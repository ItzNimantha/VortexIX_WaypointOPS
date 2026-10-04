import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { OrderStatus, TripStatus } from '@prisma/client'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Trip ID is required' }, { status: 400 })
    }

    const session = await getSession()
    const loaderId = session?.id || 'loader-1'

    const body = await req.json().catch(() => ({}))
    const { signature, totalCrates } = body

    // 1. Verify trip exists
    const trip = await prisma.trip.findUnique({
      where: { id },
      include: { stops: true }
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // 2. Upsert LoadingRecord marking it COMPLETED
    const loadingRecord = await prisma.loadingRecord.upsert({
      where: { tripId: id },
      update: {
        status: 'COMPLETED',
        loaderId
      },
      create: {
        tripId: id,
        loaderId,
        status: 'COMPLETED'
      }
    })

    // 3. Update associated Order records to LOADED
    const orderIds = trip.stops.map(s => s.orderId).filter(Boolean) as string[]
    if (orderIds.length > 0) {
      await prisma.order.updateMany({
        where: { id: { in: orderIds } },
        data: { status: OrderStatus.LOADED }
      })
    }

    // 4. Update Trip record
    // Status stays LOADING (or ready for driver to start route)
    const updatedTrip = await prisma.trip.update({
      where: { id },
      data: {
        status: TripStatus.LOADING
      }
    })

    // 5. Create AuditLog entry capturing driver sign-off
    await prisma.auditLog.create({
      data: {
        userId: loaderId,
        action: 'LOADER_DRIVER_SIGNOFF',
        details: {
          tripId: id,
          orderIds,
          totalCrates: totalCrates || null,
          hasSignature: Boolean(signature),
          timestamp: new Date().toISOString()
        }
      }
    })

    return NextResponse.json({
      success: true,
      status: updatedTrip.status,
      trip: updatedTrip,
      loadingRecordId: loadingRecord.id,
      ordersUpdated: orderIds.length
    })
  } catch (error: any) {
    console.error('Error during loader sign-off:', error)
    return NextResponse.json(
      { error: 'Failed to process driver sign-off', details: error?.message },
      { status: 500 }
    )
  }
}
