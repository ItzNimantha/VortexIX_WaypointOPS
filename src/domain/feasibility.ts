import { DomainTrip, DomainVehicle, DomainAllocation, Violation, DistrictTravelStats, ServiceAllowanceStats } from './types'
import { calculateTripTime, calculateTripDistance, calculateTripFuelLiters } from './time'

export function checkFeasibility(
  allocation: DomainAllocation,
  vehicles: DomainVehicle[],
  travelStats: DistrictTravelStats[],
  allowances: ServiceAllowanceStats[],
  fuelUsedThisWeekMap: Record<string, number> = {}
): Violation[] {
  const violations: Violation[] = []

  const vehicleTrips = new Map<string, DomainTrip[]>()
  for (const trip of allocation.trips) {
    if (!vehicleTrips.has(trip.vehicleId)) {
      vehicleTrips.set(trip.vehicleId, [])
    }
    vehicleTrips.get(trip.vehicleId)!.push(trip)
  }

  for (const [vehicleId, trips] of vehicleTrips.entries()) {
    const vehicle = vehicles.find(v => v.id === vehicleId)
    if (!vehicle) {
      violations.push({ rule: 0, message: `Vehicle ${vehicleId} not found` })
      continue
    }

    if (vehicle.status === 'IN_WORKSHOP') {
      violations.push({ rule: 0, message: `Vehicle ${vehicleId} is in workshop` })
    }

    if (trips.length > 2) {
      violations.push({ rule: 7, message: `Vehicle ${vehicleId} assigned more than 2 trips (${trips.length})` })
    }

    let freshMinutes = 0
    let styleTechMinutes = 0
    let fuelLiters = fuelUsedThisWeekMap[vehicleId] || 0

    const orderIdToTrip = new Set<string>()

    for (const trip of trips) {
      // 1. Same brand and district
      const brands = new Set(trip.orders.map(o => o.brand))
      const districts = new Set(trip.orders.map(o => o.districtId))
      
      if (brands.size > 1) {
        violations.push({ rule: 1, tripId: trip.id, message: `Multiple brands in trip` })
      }
      if (districts.size > 1) {
        violations.push({ rule: 1, tripId: trip.id, message: `Multiple districts in trip` })
      }

      let volume = 0
      let weight = 0

      for (const order of trip.orders) {
        // 5. Orders are whole (check uniqueness)
        if (orderIdToTrip.has(order.id)) {
          violations.push({ rule: 5, orderId: order.id, message: `Order ${order.id} allocated multiple times` })
        }
        orderIdToTrip.add(order.id)

        // 2. Chilled needs reefer
        if (order.isChilled && vehicle.temp !== 'REEFER') {
          violations.push({ rule: 2, orderId: order.id, message: `Chilled order on ambient vehicle` })
        }
        
        // 3. Van only constraint
        if (order.parkingConstraint === 'van_only' && vehicle.type !== 'VAN') {
          violations.push({ rule: 3, orderId: order.id, message: `van_only order on truck` })
        }

        // 4. Depot matching
        if (order.depotId !== vehicle.depotId) {
          violations.push({ rule: 4, orderId: order.id, message: `Order depot ${order.depotId} cross-assigned to vehicle depot ${vehicle.depotId}` })
        }

        volume += order.totalVolumeM3
        weight += order.totalWeightKg
      }

      // 6. Capacity
      // Fix float rounding
      if (Math.round(volume * 1000) > Math.round(vehicle.volumeCapM3 * 1000)) {
        violations.push({ rule: 6, tripId: trip.id, message: `Volume exceeded: ${volume.toFixed(2)} > ${vehicle.volumeCapM3}` })
      }
      if (Math.round(weight * 1000) > Math.round(vehicle.weightCapKg * 1000)) {
        violations.push({ rule: 6, tripId: trip.id, message: `Weight exceeded: ${weight.toFixed(2)} > ${vehicle.weightCapKg}` })
      }

      // Time and Fuel (Rule 7)
      const travel = travelStats.find(t => t.depotId === vehicle.depotId && t.districtId === trip.districtId)
      if (travel) {
        const time = calculateTripTime(trip, travel, allowances)
        const dist = calculateTripDistance(trip, travel)
        fuelLiters += calculateTripFuelLiters(dist, vehicle.kmPerL)

        if (trip.brand === 'Fresh') {
          freshMinutes += time
        } else {
          styleTechMinutes += time
        }
      }
    }

    if (freshMinutes > 270) {
      violations.push({ rule: 7, message: `Fresh budget exceeded: ${freshMinutes} > 270` })
    }
    if (styleTechMinutes > 480) {
      violations.push({ rule: 7, message: `Style/Tech budget exceeded: ${styleTechMinutes} > 480` })
    }
    if (fuelLiters > vehicle.weeklyFuelQuotaL) {
      violations.push({ rule: 0, message: `Fuel quota exceeded: ${fuelLiters.toFixed(2)} > ${vehicle.weeklyFuelQuotaL}` })
    }
  }

  return violations
}
