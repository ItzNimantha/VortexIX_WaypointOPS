export type Brand = 'Fresh' | 'Style' | 'Tech'
export type VehicleType = 'TRUCK' | 'VAN'
export type TempType = 'REEFER' | 'AMBIENT'
export type VehicleStatus = 'AVAILABLE' | 'IN_WORKSHOP' | 'EN_ROUTE'

export interface DomainVehicle {
  id: string
  type: VehicleType
  temp: TempType
  weightCapKg: number
  volumeCapM3: number
  fuelType: string
  kmPerL: number
  weeklyFuelQuotaL: number
  depotId: string
  status: VehicleStatus
}

export interface DomainOrder {
  id: string
  outletId: string
  brand: Brand
  districtId: string
  depotId: string
  dockType: string
  parkingConstraint: string | null
  mallWindow: boolean
  windowOpenTime: string | null
  windowCloseTime: string | null
  totalVolumeM3: number
  totalWeightKg: number
  isChilled: boolean
  deferredYesterday: boolean
  daysSinceLastServed: number
}

export interface DomainTrip {
  id: string
  vehicleId: string
  tripNumber: number // 1 or 2
  brand: Brand
  districtId: string
  orders: DomainOrder[]
}

export interface DomainAllocation {
  trips: DomainTrip[]
}

export interface DistrictTravelStats {
  depotId: string
  districtId: string
  depotToDistrictKm: number
  depotToDistrictFreeflowMin: number
  interStopKm: number
  interStopFreeflowMin: number
}

export interface ServiceAllowanceStats {
  brand: Brand
  dockType: string
  allowanceMin: number
}

export interface Violation {
  rule: number
  message: string
  orderId?: string
  tripId?: string
}

export interface DeferralDecision {
  orderId: string
  reason: string
  reasonType: 'FORCED' | 'CHOICE'
}
