import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { GET as getDriverTrip } from '../src/app/api/driver/trip/route'
import { POST as startDriverTrip } from '../src/app/api/driver/trip/start/route'
import { POST as syncDriver } from '../src/app/api/driver/sync/route'
import { POST as confirmReceipt, GET as getReceiptOrder } from '../src/app/api/store/orders/[id]/confirm-receipt/route'
import { Role, TripStatus, OrderStatus, StopOutcome } from '@prisma/client'

interface AssertionRecord {
  category: string
  test: string
  expected: any
  actual: any
  passed: boolean
  details?: string
}

const assertions: AssertionRecord[] = []

function assert(
  passed: boolean,
  category: string,
  test: string,
  expected: any,
  actual: any,
  details?: string
) {
  assertions.push({ category, test, expected, actual, passed, details })
  const icon = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${icon} [${category}] ${test}`)
  if (!passed) {
    console.error(`   Expected: ${JSON.stringify(expected)}`)
    console.error(`   Actual:   ${JSON.stringify(actual)}`)
    if (details) console.error(`   Details:  ${details}`)
  }
}

async function runEmpiricalHarness() {
  console.log('====================================================================')
  console.log('   EMPIRICAL CHALLENGER M3_1: DIRECT ROUTE & POSTGRESQL VERIFICATION')
  console.log('   Database: PostgreSQL 16 on localhost:5432 (Prisma client)')
  console.log('====================================================================\n')

  // 1. Session Setup
  const driverUser = await prisma.user.findFirst({ where: { role: Role.DRIVER } })
  const storeUser = await prisma.user.findFirst({ where: { role: Role.STORE_MANAGER } })

  if (!driverUser) throw new Error('Missing DRIVER user')
  if (!storeUser) throw new Error('Missing STORE_MANAGER user')

  const driverToken = await encrypt({
    userId: driverUser.id,
    role: Role.DRIVER,
    email: driverUser.email,
    vehicleId: 'VEH001',
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const driverCookieHeader = `session=${driverToken}`

  const storeToken = await encrypt({
    userId: storeUser.id,
    role: Role.STORE_MANAGER,
    email: storeUser.email,
    outletId: storeUser.outletId,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const storeCookieHeader = `session=${storeToken}`

  // -------------------------------------------------------------------------
  // SUITE 1: RBAC Enforcement
  // -------------------------------------------------------------------------
  console.log('--- SUITE 1: RBAC Enforcement on Driver Endpoints ---')

  // Unauthenticated GET /api/driver/trip
  const unauthTripReq = new Request('http://localhost:3000/api/driver/trip')
  const unauthTripRes = await getDriverTrip(unauthTripReq)
  assert(
    unauthTripRes.status === 401,
    'RBAC',
    'Unauthenticated GET /api/driver/trip returns 401 Unauthorized',
    401,
    unauthTripRes.status
  )

  // STORE_MANAGER accessing GET /api/driver/trip
  const storeTripReq = new Request('http://localhost:3000/api/driver/trip', {
    headers: { cookie: storeCookieHeader }
  })
  const storeTripRes = await getDriverTrip(storeTripReq)
  assert(
    storeTripRes.status === 401,
    'RBAC',
    'STORE_MANAGER role rejected from GET /api/driver/trip with 401',
    401,
    storeTripRes.status
  )

  // Unauthenticated POST /api/driver/trip/start
  const unauthStartReq = new Request('http://localhost:3000/api/driver/trip/start', {
    method: 'POST',
    body: JSON.stringify({})
  })
  const unauthStartRes = await startDriverTrip(unauthStartReq)
  assert(
    unauthStartRes.status === 401,
    'RBAC',
    'Unauthenticated POST /api/driver/trip/start returns 401 Unauthorized',
    401,
    unauthStartRes.status
  )

  // STORE_MANAGER accessing POST /api/driver/trip/start
  const storeStartReq = new Request('http://localhost:3000/api/driver/trip/start', {
    method: 'POST',
    headers: { cookie: storeCookieHeader },
    body: JSON.stringify({})
  })
  const storeStartRes = await startDriverTrip(storeStartReq)
  assert(
    storeStartRes.status === 401,
    'RBAC',
    'STORE_MANAGER role rejected from POST /api/driver/trip/start with 401',
    401,
    storeStartRes.status
  )

  // -------------------------------------------------------------------------
  // SETUP: Reset TRIP-97x8imc on VEH001 to clean LOADING state
  // -------------------------------------------------------------------------
  console.log('\n--- SETUP: Preparing VEH001 Trip in PostgreSQL ---')
  const tripId = 'TRIP-97x8imc'
  const targetTrip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { stops: true }
  })
  if (!targetTrip) throw new Error(`Trip ${tripId} not found`)

  const stopIds = targetTrip.stops.map(s => s.id)
  const orderIds = targetTrip.stops.map(s => s.orderId).filter(Boolean) as string[]

  // Clean prior sync artifacts
  await prisma.proofOfDelivery.deleteMany({ where: { tripStopId: { in: stopIds } } })
  await prisma.syncEvent.deleteMany({
    where: {
      OR: [
        { clientEventId: { in: stopIds.map(id => `sync-${id}`) } },
        { clientEventId: { in: stopIds.map(id => `direct-sync-${id}`) } },
        { clientEventId: { in: stopIds.map(id => `sync-test-${id}`) } }
      ]
    }
  })

  // Reset stops and orders to LOADING
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

  // -------------------------------------------------------------------------
  // SUITE 2: GET /api/driver/trip returns active trip for VEH001 with vehicle and stops
  // -------------------------------------------------------------------------
  console.log('--- SUITE 2: GET /api/driver/trip Active Trip Query ---')

  const getTripReq = new Request('http://localhost:3000/api/driver/trip', {
    headers: { cookie: driverCookieHeader }
  })
  const getTripRes = await getDriverTrip(getTripReq)
  assert(
    getTripRes.status === 200,
    'GET /api/driver/trip',
    'Returns HTTP 200 for authenticated driver',
    200,
    getTripRes.status
  )

  const tripData = await getTripRes.json()
  assert(
    tripData.success === true,
    'GET /api/driver/trip',
    'Response contains success: true',
    true,
    tripData.success
  )
  assert(
    tripData.trip?.id === tripId,
    'GET /api/driver/trip',
    `Returns active trip ${tripId} for VEH001`,
    tripId,
    tripData.trip?.id
  )
  assert(
    tripData.vehicle?.id === 'VEH001',
    'GET /api/driver/trip',
    'Returns vehicle object with id VEH001',
    'VEH001',
    tripData.vehicle?.id
  )
  assert(
    Array.isArray(tripData.stops) && tripData.stops.length === stopIds.length,
    'GET /api/driver/trip',
    `Returns stops array matching database count (${stopIds.length})`,
    stopIds.length,
    tripData.stops?.length
  )

  // Verify stop sequences ascending
  const seqs = (tripData.stops || []).map((s: any) => s.sequence)
  const isSeqAsc = seqs.slice(1).every((s: number, i: number) => s >= seqs[i])
  assert(
    isSeqAsc,
    'GET /api/driver/trip',
    'Trip stops are ordered in ascending sequence',
    true,
    isSeqAsc
  )

  // Verify stop order and outlet populated
  const allStopsPopulated = (tripData.stops || []).every(
    (s: any) => s.order && s.order.outlet && s.order.outlet.name
  )
  assert(
    allStopsPopulated,
    'GET /api/driver/trip',
    'All stops have order and outlet details included',
    true,
    allStopsPopulated
  )

  // -------------------------------------------------------------------------
  // SUITE 3: POST /api/driver/trip/start transitions Trip.status to IN_TRANSIT and Order.status to IN_TRANSIT
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: POST /api/driver/trip/start Lifecycle Transition ---')

  const startTripReq = new Request('http://localhost:3000/api/driver/trip/start', {
    method: 'POST',
    headers: {
      cookie: driverCookieHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tripId })
  })
  const startTripRes = await startDriverTrip(startTripReq)
  assert(
    startTripRes.status === 200,
    'POST /api/driver/trip/start',
    'Returns HTTP 200 on route start',
    200,
    startTripRes.status
  )

  const startTripData = await startTripRes.json()
  assert(
    startTripData.success === true && startTripData.status === 'IN_TRANSIT',
    'POST /api/driver/trip/start',
    'Returns { success: true, status: "IN_TRANSIT" }',
    { success: true, status: 'IN_TRANSIT' },
    startTripData
  )

  // Verify in PostgreSQL live database
  const pgTripAfterStart = await prisma.trip.findUnique({
    where: { id: tripId },
    include: { stops: { include: { order: true } } }
  })
  assert(
    pgTripAfterStart?.status === TripStatus.IN_TRANSIT,
    'Postgres Persistence',
    'Trip.status transitioned to IN_TRANSIT in live PostgreSQL',
    TripStatus.IN_TRANSIT,
    pgTripAfterStart?.status
  )

  const pgOrdersInTransit = (pgTripAfterStart?.stops || []).every(
    s => s.order?.status === OrderStatus.IN_TRANSIT
  )
  assert(
    pgOrdersInTransit,
    'Postgres Persistence',
    'All associated Order.status transitioned to IN_TRANSIT in live PostgreSQL',
    true,
    pgOrdersInTransit
  )

  // Verify AuditLog in live PostgreSQL
  const auditEntry = await prisma.auditLog.findFirst({
    where: {
      action: 'DRIVER_START_ROUTE',
      userId: driverUser.id
    },
    orderBy: { createdAt: 'desc' }
  })
  assert(
    auditEntry !== null && (auditEntry.details as any)?.tripId === tripId,
    'Postgres AuditLog',
    'AuditLog records DRIVER_START_ROUTE with tripId in live PostgreSQL',
    true,
    auditEntry !== null
  )

  // -------------------------------------------------------------------------
  // SUITE 4: POST /api/driver/sync STOP_COMPLETION event transitions Order.status to DELIVERED, records ProofOfDelivery, and completes Trip
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: POST /api/driver/sync Proof of Delivery & Progression ---')

  const sortedStops = (pgTripAfterStart?.stops || []).sort((a, b) => a.sequence - b.sequence)
  const stop1 = sortedStops[0]
  const stop2 = sortedStops[1]
  const stop3 = sortedStops[2]

  // Complete Stop 1
  const stop1EventId = `direct-sync-${stop1.id}`
  const syncStop1Req = new Request('http://localhost:3000/api/driver/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [
        {
          id: stop1EventId,
          type: 'STOP_COMPLETION',
          tripStopId: stop1.id,
          outcome: 'SUCCESS',
          signature: 'data:image/svg+xml;base64,mockSig1',
          photo: 'data:image/jpeg;base64,mockPhoto1',
          createdAt: new Date().toISOString()
        }
      ]
    })
  })
  const syncStop1Res = await syncDriver(syncStop1Req)
  assert(
    syncStop1Res.status === 200,
    'POST /api/driver/sync',
    'Returns HTTP 200 on stop completion',
    200,
    syncStop1Res.status
  )

  const syncStop1Data = await syncStop1Res.json()
  assert(
    syncStop1Data.success === true && syncStop1Data.processedCount === 1,
    'POST /api/driver/sync',
    'Reports success: true and processedCount: 1',
    1,
    syncStop1Data.processedCount
  )

  // Verify Stop 1 in PostgreSQL
  const pgStop1 = await prisma.tripStop.findUnique({
    where: { id: stop1.id },
    include: { order: true }
  })
  assert(
    pgStop1?.outcome === StopOutcome.SUCCESS,
    'Postgres Persistence',
    'Stop 1 outcome is SUCCESS in live PostgreSQL',
    StopOutcome.SUCCESS,
    pgStop1?.outcome
  )
  assert(
    pgStop1?.order?.status === OrderStatus.DELIVERED,
    'Postgres Persistence',
    'Stop 1 associated Order.status is DELIVERED in live PostgreSQL',
    OrderStatus.DELIVERED,
    pgStop1?.order?.status
  )

  // Verify ProofOfDelivery record in PostgreSQL
  const pgPod1 = await prisma.proofOfDelivery.findFirst({
    where: { tripStopId: stop1.id }
  })
  assert(
    pgPod1 !== null && pgPod1.clientEventId === stop1EventId,
    'Postgres Persistence',
    'ProofOfDelivery record created with matching clientEventId in PostgreSQL',
    stop1EventId,
    pgPod1?.clientEventId
  )
  assert(
    !!pgPod1?.signatureUrl && !!pgPod1?.photoUrl,
    'Postgres Persistence',
    'ProofOfDelivery contains signatureUrl and photoUrl in PostgreSQL',
    true,
    !!pgPod1?.signatureUrl && !!pgPod1?.photoUrl
  )

  // Verify Trip is still IN_TRANSIT (not prematurely COMPLETED)
  const pgTripMid = await prisma.trip.findUnique({ where: { id: tripId } })
  assert(
    pgTripMid?.status === TripStatus.IN_TRANSIT,
    'Trip Status Progression',
    'Trip.status remains IN_TRANSIT while remaining stops are pending',
    TripStatus.IN_TRANSIT,
    pgTripMid?.status
  )

  // -------------------------------------------------------------------------
  // SUITE 5: Sync Idempotency & Duplicate Replay Protection
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Sync Replay Idempotency ---')

  const replayReq = new Request('http://localhost:3000/api/driver/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [
        {
          id: stop1EventId,
          type: 'STOP_COMPLETION',
          tripStopId: stop1.id,
          outcome: 'SUCCESS',
          signature: 'data:image/svg+xml;base64,mockSig1',
          photo: 'data:image/jpeg;base64,mockPhoto1'
        }
      ]
    })
  })
  const replayRes = await syncDriver(replayReq)
  const replayData = await replayRes.json()
  assert(
    replayRes.status === 200 && replayData.success === true,
    'Sync Idempotency',
    'Replaying identical sync event returns 200 with success: true',
    true,
    replayData.success
  )

  const podCount = await prisma.proofOfDelivery.count({
    where: { tripStopId: stop1.id }
  })
  assert(
    podCount === 1,
    'Sync Idempotency',
    'No duplicate ProofOfDelivery created (count remains exactly 1)',
    1,
    podCount
  )

  // -------------------------------------------------------------------------
  // SUITE 6: Complete Remaining Stops -> Trip Auto-Transition to COMPLETED
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Multi-Stop Batch & Automatic Trip Completion ---')

  const stop2EventId = `direct-sync-${stop2.id}`
  const stop3EventId = `direct-sync-${stop3.id}`

  const remainingBatchReq = new Request('http://localhost:3000/api/driver/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [
        {
          id: stop2EventId,
          type: 'STOP_COMPLETION',
          tripStopId: stop2.id,
          outcome: 'SUCCESS',
          signature: 'sig2',
          photo: 'photo2'
        },
        {
          id: stop3EventId,
          type: 'STOP_COMPLETION',
          tripStopId: stop3.id,
          outcome: 'SUCCESS',
          signature: 'sig3',
          photo: 'photo3'
        }
      ]
    })
  })
  const batchRes = await syncDriver(remainingBatchReq)
  const batchData = await batchRes.json()
  assert(
    batchRes.status === 200 && batchData.processedCount === 2,
    'Batch Sync',
    'Remaining stops processed successfully (processedCount: 2)',
    2,
    batchData.processedCount
  )

  // Verify all orders are now DELIVERED
  const pgOrdersFinal = await prisma.order.findMany({
    where: { id: { in: orderIds } }
  })
  const allDelivered = pgOrdersFinal.every(o => o.status === OrderStatus.DELIVERED)
  assert(
    allDelivered,
    'Postgres Persistence',
    'All 3 orders have transitioned to DELIVERED in live PostgreSQL',
    true,
    allDelivered
  )

  // Verify Trip transitioned to COMPLETED
  const pgTripFinal = await prisma.trip.findUnique({ where: { id: tripId } })
  assert(
    pgTripFinal?.status === TripStatus.COMPLETED,
    'Postgres Persistence',
    'Trip.status transitioned to COMPLETED in live PostgreSQL after all stops done',
    TripStatus.COMPLETED,
    pgTripFinal?.status
  )

  // -------------------------------------------------------------------------
  // SUITE 7: Subsequent GET /api/driver/trip Graceful Empty State
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 7: GET /api/driver/trip on Completed Trip ---')

  const completedTripReq = new Request('http://localhost:3000/api/driver/trip', {
    headers: { cookie: driverCookieHeader }
  })
  const completedTripRes = await getDriverTrip(completedTripReq)
  const completedTripData = await completedTripRes.json()
  assert(
    completedTripRes.status === 200 && completedTripData.trip === null,
    'GET /api/driver/trip',
    'Returns { success: true, trip: null, stops: [] } gracefully when no active trip',
    null,
    completedTripData.trip
  )

  // -------------------------------------------------------------------------
  // SUITE 8: Store Manager Receipt Confirmation on Delivered Order
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 8: Store Manager Confirm Receipt (DELIVERED Order) ---')

  const testDeliveredOrderId = orderIds[0]
  const testDeliveredOrder = await prisma.order.findUnique({
    where: { id: testDeliveredOrderId }
  })

  // Create store session matching this order's outlet
  const outletStoreToken = await encrypt({
    userId: storeUser.id,
    role: Role.STORE_MANAGER,
    email: storeUser.email,
    outletId: testDeliveredOrder?.outletId,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const outletStoreCookieHeader = `session=${outletStoreToken}`

  const confirmReq = new Request(`http://localhost:3000/api/store/orders/${testDeliveredOrderId}/confirm-receipt`, {
    method: 'POST',
    headers: { cookie: outletStoreCookieHeader }
  })
  const confirmRes = await confirmReceipt(confirmReq, { params: { id: testDeliveredOrderId } })
  assert(
    confirmRes.status === 200,
    'Confirm Receipt',
    'POST /api/store/orders/[id]/confirm-receipt returns HTTP 200 for DELIVERED order',
    200,
    confirmRes.status
  )

  const confirmData = await confirmRes.json()
  assert(
    confirmData.success === true && confirmData.orderId === testDeliveredOrderId && confirmData.status === 'DELIVERED',
    'Confirm Receipt',
    'Returns { success: true, orderId, status: "DELIVERED" }',
    { success: true, orderId: testDeliveredOrderId, status: 'DELIVERED' },
    confirmData
  )

  // Verify AuditLog for receipt confirmation
  const receiptAudit = await prisma.auditLog.findFirst({
    where: {
      action: 'STORE_RECEIPT_CONFIRMED',
      details: { path: ['orderId'], equals: testDeliveredOrderId }
    }
  })
  assert(
    receiptAudit !== null,
    'Postgres AuditLog',
    'AuditLog entry STORE_RECEIPT_CONFIRMED recorded in live PostgreSQL',
    true,
    receiptAudit !== null
  )

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n====================================================================')
  const total = assertions.length
  const passed = assertions.filter(a => a.passed).length
  const failed = assertions.filter(a => !a.passed).length
  console.log(`TOTAL: ${total} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

runEmpiricalHarness()
  .catch(err => {
    console.error('Fatal test error:', err)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
