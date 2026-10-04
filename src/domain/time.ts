import { DomainTrip, DistrictTravelStats, ServiceAllowanceStats, DomainOrder } from './types'

export function calculateTripTime(
  trip: DomainTrip,
  travelStats: DistrictTravelStats,
  allowanceStats: ServiceAllowanceStats[]
): number {
  if (trip.orders.length === 0) return 0

  const ordersCount = trip.orders.length
  let totalTime = travelStats.depotToDistrictFreeflowMin
  totalTime += travelStats.interStopFreeflowMin * (ordersCount - 1)

  for (const order of trip.orders) {
    const allowance = allowanceStats.find(
      a => a.brand === trip.brand && a.dockType === order.dockType
    )
    if (allowance) {
      totalTime += allowance.allowanceMin
    }
  }

  return totalTime
}

export function calculateTripDistance(trip: DomainTrip, travelStats: DistrictTravelStats): number {
  if (trip.orders.length === 0) return 0
  const ordersCount = trip.orders.length
  return travelStats.depotToDistrictKm * 2 + travelStats.interStopKm * (ordersCount - 1)
}

export function calculateTripFuelLiters(distance: number, kmPerL: number): number {
  if (kmPerL <= 0) return 0
  return distance / kmPerL
}
