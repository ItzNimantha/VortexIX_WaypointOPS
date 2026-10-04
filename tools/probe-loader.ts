import prisma from '../src/lib/prisma'
import { TripStatus, OrderStatus } from '@prisma/client'

async function probe() {
  console.log('--- Probing Database State ---')
  const tripCount = await prisma.trip.count()
  const orderCount = await prisma.order.count()
  const vehicleCount = await prisma.vehicle.count()
  const loadingRecordCount = await prisma.loadingRecord.count()
  const loadingFlagCount = await prisma.loadingItemFlag.count()
  const auditLogCount = await prisma.auditLog.count()

  console.log({
    tripCount,
    orderCount,
    vehicleCount,
    loadingRecordCount,
    loadingFlagCount,
    auditLogCount
  })

  const trips = await prisma.trip.findMany({
    take: 5,
    include: {
      vehicle: true,
      stops: {
        include: {
          order: {
            include: { lines: true, outlet: true }
          }
        }
      }
    }
  })

  console.log('Sample Trips:', JSON.stringify(trips.map(t => ({
    id: t.id,
    status: t.status,
    vehicleId: t.vehicleId,
    stopsCount: t.stops.length,
    stops: t.stops.map(s => ({
      sequence: s.sequence,
      orderId: s.orderId,
      linesCount: s.order?.lines?.length || 0
    }))
  })), null, 2))

  await prisma.$disconnect()
}

probe().catch(console.error)
