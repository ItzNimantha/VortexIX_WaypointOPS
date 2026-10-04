import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession, decrypt } from '@/lib/session'
import { TripStatus, OrderStatus } from '@prisma/client'

async function resolveSession(req: Request) {
  try {
    const s = await getSession()
    if (s) return s
  } catch (_) {}
  const cookieHeader = req.headers.get('cookie') || ''
  const match = cookieHeader.match(/session=([^;]+)/)
  if (match) {
    try {
      return await decrypt(match[1])
    } catch (_) {}
  }
  return null
}

export async function POST(req: Request) {
  try {
    const session = await resolveSession(req)
    if (!session || session.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const vehicleId = session.vehicleId || 'VEH001'

    // Find the trip: by tripId if supplied, otherwise by driver vehicle
    let trip = null
    if (body?.tripId) {
      trip = await prisma.trip.findUnique({
        where: { id: body.tripId },
        include: { stops: true }
      })
    }

    if (!trip) {
      trip = await prisma.trip.findFirst({
        where: {
          vehicleId,
          status: { in: [TripStatus.LOADING, TripStatus.PLANNED, TripStatus.DEPARTED] }
        },
        include: { stops: true }
      })
    }

    if (!trip) {
      return NextResponse.json({ error: 'No ready trip found' }, { status: 404 })
    }

    // Atomically transition trip to IN_TRANSIT, all associated orders to IN_TRANSIT, and create audit log
    const orderIds = trip.stops.map(s => s.orderId).filter(Boolean) as string[]
    const operations: any[] = [
      prisma.trip.update({
        where: { id: trip.id },
        data: { status: TripStatus.IN_TRANSIT }
      })
    ]

    if (orderIds.length > 0) {
      operations.push(
        prisma.order.updateMany({
          where: { id: { in: orderIds } },
          data: { status: OrderStatus.IN_TRANSIT }
        })
      )
    }

    operations.push(
      prisma.auditLog.create({
        data: {
          userId: session.userId || 'driver-user',
          action: 'DRIVER_START_ROUTE',
          details: { tripId: trip.id, timestamp: new Date().toISOString() }
        }
      })
    )

    await prisma.$transaction(operations)

    return NextResponse.json({ success: true, status: 'IN_TRANSIT' })
  } catch (error: any) {
    console.error('Error starting route:', error)
    return NextResponse.json({ error: 'Failed to start route' }, { status: 500 })
  }
}
