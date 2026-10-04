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

export async function runApiE2EWorkflow() {
  const startTime = Date.now()
  const results: StepResult[] = []

  console.log('='.repeat(80))
  console.log(' API E2E WORKFLOW - 5-ROLE LIFECYCLE ON POSTGRESQL')
  console.log('='.repeat(80))
  console.log(`Server:    ${BASE_URL}`)
  console.log(`Database:  PostgreSQL on port 5432 via Prisma`)
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // Check health
  const healthRes = await fetch(`${BASE_URL}/api/health`)
  if (!healthRes.ok) {
    throw new Error(`Health check failed: ${healthRes.status}`)
  }

  // Fetch users
  const users = await prisma.user.findMany()
  const storeUser = users.find(u => u.role === 'STORE_MANAGER')
  const dispatchUser = users.find(u => u.role === 'DISPATCHER')
  const loaderUser = users.find(u => u.role === 'LOADER')
  const driverUser = users.find(u => u.role === 'DRIVER')

  if (!storeUser || !dispatchUser || !loaderUser || !driverUser) {
    throw new Error('Seed users not found in database')
  }

  const storeCookie = await createAuthCookie(storeUser)
  const dispatchCookie = await createAuthCookie(dispatchUser)
  const loaderCookie = await createAuthCookie(loaderUser)
  const driverCookie = await createAuthCookie(driverUser)

  let activeOrderId: string | null = null
  let activeTripId: string | null = null
  let activeTripStopId: string | null = null

  // Step 1: Store Manager places order
  const t1 = Date.now()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const orderRes = await fetch(`${BASE_URL}/api/store/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': storeCookie },
    body: JSON.stringify({
      items: [
        { productId: 'P01', quantity: 6 },
        { productId: 'P04', quantity: 8 }
      ],
      targetDate: tomorrow.toISOString().split('T')[0]
    })
  })
  if (!orderRes.ok) throw new Error(`Step 1 HTTP error: ${orderRes.status}`)
  const orderData = await orderRes.json()
  activeOrderId = orderData.orders[0].id

  const dbOrder1 = await prisma.order.findUnique({
    where: { id: activeOrderId! },
    include: { lines: true }
  })
  if (!dbOrder1 || (dbOrder1.status !== OrderStatus.CONFIRMED && dbOrder1.status !== OrderStatus.PENDING)) {
    throw new Error(`Step 1 DB assertion failed: status=${dbOrder1?.status}`)
  }
  results.push({
    step: 'Step 1',
    name: 'Store Manager Place Order',
    passed: true,
    durationMs: Date.now() - t1,
    details: { orderId: dbOrder1.id, status: dbOrder1.status }
  })
  console.log(`[PASS] Step 1: Order ${dbOrder1.id} created with status ${dbOrder1.status}`)

  // Negative Test: Confirm receipt on non-delivered order
  const tNeg = Date.now()
  const negRes = await fetch(`${BASE_URL}/api/store/orders/${activeOrderId}/confirm-receipt`, {
    method: 'POST',
    headers: { 'Cookie': storeCookie }
  })
  if (negRes.status !== 400) {
    throw new Error(`Negative test expected 400 Bad Request, got ${negRes.status}`)
  }
  results.push({
    step: 'Negative',
    name: 'Reject Confirm on Non-Delivered Order',
    passed: true,
    durationMs: Date.now() - tNeg
  })
  console.log('[PASS] Negative Test: Non-delivered order confirmation rejected with HTTP 400')

  // Step 2: Dispatcher Auto-Allocate & Publish
  const t2 = Date.now()
  const planRes = await fetch(`${BASE_URL}/api/dispatch/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': dispatchCookie },
    body: JSON.stringify({ depotId: 'DEP_PEL' })
  })
  if (!planRes.ok) throw new Error(`Step 2 Plan HTTP error: ${planRes.status}`)
  const planData = await planRes.json()

  const publishRes = await fetch(`${BASE_URL}/api/dispatch/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': dispatchCookie },
    body: JSON.stringify({ planId: planData.planId })
  })
  if (!publishRes.ok) throw new Error(`Step 2 Publish HTTP error: ${publishRes.status}`)

  const dbStop = await prisma.tripStop.findFirst({
    where: { orderId: activeOrderId! },
    include: { trip: true }
  })
  if (!dbStop || !dbStop.trip) throw new Error('TripStop not found for order')
  activeTripId = dbStop.tripId
  activeTripStopId = dbStop.id

  const dbTrip2 = await prisma.trip.findUnique({ where: { id: activeTripId } })
  const dbOrder2 = await prisma.order.findUnique({ where: { id: activeOrderId! } })
  if (dbTrip2?.status !== TripStatus.LOADING || dbOrder2?.status !== OrderStatus.LOADING) {
    throw new Error(`Step 2 DB assertion failed: tripStatus=${dbTrip2?.status}, orderStatus=${dbOrder2?.status}`)
  }
  results.push({
    step: 'Step 2',
    name: 'Dispatcher Allocate & Publish',
    passed: true,
    durationMs: Date.now() - t2,
    details: { tripId: activeTripId, tripStatus: dbTrip2.status, orderStatus: dbOrder2.status }
  })
  console.log(`[PASS] Step 2: Plan published, Trip ${activeTripId} and Order ${activeOrderId} transitioned to LOADING`)

  // Step 3: Loader Load & Sign-Off
  const t3 = Date.now()
  const loadRes = await fetch(`${BASE_URL}/api/loader/trips/${activeTripId}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': loaderCookie },
    body: JSON.stringify({ loadedCrates: { 1: 14 } })
  })
  if (!loadRes.ok) throw new Error(`Step 3 Load HTTP error: ${loadRes.status}`)

  const signoffRes = await fetch(`${BASE_URL}/api/loader/trips/${activeTripId}/signoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': loaderCookie },
    body: JSON.stringify({ signature: 'loader-signature', totalCrates: 14 })
  })
  if (!signoffRes.ok) throw new Error(`Step 3 Signoff HTTP error: ${signoffRes.status}`)

  const loadRec = await prisma.loadingRecord.findUnique({ where: { tripId: activeTripId! } })
  const dbOrder3 = await prisma.order.findUnique({ where: { id: activeOrderId! } })
  if (loadRec?.status !== 'COMPLETED' || dbOrder3?.status !== OrderStatus.LOADED) {
    throw new Error(`Step 3 DB assertion failed: loadRec=${loadRec?.status}, orderStatus=${dbOrder3?.status}`)
  }
  results.push({
    step: 'Step 3',
    name: 'Loader Loading & Sign-off',
    passed: true,
    durationMs: Date.now() - t3,
    details: { loadingRecordStatus: loadRec.status, orderStatus: dbOrder3.status }
  })
  console.log(`[PASS] Step 3: Vehicle loaded, Order ${activeOrderId} transitioned to LOADED, LoadingRecord COMPLETED`)

  // Step 4: Driver Start Route & Complete Stops
  const t4 = Date.now()
  const startRouteRes = await fetch(`${BASE_URL}/api/driver/trip/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': driverCookie },
    body: JSON.stringify({ tripId: activeTripId })
  })
  if (!startRouteRes.ok) throw new Error(`Step 4 Start Route HTTP error: ${startRouteRes.status}`)

  const dbTrip4 = await prisma.trip.findUnique({ where: { id: activeTripId! } })
  const dbOrder4 = await prisma.order.findUnique({ where: { id: activeOrderId! } })
  if (dbTrip4?.status !== TripStatus.IN_TRANSIT || dbOrder4?.status !== OrderStatus.IN_TRANSIT) {
    throw new Error(`Step 4 Start Route DB failed: trip=${dbTrip4?.status}, order=${dbOrder4?.status}`)
  }

  const allStops = await prisma.tripStop.findMany({ where: { tripId: activeTripId! } })
  const syncRes = await fetch(`${BASE_URL}/api/driver/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': driverCookie },
    body: JSON.stringify({
      events: allStops.map(s => ({
        type: 'STOP_COMPLETION',
        tripStopId: s.id,
        outcome: 'SUCCESS',
        signature: 'data:image/svg+xml;base64,pod-signature',
        photo: 'https://waypoint.mock/pod/photo.jpg',
        createdAt: new Date().toISOString()
      }))
    })
  })
  if (!syncRes.ok) throw new Error(`Step 4 Sync HTTP error: ${syncRes.status}`)

  const pod = await prisma.proofOfDelivery.findUnique({ where: { tripStopId: activeTripStopId! } })
  const dbOrder4Delivered = await prisma.order.findUnique({ where: { id: activeOrderId! } })
  const dbTrip4Completed = await prisma.trip.findUnique({ where: { id: activeTripId! } })

  if (!pod || dbOrder4Delivered?.status !== OrderStatus.DELIVERED || dbTrip4Completed?.status !== TripStatus.COMPLETED) {
    throw new Error(`Step 4 Sync DB failed: pod=${Boolean(pod)}, order=${dbOrder4Delivered?.status}, trip=${dbTrip4Completed?.status}`)
  }
  results.push({
    step: 'Step 4',
    name: 'Driver Route & POD Delivery',
    passed: true,
    durationMs: Date.now() - t4,
    details: { podId: pod.id, orderStatus: dbOrder4Delivered.status, tripStatus: dbTrip4Completed.status }
  })
  console.log(`[PASS] Step 4: Route completed, POD created, Order DELIVERED, Trip COMPLETED`)

  // Step 5: Store Manager Confirm Receipt
  const t5 = Date.now()
  const confirmRes = await fetch(`${BASE_URL}/api/store/orders/${activeOrderId}/confirm-receipt`, {
    method: 'POST',
    headers: { 'Cookie': storeCookie }
  })
  if (!confirmRes.ok) throw new Error(`Step 5 Confirm Receipt HTTP error: ${confirmRes.status}`)

  const recentLogs = await prisma.auditLog.findMany({
    where: { action: 'STORE_RECEIPT_CONFIRMED' },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
  const confirmedLog = recentLogs.find(l => (l.details as any)?.orderId === activeOrderId)
  if (!confirmedLog) {
    throw new Error(`Step 5 DB audit log STORE_RECEIPT_CONFIRMED not found for order ${activeOrderId}`)
  }

  results.push({
    step: 'Step 5',
    name: 'Store Manager Receipt Confirmation',
    passed: true,
    durationMs: Date.now() - t5,
    details: { auditLogId: confirmedLog.id }
  })
  console.log(`[PASS] Step 5: Receipt verified in PostgreSQL AuditLog: ${confirmedLog.id}`)

  console.log('\n' + '='.repeat(80))
  console.log(`[SUCCESS] ALL 5 LIFECYCLE STEPS VERIFIED IN ${Date.now() - startTime}ms`)
  console.log('='.repeat(80))
  return results
}

if (require.main === module || !process.env.VITEST) {
  runApiE2EWorkflow()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal API E2E workflow error:', err)
      process.exit(1)
    })
}
