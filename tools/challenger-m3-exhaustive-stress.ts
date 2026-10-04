import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { OrderStatus, Role } from '@prisma/client'

interface TestResult {
  name: string
  category: string
  expected: any
  actual: any
  passed: boolean
  error?: string
}

const results: TestResult[] = []

function check(
  passed: boolean,
  category: string,
  name: string,
  expected: any,
  actual: any,
  error?: string
) {
  results.push({ name, category, expected, actual, passed, error })
  const icon = passed ? '✅ PASS' : '❌ FAIL'
  console.log(`${icon} [${category}] ${name}`)
  if (!passed) {
    console.error(`   Expected: ${JSON.stringify(expected)}`)
    console.error(`   Actual:   ${JSON.stringify(actual)}`)
    if (error) console.error(`   Details:  ${error}`)
  }
}

async function runExhaustiveChallenger() {
  console.log('======================================================================')
  console.log('   EXHAUSTIVE EMPIRICAL CHALLENGER: STORE RECEIPT CONFIRMATION')
  console.log('   Target: http://localhost:3001/api/store/orders/[id]/confirm-receipt')
  console.log('======================================================================\n')

  const baseUrl = 'http://localhost:3001'

  // Get Store Manager
  const storeUser = await prisma.user.findFirst({
    where: { role: Role.STORE_MANAGER }
  })
  if (!storeUser || !storeUser.outletId) {
    throw new Error('No Store Manager user found')
  }

  const outletId = storeUser.outletId
  console.log(`Testing with Store Manager: ${storeUser.email}, Outlet: ${outletId}`)

  const sessionToken = await encrypt({
    userId: storeUser.id,
    role: Role.STORE_MANAGER,
    email: storeUser.email,
    outletId: storeUser.outletId,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const storeHeaders = {
    Cookie: `session=${sessionToken}`,
    'Content-Type': 'application/json'
  }

  // 1. Test EVERY NON-DELIVERED OrderStatus enum
  const nonDeliveredStatuses: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
    OrderStatus.PLANNED,
    OrderStatus.LOADING,
    OrderStatus.IN_TRANSIT,
    OrderStatus.LOADED,
    OrderStatus.DEFERRED,
    OrderStatus.CANCELLED
  ]

  console.log('\n--- PHASE 1: Exhaustive Non-Delivered Status Rejection ---')
  for (const testStatus of nonDeliveredStatuses) {
    // Create order with this status
    const testOrder = await prisma.order.create({
      data: {
        outletId,
        status: testStatus,
        targetDate: new Date(),
        cutoffTime: new Date(),
        totalVolumeM3: 0.1,
        totalWeightKg: 10,
        isChilled: false,
        lines: {
          create: [{ productId: 'P01', quantity: 1 }]
        }
      }
    })

    const initialAuditCount = await prisma.auditLog.count({
      where: {
        action: 'STORE_RECEIPT_CONFIRMED',
        details: { path: ['orderId'], equals: testOrder.id }
      }
    })

    // Invoke confirm-receipt
    const res = await fetch(`${baseUrl}/api/store/orders/${testOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: storeHeaders
    })
    const body = await res.json().catch(() => ({}))

    check(
      res.status === 400,
      'Status Rejection',
      `Order in status ${testStatus} rejected with HTTP 400`,
      400,
      res.status,
      JSON.stringify(body)
    )

    check(
      body.error === 'Order must be DELIVERED to confirm receipt',
      'Error Message',
      `Order in status ${testStatus} returns expected error message`,
      'Order must be DELIVERED to confirm receipt',
      body.error
    )

    // Verify DB integrity: status must not change
    const dbOrder = await prisma.order.findUnique({ where: { id: testOrder.id } })
    check(
      dbOrder?.status === testStatus,
      'DB Integrity',
      `Order status in DB for ${testStatus} remains unmutated`,
      testStatus,
      dbOrder?.status
    )

    // Verify no audit log entry created
    const finalAuditCount = await prisma.auditLog.count({
      where: {
        action: 'STORE_RECEIPT_CONFIRMED',
        details: { path: ['orderId'], equals: testOrder.id }
      }
    })
    check(
      finalAuditCount === initialAuditCount,
      'Audit Integrity',
      `No audit log created for rejected status ${testStatus}`,
      initialAuditCount,
      finalAuditCount
    )

    // Cleanup
    await prisma.orderLine.deleteMany({ where: { orderId: testOrder.id } })
    await prisma.order.delete({ where: { id: testOrder.id } })
  }

  // 2. Test DELIVERED status confirmation and idempotency
  console.log('\n--- PHASE 2: DELIVERED Order Confirmation & Idempotency ---')
  const deliveredOrder = await prisma.order.create({
    data: {
      outletId,
      status: OrderStatus.DELIVERED,
      targetDate: new Date(),
      cutoffTime: new Date(),
      totalVolumeM3: 0.2,
      totalWeightKg: 15,
      isChilled: false,
      lines: {
        create: [{ productId: 'P02', quantity: 2 }]
      }
    }
  })

  // First confirmation
  const firstRes = await fetch(`${baseUrl}/api/store/orders/${deliveredOrder.id}/confirm-receipt`, {
    method: 'POST',
    headers: storeHeaders
  })
  const firstJson = await firstRes.json().catch(() => ({}))

  check(
    firstRes.status === 200,
    'Delivered Confirmation',
    'Confirming DELIVERED order returns HTTP 200',
    200,
    firstRes.status
  )

  check(
    firstJson.success === true && firstJson.status === 'DELIVERED' && firstJson.orderId === deliveredOrder.id,
    'Delivered Confirmation',
    'Response payload matches contract { success: true, orderId, status: "DELIVERED" }',
    { success: true, orderId: deliveredOrder.id, status: 'DELIVERED' },
    firstJson
  )

  const auditLog1 = await prisma.auditLog.findFirst({
    where: {
      action: 'STORE_RECEIPT_CONFIRMED',
      details: { path: ['orderId'], equals: deliveredOrder.id }
    }
  })
  check(
    !!auditLog1 && (auditLog1.details as any)?.outletId === outletId,
    'Audit Verification',
    'AuditLog entry STORE_RECEIPT_CONFIRMED accurately recorded in PostgreSQL',
    true,
    !!auditLog1
  )

  // Second confirmation (idempotency check)
  const secondRes = await fetch(`${baseUrl}/api/store/orders/${deliveredOrder.id}/confirm-receipt`, {
    method: 'POST',
    headers: storeHeaders
  })
  const secondJson = await secondRes.json().catch(() => ({}))

  check(
    secondRes.status === 200 && secondJson.success === true,
    'Idempotency',
    'Subsequent confirmation of already DELIVERED order succeeds idempotently',
    200,
    secondRes.status
  )

  // Clean up delivered test order
  await prisma.orderLine.deleteMany({ where: { orderId: deliveredOrder.id } })
  await prisma.order.delete({ where: { id: deliveredOrder.id } })
  await prisma.auditLog.deleteMany({
    where: {
      action: 'STORE_RECEIPT_CONFIRMED',
      details: { path: ['orderId'], equals: deliveredOrder.id }
    }
  })

  // 3. Cross-Outlet DELIVERED Order Rejection
  console.log('\n--- PHASE 3: Cross-Outlet Isolation ---')
  const anotherOutlet = await prisma.outlet.findFirst({
    where: { id: { not: outletId } }
  })
  if (anotherOutlet) {
    const crossOrder = await prisma.order.create({
      data: {
        outletId: anotherOutlet.id,
        status: OrderStatus.DELIVERED,
        targetDate: new Date(),
        cutoffTime: new Date(),
        totalVolumeM3: 0.1,
        totalWeightKg: 5,
        isChilled: false,
        lines: { create: [{ productId: 'P01', quantity: 1 }] }
      }
    })

    const crossRes = await fetch(`${baseUrl}/api/store/orders/${crossOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: storeHeaders
    })
    check(
      crossRes.status === 404,
      'Outlet Isolation',
      'Store manager cannot confirm DELIVERED order belonging to another outlet (HTTP 404)',
      404,
      crossRes.status
    )

    // Clean up
    await prisma.orderLine.deleteMany({ where: { orderId: crossOrder.id } })
    await prisma.order.delete({ where: { id: crossOrder.id } })
  }

  // Summary
  console.log('\n======================================================================')
  const total = results.length
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`TOTAL EXHAUSTIVE ASSERTIONS: ${total} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('======================================================================')

  if (failed > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

runExhaustiveChallenger()
  .catch(err => {
    console.error('Fatal error during test run:', err)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
