import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { Role, TripStatus, OrderStatus, StopOutcome } from '@prisma/client'

interface CheckResult {
  category: string
  name: string
  expected: any
  actual: any
  passed: boolean
  error?: string
}

const results: CheckResult[] = []

function record(
  passed: boolean,
  category: string,
  name: string,
  expected: any,
  actual: any,
  error?: string
) {
  results.push({ category, name, expected, actual, passed, error })
  const tag = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${tag} [${category}] ${name}`)
  if (!passed) {
    console.error(`   Expected: ${JSON.stringify(expected)}`)
    console.error(`   Actual:   ${JSON.stringify(actual)}`)
    if (error) console.error(`   Details:  ${error}`)
  }
}

async function run() {
  console.log('====================================================================')
  console.log('   CHALLENGER M3_1: EMPIRICAL DRIVER API & LIFECYCLE VERIFICATION')
  console.log('   Target: http://localhost:3000 against PostgreSQL (localhost:5432)')
  console.log('====================================================================\n')

  const baseUrl = 'http://localhost:3000'

  // 1. Setup Session Tokens
  const driverUser = await prisma.user.findFirst({ where: { role: Role.DRIVER } })
  const storeUser = await prisma.user.findFirst({ where: { role: Role.STORE_MANAGER } })

  if (!driverUser) throw new Error('No driver user found in DB')
  if (!storeUser) throw new Error('No store manager user found in DB')

  const driverSessionToken = await encrypt({
    userId: driverUser.id,
    role: Role.DRIVER,
    email: driverUser.email,
    outletId: null,
    vehicleId: 'VEH001',
    depotId: null,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const driverCookie = `session=${driverSessionToken}`

  const storeSessionToken = await encrypt({
    userId: storeUser.id,
    role: Role.STORE_MANAGER,
    email: storeUser.email,
    outletId: storeUser.outletId,
    vehicleId: null,
    depotId: null,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const storeCookie = `session=${storeSessionToken}`

  // =========================================================================
  // SUITE 1: Role-Based Access Control (RBAC) & Authentication
  // =========================================================================
  console.log('--- SUITE 1: RBAC & Authentication Checks ---')

  // 1.1 Unauthenticated GET /api/driver/trip
  const unauthGetRes = await fetch(`${baseUrl}/api/driver/trip`, { redirect: 'manual' })
  record(
    unauthGetRes.status === 401 || unauthGetRes.status === 307,
    'RBAC',
    'Unauthenticated GET /api/driver/trip is rejected (401 or 307)',
    '401 or 307',
    unauthGetRes.status
  )

  // 1.2 Store Manager GET /api/driver/trip
  const storeGetRes = await fetch(`${baseUrl}/api/driver/trip`, {
    headers: { Cookie: storeCookie }
  })
  record(
    storeGetRes.status === 401,
    'RBAC',
    'STORE_MANAGER role rejected from GET /api/driver/trip with 401',
    401,
    storeGetRes.status
  )

  // 1.3 Unauthenticated POST /api/driver/trip/start
  const unauthStartRes = await fetch(`${baseUrl}/api/driver/trip/start`, {
    method: 'POST',
    redirect: 'manual'
  })
  record(
    unauthStartRes.status === 401 || unauthStartRes.status === 307,
    'RBAC',
    'Unauthenticated POST /api/driver/trip/start is rejected (401 or 307)',
    '401 or 307',
    unauthStartRes.status
  )

  // 1.4 Store Manager POST /api/driver/trip/start
  const storeStartRes = await fetch(`${baseUrl}/api/driver/trip/start`, {
    method: 'POST',
    headers: { Cookie: storeCookie }
  })
  record(
    storeStartRes.status === 401,
    'RBAC',
    'STORE_MANAGER role rejected from POST /api/driver/trip/start with 401',
    401,
    storeStartRes.status
  )

  // =========================================================================
  // SETUP TEST DATA: Reset or ensure clean test trip on VEH001
  // =========================================================================
  console.log('\n--- SETTING UP CLEAN TEST TRIP FOR VEH001 ---')
  const tripId = 'TRIP-97x8imc'
  const targetTrip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { stops: { include: { order: true } } }
  })

  if (!targetTrip) {
    throw new Error(`Target trip ${tripId} not found in database!`)
  }

  // Clear existing sync events and proof of delivery for this trip's stops
  const stopIds = targetTrip.stops.map(s => s.id)
  const orderIds = targetTrip.stops.map(s => s.orderId).filter(Boolean) as string[]

  await prisma.proofOfDelivery.deleteMany({
    where: { tripStopId: { in: stopIds } }
  })
  await prisma.syncEvent.deleteMany({
    where: {
      OR: [
        { clientEventId: { in: stopIds.map(id => `sync-${id}`) } },
        { clientEventId: { startsWith: 'sync-test-' } }
      ]
    }
  })

  // Reset stops outcome and order status to LOADING
  await prisma.tripStop.updateMany({
    where: { id: { in: stopIds } },
    data: { outcome: null, actualArrival: null }
  })
  await prisma.order.updateMany({
    where: { id: { in: orderIds } },
    data: { status: OrderStatus.LOADING }
  })
  await prisma.trip.update({
    where: { id: tripId },
    data: { status: TripStatus.LOADING }
  })

  console.log(`Trip ${tripId} reset to LOADING status with ${stopIds.length} stops reset to pending.\n`)

  // =========================================================================
  // SUITE 2: GET /api/driver/trip - Active Trip Fetching
  // =========================================================================
  console.log('--- SUITE 2: GET /api/driver/trip ---')

  const tripRes = await fetch(`${baseUrl}/api/driver/trip`, {
    headers: { Cookie: driverCookie }
  })
  record(
    tripRes.status === 200,
    'GET /trip',
    'GET /api/driver/trip returns HTTP 200 for authenticated driver',
    200,
    tripRes.status
  )

  const tripData = await tripRes.json()
  record(
    tripData.success === true,
    'GET /trip',
    'Response indicates success: true',
    true,
    tripData.success
  )

  record(
    tripData.trip?.id === tripId,
    'GET /trip',
    `Response returns active trip (${tripId}) for VEH001`,
    tripId,
    tripData.trip?.id
  )

  record(
    tripData.vehicle?.id === 'VEH001',
    'GET /trip',
    'Response returns vehicle with id VEH001',
    'VEH001',
    tripData.vehicle?.id
  )

  record(
    Array.isArray(tripData.stops) && tripData.stops.length === stopIds.length,
    'GET /trip',
    `Response returns ${stopIds.length} stops`,
    stopIds.length,
    tripData.stops?.length
  )

  // Verify stops are ordered ascending by sequence
  const sequences = (tripData.stops || []).map((s: any) => s.sequence)
  const isAscending = sequences.slice(1).every((s: number, i: number) => s >= sequences[i])
  record(
    isAscending,
    'GET /trip',
    'Stops are ordered in ascending sequence',
    true,
    isAscending
  )

  // Verify stops include order and outlet relations
  const allStopsHaveOutlet = (tripData.stops || []).every((s: any) => s.order?.outlet?.name)
  record(
    allStopsHaveOutlet,
    'GET /trip',
    'Each stop includes populated order and outlet details',
    true,
    allStopsHaveOutlet
  )

  // =========================================================================
  // SUITE 3: POST /api/driver/trip/start - Route Start & Status Transitions
  // =========================================================================
  console.log('\n--- SUITE 3: POST /api/driver/trip/start ---')

  const startRes = await fetch(`${baseUrl}/api/driver/trip/start`, {
    method: 'POST',
    headers: {
      Cookie: driverCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tripId })
  })

  record(
    startRes.status === 200,
    'POST /trip/start',
    'POST /api/driver/trip/start returns HTTP 200',
    200,
    startRes.status
  )

  const startData = await startRes.json()
  record(
    startData.success === true && startData.status === 'IN_TRANSIT',
    'POST /trip/start',
    'Response payload returns { success: true, status: "IN_TRANSIT" }',
    { success: true, status: 'IN_TRANSIT' },
    startData
  )

  // Directly verify PostgreSQL DB state for Trip and Orders
  const dbTripAfterStart = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { stops: { include: { order: true } } }
  })

  record(
    dbTripAfterStart?.status === TripStatus.IN_TRANSIT,
    'DB Persistence / Start',
    'Trip.status is IN_TRANSIT in live PostgreSQL',
    TripStatus.IN_TRANSIT,
    dbTripAfterStart?.status
  )

  const allOrdersInTransit = (dbTripAfterStart?.stops || []).every(
    s => s.order?.status === OrderStatus.IN_TRANSIT
  )
  record(
    allOrdersInTransit,
    'DB Persistence / Start',
    'All associated Order.status transitioned to IN_TRANSIT in live PostgreSQL',
    true,
    allOrdersInTransit
  )

  // Verify AuditLog record in DB
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      action: 'DRIVER_START_ROUTE',
      userId: driverUser.id
    },
    orderBy: { createdAt: 'desc' },
    take: 1
  })
  record(
    auditLogs.length > 0 && (auditLogs[0].details as any)?.tripId === tripId,
    'AuditLog',
    'AuditLog entry DRIVER_START_ROUTE recorded with tripId',
    true,
    auditLogs.length > 0
  )

  // =========================================================================
  // SUITE 4: POST /api/driver/sync - Stop Completion, POD, and Multi-stop Progression
  // =========================================================================
  console.log('\n--- SUITE 4: POST /api/driver/sync & Proof Of Delivery ---')

  const sortedStops = (dbTripAfterStart?.stops || []).sort((a, b) => a.sequence - b.sequence)
  const stop1 = sortedStops[0]
  const stop2 = sortedStops[1]
  const stop3 = sortedStops[2]

  // Test 4.1: Complete Stop 1 (Partial trip completion)
  const stop1EventId = `sync-test-stop1-${Date.now()}`
  const syncStop1Res = await fetch(`${baseUrl}/api/driver/sync`, {
    method: 'POST',
    headers: {
      Cookie: driverCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      events: [
        {
          id: stop1EventId,
          type: 'STOP_COMPLETION',
          tripStopId: stop1.id,
          outcome: 'SUCCESS',
          signature: 'data:image/png;base64,mockSignature1',
          photo: 'data:image/png;base64,mockPhoto1',
          createdAt: new Date().toISOString()
        }
      ]
    })
  })

  record(
    syncStop1Res.status === 200,
    'POST /sync / Stop 1',
    'POST /api/driver/sync returns HTTP 200 on STOP_COMPLETION',
    200,
    syncStop1Res.status
  )

  const syncStop1Data = await syncStop1Res.json()
  record(
    syncStop1Data.success === true && syncStop1Data.processedCount === 1,
    'POST /sync / Stop 1',
    'Sync reports success: true and processedCount: 1',
    { success: true, processedCount: 1 },
    { success: syncStop1Data.success, processedCount: syncStop1Data.processedCount }
  )

  // Verify DB state after Stop 1
  const dbStop1 = await prisma.tripStop.findUnique({
    where: { id: stop1.id },
    include: { order: true }
  })
  record(
    dbStop1?.outcome === StopOutcome.SUCCESS,
    'DB Persistence / Stop 1',
    'Stop 1 outcome updated to SUCCESS in PostgreSQL',
    StopOutcome.SUCCESS,
    dbStop1?.outcome
  )
  record(
    dbStop1?.order?.status === OrderStatus.DELIVERED,
    'DB Persistence / Stop 1',
    'Stop 1 associated Order.status updated to DELIVERED in PostgreSQL',
    OrderStatus.DELIVERED,
    dbStop1?.order?.status
  )

  // Verify ProofOfDelivery in DB
  const pod1 = await prisma.proofOfDelivery.findFirst({
    where: { tripStopId: stop1.id }
  })
  record(
    pod1 !== null && pod1.clientEventId === stop1EventId && !!pod1.signatureUrl,
    'DB Persistence / POD',
    'ProofOfDelivery created with clientEventId and signatureUrl in PostgreSQL',
    true,
    pod1 !== null
  )

  // Verify Trip is still IN_TRANSIT (since stops 2 & 3 are not done yet)
  const dbTripMidWay = await prisma.trip.findUnique({ where: { id: tripId } })
  record(
    dbTripMidWay?.status === TripStatus.IN_TRANSIT,
    'Trip Status Progression',
    'Trip status remains IN_TRANSIT while pending stops remain',
    TripStatus.IN_TRANSIT,
    dbTripMidWay?.status
  )

  // =========================================================================
  // SUITE 5: Offline Sync Idempotency & Replay Safety
  // =========================================================================
  console.log('\n--- SUITE 5: Sync Idempotency Check ---')

  const replayRes = await fetch(`${baseUrl}/api/driver/sync`, {
    method: 'POST',
    headers: {
      Cookie: driverCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      events: [
        {
          id: stop1EventId, // Exact same ID replayed
          type: 'STOP_COMPLETION',
          tripStopId: stop1.id,
          outcome: 'SUCCESS',
          signature: 'data:image/png;base64,mockSignature1',
          photo: 'data:image/png;base64,mockPhoto1'
        }
      ]
    })
  })

  record(
    replayRes.status === 200,
    'Sync Idempotency',
    'Replaying previously synced event returns HTTP 200 without error',
    200,
    replayRes.status
  )

  const replayData = await replayRes.json()
  record(
    replayData.success === true && replayData.results?.[0]?.success === true,
    'Sync Idempotency',
    'Replay result reports success: true',
    true,
    replayData.results?.[0]?.success
  )

  // Ensure POD count for this stop did not duplicate
  const podCount = await prisma.proofOfDelivery.count({
    where: { tripStopId: stop1.id }
  })
  record(
    podCount === 1,
    'Sync Idempotency',
    'ProofOfDelivery record count remains exactly 1 in PostgreSQL (no duplication)',
    1,
    podCount
  )

  // =========================================================================
  // SUITE 6: Complete Remaining Stops -> Trip Auto-Completion
  // =========================================================================
  console.log('\n--- SUITE 6: Final Stops & Auto-Completion of Trip ---')

  // Sync remaining stops (stop2, stop3) in a batch
  const remainingBatch = [
    {
      id: `sync-test-stop2-${Date.now()}`,
      type: 'STOP_COMPLETION',
      tripStopId: stop2.id,
      outcome: 'SUCCESS',
      signature: 'sig-stop2',
      photo: 'photo-stop2',
      createdAt: new Date().toISOString()
    },
    {
      id: `sync-test-stop3-${Date.now()}`,
      type: 'STOP_COMPLETION',
      tripStopId: stop3.id,
      outcome: 'SUCCESS',
      signature: 'sig-stop3',
      photo: 'photo-stop3',
      createdAt: new Date().toISOString()
    }
  ]

  const batchRes = await fetch(`${baseUrl}/api/driver/sync`, {
    method: 'POST',
    headers: {
      Cookie: driverCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ events: remainingBatch })
  })

  record(
    batchRes.status === 200,
    'POST /sync Batch',
    'POST /api/driver/sync with multiple remaining stops returns HTTP 200',
    200,
    batchRes.status
  )

  const batchData = await batchRes.json()
  record(
    batchData.processedCount === 2,
    'POST /sync Batch',
    'Batch processed both stops (processedCount: 2)',
    2,
    batchData.processedCount
  )

  // Verify all orders are now DELIVERED
  const allOrdersDelivered = await prisma.order.findMany({
    where: { id: { in: orderIds } }
  })
  record(
    allOrdersDelivered.every(o => o.status === OrderStatus.DELIVERED),
    'DB Persistence / Completion',
    'All 3 orders are DELIVERED in PostgreSQL',
    true,
    allOrdersDelivered.every(o => o.status === OrderStatus.DELIVERED)
  )

  // Verify Trip.status transitioned to COMPLETED
  const finalTripState = await prisma.trip.findUnique({
    where: { id: tripId }
  })
  record(
    finalTripState?.status === TripStatus.COMPLETED,
    'DB Persistence / Completion',
    'Trip.status transitioned to COMPLETED in PostgreSQL after all stops done',
    TripStatus.COMPLETED,
    finalTripState?.status
  )

  // =========================================================================
  // SUITE 7: GET /api/driver/trip When Trip is COMPLETED
  // =========================================================================
  console.log('\n--- SUITE 7: GET /api/driver/trip When Completed ---')

  const completedTripRes = await fetch(`${baseUrl}/api/driver/trip`, {
    headers: { Cookie: driverCookie }
  })
  record(
    completedTripRes.status === 200,
    'GET /trip (Completed)',
    'GET /api/driver/trip returns 200 when vehicle has no active trips',
    200,
    completedTripRes.status
  )

  const completedTripData = await completedTripRes.json()
  record(
    completedTripData.success === true && completedTripData.trip === null,
    'GET /trip (Completed)',
    'Returns { success: true, trip: null, stops: [] } gracefully without error',
    null,
    completedTripData.trip
  )

  // =========================================================================
  // SUITE 8: Adversarial Edge Cases
  // =========================================================================
  console.log('\n--- SUITE 8: Adversarial Edge Cases ---')

  // 8.1 Calling /api/driver/trip/start when no ready trip exists
  const noTripStartRes = await fetch(`${baseUrl}/api/driver/trip/start`, {
    method: 'POST',
    headers: { Cookie: driverCookie }
  })
  record(
    noTripStartRes.status === 404,
    'Adversarial / Start Route',
    'Starting route when no ready trip exists returns 404',
    404,
    noTripStartRes.status
  )

  // 8.2 Malformed payload to /api/driver/sync
  const malformedSyncRes = await fetch(`${baseUrl}/api/driver/sync`, {
    method: 'POST',
    headers: {
      Cookie: driverCookie,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ notAnEvent: 123 })
  })
  record(
    malformedSyncRes.status === 200 || malformedSyncRes.status === 400,
    'Adversarial / Sync',
    'Malformed sync body handled gracefully without 500 server crash',
    '200 or 400',
    malformedSyncRes.status
  )

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n====================================================================')
  const total = results.length
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

run()
  .catch(err => {
    console.error('Fatal test error:', err)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
