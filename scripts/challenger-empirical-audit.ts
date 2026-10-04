import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { OrderStatus, TripStatus } from '@prisma/client'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001'

interface ChallengeResult {
  category: string
  testCase: string
  passed: boolean
  observation: string
  error?: string
}

const results: ChallengeResult[] = []

async function makeCookie(user: any) {
  const token = await encrypt({
    userId: user.id,
    role: user.role,
    email: user.email,
    outletId: user.outletId,
    depotId: user.depotId,
    vehicleId: user.vehicleId,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  return `session=${token}`
}

async function runEmpiricalAudit() {
  console.log('='.repeat(80))
  console.log(' EMPIRICAL CHALLENGER: ADVERSARIAL DEEP-DIVE ON PG (5432) & SERVER (3001)')
  console.log('='.repeat(80))

  const users = await prisma.user.findMany()
  const storeUser = users.find(u => u.role === 'STORE_MANAGER')!
  const dispatchUser = users.find(u => u.role === 'DISPATCHER')!
  const loaderUser = users.find(u => u.role === 'LOADER')!
  const driverUser = users.find(u => u.role === 'DRIVER')!

  const storeCookie = await makeCookie(storeUser)
  const dispatchCookie = await makeCookie(dispatchUser)
  const loaderCookie = await makeCookie(loaderUser)
  const driverCookie = await makeCookie(driverUser)

  let testOrderId = ''
  let testTripId = ''
  let testTripStopId = ''

  // --------------------------------------------------------------------------
  // CHALLENGE 1: Step 1 Order Creation & Database Constraints
  // --------------------------------------------------------------------------
  try {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const targetDateStr = tomorrow.toISOString().split('T')[0]

    // 1a. Positive Order Creation
    const res = await fetch(`${BASE_URL}/api/store/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': storeCookie },
      body: JSON.stringify({
        items: [
          { productId: 'P01', quantity: 6 }, // Chilled
          { productId: 'P04', quantity: 12 } // Dry
        ],
        targetDate: targetDateStr
      })
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const data = await res.json()
    if (!data.success || !data.orders || data.orders.length === 0) {
      throw new Error(`Unexpected order response: ${JSON.stringify(data)}`)
    }

    testOrderId = data.orders[0].id

    // Direct DB verification
    const dbOrder = await prisma.order.findUnique({
      where: { id: testOrderId },
      include: { lines: true, outlet: true }
    })

    if (!dbOrder) throw new Error(`Order ${testOrderId} not found in PostgreSQL!`)
    if (dbOrder.status !== OrderStatus.CONFIRMED && dbOrder.status !== OrderStatus.PENDING) {
      throw new Error(`Order status in DB is ${dbOrder.status}, expected CONFIRMED/PENDING`)
    }
    if (dbOrder.outletId !== storeUser.outletId) {
      throw new Error(`Order outletId mismatch: ${dbOrder.outletId} vs ${storeUser.outletId}`)
    }
    if (dbOrder.lines.length === 0) {
      throw new Error(`Order has 0 lines in PostgreSQL!`)
    }

    results.push({
      category: 'Step 1 - Order Creation',
      testCase: 'Store Manager places order and DB persists order lines & status',
      passed: true,
      observation: `Verified Order ${testOrderId} in PostgreSQL with status=${dbOrder.status}, lines=${dbOrder.lines.length}, volume=${dbOrder.totalVolumeM3}m3, weight=${dbOrder.totalWeightKg}kg`
    })

    // 1b. Negative Order Creation: Empty items
    const emptyRes = await fetch(`${BASE_URL}/api/store/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': storeCookie },
      body: JSON.stringify({ items: [], targetDate: targetDateStr })
    })
    if (emptyRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for empty items, got ${emptyRes.status}`)
    }

    // 1c. Negative Order Creation: Unauthorized role
    const unauthRes = await fetch(`${BASE_URL}/api/store/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': driverCookie },
      body: JSON.stringify({ items: [{ productId: 'P01', quantity: 1 }], targetDate: targetDateStr })
    })
    if (unauthRes.status !== 401) {
      throw new Error(`Expected HTTP 401 for driver calling store orders, got ${unauthRes.status}`)
    }

    results.push({
      category: 'Step 1 - Negative Validation',
      testCase: 'Order validation rejects empty items (400) and wrong role (401)',
      passed: true,
      observation: `Empty items returned HTTP ${emptyRes.status}; Driver role returned HTTP ${unauthRes.status}`
    })
  } catch (err: any) {
    results.push({
      category: 'Step 1 - Order Creation',
      testCase: 'Step 1 DB and API validation',
      passed: false,
      observation: 'Step 1 validation failed',
      error: err.message
    })
  }

  // --------------------------------------------------------------------------
  // CHALLENGE 2: Confirm Receipt on Non-Delivered Order & Status Immutability
  // --------------------------------------------------------------------------
  try {
    // 2a. Attempt confirm receipt when order is CONFIRMED
    const preOrder = await prisma.order.findUnique({ where: { id: testOrderId } })
    const preStatus = preOrder?.status

    const confirmRes = await fetch(`${BASE_URL}/api/store/orders/${testOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Cookie': storeCookie }
    })

    const confirmBody = await confirmRes.json().catch(() => ({}))

    if (confirmRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for non-delivered order, got ${confirmRes.status}`)
    }
    if (confirmBody.error !== 'Order must be DELIVERED to confirm receipt') {
      throw new Error(`Unexpected error message: ${confirmBody.error}`)
    }

    // Direct DB check: Ensure Order status did NOT mutate
    const postOrder = await prisma.order.findUnique({ where: { id: testOrderId } })
    if (postOrder?.status !== preStatus) {
      throw new Error(`Order status MUTATED from ${preStatus} to ${postOrder?.status}!`)
    }

    // Direct DB check: Ensure NO audit log was created
    const auditLogs = await prisma.auditLog.findMany({
      where: { action: 'STORE_RECEIPT_CONFIRMED' },
      take: 20
    })
    const badLog = auditLogs.find(l => (l.details as any)?.orderId === testOrderId)
    if (badLog) {
      throw new Error(`Premature AuditLog entry found for order ${testOrderId}!`)
    }

    // 2b. Role Enforcement: Non-Store Manager cannot confirm receipt
    const driverConfirm = await fetch(`${BASE_URL}/api/store/orders/${testOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Cookie': driverCookie }
    })
    if (driverConfirm.status !== 401) {
      throw new Error(`Expected HTTP 401 for driver calling confirm receipt, got ${driverConfirm.status}`)
    }

    // 2c. Unauthenticated call (Middleware intercepts with 307 redirect to /login)
    const unauthConfirm = await fetch(`${BASE_URL}/api/store/orders/${testOrderId}/confirm-receipt`, {
      method: 'POST',
      redirect: 'manual'
    })
    if (unauthConfirm.status !== 307) {
      throw new Error(`Expected HTTP 307 login redirect for unauthenticated confirm receipt, got ${unauthConfirm.status}`)
    }

    results.push({
      category: 'Negative Test - Confirm Receipt',
      testCase: 'Reject confirm receipt on non-delivered order (400), verify ZERO DB mutation & no premature AuditLog',
      passed: true,
      observation: `Returned 400 with message "${confirmBody.error}", DB status retained=${postOrder?.status}, 0 audit logs created, 401 on wrong role, 307 login redirect on unauthenticated`
    })
  } catch (err: any) {
    results.push({
      category: 'Negative Test - Confirm Receipt',
      testCase: 'Status immutability and rejection verification',
      passed: false,
      observation: 'Negative confirmation test failed',
      error: err.message
    })
  }

  // --------------------------------------------------------------------------
  // CHALLENGE 3: Step 2 Auto-Allocate and Publish
  // --------------------------------------------------------------------------
  try {
    const planRes = await fetch(`${BASE_URL}/api/dispatch/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dispatchCookie },
      body: JSON.stringify({ depotId: 'DEP_PEL' })
    })

    if (!planRes.ok) throw new Error(`Plan HTTP ${planRes.status}: ${await planRes.text()}`)
    const planData = await planRes.json()

    const publishRes = await fetch(`${BASE_URL}/api/dispatch/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': dispatchCookie },
      body: JSON.stringify({ planId: planData.planId })
    })

    if (!publishRes.ok) throw new Error(`Publish HTTP ${publishRes.status}: ${await publishRes.text()}`)

    // Query DB for our specific test order's TripStop
    const dbStop = await prisma.tripStop.findFirst({
      where: { orderId: testOrderId },
      include: { trip: true }
    })

    if (!dbStop || !dbStop.trip) throw new Error(`TripStop not found in DB for order ${testOrderId}`)
    testTripId = dbStop.tripId
    testTripStopId = dbStop.id

    const dbTrip = await prisma.trip.findUnique({ where: { id: testTripId } })
    const dbOrder = await prisma.order.findUnique({ where: { id: testOrderId } })

    if (dbTrip?.status !== TripStatus.LOADING) {
      throw new Error(`Trip in DB status=${dbTrip?.status}, expected LOADING`)
    }
    if (dbOrder?.status !== OrderStatus.LOADING) {
      throw new Error(`Order in DB status=${dbOrder?.status}, expected LOADING`)
    }

    // Intermediate Negative Test: Attempt confirm receipt when order is in LOADING status
    const loadingConfirmRes = await fetch(`${BASE_URL}/api/store/orders/${testOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Cookie': storeCookie }
    })
    if (loadingConfirmRes.status !== 400) {
      throw new Error(`Expected HTTP 400 when confirming receipt for LOADING order, got ${loadingConfirmRes.status}`)
    }

    results.push({
      category: 'Step 2 - Auto-Allocate & Publish',
      testCase: 'Plan generation and publish updates both Trip and Order to LOADING in PostgreSQL; rejects receipt confirmation',
      passed: true,
      observation: `Trip ${testTripId} status=${dbTrip?.status}, Order ${testOrderId} status=${dbOrder?.status}, TripStop=${testTripStopId}, Receipt confirm during LOADING rejected with 400`
    })
  } catch (err: any) {
    results.push({
      category: 'Step 2 - Auto-Allocate & Publish',
      testCase: 'Step 2 DB and API verification',
      passed: false,
      observation: 'Step 2 failed',
      error: err.message
    })
  }

  // --------------------------------------------------------------------------
  // CHALLENGE 4: Step 3 Loader Load & Driver Sign-off
  // --------------------------------------------------------------------------
  try {
    // 4a. Load crates
    const loadRes = await fetch(`${BASE_URL}/api/loader/trips/${testTripId}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': loaderCookie },
      body: JSON.stringify({ loadedCrates: { 1: 18 } })
    })
    if (!loadRes.ok) throw new Error(`Load HTTP ${loadRes.status}: ${await loadRes.text()}`)

    const loadRecInProgress = await prisma.loadingRecord.findUnique({ where: { tripId: testTripId } })
    if (!loadRecInProgress || loadRecInProgress.status !== 'IN_PROGRESS') {
      throw new Error(`LoadingRecord status=${loadRecInProgress?.status}, expected IN_PROGRESS`)
    }

    // 4b. Driver sign-off
    const signoffRes = await fetch(`${BASE_URL}/api/loader/trips/${testTripId}/signoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': loaderCookie },
      body: JSON.stringify({
        signature: 'data:image/svg+xml;base64,challenge-signoff',
        totalCrates: 18
      })
    })
    if (!signoffRes.ok) throw new Error(`Signoff HTTP ${signoffRes.status}: ${await signoffRes.text()}`)

    const loadRecCompleted = await prisma.loadingRecord.findUnique({ where: { tripId: testTripId } })
    const orderLoaded = await prisma.order.findUnique({ where: { id: testOrderId } })
    const tripLoading = await prisma.trip.findUnique({ where: { id: testTripId } })

    if (loadRecCompleted?.status !== 'COMPLETED') {
      throw new Error(`LoadingRecord status=${loadRecCompleted?.status}, expected COMPLETED`)
    }
    if (orderLoaded?.status !== OrderStatus.LOADED) {
      throw new Error(`Order status=${orderLoaded?.status}, expected LOADED`)
    }
    if (tripLoading?.status !== TripStatus.LOADING) {
      throw new Error(`Trip status=${tripLoading?.status}, expected LOADING`)
    }

    const signoffAudit = await prisma.auditLog.findFirst({
      where: { action: 'LOADER_DRIVER_SIGNOFF' },
      orderBy: { createdAt: 'desc' }
    })
    if (!signoffAudit) throw new Error('LOADER_DRIVER_SIGNOFF entry missing from AuditLog!')

    // Intermediate Negative Test: Attempt confirm receipt when order is in LOADED status
    const loadedConfirmRes = await fetch(`${BASE_URL}/api/store/orders/${testOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Cookie': storeCookie }
    })
    if (loadedConfirmRes.status !== 400) {
      throw new Error(`Expected HTTP 400 when confirming receipt for LOADED order, got ${loadedConfirmRes.status}`)
    }

    results.push({
      category: 'Step 3 - Loading & Sign-off',
      testCase: 'Loading record completed, Order transitioned to LOADED, Trip retained at LOADING, AuditLog recorded; receipt confirm rejected (400)',
      passed: true,
      observation: `LoadingRecord=${loadRecCompleted?.id} (COMPLETED), Order ${testOrderId} (LOADED), Trip ${testTripId} (LOADING), AuditLog=${signoffAudit?.id}, Receipt confirm during LOADED rejected with 400`
    })
  } catch (err: any) {
    results.push({
      category: 'Step 3 - Loading & Sign-off',
      testCase: 'Step 3 verification',
      passed: false,
      observation: 'Step 3 failed',
      error: err.message
    })
  }

  // --------------------------------------------------------------------------
  // CHALLENGE 5: Step 4 Driver Route & POD Sync
  // --------------------------------------------------------------------------
  try {
    // 5a. Start route
    const startRes = await fetch(`${BASE_URL}/api/driver/trip/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': driverCookie },
      body: JSON.stringify({ tripId: testTripId })
    })
    if (!startRes.ok) throw new Error(`Start route HTTP ${startRes.status}: ${await startRes.text()}`)

    const tripInTransit = await prisma.trip.findUnique({ where: { id: testTripId } })
    const orderInTransit = await prisma.order.findUnique({ where: { id: testOrderId } })

    if (tripInTransit?.status !== TripStatus.IN_TRANSIT || orderInTransit?.status !== OrderStatus.IN_TRANSIT) {
      throw new Error(`Status mismatch after start: trip=${tripInTransit?.status}, order=${orderInTransit?.status}`)
    }

    // Intermediate Negative Test: Attempt confirm receipt when order is IN_TRANSIT
    const transitConfirmRes = await fetch(`${BASE_URL}/api/store/orders/${testOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Cookie': storeCookie }
    })
    if (transitConfirmRes.status !== 400) {
      throw new Error(`Expected HTTP 400 when confirming receipt for IN_TRANSIT order, got ${transitConfirmRes.status}`)
    }

    // 5b. Sync stop completion with ProofOfDelivery
    const clientEventId = `pod-challenge-${Date.now()}`
    const allStops = await prisma.tripStop.findMany({ where: { tripId: testTripId } })

    const syncRes = await fetch(`${BASE_URL}/api/driver/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': driverCookie },
      body: JSON.stringify({
        events: allStops.map(s => ({
          id: `${clientEventId}-${s.id}`,
          type: 'STOP_COMPLETION',
          tripStopId: s.id,
          outcome: 'SUCCESS',
          signature: 'data:image/svg+xml;base64,pod-receiver',
          photo: 'https://waypoint.mock/pod/photo-challenger.jpg',
          createdAt: new Date().toISOString()
        }))
      })
    })

    if (!syncRes.ok) throw new Error(`Driver sync HTTP ${syncRes.status}: ${await syncRes.text()}`)

    const pod = await prisma.proofOfDelivery.findUnique({ where: { tripStopId: testTripStopId } })
    const deliveredOrder = await prisma.order.findUnique({ where: { id: testOrderId } })
    const completedTrip = await prisma.trip.findUnique({ where: { id: testTripId } })

    if (!pod) throw new Error(`ProofOfDelivery missing for TripStop ${testTripStopId}!`)
    if (deliveredOrder?.status !== OrderStatus.DELIVERED) {
      throw new Error(`Order status=${deliveredOrder?.status}, expected DELIVERED`)
    }
    if (completedTrip?.status !== TripStatus.COMPLETED) {
      throw new Error(`Trip status=${completedTrip?.status}, expected COMPLETED`)
    }

    // 5c. Idempotency test: Re-send same sync event batch
    const duplicateRes = await fetch(`${BASE_URL}/api/driver/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': driverCookie },
      body: JSON.stringify({
        events: allStops.map(s => ({
          id: `${clientEventId}-${s.id}`,
          type: 'STOP_COMPLETION',
          tripStopId: s.id,
          outcome: 'SUCCESS'
        }))
      })
    })
    if (!duplicateRes.ok) throw new Error(`Idempotent sync failed with HTTP ${duplicateRes.status}`)

    results.push({
      category: 'Step 4 - Driver Route & POD Sync',
      testCase: 'Route starts (IN_TRANSIT), POD sync creates ProofOfDelivery, Order DELIVERED, Trip COMPLETED, sync is idempotent; receipt confirm during transit rejected (400)',
      passed: true,
      observation: `Trip=${completedTrip.status}, Order=${deliveredOrder.status}, POD=${pod.id}, Idempotency verified, Receipt confirm during IN_TRANSIT rejected with 400`
    })
  } catch (err: any) {
    results.push({
      category: 'Step 4 - Driver Route & POD Sync',
      testCase: 'Step 4 verification',
      passed: false,
      observation: 'Step 4 failed',
      error: err.message
    })
  }

  // --------------------------------------------------------------------------
  // CHALLENGE 6: Step 5 Store Manager Confirm Receipt
  // --------------------------------------------------------------------------
  try {
    const confirmRes = await fetch(`${BASE_URL}/api/store/orders/${testOrderId}/confirm-receipt`, {
      method: 'POST',
      headers: { 'Cookie': storeCookie }
    })

    if (!confirmRes.ok) throw new Error(`Confirm receipt HTTP ${confirmRes.status}: ${await confirmRes.text()}`)
    const confirmData = await confirmRes.json()

    if (!confirmData.success || confirmData.status !== OrderStatus.DELIVERED) {
      throw new Error(`Unexpected confirm receipt response: ${JSON.stringify(confirmData)}`)
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { action: 'STORE_RECEIPT_CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      take: 5
    })

    const receiptLog = auditLogs.find(l => (l.details as any)?.orderId === testOrderId)
    if (!receiptLog) {
      throw new Error(`AuditLog STORE_RECEIPT_CONFIRMED missing for order ${testOrderId}!`)
    }

    const finalOrder = await prisma.order.findUnique({ where: { id: testOrderId } })
    if (finalOrder?.status !== OrderStatus.DELIVERED) {
      throw new Error(`Final order status corrupted: ${finalOrder?.status}`)
    }

    results.push({
      category: 'Step 5 - Store Manager Receipt Confirmation',
      testCase: 'Confirm receipt succeeds on DELIVERED order, writes STORE_RECEIPT_CONFIRMED to PostgreSQL AuditLog',
      passed: true,
      observation: `AuditLog=${receiptLog.id}, Action=${receiptLog.action}, verifiedAt=${(receiptLog.details as any)?.verifiedAt}`
    })
  } catch (err: any) {
    results.push({
      category: 'Step 5 - Store Manager Receipt Confirmation',
      testCase: 'Step 5 verification',
      passed: false,
      observation: 'Step 5 failed',
      error: err.message
    })
  }

  // Print Summary
  console.log('\n' + '='.repeat(80))
  console.log(' EMPIRICAL AUDIT RESULTS')
  console.log('='.repeat(80))
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] [${r.category}] ${r.testCase}`)
    console.log(`       Observation: ${r.observation}`)
    if (r.error) console.log(`       Error: ${r.error}`)
  }
  console.log('='.repeat(80))

  const allPassed = results.every(r => r.passed)
  if (!allPassed) {
    process.exit(1)
  }
}

runEmpiricalAudit().catch(err => {
  console.error('Fatal challenge runner error:', err)
  process.exit(1)
})
