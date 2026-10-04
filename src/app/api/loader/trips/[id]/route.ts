import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Trip ID is required' }, { status: 400 })
    }

    const trip = await prisma.trip.findUnique({
      where: { id },
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
          }
        }
      }
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Fetch existing loading record if any
    const loadingRecord = await prisma.loadingRecord.findUnique({
      where: { tripId: id }
    })

    const flags = loadingRecord
      ? await prisma.loadingItemFlag.findMany({
          where: { loadingRecordId: loadingRecord.id }
        })
      : []

    // Sort stops in reverse order of sequence (last delivery stop loaded first)
    const totalStops = trip.stops.length
    const sortedStops = [...trip.stops].sort((a, b) => b.sequence - a.sequence)

    const formattedStops = sortedStops.map(stop => {
      let crates = 0
      if (stop.order?.lines && stop.order.lines.length > 0) {
        crates = stop.order.lines.reduce((acc, line) => acc + line.quantity, 0)
      } else if (stop.order?.totalVolumeM3) {
        crates = Math.max(1, Math.round(stop.order.totalVolumeM3 * 8))
      } else {
        crates = 5
      }

      const outletName = stop.order?.outlet?.name || stop.order?.outletId || `Outlet ${stop.sequence}`
      const loadSequence = totalStops - stop.sequence + 1

      return {
        id: stop.id,
        sequence: stop.sequence,
        loadSequence,
        outlet: outletName,
        outletId: stop.order?.outletId || stop.order?.outlet?.id || null,
        dockType: stop.order?.outlet?.dockType || 'STANDARD',
        crates,
        plannedEta: stop.plannedEta,
        orderId: stop.orderId,
        order: stop.order
      }
    })

    const totalCrates = formattedStops.reduce((sum, s) => sum + s.crates, 0)

    return NextResponse.json({
      success: true,
      trip: {
        id: trip.id,
        vehicleId: trip.vehicleId,
        vehicle: trip.vehicle,
        vehicleType: trip.vehicle?.type || 'TRUCK',
        vehicleTemp: trip.vehicle?.temp || 'REEFER',
        brand: trip.brand,
        districtId: trip.districtId,
        status: trip.status,
        tripNumber: trip.tripNumber,
        totalCrates
      },
      stops: formattedStops,
      loadingRecord,
      flags
    })
  } catch (error: any) {
    console.error('Error fetching trip by ID:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trip', details: error?.message },
      { status: 500 }
    )
  }
}
