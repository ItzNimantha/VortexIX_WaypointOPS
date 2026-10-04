import { DomainOrder, DomainVehicle, DomainTrip, DistrictTravelStats, ServiceAllowanceStats, DeferralDecision } from './types'
import { checkFeasibility } from './feasibility'
import { calculateTripTime } from './time'

export function autoAllocate(
  orders: DomainOrder[],
  vehicles: DomainVehicle[],
  travelStats: DistrictTravelStats[],
  allowances: ServiceAllowanceStats[]
) {
  // 1. Sort orders by priority
  // Priority: deferred_yesterday (protect), days_since_last_served (desc), chilled, window tightness
  const sortedOrders = [...orders].sort((a, b) => {
    if (a.deferredYesterday && !b.deferredYesterday) return -1
    if (!a.deferredYesterday && b.deferredYesterday) return 1
    if (a.daysSinceLastServed !== b.daysSinceLastServed) return b.daysSinceLastServed - a.daysSinceLastServed
    if (a.isChilled && !b.isChilled) return -1
    if (!a.isChilled && b.isChilled) return 1
    return 0
  })

  // Available vehicles
  const availableVehicles = vehicles.filter(v => v.status === 'AVAILABLE')
  
  // Track trips
  const trips: DomainTrip[] = []
  const vehicleTripCount = new Map<string, number>()
  availableVehicles.forEach(v => vehicleTripCount.set(v.id, 0))

  const unserved: DomainOrder[] = []
  const deferrals: DeferralDecision[] = []

  // Create trips by grouping by depot, district, brand
  for (const order of sortedOrders) {
    let allocated = false

    // Try to find an existing trip to fit the order
    for (const trip of trips) {
      if (trip.brand === order.brand && trip.districtId === order.districtId) {
        const vehicle = availableVehicles.find(v => v.id === trip.vehicleId)!
        
        // Add tentatively
        trip.orders.push(order)
        const violations = checkFeasibility({ trips: [trip] }, [vehicle], travelStats, allowances)
        
        if (violations.length === 0) {
          allocated = true
          break
        } else {
          // Revert
          trip.orders.pop()
        }
      }
    }

    if (!allocated) {
      // Try to create a new trip
      // Prioritize reefers for chilled
      let candidateVehicles = availableVehicles.filter(v => v.depotId === order.depotId)
      if (order.isChilled) candidateVehicles = candidateVehicles.filter(v => v.temp === 'REEFER')
      if (order.parkingConstraint === 'van_only') candidateVehicles = candidateVehicles.filter(v => v.type === 'VAN')

      // First-fit decreasing (sort by volume capacity)
      candidateVehicles.sort((a, b) => b.volumeCapM3 - a.volumeCapM3)

      for (const vehicle of candidateVehicles) {
        const currentCount = vehicleTripCount.get(vehicle.id) || 0
        if (currentCount < 2) {
          const newTrip: DomainTrip = {
            id: `TRIP-${Math.random().toString(36).substring(2, 9)}`,
            vehicleId: vehicle.id,
            tripNumber: currentCount + 1,
            brand: order.brand,
            districtId: order.districtId,
            orders: [order]
          }

          // Check if this new trip is feasible along with existing trips for this vehicle
          const vehicleExistingTrips = trips.filter(t => t.vehicleId === vehicle.id)
          const violations = checkFeasibility(
            { trips: [...vehicleExistingTrips, newTrip] }, 
            [vehicle], 
            travelStats, 
            allowances
          )

          if (violations.length === 0) {
            trips.push(newTrip)
            vehicleTripCount.set(vehicle.id, currentCount + 1)
            allocated = true
            break
          }
        }
      }
    }

    if (!allocated) {
      unserved.push(order)
      deferrals.push({
        orderId: order.id,
        reason: 'No feasible vehicle/time/capacity available',
        reasonType: 'FORCED'
      })
    }
  }

  return { trips, deferrals }
}
