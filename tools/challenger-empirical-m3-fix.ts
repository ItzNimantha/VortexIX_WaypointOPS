import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { POST as startDriverTrip } from '../src/app/api/driver/trip/start/route'
import { POST as syncDriver } from '../src/app/api/driver/sync/route'
import { Role, TripStatus, OrderStatus, StopOutcome } from '@prisma/client'

interface AssertionRecord {
  section: string
  test: string
  expected: any
  actual: any
  passed: boolean
  details?: string
}

const assertions: AssertionRecord[] = []

function assert(
  passed: boolean,
  section: string,
  test: string,
  expected: any,
  actual: any,
  details?: string
) {
  assertions.push({ section, test, expected, actual, passed, details })
  const icon = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${icon} [${section}] ${test}`)
  if (!passed) {
    console.error(`   Expected: ${JSON.stringify(expected)}`)
    console.error(`   Actual:   ${JSON.stringify(actual)}`)
    if (details) console.error(`   Details:  ${details}`)
  }
}

async function runEmpiricalHarness() {
  console.log('========================================================================')
  console.log('  CHALLENGER M3 FIX: EMPIRICAL HARNESS FOR ROUTE START & DRIVER SYNC')
  console.log('  Testing against live PostgreSQL (localhost:5432) via Prisma Client')
  console.log('========================================================================\n')

  // Find or create test driver user
  let driverUser = await prisma.user.findFirst({ where: { role: Role.DRIVER } })
  if (!driverUser) {
    throw new Error('No DRIVER user found in DB')
  }

  const driverToken = await encrypt({
    userId: driverUser.id,
    role: Role.DRIVER,
    email: driverUser.email,
    vehicleId: 'VEH-TEST-M3',
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const driverCookieHeader = `session=${driverToken}`

  // Find an outlet for creating test orders
  const outlet = await prisma.outlet.findFirst()
  if (!outlet) throw new Error('No outlet found in DB')

  // Use existing vehicle
  const existingVehicle = await prisma.vehicle.findFirst()
  if (!existingVehicle) throw new Error('No vehicle found in DB')
  const vehicleId = existingVehicle.id

  // Generate unique test IDs
  const runId = Math.random().toString(36).substring(2, 8)
  const testTripId = `TRIP-M3FIX-${runId}`
  const orderAId = `ORD-M3FIX-A-${runId}`
  const orderBId = `ORD-M3FIX-B-${runId}`
  const orderCId = `ORD-M3FIX-C-${runId}`
  const stopAId = `STOP-M3FIX-A-${runId}`
  const stopBId = `STOP-M3FIX-B-${runId}`
  const stopCId = `STOP-M3FIX-C-${runId}`

  console.log(`Setting up isolated test fixtures with run ID: ${runId}`)

  try {
    // -------------------------------------------------------------------------
    // SETUP: Create isolated test orders and trip
    // -------------------------------------------------------------------------
    const now = new Date()
    await prisma.order.create({
      data: {
        id: orderAId,
        outletId: outlet.id,
        status: OrderStatus.LOADING,
        targetDate: now,
        cutoffTime: now,
        totalVolumeM3: 0.5,
        totalWeightKg: 50,
        isChilled: false,
        lines: { create: [{ productId: 'P01', quantity: 5 }] }
      }
    })

    await prisma.order.create({
      data: {
        id: orderBId,
        outletId: outlet.id,
        status: OrderStatus.LOADING,
        targetDate: now,
        cutoffTime: now,
        totalVolumeM3: 0.8,
        totalWeightKg: 80,
        isChilled: false,
        lines: { create: [{ productId: 'P02', quantity: 8 }] }
      }
    })

    await prisma.order.create({
      data: {
        id: orderCId,
        outletId: outlet.id,
        status: OrderStatus.LOADING,
        targetDate: now,
        cutoffTime: now,
        totalVolumeM3: 1.2,
        totalWeightKg: 120,
        isChilled: false,
        lines: { create: [{ productId: 'P03', quantity: 12 }] }
      }
    })

    await prisma.trip.create({
      data: {
        id: testTripId,
        vehicleId: vehicleId,
        tripNumber: 1,
        brand: 'FRESH',
        districtId: outlet.districtId || 'COLOMBO_CENTRAL',
        status: TripStatus.LOADING,
        stops: {
          create: [
            {
              id: stopAId,
              sequence: 1,
              orderId: orderAId,
              plannedEta: now
            },
            {
              id: stopBId,
              sequence: 2,
              orderId: orderBId,
              plannedEta: now
            },
            {
              id: stopCId,
              sequence: 3,
              orderId: orderCId,
              plannedEta: now
            }
          ]
        }
      }
    })

    // =========================================================================
    // SECTION 1: ROUTE START ATOMIC TRANSACTION VERIFICATION
    // =========================================================================
    console.log('\n--- SECTION 1: Route Start Transaction Atomicity ---')

    // 1.1 Start trip via POST /api/driver/trip/start
    const startReq = new Request('http://localhost:3000/api/driver/trip/start', {
      method: 'POST',
      headers: {
        cookie: driverCookieHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tripId: testTripId })
    })

    const startRes = await startDriverTrip(startReq)
    const startBody = await startRes.json()

    assert(
      startRes.status === 200,
      'Route Start API',
      'POST /api/driver/trip/start returns HTTP 200',
      200,
      startRes.status
    )

    assert(
      startBody.success === true && startBody.status === 'IN_TRANSIT',
      'Route Start API',
      'POST /api/driver/trip/start response contains { success: true, status: "IN_TRANSIT" }',
      { success: true, status: 'IN_TRANSIT' },
      startBody
    )

    // 1.2 Query PostgreSQL: verify Trip status is IN_TRANSIT
    const liveTrip = await prisma.trip.findUnique({
      where: { id: testTripId },
      include: { stops: true }
    })

    assert(
      liveTrip?.status === TripStatus.IN_TRANSIT,
      'Route Start DB Atomicity',
      'Trip status transitioned to IN_TRANSIT in PostgreSQL',
      TripStatus.IN_TRANSIT,
      liveTrip?.status
    )

    // 1.3 Query PostgreSQL: verify ALL associated Orders transitioned to IN_TRANSIT atomically
    const liveOrders = await prisma.order.findMany({
      where: { id: { in: [orderAId, orderBId, orderCId] } }
    })

    const allOrdersInTransit = liveOrders.length === 3 && liveOrders.every(o => o.status === OrderStatus.IN_TRANSIT)
    assert(
      allOrdersInTransit,
      'Route Start DB Atomicity',
      'ALL associated orders transitioned to IN_TRANSIT in PostgreSQL',
      true,
      allOrdersInTransit,
      `Order statuses: ${liveOrders.map(o => `${o.id}=${o.status}`).join(', ')}`
    )

    // 1.4 Query PostgreSQL: verify AuditLog created
    const startAudit = await prisma.auditLog.findFirst({
      where: {
        action: 'DRIVER_START_ROUTE',
        details: { path: ['tripId'], equals: testTripId }
      }
    })

    assert(
      startAudit !== null,
      'Route Start AuditLog',
      'AuditLog record DRIVER_START_ROUTE was created in PostgreSQL within transaction',
      true,
      startAudit !== null
    )

    // 1.5 Stress test: transactional atomicity on error
    // Verify that prisma.$transaction rolls back if an invalid operation is part of the batch
    let rollbackSuccess = false
    try {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: orderAId },
          data: { totalVolumeM3: 999.0 }
        }),
        // Intentionally invalid operation that violates FK / non-existent record
        prisma.tripStop.update({
          where: { id: 'NON_EXISTENT_STOP_TO_FORCE_ROLLBACK' },
          data: { outcome: StopOutcome.SUCCESS }
        })
      ])
    } catch (txErr) {
      rollbackSuccess = true
    }

    const orderACheck = await prisma.order.findUnique({ where: { id: orderAId } })
    assert(
      rollbackSuccess && orderACheck?.totalVolumeM3 === 0.5,
      'Transaction Rollback Guarantee',
      'Prisma $transaction rolls back all mutations on error (no partial updates)',
      0.5,
      orderACheck?.totalVolumeM3
    )

    // =========================================================================
    // SECTION 2: DRIVER SYNC OUTCOME GATING EMPIRICAL VERIFICATION
    // =========================================================================
    console.log('\n--- SECTION 2: Driver Sync Outcome Gating (FAILED vs SUCCESS) ---')

    // 2.1 Test FAILED Outcome: Stop A
    console.log('\nTesting STOP_COMPLETION with outcome === "FAILED" on Stop A...')
    const eventAId = `sync-event-A-${runId}`
    const syncReqFailed = new Request('http://localhost:3000/api/driver/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: eventAId,
            type: 'STOP_COMPLETION',
            tripStopId: stopAId,
            outcome: 'FAILED',
            photo: 'http://example.com/failed-delivery.jpg',
            lat: 6.9271,
            lng: 79.8612,
            createdAt: new Date().toISOString()
          }
        ]
      })
    })

    const syncResFailed = await syncDriver(syncReqFailed)
    const syncBodyFailed = await syncResFailed.json()

    assert(
      syncResFailed.status === 200,
      'Sync API (FAILED)',
      'POST /api/driver/sync returns HTTP 200 for FAILED outcome',
      200,
      syncResFailed.status
    )

    assert(
      syncBodyFailed.success === true && syncBodyFailed.processedCount === 1,
      'Sync API (FAILED)',
      'Sync response indicates success: true and processedCount: 1',
      { success: true, processedCount: 1 },
      { success: syncBodyFailed.success, processedCount: syncBodyFailed.processedCount }
    )

    // Verify Stop A in PostgreSQL: outcome MUST be FAILED
    const liveStopA = await prisma.tripStop.findUnique({ where: { id: stopAId } })
    assert(
      liveStopA?.outcome === StopOutcome.FAILED,
      'Outcome Gating (FAILED)',
      'Stop A outcome in PostgreSQL is set to FAILED',
      StopOutcome.FAILED,
      liveStopA?.outcome
    )

    // CRITICAL EMPIRICAL CHECK: Order A status MUST NOT BE DELIVERED!
    const liveOrderA = await prisma.order.findUnique({ where: { id: orderAId } })
    assert(
      liveOrderA?.status !== OrderStatus.DELIVERED,
      'Outcome Gating (FAILED)',
      'Order A status MUST NOT be updated to DELIVERED when outcome is FAILED',
      true,
      liveOrderA?.status !== OrderStatus.DELIVERED,
      `Actual Order A status in DB: ${liveOrderA?.status}`
    )

    assert(
      liveOrderA?.status === OrderStatus.IN_TRANSIT,
      'Outcome Gating (FAILED)',
      'Order A status remains IN_TRANSIT in PostgreSQL when outcome is FAILED',
      OrderStatus.IN_TRANSIT,
      liveOrderA?.status
    )

    // Verify ProofOfDelivery was still recorded for audit trail
    const livePodA = await prisma.proofOfDelivery.findFirst({
      where: { clientEventId: eventAId }
    })
    assert(
      livePodA !== null && livePodA.tripStopId === stopAId,
      'Sync ProofOfDelivery',
      'ProofOfDelivery record created for FAILED stop event',
      stopAId,
      livePodA?.tripStopId
    )

    // 2.2 Test SUCCESS Outcome: Stop B
    console.log('\nTesting STOP_COMPLETION with outcome === "SUCCESS" on Stop B...')
    const eventBId = `sync-event-B-${runId}`
    const syncReqSuccess = new Request('http://localhost:3000/api/driver/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: eventBId,
            type: 'STOP_COMPLETION',
            tripStopId: stopBId,
            outcome: 'SUCCESS',
            signature: 'data:image/svg+xml;base64,validSignatureB',
            photo: 'http://example.com/success-delivery.jpg',
            lat: 6.9300,
            lng: 79.8650,
            createdAt: new Date().toISOString()
          }
        ]
      })
    })

    const syncResSuccess = await syncDriver(syncReqSuccess)
    const syncBodySuccess = await syncResSuccess.json()

    assert(
      syncResSuccess.status === 200,
      'Sync API (SUCCESS)',
      'POST /api/driver/sync returns HTTP 200 for SUCCESS outcome',
      200,
      syncResSuccess.status
    )

    assert(
      syncBodySuccess.success === true && syncBodySuccess.processedCount === 1,
      'Sync API (SUCCESS)',
      'Sync response indicates success: true and processedCount: 1',
      { success: true, processedCount: 1 },
      { success: syncBodySuccess.success, processedCount: syncBodySuccess.processedCount }
    )

    // Verify Stop B in PostgreSQL: outcome MUST be SUCCESS
    const liveStopB = await prisma.tripStop.findUnique({ where: { id: stopBId } })
    assert(
      liveStopB?.outcome === StopOutcome.SUCCESS,
      'Outcome Gating (SUCCESS)',
      'Stop B outcome in PostgreSQL is set to SUCCESS',
      StopOutcome.SUCCESS,
      liveStopB?.outcome
    )

    // CRITICAL EMPIRICAL CHECK: Order B status MUST BE DELIVERED!
    const liveOrderB = await prisma.order.findUnique({ where: { id: orderBId } })
    assert(
      liveOrderB?.status === OrderStatus.DELIVERED,
      'Outcome Gating (SUCCESS)',
      'Order B status IS updated to DELIVERED when outcome is SUCCESS',
      OrderStatus.DELIVERED,
      liveOrderB?.status
    )

    // Verify ProofOfDelivery for Stop B
    const livePodB = await prisma.proofOfDelivery.findFirst({
      where: { clientEventId: eventBId }
    })
    assert(
      livePodB !== null && livePodB.signatureUrl !== null,
      'Sync ProofOfDelivery',
      'ProofOfDelivery record created for SUCCESS stop with signature',
      true,
      livePodB !== null && livePodB.signatureUrl !== null
    )

    // 2.3 Verify Trip is still IN_TRANSIT since Stop C is pending
    const tripCheckMid = await prisma.trip.findUnique({ where: { id: testTripId } })
    assert(
      tripCheckMid?.status === TripStatus.IN_TRANSIT,
      'Trip State Progression',
      'Trip remains IN_TRANSIT while pending stops remain',
      TripStatus.IN_TRANSIT,
      tripCheckMid?.status
    )

    // 2.4 Test PARTIAL outcome (valid StopOutcome enum, non-SUCCESS) on Stop C
    console.log('\nTesting STOP_COMPLETION with outcome === "PARTIAL" on Stop C...')
    const eventCId = `sync-event-C-${runId}`
    const syncReqPartial = new Request('http://localhost:3000/api/driver/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: eventCId,
            type: 'STOP_COMPLETION',
            tripStopId: stopCId,
            outcome: 'PARTIAL',
            createdAt: new Date().toISOString()
          }
        ]
      })
    })

    const syncResPartial = await syncDriver(syncReqPartial)
    const syncBodyPartial = await syncResPartial.json()

    assert(
      syncResPartial.status === 200 && syncBodyPartial.success === true && syncBodyPartial.processedCount === 1,
      'Sync API (PARTIAL)',
      'POST /api/driver/sync accepts PARTIAL outcome and processes 1 event',
      true,
      syncResPartial.status === 200 && syncBodyPartial.success === true && syncBodyPartial.processedCount === 1
    )

    // Verify Order C status in PostgreSQL did NOT become DELIVERED
    const liveOrderC = await prisma.order.findUnique({ where: { id: orderCId } })
    assert(
      liveOrderC?.status !== OrderStatus.DELIVERED,
      'Outcome Gating (PARTIAL)',
      'Order C status MUST NOT be updated to DELIVERED when outcome is PARTIAL',
      true,
      liveOrderC?.status !== OrderStatus.DELIVERED,
      `Order C status in DB: ${liveOrderC?.status}`
    )

    // Verify Stop C outcome in DB is PARTIAL
    const liveStopC = await prisma.tripStop.findUnique({ where: { id: stopCId } })
    assert(
      liveStopC?.outcome === StopOutcome.PARTIAL,
      'Outcome Gating (PARTIAL)',
      'Stop C outcome in PostgreSQL is set to PARTIAL',
      StopOutcome.PARTIAL,
      liveStopC?.outcome
    )

    // Verify Trip status auto-transitions to COMPLETED now that ALL 3 stops have outcomes (1 FAILED, 1 SUCCESS, 1 PARTIAL)
    const tripCheckFinal = await prisma.trip.findUnique({ where: { id: testTripId } })
    assert(
      tripCheckFinal?.status === TripStatus.COMPLETED,
      'Trip Completion Progression',
      'Trip transitions to COMPLETED in PostgreSQL when all stops have non-null outcomes',
      TripStatus.COMPLETED,
    )

    // 2.5 Replay Idempotency Check
    console.log('\nTesting replay idempotency of eventAId...')
    const replayReq = new Request('http://localhost:3000/api/driver/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: eventAId,
            type: 'STOP_COMPLETION',
            tripStopId: stopAId,
            outcome: 'FAILED'
          }
        ]
      })
    })
    const replayRes = await syncDriver(replayReq)
    const replayBody = await replayRes.json()
    assert(
      replayRes.status === 200 && replayBody.success === true,
      'Sync Idempotency',
      'Replaying event returns 200 success without duplicate work',
      true,
      replayBody.success
    )

    const podACount = await prisma.proofOfDelivery.count({
      where: { clientEventId: eventAId }
    })
    assert(
      podACount === 1,
      'Sync Idempotency',
      'ProofOfDelivery count remains exactly 1 after replay',
      1,
      podACount
    )

    // =========================================================================
    // SECTION 3: OVER-THE-WIRE HTTP API VERIFICATION (PORT 3001 / 3000)
    // =========================================================================
    console.log('\n--- SECTION 3: Over-The-Wire HTTP Endpoint Verification ---')
    let httpBaseUrl: string | null = null
    for (const port of [3001, 3000]) {
      try {
        const ping = await fetch(`http://localhost:${port}/api/driver/trip`, {
          headers: { Cookie: driverCookieHeader }
        })
        if (ping.status === 200 || ping.status === 404 || ping.status === 401) {
          httpBaseUrl = `http://localhost:${port}`
          break
        }
      } catch (_) {}
    }

    if (httpBaseUrl) {
      console.log(`Detected active Next.js server on ${httpBaseUrl}. Running over-the-wire tests...`)

      // Create a second isolated trip for HTTP over-the-wire testing
      const httpRunId = Math.random().toString(36).substring(2, 8)
      const httpTripId = `TRIP-HTTP-${httpRunId}`
      const httpOrderFailedId = `ORD-HTTP-FAIL-${httpRunId}`
      const httpOrderSuccessId = `ORD-HTTP-SUCC-${httpRunId}`
      const httpStopFailedId = `STOP-HTTP-FAIL-${httpRunId}`
      const httpStopSuccessId = `STOP-HTTP-SUCC-${httpRunId}`

      try {
        await prisma.order.create({
          data: {
            id: httpOrderFailedId,
            outletId: outlet.id,
            status: OrderStatus.LOADING,
            targetDate: now,
            cutoffTime: now,
            totalVolumeM3: 0.3,
            totalWeightKg: 30,
            isChilled: false,
            lines: { create: [{ productId: 'P01', quantity: 2 }] }
          }
        })
        await prisma.order.create({
          data: {
            id: httpOrderSuccessId,
            outletId: outlet.id,
            status: OrderStatus.LOADING,
            targetDate: now,
            cutoffTime: now,
            totalVolumeM3: 0.4,
            totalWeightKg: 40,
            isChilled: false,
            lines: { create: [{ productId: 'P02', quantity: 3 }] }
          }
        })
        await prisma.trip.create({
          data: {
            id: httpTripId,
            vehicleId: vehicleId,
            tripNumber: 2,
            brand: 'FRESH',
            districtId: outlet.districtId || 'COLOMBO_CENTRAL',
            status: TripStatus.LOADING,
            stops: {
              create: [
                {
                  id: httpStopFailedId,
                  sequence: 1,
                  orderId: httpOrderFailedId,
                  plannedEta: now
                },
                {
                  id: httpStopSuccessId,
                  sequence: 2,
                  orderId: httpOrderSuccessId,
                  plannedEta: now
                }
              ]
            }
          }
        })

        // 3.1 HTTP POST /api/driver/trip/start
        const httpStartRes = await fetch(`${httpBaseUrl}/api/driver/trip/start`, {
          method: 'POST',
          headers: {
            Cookie: driverCookieHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ tripId: httpTripId })
        })
        assert(
          httpStartRes.status === 200,
          'HTTP Route Start',
          `POST ${httpBaseUrl}/api/driver/trip/start returns HTTP 200`,
          200,
          httpStartRes.status
        )
        const httpStartData = await httpStartRes.json()
        assert(
          httpStartData.success === true && httpStartData.status === 'IN_TRANSIT',
          'HTTP Route Start',
          'HTTP route start response contains { success: true, status: "IN_TRANSIT" }',
          { success: true, status: 'IN_TRANSIT' },
          httpStartData
        )

        // Verify DB atomic update from HTTP request
        const httpDbTrip = await prisma.trip.findUnique({ where: { id: httpTripId } })
        const httpDbOrders = await prisma.order.findMany({ where: { id: { in: [httpOrderFailedId, httpOrderSuccessId] } } })
        assert(
          httpDbTrip?.status === TripStatus.IN_TRANSIT && httpDbOrders.every(o => o.status === OrderStatus.IN_TRANSIT),
          'HTTP Route Start DB',
          'HTTP Route start atomically transitioned trip and both orders to IN_TRANSIT in DB',
          true,
          httpDbTrip?.status === TripStatus.IN_TRANSIT && httpDbOrders.every(o => o.status === OrderStatus.IN_TRANSIT)
        )

        // 3.2 HTTP POST /api/driver/sync with outcome === 'FAILED'
        const httpFailedSyncRes = await fetch(`${httpBaseUrl}/api/driver/sync`, {
          method: 'POST',
          headers: {
            Cookie: driverCookieHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            events: [
              {
                id: `http-sync-fail-${httpRunId}`,
                type: 'STOP_COMPLETION',
                tripStopId: httpStopFailedId,
                outcome: 'FAILED',
                createdAt: new Date().toISOString()
              }
            ]
          })
        })
        const httpFailedSyncData = await httpFailedSyncRes.json()

        assert(
          httpFailedSyncRes.status === 200 && httpFailedSyncData.processedCount === 1,
          'HTTP Driver Sync FAILED',
          'HTTP POST /api/driver/sync returns 200 and processedCount 1 for outcome === "FAILED"',
          true,
          httpFailedSyncRes.status === 200 && httpFailedSyncData.processedCount === 1
        )

        const httpDbOrderFailed = await prisma.order.findUnique({ where: { id: httpOrderFailedId } })
        assert(
          httpDbOrderFailed?.status !== OrderStatus.DELIVERED && httpDbOrderFailed?.status === OrderStatus.IN_TRANSIT,
          'HTTP Outcome Gating FAILED',
          'HTTP sync with outcome "FAILED" does NOT set order status to DELIVERED in PostgreSQL',
          OrderStatus.IN_TRANSIT,
          httpDbOrderFailed?.status
        )

        // 3.3 HTTP POST /api/driver/sync with outcome === 'SUCCESS'
        const httpSuccessSyncRes = await fetch(`${httpBaseUrl}/api/driver/sync`, {
          method: 'POST',
          headers: {
            Cookie: driverCookieHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            events: [
              {
                id: `http-sync-succ-${httpRunId}`,
                type: 'STOP_COMPLETION',
                tripStopId: httpStopSuccessId,
                outcome: 'SUCCESS',
                signature: 'data:image/svg+xml;base64,httpSig',
                createdAt: new Date().toISOString()
              }
            ]
          })
        })
        const httpSuccessSyncData = await httpSuccessSyncRes.json()
        console.log('HTTP Sync Success Response:', JSON.stringify(httpSuccessSyncData))

        assert(
          httpSuccessSyncRes.status === 200 && httpSuccessSyncData.processedCount === 1,
          'HTTP Driver Sync SUCCESS',
          'HTTP POST /api/driver/sync returns 200 and processedCount 1 for outcome === "SUCCESS"',
          true,
          httpSuccessSyncRes.status === 200 && httpSuccessSyncData.processedCount === 1
        )

        const httpDbOrderSuccess = await prisma.order.findUnique({ where: { id: httpOrderSuccessId } })
        assert(
          httpDbOrderSuccess?.status === OrderStatus.DELIVERED,
          'HTTP Outcome Gating SUCCESS',
          'HTTP sync with outcome "SUCCESS" sets order status to DELIVERED in PostgreSQL',
          OrderStatus.DELIVERED,
          httpDbOrderSuccess?.status
        )
      } finally {
        await prisma.proofOfDelivery.deleteMany({ where: { tripStopId: { in: [httpStopFailedId, httpStopSuccessId] } } }).catch(() => {})
        await prisma.syncEvent.deleteMany({ where: { clientEventId: { in: [`http-sync-fail-${httpRunId}`, `http-sync-succ-${httpRunId}`] } } }).catch(() => {})
        await prisma.auditLog.deleteMany({ where: { details: { path: ['tripId'], equals: httpTripId } } }).catch(() => {})
        await prisma.tripStop.deleteMany({ where: { tripId: httpTripId } }).catch(() => {})
        await prisma.trip.deleteMany({ where: { id: httpTripId } }).catch(() => {})
        await prisma.order.deleteMany({ where: { id: { in: [httpOrderFailedId, httpOrderSuccessId] } } }).catch(() => {})
      }
    } else {
      console.log('No HTTP server detected on port 3001 or 3000 (direct handler verification used).')
    }

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP: Clean isolated test records
    // -------------------------------------------------------------------------
    console.log('\nCleaning up test artifacts...')
    await prisma.proofOfDelivery.deleteMany({
      where: { tripStopId: { in: [stopAId, stopBId, stopCId] } }
    }).catch(() => {})

    await prisma.syncEvent.deleteMany({
      where: { clientEventId: { in: [`sync-event-A-${runId}`, `sync-event-B-${runId}`, `sync-event-C-${runId}`] } }
    }).catch(() => {})

    await prisma.auditLog.deleteMany({
      where: { details: { path: ['tripId'], equals: testTripId } }
    }).catch(() => {})

    await prisma.tripStop.deleteMany({
      where: { tripId: testTripId }
    }).catch(() => {})

    await prisma.trip.deleteMany({
      where: { id: testTripId }
    }).catch(() => {})

    await prisma.order.deleteMany({
      where: { id: { in: [orderAId, orderBId, orderCId] } }
    }).catch(() => {})

    console.log('Test artifacts successfully cleaned up.')
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n========================================================================')
  const total = assertions.length
  const passed = assertions.filter(a => a.passed).length
  const failed = assertions.filter(a => !a.passed).length
  console.log(`TOTAL ASSERTIONS: ${total} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('========================================================================')

  if (failed > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

runEmpiricalHarness()
  .catch(err => {
    console.error('Fatal execution error:', err)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
