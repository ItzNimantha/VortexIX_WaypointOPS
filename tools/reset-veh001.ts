import prisma from '../src/lib/prisma'
import { TripStatus, OrderStatus } from '@prisma/client'

async function resetTrip() {
  const tripId = 'TRIP-97x8imc'
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { stops: true }
  })
  if (!trip) return

  const stopIds = trip.stops.map(s => s.id)
  const orderIds = trip.stops.map(s => s.orderId).filter(Boolean) as string[]

  await prisma.proofOfDelivery.deleteMany({ where: { tripStopId: { in: stopIds } } })
  await prisma.syncEvent.deleteMany({
    where: {
      OR: [
        { clientEventId: { in: stopIds.map(id => `sync-${id}`) } },
        { clientEventId: { in: stopIds.map(id => `direct-sync-${id}`) } },
        { clientEventId: { in: stopIds.map(id => `sync-test-${id}`) } }
      ]
    }
  })

  await prisma.tripStop.updateMany({
    where: { id: { in: stopIds } },
    data: { outcome: null, actualArrival: null }
  })

  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: { status: OrderStatus.LOADING }
  })

  await prisma.trip.update({
    where: { id: tripId },
    data: { status: TripStatus.LOADING }
  })

  console.log(`Trip ${tripId} successfully reset to LOADING status with 3 pending stops for VEH001.`)
}

resetTrip()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
