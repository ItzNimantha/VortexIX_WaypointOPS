import { describe, it, expect } from 'vitest'
import { autoAllocate } from '../allocator'
import { DomainVehicle, DomainOrder, DistrictTravelStats, ServiceAllowanceStats } from '../types'
import { checkFeasibility } from '../feasibility'

describe('Auto Allocator', () => {
  it('allocates valid trips and creates deferrals for over-capacity', () => {
    const vehicles: DomainVehicle[] = [
      {
        id: 'V1', type: 'TRUCK', temp: 'AMBIENT', weightCapKg: 1000, volumeCapM3: 10,
        fuelType: 'DIESEL', kmPerL: 5, weeklyFuelQuotaL: 500, depotId: 'D1', status: 'AVAILABLE'
      }
    ]

    const orders: DomainOrder[] = [
      {
        id: 'O1', outletId: 'OUT1', brand: 'Fresh', districtId: 'DIST1', depotId: 'D1',
        dockType: 'street', parkingConstraint: null, mallWindow: false, windowOpenTime: null, windowCloseTime: null,
        totalVolumeM3: 6, totalWeightKg: 100, isChilled: false, deferredYesterday: true, daysSinceLastServed: 2
      },
      {
        id: 'O2', outletId: 'OUT2', brand: 'Fresh', districtId: 'DIST1', depotId: 'D1',
        dockType: 'street', parkingConstraint: null, mallWindow: false, windowOpenTime: null, windowCloseTime: null,
        totalVolumeM3: 6, totalWeightKg: 100, isChilled: false, deferredYesterday: false, daysSinceLastServed: 1
      },
      {
        id: 'O3', outletId: 'OUT3', brand: 'Fresh', districtId: 'DIST1', depotId: 'D1',
        dockType: 'street', parkingConstraint: null, mallWindow: false, windowOpenTime: null, windowCloseTime: null,
        totalVolumeM3: 6, totalWeightKg: 100, isChilled: false, deferredYesterday: false, daysSinceLastServed: 0
      }
    ]

    const travelStats: DistrictTravelStats[] = [
      { depotId: 'D1', districtId: 'DIST1', depotToDistrictKm: 10, depotToDistrictFreeflowMin: 15, interStopKm: 2, interStopFreeflowMin: 5 }
    ]

    const allowances: ServiceAllowanceStats[] = [
      { brand: 'Fresh', dockType: 'street', allowanceMin: 15 }
    ]

    const { trips, deferrals } = autoAllocate(orders, vehicles, travelStats, allowances)

    // O1 and O2 should be allocated into 2 separate trips on V1
    expect(trips).toHaveLength(2)
    expect(trips[0].orders[0].id).toBe('O1')
    expect(trips[1].orders[0].id).toBe('O2')

    // O3 should be deferred since V1 maxes out at 2 trips
    expect(deferrals).toHaveLength(1)
    expect(deferrals[0].orderId).toBe('O3')

    // Feasibility should be 0 violations
    const violations = checkFeasibility({ trips }, vehicles, travelStats, allowances)
    expect(violations).toHaveLength(0)
  })
})
