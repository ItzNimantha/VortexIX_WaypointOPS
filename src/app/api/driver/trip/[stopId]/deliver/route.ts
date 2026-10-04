import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { StopOutcome, OrderStatus, TripStatus } from '@prisma/client'

export async function POST(
  req: Request,
  { params }: { params: { stopId: string } }
) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { stopId } = params

    // Get the stop
    const stop = await prisma.tripStop.findUnique({
      where: { id: stopId },
      include: { trip: { include: { stops: true } } }
    })

    if (!stop) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 })
    }

    // Update stop outcome
    await prisma.tripStop.update({
      where: { id: stopId },
      data: { 
        outcome: StopOutcome.SUCCESS,
        actualArrival: new Date()
      }
    })

    // Update associated order to DELIVERED
    if (stop.orderId) {
      await prisma.order.update({
        where: { id: stop.orderId },
        data: { status: OrderStatus.DELIVERED }
      })
    }

    // Check if all stops are done
    const allStops = stop.trip.stops
    const otherStops = allStops.filter(s => s.id !== stopId)
    const allOthersDone = otherStops.every(s => s.outcome)
    
    if (allOthersDone) {
      await prisma.trip.update({
        where: { id: stop.tripId },
        data: { status: TripStatus.DELIVERED }
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'DRIVER_STOP_DELIVERED',
        details: { stopId, orderId: stop.orderId, timestamp: new Date().toISOString() }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error delivering stop:', error)
    return NextResponse.json({ error: 'Failed to deliver stop' }, { status: 500 })
  }
}
