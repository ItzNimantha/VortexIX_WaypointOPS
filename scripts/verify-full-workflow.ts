import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { OrderStatus, TripStatus } from '@prisma/client'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001'

interface StepResult {
  step: string
  name: string
  passed: boolean
  durationMs: number
  details?: any
  error?: string
}

async function createAuthCookie(user: any): Promise<string> {
  const sessionData = {
    userId: user.id,
    role: user.role,
    email: user.email,
    outletId: user.outletId,
    depotId: user.depotId,
    vehicleId: user.vehicleId,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  }
  const token = await encrypt(sessionData)
  return `session=${token}`
}

async function verifyFullWorkflow() {
  const startTime = Date.now()
  const results: StepResult[] = []

  console.log('='.repeat(80))
  console.log(' WAYPOINT OPS - PROGRAMMATIC E2E LIFECYCLE VERIFICATION')
  console.log('='.repeat(80))
  console.log(`Target Server:      ${BASE_URL}`)
  console.log(`Target Database:    PostgreSQL 16 (port 5432) via Prisma Singleton`)
  console.log(`Verification Time:  ${new Date().toISOString()}\n`)

  // Pre-flight 1: Server Health Check
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`)
    if (!healthRes.ok) {
      throw new Error(`Health check returned status ${healthRes.status}`)
    }
    const healthData = await healthRes.json()
    console.log(`[PASS] Server Health: Server alive at ${BASE_URL} (${healthData.timestamp || 'OK'})\n`)
  } catch (err: any) {
    console.error(`[FAIL] Server Unreachable at ${BASE_URL}: ${err.message}`)
    process.exit(1)
  }

  // Pre-flight 2: Verify PostgreSQL & Seed Users
  const users = await prisma.user.findMany()
  const storeUser = users.find(u => u.role === 'STORE_MANAGER')
  const dispatchUser = users.find(u => u.role === 'DISPATCHER')
  const loaderUser = users.find(u => u.role === 'LOADER')
  const driverUser = users.find(u => u.role === 'DRIVER')

  if (!storeUser || !dispatchUser || !loaderUser || !driverUser) {
    console.error('[FAIL] Missing required seed users in PostgreSQL database!')
    process.exit(1)
  }

  console.log('[PASS] PostgreSQL Users Verified:')
  console.log(`  - Store Manager: ${storeUser.email} (Outlet: ${storeUser.outletId})`)
  console.log(`  - Dispatcher:    ${dispatchUser.email} (Depot: ${dispatchUser.depotId})`)
  console.log(`  - Loader:        ${loaderUser.email} (Depot: ${loaderUser.depotId})`)
  console.log(`  - Driver:        ${driverUser.email} (Vehicle: ${driverUser.vehicleId})\n`)

  const storeCookie = await createAuthCookie(storeUser)
  const dispatchCookie = await createAuthCookie(dispatchUser)
  const loaderCookie = await createAuthCookie(loaderUser)
  const driverCookie = await createAuthCookie(driverUser)

  let activeOrderId: string | null = null
  let activeTripId: string | null = null
  let activeTripStopId: string | null = null

  // =========================================================================
  // STEP 1: Store Manager places order
  // =========================================================================
  const step1Start = Date.now()
  try {
    console.log('>>> STEP 1: Store Manager places order (POST /api/store/orders)')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const targetDateStr = tomorrow.toISOString().split('T')[0]

    const orderPayload = {
      items: [
        { productId: 'P01', quantity: 8 },  // Fresh Milk 1L (Chilled)
        { productId: 'P04', quantity: 12 }, // Rice 5kg (Dry)
      ],
      targetDate: targetDateStr
    }

    const orderRes = await fetch(`${BASE_URL}/api/store/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': storeCookie
      },
      body: JSON.stringify(orderPayload)
    })

    if (!orderRes.ok) {
      const errText = await orderRes.text()
      throw new Error(`Order creation failed with status ${orderRes.status}: ${errText}`)
    }

    const orderData = await orderRes.json()
    if (!orderData.success || !orderData.orders || orderData.orders.length === 0) {
      throw new Error(`Invalid response format from /api/store/orders: ${JSON.stringify(orderData)}`)
    }

    // Select the first created order (e.g., chilled or dry)
    const createdOrder = orderData.orders[0]
    activeOrderId = createdOrder.id

    // Direct PostgreSQL Assertion via Prisma
    const dbOrder = await prisma.order.findUnique({
      where: { id: activeOrderId! },
      include: { lines: true, outlet: true }
    })

    if (!dbOrder) {
      throw new Error(`Order ${activeOrderId} not found in PostgreSQL!`)
    }

    if (dbOrder.status !== OrderStatus.CONFIRMED && dbOrder.status !== OrderStatus.PENDING) {
      throw new Error(`Order status in PostgreSQL was ${dbOrder.status}, expected CONFIRMED or PENDING`)
    }

    if (dbOrder.outletId !== storeUser.outletId) {
      throw new Error(`Order outletId in PostgreSQL was ${dbOrder.outletId}, expected ${storeUser.outletId}`)
    }

    if (!dbOrder.lines || dbOrder.lines.length === 0) {
      throw new Error(`Order lines missing in PostgreSQL for order ${activeOrderId}`)
    }

    results.push({
      step: 'Step 1',
      name: 'Store Manager Order Placement',
      passed: true,
      durationMs: Date.now() - step1Start,
      details: {
        orderId: dbOrder.id,
        status: dbOrder.status,
        outletId: dbOrder.outletId,
        isChilled: dbOrder.isChilled,
        linesCount: dbOrder.lines.length,
        totalVolumeM3: dbOrder.totalVolumeM3,
        totalWeightKg: dbOrder.totalWeightKg
      }
    })
    console.log(`  [PASS] Order created in PostgreSQL: ID=${dbOrder.id}, Status=${dbOrder.status}, Chilled=${dbOrder.isChilled}, Lines=${dbOrder.lines.length}\n`)
  } catch (err: any) {
    results.push({
      step: 'Step 1',
      name: 'Store Manager Order Placement',
      passed: false,
      durationMs: Date.now() - step1Start,
      error: err.message
    })
    console.error(`  [FAIL] Step 1: ${err.message}\n`)
    process.exit(1)
  }

  // =========================================================================
  // NEGATIVE TEST: Confirm receipt on non-delivered order must return 400 Bad Request
  // =========================================================================
  const negStart = Date.now()
  try {
    console.log('>>> NEGATIVE TEST: Attempt confirm-receipt on non-delivered order (expected HTTP 400)')
    const negRes = await fetch(`${BASE_URL}/api/store/orders/${activeOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Cookie': storeCookie }
    })

    const negData = await negRes.json().catch(() => ({}))
    if (negRes.status !== 400) {
      throw new Error(`Expected HTTP 400 Bad Request but received ${negRes.status}: ${JSON.stringify(negData)}`)
    }

    // Verify PostgreSQL AuditLog does NOT contain confirmation entry for this order
    const negLogs = await prisma.auditLog.findMany({
      where: { action: 'STORE_RECEIPT_CONFIRMED' },
      take: 20
    })
    const prematureLog = negLogs.find(l => (l.details as any)?.orderId === activeOrderId)
    if (prematureLog) {
      throw new Error(`AuditLog contains premature STORE_RECEIPT_CONFIRMED entry for non-delivered order ${activeOrderId}!`)
    }

    results.push({
      step: 'Negative Test',
      name: 'Reject Confirm Receipt on Non-Delivered Order',
      passed: true,
      durationMs: Date.now() - negStart,
      details: {
        httpStatus: negRes.status,
        errorMessage: negData.error
      }
    })
    console.log(`  [PASS] Negative test passed: HTTP 400 returned with message "${negData.error}"\n`)
  } catch (err: any) {
    results.push({
      step: 'Negative Test',
      name: 'Reject Confirm Receipt on Non-Delivered Order',
      passed: false,
      durationMs: Date.now() - negStart,
      error: err.message
    })
    console.error(`  [FAIL] Negative Test: ${err.message}\n`)
    process.exit(1)
  }

  // =========================================================================
  // STEP 2: Dispatcher Auto-Allocates & Publishes Plan
  // =========================================================================
  const step2Start = Date.now()
  try {
    console.log('>>> STEP 2: Dispatcher Auto-Allocates & Publishes (POST /api/dispatch/plan, POST /api/dispatch/publish)')
    // 2a. Trigger auto-allocation
    const planRes = await fetch(`${BASE_URL}/api/dispatch/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': dispatchCookie
      },
      body: JSON.stringify({ depotId: 'DEP_PEL' })
    })

    if (!planRes.ok) {
      const errText = await planRes.text()
      throw new Error(`Plan allocation failed with status ${planRes.status}: ${errText}`)
    }

    const planData = await planRes.json()
    if (!planData.success || !planData.planId) {
      throw new Error(`Invalid plan response: ${JSON.stringify(planData)}`)
    }

    const planId = planData.planId
    console.log(`  - Allocation plan generated: PlanId=${planId}, Trips=${planData.trips?.length || 0}`)

    // 2b. Publish the plan
    const publishRes = await fetch(`${BASE_URL}/api/dispatch/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': dispatchCookie
      },
      body: JSON.stringify({ planId })
    })

    if (!publishRes.ok) {
      const errText = await publishRes.text()
      throw new Error(`Publish failed with status ${publishRes.status}: ${errText}`)
    }

    const publishData = await publishRes.json()
    if (!publishData.success) {
      throw new Error(`Publish response indicates failure: ${JSON.stringify(publishData)}`)
    }

    // Direct PostgreSQL Assertion: find TripStop and Trip for our order
    const dbTripStop = await prisma.tripStop.findFirst({
      where: { orderId: activeOrderId! },
      include: { trip: true }
    })

    if (!dbTripStop || !dbTripStop.trip) {
      throw new Error(`TripStop for order ${activeOrderId} not found in PostgreSQL!`)
    }

    activeTripId = dbTripStop.tripId
    activeTripStopId = dbTripStop.id

    const dbTrip = await prisma.trip.findUnique({
      where: { id: activeTripId }
    })

    if (!dbTrip || dbTrip.status !== TripStatus.LOADING) {
      throw new Error(`Trip ${activeTripId} in PostgreSQL has status ${dbTrip?.status}, expected LOADING`)
    }

    const dbOrder = await prisma.order.findUnique({
      where: { id: activeOrderId! }
    })

    if (!dbOrder || dbOrder.status !== OrderStatus.LOADING) {
      throw new Error(`Order ${activeOrderId} in PostgreSQL has status ${dbOrder?.status}, expected LOADING`)
    }

    results.push({
      step: 'Step 2',
      name: 'Dispatcher Auto-Allocate & Publish',
      passed: true,
      durationMs: Date.now() - step2Start,
      details: {
        planId,
        tripId: activeTripId,
        tripStopId: activeTripStopId,
        tripStatus: dbTrip.status,
        orderStatus: dbOrder.status,
        vehicleId: dbTrip.vehicleId
      }
    })
    console.log(`  [PASS] Dispatch published: Trip=${activeTripId} (Status=${dbTrip.status}, Vehicle=${dbTrip.vehicleId}), Order=${activeOrderId} (Status=${dbOrder.status})\n`)
  } catch (err: any) {
    results.push({
      step: 'Step 2',
      name: 'Dispatcher Auto-Allocate & Publish',
      passed: false,
      durationMs: Date.now() - step2Start,
      error: err.message
    })
    console.error(`  [FAIL] Step 2: ${err.message}\n`)
    process.exit(1)
  }

  // =========================================================================
  // STEP 3: Loader verifies, loads crates, and captures driver sign-off
  // =========================================================================
  const step3Start = Date.now()
  try {
    console.log(`>>> STEP 3: Loader loads crates and driver signs off (POST /api/loader/trips/${activeTripId}/load, signoff)`)
    // 3a. Record loaded crates
    const loadRes = await fetch(`${BASE_URL}/api/loader/trips/${activeTripId}/load`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': loaderCookie
      },
      body: JSON.stringify({
        loadedCrates: { 1: 20 }
      })
    })

    if (!loadRes.ok) {
      const errText = await loadRes.text()
      throw new Error(`Loader load failed with status ${loadRes.status}: ${errText}`)
    }

    // Direct PostgreSQL check: LoadingRecord created
    const loadingRecInProgress = await prisma.loadingRecord.findUnique({
      where: { tripId: activeTripId! }
    })

    if (!loadingRecInProgress || loadingRecInProgress.status !== 'IN_PROGRESS') {
      throw new Error(`LoadingRecord for trip ${activeTripId} status is ${loadingRecInProgress?.status}, expected IN_PROGRESS`)
    }

    // 3b. Driver sign-off
    const signoffRes = await fetch(`${BASE_URL}/api/loader/trips/${activeTripId}/signoff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': loaderCookie
      },
      body: JSON.stringify({
        signature: 'data:image/svg+xml;base64,PHN2Zz5kcml2ZXItc2lnbmVkPC9zdmc+',
        totalCrates: 20
      })
    })

    if (!signoffRes.ok) {
      const errText = await signoffRes.text()
      throw new Error(`Signoff failed with status ${signoffRes.status}: ${errText}`)
    }

    // Direct PostgreSQL Assertions:
    const loadingRecCompleted = await prisma.loadingRecord.findUnique({
      where: { tripId: activeTripId! }
    })

    if (!loadingRecCompleted || loadingRecCompleted.status !== 'COMPLETED') {
      throw new Error(`LoadingRecord in PostgreSQL status is ${loadingRecCompleted?.status}, expected COMPLETED`)
    }

    const orderLoaded = await prisma.order.findUnique({
      where: { id: activeOrderId! }
    })

    if (!orderLoaded || orderLoaded.status !== OrderStatus.LOADED) {
      throw new Error(`Order in PostgreSQL status is ${orderLoaded?.status}, expected LOADED`)
    }

    const tripAfterSignoff = await prisma.trip.findUnique({
      where: { id: activeTripId! }
    })

    if (!tripAfterSignoff || tripAfterSignoff.status !== TripStatus.LOADING) {
      throw new Error(`Trip in PostgreSQL status is ${tripAfterSignoff?.status}, expected LOADING`)
    }

    const signoffAudit = await prisma.auditLog.findFirst({
      where: { action: 'LOADER_DRIVER_SIGNOFF' },
      orderBy: { createdAt: 'desc' }
    })

    if (!signoffAudit) {
      throw new Error(`AuditLog LOADER_DRIVER_SIGNOFF entry not found in PostgreSQL!`)
    }

    results.push({
      step: 'Step 3',
      name: 'Loader Loading & Driver Sign-off',
      passed: true,
      durationMs: Date.now() - step3Start,
      details: {
        loadingRecordId: loadingRecCompleted.id,
        loadingStatus: loadingRecCompleted.status,
        orderStatus: orderLoaded.status,
        tripStatus: tripAfterSignoff.status,
        auditLogId: signoffAudit.id
      }
    })
    console.log(`  [PASS] Loading completed: LoadingRecord=${loadingRecCompleted.id} (Status=${loadingRecCompleted.status}), Order=${activeOrderId} (Status=${orderLoaded.status})\n`)
  } catch (err: any) {
    results.push({
      step: 'Step 3',
      name: 'Loader Loading & Driver Sign-off',
      passed: false,
      durationMs: Date.now() - step3Start,
      error: err.message
    })
    console.error(`  [FAIL] Step 3: ${err.message}\n`)
    process.exit(1)
  }

  // =========================================================================
  // STEP 4: Driver starts route & completes stop with POD photo + signature
  // =========================================================================
  const step4Start = Date.now()
  try {
    console.log(`>>> STEP 4: Driver starts route & completes stops (POST /api/driver/trip/start, POST /api/driver/sync)`)
    // 4a. Start route
    const startRouteRes = await fetch(`${BASE_URL}/api/driver/trip/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': driverCookie
      },
      body: JSON.stringify({ tripId: activeTripId })
    })

    if (!startRouteRes.ok) {
      const errText = await startRouteRes.text()
      throw new Error(`Driver start route failed with status ${startRouteRes.status}: ${errText}`)
    }

    // Direct PostgreSQL check: Trip and Order transition to IN_TRANSIT
    const tripInTransit = await prisma.trip.findUnique({
      where: { id: activeTripId! }
    })

    if (!tripInTransit || tripInTransit.status !== TripStatus.IN_TRANSIT) {
      throw new Error(`Trip status in PostgreSQL is ${tripInTransit?.status}, expected IN_TRANSIT`)
    }

    const orderInTransit = await prisma.order.findUnique({
      where: { id: activeOrderId! }
    })

    if (!orderInTransit || orderInTransit.status !== OrderStatus.IN_TRANSIT) {
      throw new Error(`Order status in PostgreSQL is ${orderInTransit?.status}, expected IN_TRANSIT`)
    }

    console.log(`  - Route started: Trip=${activeTripId} (IN_TRANSIT), Order=${activeOrderId} (IN_TRANSIT)`)

    // 4b. Fetch all stops on the trip and sync completion
    const tripStops = await prisma.tripStop.findMany({
      where: { tripId: activeTripId! }
    })

    const syncEvents = tripStops.map(s => ({
      type: 'STOP_COMPLETION',
      tripStopId: s.id,
      outcome: 'SUCCESS',
      signature: 'data:image/svg+xml;base64,PHN2Zz5yZWNlaXZlci1zaWduYXR1cmU8L3N2Zz4=',
      photo: `https://waypoint.mock/pod/photo-${s.id}.jpg`,
      createdAt: new Date().toISOString()
    }))

    const syncRes = await fetch(`${BASE_URL}/api/driver/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': driverCookie
      },
      body: JSON.stringify({ events: syncEvents })
    })

    if (!syncRes.ok) {
      const errText = await syncRes.text()
      throw new Error(`Driver stop sync failed with status ${syncRes.status}: ${errText}`)
    }

    // Direct PostgreSQL Assertions:
    const pod = await prisma.proofOfDelivery.findUnique({
      where: { tripStopId: activeTripStopId! }
    })

    if (!pod) {
      throw new Error(`ProofOfDelivery record for TripStop ${activeTripStopId} not found in PostgreSQL!`)
    }

    const deliveredOrder = await prisma.order.findUnique({
      where: { id: activeOrderId! }
    })

    if (!deliveredOrder || deliveredOrder.status !== OrderStatus.DELIVERED) {
      throw new Error(`Order in PostgreSQL status is ${deliveredOrder?.status}, expected DELIVERED`)
    }

    const completedTrip = await prisma.trip.findUnique({
      where: { id: activeTripId! }
    })

    if (!completedTrip || completedTrip.status !== TripStatus.COMPLETED) {
      throw new Error(`Trip in PostgreSQL status is ${completedTrip?.status}, expected COMPLETED`)
    }

    results.push({
      step: 'Step 4',
      name: 'Driver Route & Proof of Delivery Sync',
      passed: true,
      durationMs: Date.now() - step4Start,
      details: {
        tripId: activeTripId,
        tripStatus: completedTrip.status,
        orderStatus: deliveredOrder.status,
        podId: pod.id,
        podTimestamp: pod.timestamp.toISOString(),
        stopsCompleted: tripStops.length
      }
    })
    console.log(`  [PASS] Delivery synced: POD=${pod.id}, Order=${activeOrderId} (Status=${deliveredOrder.status}), Trip=${activeTripId} (Status=${completedTrip.status})\n`)
  } catch (err: any) {
    results.push({
      step: 'Step 4',
      name: 'Driver Route & Proof of Delivery Sync',
      passed: false,
      durationMs: Date.now() - step4Start,
      error: err.message
    })
    console.error(`  [FAIL] Step 4: ${err.message}\n`)
    process.exit(1)
  }

  // =========================================================================
  // STEP 5: Store Manager confirms receipt
  // =========================================================================
  const step5Start = Date.now()
  try {
    console.log(`>>> STEP 5: Store Manager confirms receipt (POST /api/store/orders/${activeOrderId}/confirm-receipt)`)
    const confirmRes = await fetch(`${BASE_URL}/api/store/orders/${activeOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: {
        'Cookie': storeCookie
      }
    })

    if (!confirmRes.ok) {
      const errText = await confirmRes.text()
      throw new Error(`Confirm receipt failed with status ${confirmRes.status}: ${errText}`)
    }

    const confirmData = await confirmRes.json()
    if (!confirmData.success || confirmData.status !== OrderStatus.DELIVERED) {
      throw new Error(`Invalid response from confirm-receipt: ${JSON.stringify(confirmData)}`)
    }

    // Direct PostgreSQL Assertion: verify AuditLog contains STORE_RECEIPT_CONFIRMED
    const recentAuditLogs = await prisma.auditLog.findMany({
      where: { action: 'STORE_RECEIPT_CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      take: 10
    })

    const confirmationLog = recentAuditLogs.find(l => (l.details as any)?.orderId === activeOrderId)
    if (!confirmationLog) {
      throw new Error(`STORE_RECEIPT_CONFIRMED entry for order ${activeOrderId} not found in PostgreSQL AuditLog!`)
    }

    results.push({
      step: 'Step 5',
      name: 'Store Manager Receipt Confirmation',
      passed: true,
      durationMs: Date.now() - step5Start,
      details: {
        orderId: activeOrderId,
        status: confirmData.status,
        auditLogId: confirmationLog.id,
        auditDetails: confirmationLog.details
      }
    })
    console.log(`  [PASS] Receipt confirmed in PostgreSQL: AuditLog=${confirmationLog.id}, Action=${confirmationLog.action}, Order=${activeOrderId}\n`)
  } catch (err: any) {
    results.push({
      step: 'Step 5',
      name: 'Store Manager Receipt Confirmation',
      passed: false,
      durationMs: Date.now() - step5Start,
      error: err.message
    })
    console.error(`  [FAIL] Step 5: ${err.message}\n`)
    process.exit(1)
  }

  // =========================================================================
  // SUMMARY & VERIFICATION ATTESTATION
  // =========================================================================
  const totalDuration = Date.now() - startTime
  const allPassed = results.every(r => r.passed)

  console.log('='.repeat(80))
  console.log(' VERIFICATION SUMMARY & DATABASE AUDIT')
  console.log('='.repeat(80))
  console.log(`Verified Order ID:   ${activeOrderId}`)
  console.log(`Verified Trip ID:    ${activeTripId}`)
  console.log(`Total Elapsed Time:  ${totalDuration}ms\n`)

  console.log('| Step | Verification Action | Result | Duration |')
  console.log('|------|---------------------|:------:|:--------:|')
  for (const r of results) {
    console.log(`| ${r.step.padEnd(4)} | ${r.name.padEnd(35)} | ${r.passed ? ' PASS ' : ' FAIL '} | ${(r.durationMs + 'ms').padEnd(8)} |`)
  }
  console.log('='.repeat(80))

  if (allPassed) {
    console.log('\n[SUCCESS] ALL 5 LIFECYCLE STEPS & NEGATIVE BOUNDARY ASSERTIONS PASSED!')
    console.log('Order status lifecycle verified against PostgreSQL: PENDING -> LOADING -> LOADED -> IN_TRANSIT -> DELIVERED -> Receipt Verified (AuditLog).')
    process.exit(0)
  } else {
    console.error('\n[FAILURE] Workflow verification encountered failures.')
    process.exit(1)
  }
}

verifyFullWorkflow().catch(err => {
  console.error('Fatal execution error:', err)
  process.exit(1)
})
