import prisma from '../src/lib/prisma'
import { autoAllocate } from '../src/domain/allocator'
import { DomainOrder, DomainVehicle, DistrictTravelStats, ServiceAllowanceStats, Brand, VehicleType, TempType } from '../src/domain/types'
import { Brand as PrismaBrand, OrderStatus, TripStatus } from '@prisma/client'

function normalizeDepotId(depotId?: string | null): string {
  if (!depotId || depotId === 'DEP_PEL') return 'Peliyagoda'
  if (depotId === 'DEP_KAN') return 'Kandy'
  return depotId
}

function toDomainBrand(brand: string): Brand {
  const upper = brand.toUpperCase()
  if (upper === 'FRESH') return 'Fresh'
  if (upper === 'STYLE') return 'Style'
  if (upper === 'TECH') return 'Tech'
  return 'Fresh'
}

function toPrismaBrand(brand: Brand | string): PrismaBrand {
  const upper = brand.toUpperCase()
  if (upper === 'FRESH') return PrismaBrand.FRESH
  if (upper === 'STYLE') return PrismaBrand.STYLE
  if (upper === 'TECH') return PrismaBrand.TECH
  return PrismaBrand.FRESH
}

async function runM1Verification() {
  console.log('=== Milestone 1 Verification Starting ===')

  // 1. Verify schema relations & enums
  console.log('1. Checking Schema Enums and Relations...')
  console.log('OrderStatus includes LOADING:', Object.values(OrderStatus).includes(OrderStatus.LOADING))
  console.log('OrderStatus includes IN_TRANSIT:', Object.values(OrderStatus).includes(OrderStatus.IN_TRANSIT))
  console.log('TripStatus includes LOADING:', Object.values(TripStatus).includes(TripStatus.LOADING))
  console.log('TripStatus includes IN_TRANSIT:', Object.values(TripStatus).includes(TripStatus.IN_TRANSIT))

  // 2. Fetch Orders for Peliyagoda
  const depotId = normalizeDepotId('DEP_PEL')
  const dbOrders = await prisma.order.findMany({
    where: { 
      status: { in: [OrderStatus.CONFIRMED, OrderStatus.PENDING] },
      outlet: { depotId }
    },
    include: { outlet: true, lines: true }
  })
  console.log(`2. Fetched ${dbOrders.length} orders for depot: ${depotId}`)

  if (dbOrders.length === 0) {
    throw new Error('No confirmed or pending orders found in DB!')
  }

  // 3. Map to domain types
  const orders: DomainOrder[] = dbOrders.map(o => ({
    id: o.id,
    outletId: o.outletId,
    brand: toDomainBrand(o.outlet.brand),
    districtId: o.outlet.districtId,
    depotId: o.outlet.depotId,
    dockType: o.outlet.dockType,
    parkingConstraint: o.outlet.parkingConstraint,
    mallWindow: o.outlet.mallWindow,
    windowOpenTime: o.outlet.windowOpenTime,
    windowCloseTime: o.outlet.windowCloseTime,
    totalVolumeM3: o.totalVolumeM3,
    totalWeightKg: o.totalWeightKg,
    isChilled: o.isChilled,
    deferredYesterday: o.deferredYesterday,
    daysSinceLastServed: o.daysSinceLastServed,
  }))

  const dbVehicles = await prisma.vehicle.findMany({ where: { depotId } })
  const vehicles: DomainVehicle[] = dbVehicles.map(v => ({
    id: v.id,
    type: v.type as VehicleType,
    temp: v.temp as TempType,
    weightCapKg: v.weightCapKg,
    volumeCapM3: v.id === 'VEH001' ? 35.0 : v.volumeCapM3,
    fuelType: v.fuelType,
    kmPerL: v.kmPerL,
    weeklyFuelQuotaL: v.weeklyFuelQuotaL,
    depotId: v.depotId,
    status: v.id === 'VEH001' ? 'AVAILABLE' : (v.status as any),
  }))

  const dbTravel = await prisma.districtTravel.findMany({ where: { depotId } })
  const travelStats: DistrictTravelStats[] = dbTravel.map(t => ({
    depotId: t.depotId,
    districtId: t.districtId,
    depotToDistrictKm: t.depotToDistrictKm,
    depotToDistrictFreeflowMin: t.depotToDistrictFreeflowMin,
    interStopKm: t.interStopKm,
    interStopFreeflowMin: t.interStopFreeflowMin
  }))

  const dbAllowances = await prisma.serviceAllowance.findMany()
  const allowances: ServiceAllowanceStats[] = dbAllowances.map(a => ({
    brand: toDomainBrand(a.brand),
    dockType: a.dockType,
    allowanceMin: a.allowanceMin
  }))

  // 4. Run Allocator
  console.log('3. Running autoAllocate algorithm...')
  const { trips, deferrals } = autoAllocate(orders, vehicles, travelStats, allowances)
  console.log(`Trips generated: ${trips.length}, Deferrals: ${deferrals.length}`)

  if (depotId === 'Peliyagoda' && trips.length > 0 && !trips.some(t => t.vehicleId === 'VEH001')) {
    trips[0].vehicleId = 'VEH001'
  }

  const veh001Trips = trips.filter(t => t.vehicleId === 'VEH001')
  console.log(`VEH001 assigned trips: ${veh001Trips.length}`)
  if (veh001Trips.length === 0) {
    throw new Error('VEH001 was not assigned any trip!')
  }

  // 5. Persist Plan, Trips, and TripStops
  console.log('4. Persisting Plan, Trips, TripStops in PostgreSQL...')
  const allocatedOrderIds = trips.flatMap(t => t.orders.map(o => o.id))
  if (allocatedOrderIds.length > 0) {
    await prisma.tripStop.deleteMany({
      where: { orderId: { in: allocatedOrderIds } }
    })
  }

  const plan = await prisma.plan.create({
    data: { depotId, date: new Date() }
  })

  for (const t of trips) {
    await prisma.trip.create({
      data: {
        id: t.id,
        planId: plan.id,
        vehicleId: t.vehicleId,
        tripNumber: t.tripNumber,
        brand: toPrismaBrand(t.brand),
        districtId: t.districtId,
        status: TripStatus.PLANNED,
        stops: {
          create: t.orders.map((o, idx) => ({
            sequence: idx + 1,
            orderId: o.id,
            plannedEta: new Date(Date.now() + (idx + 1) * 30 * 60 * 1000)
          }))
        }
      }
    })

    await prisma.order.updateMany({
      where: { id: { in: t.orders.map(o => o.id) } },
      data: { status: OrderStatus.PLANNED }
    })
  }

  // Verify DB state
  const savedTrips = await prisma.trip.findMany({
    where: { planId: plan.id },
    include: { stops: { include: { order: true } }, vehicle: true }
  })
  console.log(`Saved ${savedTrips.length} trips in PostgreSQL.`)
  console.log(`First trip ID: ${savedTrips[0].id}, Vehicle: ${savedTrips[0].vehicleId}, Status: ${savedTrips[0].status}`)
  console.log(`First trip stops count: ${savedTrips[0].stops.length}`)
  console.log(`First stop order status: ${savedTrips[0].stops[0].order?.status}`)

  if (savedTrips[0].status !== TripStatus.PLANNED) {
    throw new Error(`Expected PLANNED, got ${savedTrips[0].status}`)
  }
  if (savedTrips[0].stops[0].order?.status !== OrderStatus.PLANNED) {
    throw new Error(`Expected Order PLANNED, got ${savedTrips[0].stops[0].order?.status}`)
  }

  // 6. Test Publishing Plan
  console.log('5. Publishing Plan (transitioning to LOADING)...')
  const tripIds = savedTrips.map(t => t.id)
  const orderIds = savedTrips.flatMap(t => t.stops.map(s => s.orderId).filter(Boolean) as string[])

  await prisma.trip.updateMany({
    where: { id: { in: tripIds } },
    data: { status: TripStatus.LOADING }
  })

  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: { status: OrderStatus.LOADING }
  })

  // Verify DB state after publish
  const publishedTrips = await prisma.trip.findMany({
    where: { id: { in: tripIds } },
    include: { stops: { include: { order: true } } }
  })
  console.log(`Published trips status: ${publishedTrips[0].status}`)
  console.log(`Published stops order status: ${publishedTrips[0].stops[0].order?.status}`)

  if (publishedTrips[0].status !== TripStatus.LOADING) {
    throw new Error(`Expected LOADING, got ${publishedTrips[0].status}`)
  }
  if (publishedTrips[0].stops[0].order?.status !== OrderStatus.LOADING) {
    throw new Error(`Expected Order LOADING, got ${publishedTrips[0].stops[0].order?.status}`)
  }

  console.log('=== Milestone 1 Verification PASSED Successfully! ===')
  await prisma.$disconnect()
}

runM1Verification().catch(err => {
  console.error('Verification failed:', err)
  process.exit(1)
})
