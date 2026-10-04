import { DomainOrder, DomainVehicle } from './types'

export function calculateCapacitySummary(orders: DomainOrder[], vehicles: DomainVehicle[]) {
  let demandM3 = 0
  let availableM3 = 0

  orders.forEach(o => { demandM3 += o.totalVolumeM3 })
  vehicles.forEach(v => { 
    if (v.status === 'AVAILABLE') {
      availableM3 += v.volumeCapM3 
    }
  })

  return {
    demandM3,
    availableM3,
    isOverCapacity: demandM3 > availableM3
  }
}
