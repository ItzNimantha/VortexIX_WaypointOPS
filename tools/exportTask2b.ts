import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { autoAllocate } from '../src/domain/allocator'
import { checkFeasibility } from '../src/domain/feasibility'
import { DomainVehicle, DomainOrder, DistrictTravelStats, ServiceAllowanceStats, Brand, VehicleType, TempType } from '../src/domain/types'

const seedDataDir = path.join(process.cwd(), 'seed-data')

const readCsv = (filename: string) => {
  const file = fs.readFileSync(path.join(seedDataDir, filename), 'utf8')
  return parse(file, { columns: true, skip_empty_lines: true })
}

function run() {
  console.log('Loading data...')
  
  const rawVehicles = readCsv('vehicles.csv')
  const vehicles: DomainVehicle[] = rawVehicles.map((v: any) => ({
    id: v.vehicle_id,
    type: v.type.toUpperCase() as VehicleType,
    temp: v.temp.toUpperCase() as TempType,
    weightCapKg: parseFloat(v.weight_cap_kg),
    volumeCapM3: parseFloat(v.volume_cap_m3),
    fuelType: v.fuel_type,
    kmPerL: parseFloat(v.km_per_l),
    weeklyFuelQuotaL: parseFloat(v.weekly_fuel_quota_l),
    depotId: v.depot_id,
    status: 'AVAILABLE'
  }))

  const rawOutlets = readCsv('outlets.csv')
  const outletMap = new Map(rawOutlets.map((o: any) => [o.outlet_id, o]))

  const rawOrders = readCsv('task2b_peak_day_scenarios.csv')
  const orders: DomainOrder[] = rawOrders
    .filter((o: any) => o.scenario === 'S1')
    .map((o: any) => {
      const outlet = outletMap.get(o.outlet_id)
      return {
        id: o.order_ref,
        outletId: o.outlet_id,
        brand: o.brand as Brand,
        districtId: o.district,
        depotId: o.depot,
        dockType: o.dock_type,
        parkingConstraint: o.parking_constraint || null,
        mallWindow: o.mall_window === '1' || o.mall_window === 'true',
        windowOpenTime: o.window_open_time || null,
        windowCloseTime: o.window_close_time || null,
        totalVolumeM3: parseFloat(o.order_volume_m3),
        totalWeightKg: parseFloat(o.order_weight_kg),
        isChilled: o.temp_requirement === 'chilled',
        deferredYesterday: o.deferred_yesterday === '1',
        daysSinceLastServed: parseInt(o.days_since_last_served),
      }
    })

  const rawTravel = readCsv('district_travel.csv')
  const travelStats: DistrictTravelStats[] = rawTravel.map((t: any) => ({
    depotId: t.depot_id,
    districtId: t.district_id,
    depotToDistrictKm: parseFloat(t.depot_to_district_km),
    depotToDistrictFreeflowMin: parseFloat(t.depot_to_district_freeflow_min),
    interStopKm: parseFloat(t.inter_stop_km),
    interStopFreeflowMin: parseFloat(t.inter_stop_freeflow_min)
  }))

  const rawAllowances = readCsv('service_allowance.csv')
  const allowances: ServiceAllowanceStats[] = rawAllowances.map((a: any) => ({
    brand: a.brand as Brand,
    dockType: a.dock_type,
    allowanceMin: parseFloat(a.service_allowance_min)
  }))

  console.log(`Running auto-allocator for ${orders.length} orders...`)
  const start = Date.now()
  const { trips, deferrals } = autoAllocate(orders, vehicles, travelStats, allowances)
  const duration = Date.now() - start
  console.log(`Allocation took ${duration}ms.`)

  console.log('Checking feasibility...')
  const violations = checkFeasibility({ trips }, vehicles, travelStats, allowances)
  
  if (violations.length > 0) {
    console.error('Violations found!')
    console.error(violations)
    process.exit(1)
  } else {
    console.log('0 violations found.')
  }

  // Generate CSV content
  // CSV Format: scenario, order_ref, outlet_id, decision, vehicle_id, trip_id
  let csv = 'scenario,order_ref,outlet_id,decision,vehicle_id,trip_id\n'
  
  for (const trip of trips) {
    for (const order of trip.orders) {
      csv += `S1,${order.id},${order.outletId},served,${trip.vehicleId},${trip.tripNumber}\n`
    }
  }

  for (const deferral of deferrals) {
    const order = orders.find(o => o.id === deferral.orderId)!
    csv += `S1,${order.id},${order.outletId},deferred,, \n`
  }

  // Windows compatible temp path
  const tmpPath = process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp'
  const outPath = path.join(tmpPath, 'submission_task2b.csv')
  fs.writeFileSync(outPath, csv)
  
  console.log(`Exported successfully to ${outPath}`)
}

run()
