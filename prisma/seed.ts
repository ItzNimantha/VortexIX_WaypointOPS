import 'dotenv/config'
import { PrismaClient, Role, Brand, VehicleType, TempType, OrderStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import bcrypt from 'bcryptjs'

// Use DIRECT_URL (direct connection) or DATABASE_URL and enable SSL
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!connectionString) {
  throw new Error("Neither DIRECT_URL nor DATABASE_URL is set in environment variables.")
}

const pool = new Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false } 
})
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Starting DB seed...')
  console.log(`Connecting via: ${connectionString.replace(/:[^:@]+@/, ':****@')}`)
  const seedDataDir = path.join(process.cwd(), 'seed-data')

  const readCsv = (filename: string) => {
    const file = fs.readFileSync(path.join(seedDataDir, filename), 'utf8')
    return parse(file, { columns: true, skip_empty_lines: true })
  }

  // 1. Seed Outlets
  console.log('Seeding outlets...')
  const outlets = readCsv('outlets.csv')
  const outletsData = outlets.map((row: any) => ({
    id: row.outlet_id,
    name: row.outlet_name || row.outlet_id,
    brand: row.brand.toUpperCase() as Brand,
    districtId: row.district,
    depotId: row.depot,
    dockType: row.dock_type,
    parkingConstraint: row.parking_constraint || null,
    mallWindow: row.mall_window === '1' || row.mall_window === 'true',
    windowOpenTime: row.window_open_time || null,
    windowCloseTime: row.window_close_time || null,
  }))
  await prisma.outlet.createMany({ data: outletsData, skipDuplicates: true })

  // 2. Seed Vehicles
  console.log('Seeding vehicles...')
  const vehicles = readCsv('vehicles.csv')
  const vehiclesData = vehicles.map((row: any) => ({
    id: row.vehicle_id,
    type: row.type.toUpperCase() as VehicleType,
    temp: row.temp.toUpperCase() as TempType,
    weightCapKg: parseFloat(row.weight_cap_kg),
    volumeCapM3: parseFloat(row.volume_cap_m3),
    fuelType: row.fuel_type,
    kmPerL: parseFloat(row.km_per_l),
    weeklyFuelQuotaL: parseFloat(row.weekly_fuel_quota_l),
    depotId: row.depot,
    status: 'AVAILABLE',
  }))
  await prisma.vehicle.createMany({ data: vehiclesData, skipDuplicates: true })

  // 3. Seed Calendar
  console.log('Seeding calendar...')
  const calendar = readCsv('calendar.csv')
  const calendarData = calendar.map((row: any) => ({
    date: new Date(row.date),
    isOperating: row.is_operating === '1' || row.is_operating === 'true',
    isPayday: row.is_payday === '1' || row.is_payday === 'true',
    festival: row.festival || null,
    festivalRamp: row.festival_ramp ? parseInt(row.festival_ramp) : null,
    monsoon: row.monsoon === '1' || row.monsoon === 'true',
  }))
  await prisma.calendarDay.createMany({ data: calendarData, skipDuplicates: true })

  // 4. Seed District Travel
  console.log('Seeding district travel...')
  const districtTravel = readCsv('district_travel.csv')
  const districtTravelData = districtTravel.map((row: any) => ({
    depotId: row.depot,
    districtId: row.district,
    depotToDistrictKm: parseFloat(row.depot_to_district_km),
    depotToDistrictFreeflowMin: parseFloat(row.depot_to_district_freeflow_min),
    interStopKm: parseFloat(row.inter_stop_km),
    interStopFreeflowMin: parseFloat(row.inter_stop_freeflow_min),
    roadClass: row.road_class,
  }))
  await prisma.districtTravel.createMany({ data: districtTravelData, skipDuplicates: true })

  // 5. Seed Service Allowance
  console.log('Seeding service allowance...')
  const serviceAllowance = readCsv('service_allowance.csv')
  const serviceAllowanceData = serviceAllowance.map((row: any) => ({
    brand: row.brand.toUpperCase() as Brand,
    dockType: row.dock_type,
    allowanceMin: parseFloat(row.service_allowance_min),
  }))
  await prisma.serviceAllowance.createMany({ data: serviceAllowanceData, skipDuplicates: true })

  // 5.25 Seed Products
  console.log('Seeding products...')
  const products = [
    { id: 'P01', name: 'Fresh Milk 1L', category: 'Dairy', brand: Brand.FRESH, isChilled: true, volumeM3: 0.001, weightKg: 1 },
    { id: 'P02', name: 'Chicken Breast 1kg', category: 'Meat', brand: Brand.FRESH, isChilled: true, volumeM3: 0.002, weightKg: 1 },
    { id: 'P03', name: 'Carrots 1kg', category: 'Produce', brand: Brand.FRESH, isChilled: true, volumeM3: 0.003, weightKg: 1 },
    { id: 'P04', name: 'Rice 5kg', category: 'Dry Groceries', brand: Brand.FRESH, isChilled: false, volumeM3: 0.005, weightKg: 5 },
    { id: 'P05', name: 'Bread Loaf', category: 'Bakery', brand: Brand.FRESH, isChilled: false, volumeM3: 0.004, weightKg: 0.5 },
    { id: 'P06', name: 'Orange Juice 1L', category: 'Beverages', brand: Brand.FRESH, isChilled: false, volumeM3: 0.001, weightKg: 1 },
  ]
  await prisma.product.createMany({ data: products, skipDuplicates: true })

  // 5.5 Seed Orders (Task2b scenario)
  console.log('Seeding orders...')
  const orders = readCsv('task2b_peak_day_scenarios.csv')
  const targetDate = new Date()
  targetDate.setHours(0, 0, 0, 0)
  const ordersData = orders
    .filter((row: any) => row.scenario === 'S1')
    .map((row: any) => ({
      id: row.order_ref,
      outletId: row.outlet_id,
      status: OrderStatus.CONFIRMED,
      targetDate: targetDate,
      cutoffTime: new Date(targetDate.getTime() - 8 * 60 * 60 * 1000), // Previous day 4pm
      totalVolumeM3: parseFloat(row.order_volume_m3),
      totalWeightKg: parseFloat(row.order_weight_kg),
      isChilled: row.temp_requirement === 'chilled',
      deferredYesterday: row.deferred_yesterday === '1',
      daysSinceLastServed: parseInt(row.days_since_last_served),
    }))

  let kandyOrderIdx = 1;
  const kandyOrdersData: any[] = [];
  for (const row of outlets) {
    if (row.depot_id === 'Kandy' || row.depot === 'Kandy') {
      const isChilled = kandyOrderIdx % 3 === 0;
      kandyOrdersData.push({
        id: `KND-${kandyOrderIdx.toString().padStart(3, '0')}`,
        outletId: row.outlet_id,
        status: OrderStatus.CONFIRMED,
        targetDate: targetDate,
        cutoffTime: new Date(targetDate.getTime() - 8 * 60 * 60 * 1000),
        totalVolumeM3: isChilled ? 1.5 : 2.0,
        totalWeightKg: isChilled ? 300 : 500,
        isChilled: isChilled,
        deferredYesterday: false,
        daysSinceLastServed: 1,
      });
      kandyOrderIdx++;
    }
  }

  await prisma.order.createMany({
    data: [...ordersData, ...kandyOrdersData],
    skipDuplicates: true,
  })

  // 6. Users (Auth)
  console.log('Seeding users...')
  const passwordHash = await bcrypt.hash('password123', 10)
  
  const seedUsers = [
    { email: 'store@waypoint.com', role: Role.STORE_MANAGER, outletId: 'OUT001', vehicleId: null, depotId: null },
    { email: 'dispatch@waypoint.com', role: Role.DISPATCHER, outletId: null, vehicleId: null, depotId: 'DEP_PEL' },
    { email: 'loader@waypoint.com', role: Role.LOADER, outletId: null, vehicleId: null, depotId: 'DEP_PEL' },
    { email: 'driver@waypoint.com', role: Role.DRIVER, outletId: null, vehicleId: 'VEH001', depotId: null },
  ]

  for (const u of seedUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: passwordHash },
      create: {
        email: u.email,
        password: passwordHash,
        role: u.role,
        outletId: u.outletId,
        vehicleId: u.vehicleId,
        depotId: u.depotId,
      },
    })
  }

  console.log('Seed completed successfully.')
  console.log('--- SEEDED ACCOUNTS ---')
  seedUsers.forEach(u => console.log(`Email: ${u.email} | Password: password123 | Role: ${u.role}`))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
  })
