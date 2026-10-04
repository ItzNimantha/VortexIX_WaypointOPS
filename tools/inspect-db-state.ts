import prisma from '../src/lib/prisma'

async function inspect() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, vehicleId: true, outletId: true }
  })
  console.log('--- USERS ---')
  console.log(users)

  const vehicles = await prisma.vehicle.findMany()
  console.log('--- VEHICLES ---')
  console.log(vehicles.map(v => ({ id: v.id, regNo: v.regNo, status: v.status })))

  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      status: true,
      vehicleId: true,
      tripNumber: true,
      brand: true,
      stops: {
        select: {
          id: true,
          sequence: true,
          orderId: true,
          outcome: true,
          order: { select: { id: true, status: true, outletId: true } }
        }
      }
    }
  })
  console.log(`--- TRIPS (Total: ${trips.length}) ---`)
  for (const t of trips) {
    console.log(`Trip: ${t.id} | Status: ${t.status} | Vehicle: ${t.vehicleId} | Stops: ${t.stops.length}`)
    for (const s of t.stops) {
      console.log(`   Stop: ${s.id} (Seq: ${s.sequence}) -> Order: ${s.orderId} (Status: ${s.order?.status}) Outcome: ${s.outcome}`)
    }
  }
}

inspect()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
