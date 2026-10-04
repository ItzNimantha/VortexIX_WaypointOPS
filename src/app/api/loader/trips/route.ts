import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { TripStatus } from '@prisma/client'

function normalizeDepotIds(depotParam?: string | null): string[] {
  if (!depotParam) return ['DEP_PEL', 'Peliyagoda']
  const upper = depotParam.toUpperCase()
  if (upper === 'DEP_PEL' || upper === 'PELIYAGODA') {
    return ['DEP_PEL', 'Peliyagoda']
  }
  if (upper === 'DEP_KAN' || upper === 'KANDY') {
    return ['DEP_KAN', 'Kandy']
  }
  return [depotParam]
}

export async function GET(req: Request) {
  try {
    const session = await getSession()
    const { searchParams } = new URL(req.url)
    const depotParam = searchParams.get('depotId') || session?.depotId
    const depotMatches = normalizeDepotIds(depotParam)

    // Find trips ready for loading (LOADING or PLANNED) at the loader's depot
    let trips = await prisma.trip.findMany({
      where: {
        status: { in: [TripStatus.LOADING, TripStatus.PLANNED] },
        OR: [
          { vehicle: { depotId: { in: depotMatches } } },
          { plan: { depotId: { in: depotMatches } } },
          { vehicleId: null }
        ]
      },
      include: {
        vehicle: true,
        stops: {
          include: {
            order: {
              include: {
                lines: true,
                outlet: true
              }
            }
          },
          orderBy: { sequence: 'asc' }
        }
      },
      orderBy: [
        { status: 'desc' }, // LOADING first, then PLANNED
        { id: 'asc' }
      ]
    })

    // Fallback: If no trips match specific depot filter, fetch any ready trips
    if (trips.length === 0) {
      trips = await prisma.trip.findMany({
        where: {
          status: { in: [TripStatus.LOADING, TripStatus.PLANNED] }
        },
        include: {
          vehicle: true,
          stops: {
            include: {
              order: {
                include: {
                  lines: true,
                  outlet: true
                }
              }
            },
            orderBy: { sequence: 'asc' }
          }
        },
        orderBy: [
          { status: 'desc' },
          { id: 'asc' }
        ]
      })
    }

    const formattedTrips = trips.map(trip => {
      // Calculate crates across all stops
      let totalCrates = 0
      for (const stop of trip.stops) {
        if (stop.order?.lines && stop.order.lines.length > 0) {
          totalCrates += stop.order.lines.reduce((acc, line) => acc + line.quantity, 0)
        } else if (stop.order?.totalVolumeM3) {
          totalCrates += Math.max(1, Math.round(stop.order.totalVolumeM3 * 8))
        } else {
          totalCrates += 5 // Default crate estimate per stop if no order lines
        }
      }

      // Format departure time from first stop plannedEta
      let departure = '04:00'
      if (trip.stops.length > 0 && trip.stops[0].plannedEta) {
        const d = new Date(trip.stops[0].plannedEta)
        const hours = d.getHours().toString().padStart(2, '0')
        const mins = d.getMinutes().toString().padStart(2, '0')
        departure = `${hours}:${mins}`
      }

      return {
        id: trip.id,
        vehicle: trip.vehicle?.id || trip.vehicleId || 'VEH001',
        vehicleType: trip.vehicle?.type || 'TRUCK',
        vehicleTemp: trip.vehicle?.temp || 'REEFER',
        departure,
        status: trip.status,
        orders: trip.stops.length,
        crates: totalCrates,
        districtId: trip.districtId,
        brand: trip.brand,
        tripNumber: trip.tripNumber,
        stopsCount: trip.stops.length,
        stops: trip.stops
      }
    })

    return NextResponse.json({
      success: true,
      trips: formattedTrips
    })
  } catch (error: any) {
    console.error('Error fetching loader trips:', error)
    return NextResponse.json(
      { error: 'Failed to fetch loader trips', details: error?.message },
      { status: 500 }
    )
  }
}
