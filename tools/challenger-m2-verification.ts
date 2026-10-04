import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { OrderStatus, TripStatus } from '@prisma/client'

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
  console.log(`${icon} [${category}] ${test} (Expected: ${expected}, Got: ${actual})`)
  if (!passed && details) {
    console.error(`   Error details: ${details}`)
  }
}

async function runEmpiricalVerification() {
  console.log('=================================================================')
  console.log('   EMPIRICAL CHALLENGER M2 VERIFICATION HARNESS')
  console.log('   Testing against Next.js (http://localhost:3000) & PostgreSQL (5432)')
  console.log('=================================================================\n')

  const baseUrl = 'http://localhost:3000'

  // Step 0: Generate valid LOADER JWT session token
  const loaderUser = await prisma.user.findUnique({
    where: { email: 'loader@waypoint.com' }
  })
  if (!loaderUser) {
    throw new Error('Loader user loader@waypoint.com not found in PostgreSQL')
  }

  const sessionPayload = {
    userId: loaderUser.id,
    role: loaderUser.role,
    email: loaderUser.email,
    depotId: loaderUser.depotId || 'DEP_PEL',
    outletId: loaderUser.outletId,
    vehicleId: loaderUser.vehicleId,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  }
  const sessionToken = await encrypt(sessionPayload)
  const authCookie = `session=${sessionToken}`

  // -------------------------------------------------------------
  // Test Suite 1: Middleware & Unauthenticated Protection
  // -------------------------------------------------------------
  console.log('\n--- SUITE 1: Auth & Middleware Protection ---')
  const unauthRes = await fetch(`${baseUrl}/api/loader/trips`, {
    redirect: 'manual'
  })
  assert(
    unauthRes.status === 307,
    'Auth / Middleware',
    'Unauthenticated GET /api/loader/trips redirects to /login',
    307,
    unauthRes.status,
    `Location header: ${unauthRes.headers.get('location')}`
  )

  // -------------------------------------------------------------
  // Test Suite 2: GET /api/loader/trips against PostgreSQL
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: GET /api/loader/trips against PostgreSQL ---')
  const tripsRes = await fetch(`${baseUrl}/api/loader/trips`, {
    headers: { Cookie: authCookie }
  })
  assert(
    tripsRes.status === 200,
    'Loader Trips API',
    'Authenticated GET /api/loader/trips returns HTTP 200',
    200,
    tripsRes.status
  )

  const tripsJson = await tripsRes.json()
  assert(
    tripsJson.success === true,
    'Loader Trips API',
    'Response contains success: true',
    true,
    tripsJson.success
  )
  assert(
    Array.isArray(tripsJson.trips) && tripsJson.trips.length > 0,
    'Loader Trips API',
    'Response contains non-empty trips array',
    '> 0 trips',
    tripsJson.trips?.length
  )

  // Cross-reference with live PostgreSQL
  const dbTripsCount = await prisma.trip.count({
    where: {
      status: { in: [TripStatus.LOADING, TripStatus.PLANNED] }
    }
  })
  assert(
    tripsJson.trips.length === dbTripsCount,
    'Postgres Parity',
    'API trip count matches database LOADING/PLANNED trip count',
    dbTripsCount,
    tripsJson.trips.length
  )

  // Check structure of first trip
  const sampleTrip = tripsJson.trips[0]
  assert(
    Boolean(sampleTrip.id && sampleTrip.vehicle && sampleTrip.departure && sampleTrip.status),
    'Loader Trips API',
    'Trip object contains id, vehicle, departure, status fields',
    'truthy fields',
    JSON.stringify({ id: sampleTrip.id, vehicle: sampleTrip.vehicle, departure: sampleTrip.departure, status: sampleTrip.status })
  )

  // -------------------------------------------------------------
  // Test Suite 3: Reverse Load Sequencing in GET /api/loader/trips/[id]
  // -------------------------------------------------------------
  console.log('\n--- SUITE 3: Reverse Load Sequencing in GET /api/loader/trips/[id] ---')
  // Select a multi-stop trip for definitive reverse ordering test
  const candidateTrip = tripsJson.trips.find((t: any) => t.stopsCount >= 3) || tripsJson.trips[0]
  console.log(`Selected trip for sequence audit: ${candidateTrip.id} (Stops count: ${candidateTrip.stopsCount})`)

  // Fetch raw stops directly from PostgreSQL
  const dbRawTrip = await prisma.trip.findUnique({
    where: { id: candidateTrip.id },
    include: {
      stops: {
        orderBy: { sequence: 'asc' },
        include: { order: { include: { lines: true, outlet: true } } }
      }
    }
  })

  if (!dbRawTrip) {
    throw new Error(`Trip ${candidateTrip.id} not found in PostgreSQL`)
  }

  const rawSequencesAsc = dbRawTrip.stops.map(s => s.sequence)
  console.log('PostgreSQL raw delivery sequences (ASC):', rawSequencesAsc)

  // Query API endpoint
  const tripDetailRes = await fetch(`${baseUrl}/api/loader/trips/${candidateTrip.id}`, {
    headers: { Cookie: authCookie }
  })
  assert(
    tripDetailRes.status === 200,
    'Trip Detail API',
    `GET /api/loader/trips/${candidateTrip.id} returns HTTP 200`,
    200,
    tripDetailRes.status
  )

  const tripDetailJson = await tripDetailRes.json()
  assert(
    tripDetailJson.success === true && Array.isArray(tripDetailJson.stops),
    'Trip Detail API',
    'Response contains success: true and stops array',
    true,
    tripDetailJson.success
  )

  const apiStops = tripDetailJson.stops
  const apiSequences = apiStops.map((s: any) => s.sequence)
  const apiLoadSequences = apiStops.map((s: any) => s.loadSequence)

  console.log('API returned delivery sequences (should be DESC):', apiSequences)
  console.log('API returned load sequences (should be 1..N):', apiLoadSequences)

  // Verify reverse sequencing
  let strictlyReversed = true
  for (let i = 0; i < apiSequences.length - 1; i++) {
    if (apiSequences[i] <= apiSequences[i + 1]) {
      strictlyReversed = false
      break
    }
  }

  assert(
    strictlyReversed,
    'Reverse Sequencing',
    'Stops delivery sequence strictly decreases (last delivery stop loaded first)',
    true,
    strictlyReversed,
    `Sequences returned: ${apiSequences.join(', ')}`
  )

  let loadSequencesStrict = true
  for (let i = 0; i < apiLoadSequences.length; i++) {
    if (apiLoadSequences[i] !== i + 1) {
      loadSequencesStrict = false
      break
    }
  }

  assert(
    loadSequencesStrict,
    'Reverse Sequencing',
    'Load sequences strictly ascend 1, 2, ..., N',
    true,
    loadSequencesStrict,
    `Load sequences returned: ${apiLoadSequences.join(', ')}`
  )

  // -------------------------------------------------------------
  // Test Suite 4: Loading Progress & Shortfall via POST /api/loader/trips/[id]/load
  // -------------------------------------------------------------
  console.log('\n--- SUITE 4: POST /api/loader/trips/[id]/load ---')
  const testStopSequence = apiSequences[0]
  const loadPayload = {
    loadedCrates: { [testStopSequence]: 5 },
    shortfall: {
      stopId: testStopSequence,
      qty: 2,
      reason: 'Challenger empirical shortfall stress-test'
    }
  }

  const loadRes = await fetch(`${baseUrl}/api/loader/trips/${candidateTrip.id}/load`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookie
    },
    body: JSON.stringify(loadPayload)
  })

  assert(
    loadRes.status === 200,
    'Load Progress API',
    'POST /api/loader/trips/[id]/load returns HTTP 200',
    200,
    loadRes.status
  )

  const loadJson = await loadRes.json()
  assert(
    loadJson.success === true && Boolean(loadJson.loadingRecordId),
    'Load Progress API',
    'Response returns success: true and loadingRecordId',
    'truthy loadingRecordId',
    loadJson.loadingRecordId
  )

  // Verify PostgreSQL state
  const dbLoadingRecordInProgress = await prisma.loadingRecord.findUnique({
    where: { tripId: candidateTrip.id }
  })
  assert(
    dbLoadingRecordInProgress?.status === 'IN_PROGRESS',
    'Postgres Persistence',
    'LoadingRecord exists in Postgres with status IN_PROGRESS',
    'IN_PROGRESS',
    dbLoadingRecordInProgress?.status
  )

  const dbFlag = await prisma.loadingItemFlag.findFirst({
    where: { loadingRecordId: dbLoadingRecordInProgress?.id },
    orderBy: { id: 'desc' }
  })
  assert(
    dbFlag?.quantity === 2,
    'Postgres Persistence',
    'LoadingItemFlag recorded in Postgres with quantity 2',
    2,
    dbFlag?.quantity
  )

  const dbIssue = await prisma.issueReport.findFirst({
    where: { relatedEntityId: candidateTrip.id },
    orderBy: { createdAt: 'desc' }
  })
  assert(
    Boolean(dbIssue && dbIssue.note?.includes('Challenger')),
    'Postgres Persistence',
    'IssueReport created in Postgres for Dispatcher alerts',
    true,
    Boolean(dbIssue)
  )

  // -------------------------------------------------------------
  // Test Suite 5: Driver Sign-off via POST /api/loader/trips/[id]/signoff
  // -------------------------------------------------------------
  console.log('\n--- SUITE 5: POST /api/loader/trips/[id]/signoff & Postgres Transitions ---')
  const orderIdsForTrip = dbRawTrip.stops.map(s => s.orderId).filter(Boolean) as string[]
  console.log(`Associated order IDs for trip ${candidateTrip.id}:`, orderIdsForTrip)

  const preSignoffOrders = await prisma.order.findMany({
    where: { id: { in: orderIdsForTrip } }
  })
  console.log('Order statuses prior to signoff:', preSignoffOrders.map(o => `${o.id}:${o.status}`))

  const signoffPayload = {
    signature: 'data:image/svg+xml;utf8,<svg>empirical-challenger-signature</svg>',
    totalCrates: candidateTrip.crates || 25
  }

  const signoffRes = await fetch(`${baseUrl}/api/loader/trips/${candidateTrip.id}/signoff`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: authCookie
    },
    body: JSON.stringify(signoffPayload)
  })

  assert(
    signoffRes.status === 200,
    'Sign-off API',
    'POST /api/loader/trips/[id]/signoff returns HTTP 200',
    200,
    signoffRes.status
  )

  const signoffJson = await signoffRes.json()
  assert(
    signoffJson.success === true,
    'Sign-off API',
    'Response returns success: true',
    true,
    signoffJson.success
  )

  // Verify PostgreSQL state transitions
  const dbLoadingRecordCompleted = await prisma.loadingRecord.findUnique({
    where: { tripId: candidateTrip.id }
  })
  assert(
    dbLoadingRecordCompleted?.status === 'COMPLETED',
    'Postgres Persistence',
    'LoadingRecord transitioned to COMPLETED in Postgres',
    'COMPLETED',
    dbLoadingRecordCompleted?.status
  )

  const postSignoffOrders = await prisma.order.findMany({
    where: { id: { in: orderIdsForTrip } }
  })
  const allOrdersLoaded = postSignoffOrders.every(o => o.status === OrderStatus.LOADED)
  assert(
    allOrdersLoaded,
    'Postgres State Transition',
    'All associated Order records transitioned to OrderStatus.LOADED',
    true,
    allOrdersLoaded,
    `Order statuses: ${postSignoffOrders.map(o => `${o.id}:${o.status}`).join(', ')}`
  )

  const dbAuditLog = await prisma.auditLog.findFirst({
    where: { action: 'LOADER_DRIVER_SIGNOFF' },
    orderBy: { createdAt: 'desc' }
  })
  assert(
    Boolean(dbAuditLog && (dbAuditLog.details as any)?.tripId === candidateTrip.id),
    'Postgres Audit Logging',
    'AuditLog entry created with LOADER_DRIVER_SIGNOFF and tripId',
    candidateTrip.id,
    (dbAuditLog?.details as any)?.tripId
  )

  // -------------------------------------------------------------
  // Test Suite 6: Adversarial & Edge Cases
  // -------------------------------------------------------------
  console.log('\n--- SUITE 6: Adversarial & Edge Case Stress-Tests ---')

  // 6.1 Non-existent trip GET
  const nonExistentGet = await fetch(`${baseUrl}/api/loader/trips/TRIP-NONEXISTENT-999`, {
    headers: { Cookie: authCookie }
  })
  assert(
    nonExistentGet.status === 404,
    'Edge Case: 404 Handling',
    'GET /api/loader/trips/NON_EXISTENT returns 404',
    404,
    nonExistentGet.status
  )

  // 6.2 Non-existent trip signoff POST
  const nonExistentSignoff = await fetch(`${baseUrl}/api/loader/trips/TRIP-NONEXISTENT-999/signoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ signature: 'sig', totalCrates: 10 })
  })
  assert(
    nonExistentSignoff.status === 404,
    'Edge Case: 404 Handling',
    'POST /api/loader/trips/NON_EXISTENT/signoff returns 404',
    404,
    nonExistentSignoff.status
  )

  // 6.3 Idempotent repeated signoff
  const repeatSignoff = await fetch(`${baseUrl}/api/loader/trips/${candidateTrip.id}/signoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({ signature: 'repeat-sig', totalCrates: 25 })
  })
  assert(
    repeatSignoff.status === 200,
    'Edge Case: Idempotency',
    'Repeated signoff succeeds idempotently without 500 collision',
    200,
    repeatSignoff.status
  )

  // 6.4 Malformed body on signoff (empty JSON)
  const emptyBodySignoff = await fetch(`${baseUrl}/api/loader/trips/${candidateTrip.id}/signoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: authCookie },
    body: JSON.stringify({})
  })
  assert(
    emptyBodySignoff.status === 200,
    'Edge Case: Payload Robustness',
    'Sign-off with empty body falls back safely without unhandled exception',
    200,
    emptyBodySignoff.status
  )

  // 6.5 Depot filter parameter test
  const peliyagodaParamRes = await fetch(`${baseUrl}/api/loader/trips?depotId=Peliyagoda`, {
    headers: { Cookie: authCookie }
  })
  const peliyagodaJson = await peliyagodaParamRes.json()
  assert(
    peliyagodaParamRes.status === 200 && peliyagodaJson.success === true,
    'Edge Case: Depot Filter',
    'GET /api/loader/trips?depotId=Peliyagoda succeeds with depot normalization',
    200,
    peliyagodaParamRes.status
  )

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n=================================================================')
  const total = assertions.length
  const passed = assertions.filter(a => a.passed).length
  const failed = assertions.filter(a => !a.passed).length
  console.log(`TOTAL ASSERTIONS: ${total}`)
  console.log(`PASSED: ${passed}`)
  console.log(`FAILED: ${failed}`)
  console.log(`VERDICT: ${failed === 0 ? 'CONFIRMED' : 'FAILED'}`)
  console.log('=================================================================')

  await prisma.$disconnect()
  return { total, passed, failed, verdict: failed === 0 ? 'CONFIRMED' : 'FAILED', assertions }
}

runEmpiricalVerification().catch(err => {
  console.error('Empirical harness crashed:', err)
  process.exit(1)
})
