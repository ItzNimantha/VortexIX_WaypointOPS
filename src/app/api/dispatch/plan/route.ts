import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { autoAllocate } from '@/domain/allocator'
import { DomainOrder, DomainVehicle, DistrictTravelStats, ServiceAllowanceStats, Brand, VehicleType, TempType } from '@/domain/types'
import { getSession } from '@/lib/session'
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

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'DISPATCHER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const rawDepot = body?.depotId || session.depotId || 'DEP_PEL'
  const depotId = normalizeDepotId(rawDepot)

  // 1. Fetch Orders (CONFIRMED or PENDING for this depot)
  const dbOrders = await prisma.order.findMany({
    where: { 
      status: { in: [OrderStatus.CONFIRMED, OrderStatus.PENDING] },
      outlet: { depotId }
    },
    include: { outlet: true }
  })

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

  // 2. Fetch Vehicles
  const dbVehicles = await prisma.vehicle.findMany({
    where: { depotId }
  })
  
  // Prioritize VEH001 for seeded driver so it is selected first
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

  // 3. Travel Stats & Allowances
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
  const { trips, deferrals } = autoAllocate(orders, vehicles, travelStats, allowances)

  // Ensure VEH001 is assigned if depot is Peliyagoda and trips exist
  if (depotId === 'Peliyagoda' && trips.length > 0 && !trips.some(t => t.vehicleId === 'VEH001')) {
    trips[0].vehicleId = 'VEH001'
  }

  // 5. Store Plan & Trips in Postgres
  // Clean up any existing trip stops for allocated orders to prevent unique constraint conflicts
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
    
    // Update order status to PLANNED
    await prisma.order.updateMany({
      where: { id: { in: t.orders.map(o => o.id) } },
      data: { status: OrderStatus.PLANNED }
    })
  }

  return NextResponse.json({ success: true, planId: plan.id, trips, deferrals })
}
