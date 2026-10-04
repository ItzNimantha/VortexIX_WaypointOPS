import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession, decrypt } from '@/lib/session'

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

export async function GET(req: Request) {
  try {
    const session = await resolveSession(req)
    if (!session || session.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const vehicleId = session.vehicleId || 'VEH001'
    const url = new URL(req.url)
    const tripId = url.searchParams.get('tripId')
    const stopId = url.searchParams.get('stopId')

    const where: any = {
      status: { in: ['IN_TRANSIT', 'LOADING', 'DEPARTED', 'PLANNED'] }
    }

    if (stopId) {
      where.stops = { some: { id: stopId } }
    } else if (tripId) {
      where.id = tripId
    } else {
      where.vehicleId = vehicleId
    }

    // Find the active trip for this vehicle (IN_TRANSIT, LOADING, DEPARTED, PLANNED)
    const trip = await prisma.trip.findFirst({
      where,
      orderBy: [
        { status: 'asc' },
      ],
      include: {
        stops: {
          orderBy: { sequence: 'asc' },
          include: {
            order: {
              include: {
                outlet: true,
                lines: true
              }
            }
          }
        },
        vehicle: true
      }
    })

    if (!trip) {
      return NextResponse.json({ success: true, trip: null, vehicle: null, stops: [] })
    }

    return NextResponse.json({ 
      success: true, 
      trip,
      vehicle: trip.vehicle,
      stops: trip.stops 
    })
  } catch (error: any) {
    console.error('Error fetching driver trip:', error)
    return NextResponse.json({ error: 'Failed to fetch trip' }, { status: 500 })
  }
}
