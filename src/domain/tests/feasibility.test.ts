import { describe, it, expect } from 'vitest'
import { checkFeasibility } from '../feasibility'
import { DomainVehicle, DomainOrder, DomainTrip, DistrictTravelStats, ServiceAllowanceStats } from '../types'

describe('Feasibility Validator', () => {
  const baseVehicle: DomainVehicle = {
    id: 'V1', type: 'TRUCK', temp: 'AMBIENT', weightCapKg: 5000, volumeCapM3: 20,
    fuelType: 'DIESEL', kmPerL: 5, weeklyFuelQuotaL: 500, depotId: 'D1', status: 'AVAILABLE'
  }

  const baseOrder: DomainOrder = {
    id: 'O1', outletId: 'OUT1', brand: 'Fresh', districtId: 'DIST1', depotId: 'D1',
    dockType: 'street', parkingConstraint: null, mallWindow: false, windowOpenTime: null, windowCloseTime: null,
    totalVolumeM3: 1, totalWeightKg: 100, isChilled: false, deferredYesterday: false, daysSinceLastServed: 0
  }

  const travelStats: DistrictTravelStats[] = [
    { depotId: 'D1', districtId: 'Gampaha', depotToDistrictKm: 30, depotToDistrictFreeflowMin: 37, interStopKm: 5, interStopFreeflowMin: 9 },
    { depotId: 'D1', districtId: 'Colombo', depotToDistrictKm: 15, depotToDistrictFreeflowMin: 20, interStopKm: 2, interStopFreeflowMin: 5 },
    { depotId: 'D1', districtId: 'DIST1', depotToDistrictKm: 10, depotToDistrictFreeflowMin: 15, interStopKm: 2, interStopFreeflowMin: 5 }
  ]

  const allowances: ServiceAllowanceStats[] = [
    { brand: 'Fresh', dockType: 'rear_dock', allowanceMin: 15 },
    { brand: 'Fresh', dockType: 'street', allowanceMin: 16 }
  ]

  it('calculates the worked example (Gampaha Fresh trip = 101 min)', () => {
    // 2 rear_dock + 1 street stop
    const orders: DomainOrder[] = [
      { ...baseOrder, id: 'O1', districtId: 'Gampaha', dockType: 'rear_dock' },
      { ...baseOrder, id: 'O2', districtId: 'Gampaha', dockType: 'rear_dock' },
      { ...baseOrder, id: 'O3', districtId: 'Gampaha', dockType: 'street' }
    ]
    const trip1: DomainTrip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'Gampaha', orders }
    
    // Trip 1 Time = 37 + (3-1)*9 + 15 + 15 + 16 = 37 + 18 + 46 = 101
    const violations = checkFeasibility({ trips: [trip1] }, [baseVehicle], travelStats, allowances)
    expect(violations).toHaveLength(0)
  })

  it('rejects a third trip for a vehicle', () => {
    const trip1: DomainTrip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'DIST1', orders: [{ ...baseOrder, id: 'O1' }] }
    const trip2: DomainTrip = { id: 'T2', vehicleId: 'V1', tripNumber: 2, brand: 'Fresh', districtId: 'DIST1', orders: [{ ...baseOrder, id: 'O2' }] }
    const trip3: DomainTrip = { id: 'T3', vehicleId: 'V1', tripNumber: 3, brand: 'Fresh', districtId: 'DIST1', orders: [{ ...baseOrder, id: 'O3' }] }

    const violations = checkFeasibility({ trips: [trip1, trip2, trip3] }, [baseVehicle], travelStats, allowances)
    expect(violations.some(v => v.rule === 7 && v.message.includes('more than 2 trips'))).toBe(true)
  })

  it('rejects chilled order on ambient vehicle', () => {
    const order = { ...baseOrder, isChilled: true }
    const trip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'DIST1', orders: [order] }
    const violations = checkFeasibility({ trips: [trip] }, [baseVehicle], travelStats, allowances)
    expect(violations.some(v => v.rule === 2)).toBe(true)
  })

  it('rejects van_only outlet on truck', () => {
    const order = { ...baseOrder, parkingConstraint: 'van_only' }
    const trip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'DIST1', orders: [order] }
    const violations = checkFeasibility({ trips: [trip] }, [baseVehicle], travelStats, allowances)
    expect(violations.some(v => v.rule === 3)).toBe(true)
  })

  it('rejects volume exceeded while weight is fine', () => {
    const order = { ...baseOrder, totalVolumeM3: 25, totalWeightKg: 100 }
    const trip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'DIST1', orders: [order] }
    const violations = checkFeasibility({ trips: [trip] }, [baseVehicle], travelStats, allowances)
    expect(violations.some(v => v.rule === 6 && v.message.includes('Volume exceeded'))).toBe(true)
  })

  it('rejects split-brand trip', () => {
    const order1 = { ...baseOrder, brand: 'Fresh' as any }
    const order2 = { ...baseOrder, brand: 'Style' as any }
    const trip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'DIST1', orders: [order1, order2] }
    const violations = checkFeasibility({ trips: [trip] }, [baseVehicle], travelStats, allowances)
    expect(violations.some(v => v.rule === 1 && v.message.includes('Multiple brands'))).toBe(true)
  })

  it('rejects cross-depot assignments', () => {
    const order = { ...baseOrder, depotId: 'D2' }
    const trip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'DIST1', orders: [order] }
    const violations = checkFeasibility({ trips: [trip] }, [baseVehicle], travelStats, allowances)
    expect(violations.some(v => v.rule === 4)).toBe(true)
  })

  it('never uses in_workshop vehicle', () => {
    const vehicle = { ...baseVehicle, status: 'IN_WORKSHOP' as any }
    const trip = { id: 'T1', vehicleId: 'V1', tripNumber: 1, brand: 'Fresh', districtId: 'DIST1', orders: [baseOrder] }
    const violations = checkFeasibility({ trips: [trip] }, [vehicle], travelStats, allowances)
    expect(violations.some(v => v.rule === 0 && v.message.includes('in workshop'))).toBe(true)
  })
})
