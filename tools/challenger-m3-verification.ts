import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { OrderStatus, Role } from '@prisma/client'

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
  console.log(`   Expected: ${JSON.stringify(expected)}`)
  console.log(`   Actual:   ${JSON.stringify(actual)}`)
  if (!passed && details) {
    console.error(`   Failure Details: ${details}`)
  }
}

async function runEmpiricalChallenge() {
  console.log('=================================================================')
  console.log('   EMPIRICAL CHALLENGER M3_2 VERIFICATION HARNESS')
  console.log('   Testing against Next.js (http://localhost:3001) & PostgreSQL (5432)')
  console.log('=================================================================\n')

  const baseUrl = 'http://localhost:3001'

  // Step 0: Identify Store Manager and Driver users
  const storeUser = await prisma.user.findFirst({
    where: { role: Role.STORE_MANAGER }
  })
  if (!storeUser || !storeUser.outletId) {
    throw new Error('No Store Manager user with outletId found in PostgreSQL')
  }

  const outletId = storeUser.outletId
  console.log(`Store Manager User: ${storeUser.email} (outletId: ${outletId})`)

  const driverUser = await prisma.user.findFirst({
    where: { role: Role.DRIVER }
  })

  // Create JWT session cookie for Store Manager
  const storeSessionToken = await encrypt({
    userId: storeUser.id,
    role: storeUser.role,
    email: storeUser.email,
    outletId: storeUser.outletId,
    vehicleId: null,
    depotId: null,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const storeCookie = `session=${storeSessionToken}`

  // Create JWT session cookie for Driver
  const driverSessionToken = await encrypt({
    userId: driverUser?.id || 'driver-id',
    role: Role.DRIVER,
    email: driverUser?.email || 'driver@waypoint.com',
    outletId: null,
    vehicleId: 'VEH001',
    depotId: null,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const driverCookie = `session=${driverSessionToken}`

  // -------------------------------------------------------------------------
  // SUITE 1: Auth & Role-Based Access Control on Confirm-Receipt
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 1: Auth & Role-Based Access Control ---')

  const unauthRes = await fetch(`${baseUrl}/api/store/orders/some-id/confirm-receipt`, {
    method: 'POST',
    redirect: 'manual'
  })
  assert(
    unauthRes.status === 401 || unauthRes.status === 307,
    'Auth / RBAC',
    'Unauthenticated POST /confirm-receipt is rejected (401 or 307 redirect)',
    '401 or 307',
    unauthRes.status
  )

  const driverRes = await fetch(`${baseUrl}/api/store/orders/some-id/confirm-receipt`, {
    method: 'POST',
    headers: { Cookie: driverCookie }
  })
  assert(
    driverRes.status === 401,
    'Auth / RBAC',
    'Driver role rejected from POST /confirm-receipt with 401 Unauthorized',
    401,
    driverRes.status
  )

  // -------------------------------------------------------------------------
  // SUITE 2: Rejection of Non-Existent Order & Cross-Outlet Scoping
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Non-Existent Order Rejection & Outlet Scoping ---')

  const nonExistentId = 'ORD-DOES-NOT-EXIST-9999'
  const nonExistentRes = await fetch(`${baseUrl}/api/store/orders/${nonExistentId}/confirm-receipt`, {
    method: 'POST',
    headers: { Cookie: storeCookie }
  })
  const nonExistentJson = await nonExistentRes.json().catch(() => ({}))
  assert(
    nonExistentRes.status === 404,
    'Rejection / Non-Existent',
    'Confirming non-existent order returns HTTP 404 Not Found',
    404,
    nonExistentRes.status,
    JSON.stringify(nonExistentJson)
  )

  // Cross-outlet order rejection
  const otherOutletOrder = await prisma.order.findFirst({
    where: { outletId: { not: outletId } }
  })
  if (otherOutletOrder) {
    const crossOutletRes = await fetch(`${baseUrl}/api/store/orders/${otherOutletOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    assert(
      crossOutletRes.status === 404,
      'Rejection / Cross-Outlet',
      'Confirming order belonging to another outlet returns HTTP 404',
      404,
      crossOutletRes.status
    )
  }

  // -------------------------------------------------------------------------
  // SUITE 3: Rejection of Non-Delivered Order
  // Requirement: "Verify that confirming a non-delivered or non-existent order is rejected."
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Non-Delivered Order Rejection (Stress Challenge) ---')

  // Create an isolated non-delivered test order (status: LOADING)
  const nonDeliveredOrder = await prisma.order.create({
    data: {
      outletId: outletId,
      status: OrderStatus.LOADING,
      targetDate: new Date(),
      cutoffTime: new Date(),
      totalVolumeM3: 0.1,
      totalWeightKg: 10,
      isChilled: false,
      lines: {
        create: [
          { productId: 'P01', quantity: 1 }
        ]
      }
    }
  })

  console.log(`Created isolated non-delivered order: ${nonDeliveredOrder.id} with status: ${nonDeliveredOrder.status}`)

  const nonDeliveredRes = await fetch(`${baseUrl}/api/store/orders/${nonDeliveredOrder.id}/confirm-receipt`, {
    method: 'POST',
    headers: { Cookie: storeCookie }
  })
  const nonDeliveredStatus = nonDeliveredRes.status
  const nonDeliveredJson = await nonDeliveredRes.json().catch(() => ({}))

  // In standard workflow, confirming non-delivered order must be rejected (HTTP 400 Bad Request)
  const isRejected = nonDeliveredStatus === 400 || nonDeliveredStatus === 422 || nonDeliveredStatus === 403
  assert(
    isRejected,
    'Rejection / Non-Delivered',
    'Confirming non-delivered order (status: LOADING) MUST be rejected with HTTP 400/422/403',
    'HTTP 400/422/403 (Error: Order must be DELIVERED)',
    `HTTP ${nonDeliveredStatus} (Response: ${JSON.stringify(nonDeliveredJson)})`,
    `BUG DETECTED: Route src/app/api/store/orders/[id]/confirm-receipt/route.ts lines 48-54 unconditionally mutates non-delivered orders to DELIVERED and returns HTTP 200, bypassing driver delivery!`
  )

  // Verify whether the database record was illegally mutated to DELIVERED
  const dbOrderCheck = await prisma.order.findUnique({
    where: { id: nonDeliveredOrder.id }
  })
  const orderMutatedIllegally = dbOrderCheck?.status === OrderStatus.DELIVERED
  assert(
    !orderMutatedIllegally,
    'DB Integrity / Non-Delivered',
    'Order in DB should NOT be mutated to DELIVERED upon invalid confirmation',
    'Order status remains LOADING',
    `Order status in DB became: ${dbOrderCheck?.status}`,
    `BUG DETECTED: Database record was overwritten from LOADING to DELIVERED by confirm-receipt endpoint.`
  )

  // Clean up isolated test order
  await prisma.orderLine.deleteMany({ where: { orderId: nonDeliveredOrder.id } })
  await prisma.order.delete({ where: { id: nonDeliveredOrder.id } })

  // -------------------------------------------------------------------------
  // SUITE 4: Confirm Receipt on DELIVERED Orders & AuditLog Verification
  // Requirement: "Verify /api/store/orders/[id]/confirm-receipt confirms receipt on delivered orders and logs STORE_RECEIPT_CONFIRMED in AuditLog."
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Delivered Order Receipt Confirmation & AuditLog ---')

  // Create an isolated DELIVERED test order
  const deliveredOrder = await prisma.order.create({
    data: {
      outletId: outletId,
      status: OrderStatus.DELIVERED,
      targetDate: new Date(),
      cutoffTime: new Date(),
      totalVolumeM3: 0.25,
      totalWeightKg: 25,
      isChilled: false,
      lines: {
        create: [
          { productId: 'P04', quantity: 2 },
          { productId: 'P05', quantity: 3 }
        ]
      }
    },
    include: { lines: true }
  })

  console.log(`Created isolated delivered order: ${deliveredOrder.id} with status: ${deliveredOrder.status}`)

  const confirmRes = await fetch(`${baseUrl}/api/store/orders/${deliveredOrder.id}/confirm-receipt`, {
    method: 'POST',
    headers: { Cookie: storeCookie }
  })
  const confirmJson = await confirmRes.json().catch(() => ({}))

  assert(
    confirmRes.status === 200,
    'Confirm Receipt / Delivered',
    'Confirm receipt on DELIVERED order returns HTTP 200',
    200,
    confirmRes.status
  )

  assert(
    confirmJson.success === true && confirmJson.orderId === deliveredOrder.id && confirmJson.status === 'DELIVERED',
    'Confirm Receipt / Delivered',
    'Response payload matches contract { success: true, orderId, status: "DELIVERED" }',
    { success: true, orderId: deliveredOrder.id, status: 'DELIVERED' },
    confirmJson
  )

  // Verify AuditLog record in live PostgreSQL
  const auditLogsAfter = await prisma.auditLog.findMany({
    where: {
      action: 'STORE_RECEIPT_CONFIRMED'
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  })

  const matchingLog = auditLogsAfter.find((log: any) => {
    const details = log.details as any
    return details && details.orderId === deliveredOrder.id
  })

  assert(
    !!matchingLog,
    'AuditLog Verification',
    'AuditLog entry with action STORE_RECEIPT_CONFIRMED exists in PostgreSQL',
    true,
    !!matchingLog,
    matchingLog ? JSON.stringify(matchingLog) : 'No audit log found for deliveredOrder.id'
  )

  if (matchingLog) {
    const details = matchingLog.details as any
    assert(
      details.outletId === outletId && !!details.verifiedAt,
      'AuditLog Details',
      'AuditLog details contain correct outletId and verifiedAt timestamp',
      true,
      details
    )
  }

  // -------------------------------------------------------------------------
  // SUITE 5: GET /api/store/orders Returns Orders with Lines and Current Statuses
  // Requirement: "Verify /api/store/orders returns orders with lines and current statuses."
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 5: GET /api/store/orders Orders & Lines ---')

  const getOrdersRes = await fetch(`${baseUrl}/api/store/orders`, {
    method: 'GET',
    headers: { Cookie: storeCookie }
  })

  assert(
    getOrdersRes.status === 200,
    'Store Orders List',
    'GET /api/store/orders returns HTTP 200',
    200,
    getOrdersRes.status
  )

  const getOrdersJson = await getOrdersRes.json().catch(() => ({}))
  assert(
    Array.isArray(getOrdersJson.orders) && getOrdersJson.orders.length > 0,
    'Store Orders List',
    'Response contains non-empty orders array',
    '> 0 orders',
    getOrdersJson.orders?.length
  )

  if (Array.isArray(getOrdersJson.orders) && getOrdersJson.orders.length > 0) {
    const fetchedDelivered = getOrdersJson.orders.find((o: any) => o.id === deliveredOrder.id)
    assert(
      !!fetchedDelivered,
      'Store Orders List',
      'Created test delivered order is returned in orders list',
      true,
      !!fetchedDelivered
    )

    if (fetchedDelivered) {
      assert(
        Array.isArray(fetchedDelivered.lines) && fetchedDelivered.lines.length === 2,
        'Store Orders List',
        'Order includes lines with items and quantities',
        2,
        fetchedDelivered.lines?.length
      )
      assert(
        fetchedDelivered.status === 'DELIVERED',
        'Store Orders List',
        'Order status reflects current status DELIVERED',
        'DELIVERED',
        fetchedDelivered.status
      )
      assert(
        !!fetchedDelivered.outlet && fetchedDelivered.outlet.id === outletId,
        'Store Orders List',
        'Order includes outlet information',
        outletId,
        fetchedDelivered.outlet?.id
      )
    }

    // Verify all returned orders belong to outlet
    const allBelongToOutlet = getOrdersJson.orders.every((o: any) => o.outletId === outletId)
    assert(
      allBelongToOutlet,
      'Store Orders List',
      'All returned orders strictly belong to store manager outlet',
      true,
      allBelongToOutlet
    )
  }

  // -------------------------------------------------------------------------
  // SUITE 6: GET /api/store/orders/[id]/confirm-receipt Single Order
  // -------------------------------------------------------------------------
  console.log('\n--- SUITE 6: GET /api/store/orders/[id]/confirm-receipt ---')

  const getSingleRes = await fetch(`${baseUrl}/api/store/orders/${deliveredOrder.id}/confirm-receipt`, {
    method: 'GET',
    headers: { Cookie: storeCookie }
  })
  assert(
    getSingleRes.status === 200,
    'Single Order Receipt Fetch',
    'GET /api/store/orders/[id]/confirm-receipt returns HTTP 200',
    200,
    getSingleRes.status
  )

  const getSingleJson = await getSingleRes.json().catch(() => ({}))
  assert(
    getSingleJson.success === true && getSingleJson.order?.id === deliveredOrder.id,
    'Single Order Receipt Fetch',
    'GET /api/store/orders/[id]/confirm-receipt returns order details',
    deliveredOrder.id,
    getSingleJson.order?.id
  )

  // Clean up delivered test order and audit log
  await prisma.orderLine.deleteMany({ where: { orderId: deliveredOrder.id } })
  await prisma.order.delete({ where: { id: deliveredOrder.id } })
  await prisma.auditLog.deleteMany({
    where: {
      action: 'STORE_RECEIPT_CONFIRMED',
      details: { path: ['orderId'], equals: deliveredOrder.id }
    }
  })

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n=================================================================')
  const total = assertions.length
  const passed = assertions.filter(a => a.passed).length
  const failed = assertions.filter(a => !a.passed).length
  console.log(`TOTAL ASSERTIONS: ${total} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('=================================================================')

  return { total, passed, failed, assertions }
}

runEmpiricalChallenge()
  .then(res => {
    if (res.failed > 0) {
      console.log(`\n❌ Empirical Challenge found ${res.failed} failure(s)!`)
      process.exit(1)
    } else {
      console.log('\n🎉 All empirical challenge assertions passed!')
      process.exit(0)
    }
  })
  .catch(err => {
    console.error('Fatal execution error:', err)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
