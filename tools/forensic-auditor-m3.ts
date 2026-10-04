import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { OrderStatus, TripStatus, Role } from '@prisma/client'

interface TestResult {
  suite: string
  name: string
  passed: boolean
  details?: string
}

const results: TestResult[] = []

function logResult(suite: string, name: string, passed: boolean, details?: string) {
  results.push({ suite, name, passed, details })
  console.log(`${passed ? '✅ PASS' : '❌ FAIL'} [${suite}] ${name}`)
  if (details) {
    console.log(`   ${details}`)
  }
}

async function runAudit() {
  console.log('======================================================================')
  console.log('   INDEPENDENT FORENSIC INTEGRITY AUDIT - MILESTONE 3 FIX')
  console.log('   Auditor: auditor_m3_fix_1')
  console.log('   PostgreSQL: localhost:5432 | Next.js API: http://localhost:3001')
  console.log('======================================================================\n')

  const baseUrl = 'http://localhost:3001'

  // Tracking for reliable cleanup
  const createdOrderIds: string[] = []
  const createdTripIds: string[] = []
  const createdSyncEventIds: string[] = []
  const createdStopIds: string[] = []

  try {
    // Clean up any stale test entities from previous partial runs
    const staleOrders = await prisma.order.findMany({
      where: {
        lines: { some: { productId: 'P_FORENSIC_TEST' } }
      }
    })
    for (const ord of staleOrders) {
      await prisma.orderLine.deleteMany({ where: { orderId: ord.id } })
      await prisma.order.delete({ where: { id: ord.id } })
    }

    // Retrieve store manager and driver
    const storeUser = await prisma.user.findFirst({
      where: { role: Role.STORE_MANAGER }
    })
    if (!storeUser || !storeUser.outletId) {
      throw new Error('No Store Manager with outletId found in PostgreSQL')
    }

    const driverUser = await prisma.user.findFirst({
      where: { role: Role.DRIVER }
    })
    if (!driverUser) {
      throw new Error('No Driver found in PostgreSQL')
    }

    const outletA = storeUser.outletId
    // Find another outlet for cross-outlet isolation test
    const outletBRecord = await prisma.outlet.findFirst({
      where: { id: { not: outletA } }
    })
    const outletB = outletBRecord ? outletBRecord.id : 'OUTLET-OTHER'

    // Create JWT session tokens
    const storeToken = await encrypt({
      userId: storeUser.id,
      role: Role.STORE_MANAGER,
      email: storeUser.email,
      outletId: outletA,
      vehicleId: null,
      depotId: null,
      expires: new Date(Date.now() + 60 * 60 * 1000)
    })
    const storeCookie = `session=${storeToken}`

    const driverToken = await encrypt({
      userId: driverUser.id,
      role: Role.DRIVER,
      email: driverUser.email,
      outletId: null,
      vehicleId: 'VEH001',
      depotId: null,
      expires: new Date(Date.now() + 60 * 60 * 1000)
    })
    const driverCookie = `session=${driverToken}`

    // -------------------------------------------------------------------------
    // CHECK 1: Non-Delivered Rejection on confirm-receipt across all statuses
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 1: Non-Delivered Order Rejection on confirm-receipt ---')
    const testOrder = await prisma.order.create({
      data: {
        outletId: outletA,
        status: OrderStatus.LOADING,
        targetDate: new Date(),
        cutoffTime: new Date(),
        totalVolumeM3: 0.1,
        totalWeightKg: 10,
        isChilled: false,
        lines: {
          create: [{ productId: 'P_FORENSIC_TEST', quantity: 1 }]
        }
      }
    })
    createdOrderIds.push(testOrder.id)

    // Test LOADING status rejection
    const resLoading = await fetch(`${baseUrl}/api/store/orders/${testOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    const bodyLoading = await resLoading.json().catch(() => ({}))
    const dbOrderLoading = await prisma.order.findUnique({ where: { id: testOrder.id } })

    logResult(
      'Check 1.1: Rejection on LOADING',
      'HTTP 400 returned when confirming LOADING order',
      resLoading.status === 400 && bodyLoading.error === 'Order must be DELIVERED to confirm receipt',
      `Status: ${resLoading.status}, Error: ${bodyLoading.error}`
    )
    logResult(
      'Check 1.2: DB State on LOADING',
      'Order in PostgreSQL remains in LOADING status (no mutation)',
      dbOrderLoading?.status === OrderStatus.LOADING,
      `DB status: ${dbOrderLoading?.status}`
    )

    // Test IN_TRANSIT status rejection
    await prisma.order.update({ where: { id: testOrder.id }, data: { status: OrderStatus.IN_TRANSIT } })
    const resInTransit = await fetch(`${baseUrl}/api/store/orders/${testOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    const bodyInTransit = await resInTransit.json().catch(() => ({}))
    const dbOrderInTransit = await prisma.order.findUnique({ where: { id: testOrder.id } })

    logResult(
      'Check 1.3: Rejection on IN_TRANSIT',
      'HTTP 400 returned when confirming IN_TRANSIT order',
      resInTransit.status === 400 && bodyInTransit.error === 'Order must be DELIVERED to confirm receipt',
      `Status: ${resInTransit.status}, Error: ${bodyInTransit.error}`
    )
    logResult(
      'Check 1.4: DB State on IN_TRANSIT',
      'Order in PostgreSQL remains in IN_TRANSIT status (no mutation)',
      dbOrderInTransit?.status === OrderStatus.IN_TRANSIT,
      `DB status: ${dbOrderInTransit?.status}`
    )

    // Test PENDING status rejection
    await prisma.order.update({ where: { id: testOrder.id }, data: { status: OrderStatus.PENDING } })
    const resPending = await fetch(`${baseUrl}/api/store/orders/${testOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    const bodyPending = await resPending.json().catch(() => ({}))
    const dbOrderPending = await prisma.order.findUnique({ where: { id: testOrder.id } })

    logResult(
      'Check 1.5: Rejection on PENDING',
      'HTTP 400 returned when confirming PENDING order',
      resPending.status === 400 && bodyPending.error === 'Order must be DELIVERED to confirm receipt',
      `Status: ${resPending.status}, Error: ${bodyPending.error}`
    )
    logResult(
      'Check 1.6: DB State on PENDING',
      'Order in PostgreSQL remains in PENDING status (no mutation)',
      dbOrderPending?.status === OrderStatus.PENDING,
      `DB status: ${dbOrderPending?.status}`
    )

    // Test CONFIRMED status rejection
    await prisma.order.update({ where: { id: testOrder.id }, data: { status: OrderStatus.CONFIRMED } })
    const resConfirmed = await fetch(`${baseUrl}/api/store/orders/${testOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    const bodyConfirmed = await resConfirmed.json().catch(() => ({}))
    const dbOrderConfirmed = await prisma.order.findUnique({ where: { id: testOrder.id } })

    logResult(
      'Check 1.7: Rejection on CONFIRMED',
      'HTTP 400 returned when confirming CONFIRMED order',
      resConfirmed.status === 400 && bodyConfirmed.error === 'Order must be DELIVERED to confirm receipt',
      `Status: ${resConfirmed.status}, Error: ${bodyConfirmed.error}`
    )
    logResult(
      'Check 1.8: DB State on CONFIRMED',
      'Order in PostgreSQL remains in CONFIRMED status (no mutation)',
      dbOrderConfirmed?.status === OrderStatus.CONFIRMED,
      `DB status: ${dbOrderConfirmed?.status}`
    )

    // -------------------------------------------------------------------------
    // CHECK 2: Non-existent order and Cross-outlet isolation
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 2: Non-Existent and Cross-Outlet Isolation ---')
    const resNotFound = await fetch(`${baseUrl}/api/store/orders/non-existent-uuid-9999/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    logResult(
      'Check 2.1: Non-Existent Order',
      'HTTP 404 returned for unknown order ID',
      resNotFound.status === 404,
      `Status: ${resNotFound.status}`
    )

    // Cross outlet order
    const crossOrder = await prisma.order.create({
      data: {
        outletId: outletB,
        status: OrderStatus.DELIVERED,
        targetDate: new Date(),
        cutoffTime: new Date(),
        totalVolumeM3: 0.1,
        totalWeightKg: 10,
        isChilled: false,
        lines: { create: [{ productId: 'P_FORENSIC_TEST', quantity: 1 }] }
      }
    })
    createdOrderIds.push(crossOrder.id)

    const resCross = await fetch(`${baseUrl}/api/store/orders/${crossOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    logResult(
      'Check 2.2: Cross-Outlet Isolation',
      'HTTP 404 returned when store manager attempts to confirm other outlet order',
      resCross.status === 404,
      `Status: ${resCross.status}`
    )

    // -------------------------------------------------------------------------
    // CHECK 3: Legitimate DELIVERED confirmation & AuditLog persistence
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 3: Legitimate DELIVERED Confirmation ---')
    await prisma.order.update({ where: { id: testOrder.id }, data: { status: OrderStatus.DELIVERED } })
    const resDelivered = await fetch(`${baseUrl}/api/store/orders/${testOrder.id}/confirm-receipt`, {
      method: 'POST',
      headers: { Cookie: storeCookie }
    })
    const bodyDelivered = await resDelivered.json().catch(() => ({}))

    logResult(
      'Check 3.1: DELIVERED Confirmation Response',
      'HTTP 200 returned with success: true and status: DELIVERED',
      resDelivered.status === 200 && bodyDelivered.success === true && bodyDelivered.status === 'DELIVERED',
      `Status: ${resDelivered.status}, Body: ${JSON.stringify(bodyDelivered)}`
    )

    const auditLogReceipt = await prisma.auditLog.findFirst({
      where: {
        action: 'STORE_RECEIPT_CONFIRMED',
        details: { path: ['orderId'], equals: testOrder.id }
      }
    })

    logResult(
      'Check 3.2: STORE_RECEIPT_CONFIRMED in PostgreSQL',
      'AuditLog record is persisted with action STORE_RECEIPT_CONFIRMED',
      auditLogReceipt !== null && (auditLogReceipt.details as any)?.orderId === testOrder.id,
      `AuditLog found: ${!!auditLogReceipt}`
    )

    // -------------------------------------------------------------------------
    // CHECK 4: Driver Route Start Transactional Integrity ($transaction)
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 4: Driver Route Start Transactional Execution ---')
    // Reset test order to LOADING and create second test order for multi-stop route
    await prisma.order.update({ where: { id: testOrder.id }, data: { status: OrderStatus.LOADING } })

    const testOrder2 = await prisma.order.create({
      data: {
        outletId: outletA,
        status: OrderStatus.LOADING,
        targetDate: new Date(),
        cutoffTime: new Date(),
        totalVolumeM3: 0.1,
        totalWeightKg: 10,
        isChilled: false,
        lines: {
          create: [{ productId: 'P_FORENSIC_TEST', quantity: 2 }]
        }
      }
    })
    createdOrderIds.push(testOrder2.id)

    const driverTrip = await prisma.trip.create({
      data: {
        vehicleId: 'VEH001',
        tripNumber: 1,
        brand: 'FRESH',
        districtId: 'COLOMBO',
        status: TripStatus.LOADING,
        stops: {
          create: [
            {
              sequence: 1,
              orderId: testOrder.id,
              plannedEta: new Date()
            },
            {
              sequence: 2,
              orderId: testOrder2.id,
              plannedEta: new Date()
            }
          ]
        }
      },
      include: { stops: true }
    })
    createdTripIds.push(driverTrip.id)
    const tripStop1 = driverTrip.stops[0]
    const tripStop2 = driverTrip.stops[1]
    createdStopIds.push(tripStop1.id, tripStop2.id)

    const resTripStart = await fetch(`${baseUrl}/api/driver/trip/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
      body: JSON.stringify({ tripId: driverTrip.id })
    })
    const bodyTripStart = await resTripStart.json().catch(() => ({}))

    const dbTripAfterStart = await prisma.trip.findUnique({ where: { id: driverTrip.id } })
    const dbOrder1AfterStart = await prisma.order.findUnique({ where: { id: testOrder.id } })
    const dbOrder2AfterStart = await prisma.order.findUnique({ where: { id: testOrder2.id } })
    const auditLogStart = await prisma.auditLog.findFirst({
      where: {
        action: 'DRIVER_START_ROUTE',
        details: { path: ['tripId'], equals: driverTrip.id }
      }
    })

    logResult(
      'Check 4.1: Trip Start API Response',
      'POST /api/driver/trip/start returns HTTP 200 with status: IN_TRANSIT',
      resTripStart.status === 200 && bodyTripStart.success === true && bodyTripStart.status === 'IN_TRANSIT',
      `Status: ${resTripStart.status}, Body: ${JSON.stringify(bodyTripStart)}`
    )
    logResult(
      'Check 4.2: Trip DB Status',
      'Trip in PostgreSQL updated to IN_TRANSIT',
      dbTripAfterStart?.status === TripStatus.IN_TRANSIT,
      `Trip status: ${dbTripAfterStart?.status}`
    )
    logResult(
      'Check 4.3: Orders DB Status',
      'All associated Orders in PostgreSQL updated to IN_TRANSIT',
      dbOrder1AfterStart?.status === OrderStatus.IN_TRANSIT && dbOrder2AfterStart?.status === OrderStatus.IN_TRANSIT,
      `Order 1: ${dbOrder1AfterStart?.status}, Order 2: ${dbOrder2AfterStart?.status}`
    )
    logResult(
      'Check 4.4: DRIVER_START_ROUTE AuditLog in DB',
      'AuditLog record is persisted with action DRIVER_START_ROUTE in PostgreSQL',
      auditLogStart !== null,
      `AuditLog found: ${!!auditLogStart}`
    )

    // -------------------------------------------------------------------------
    // CHECK 5: Driver Sync Outcome Discrimination (FAILED vs SUCCESS)
    // -------------------------------------------------------------------------
    console.log('\n--- CHECK 5: Driver Sync Outcome Discrimination ---')

    // Test 5A: Outcome FAILED on stop 1 must NOT mark order 1 DELIVERED
    const failedEventId = `forensic-fail-${Date.now()}`
    createdSyncEventIds.push(failedEventId)

    const resSyncFail = await fetch(`${baseUrl}/api/driver/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
      body: JSON.stringify({
        events: [
          {
            id: failedEventId,
            type: 'STOP_COMPLETION',
            tripStopId: tripStop1.id,
            outcome: 'FAILED',
            createdAt: new Date().toISOString()
          }
        ]
      })
    })
    const bodySyncFail = await resSyncFail.json().catch(() => ({}))

    const dbStop1AfterFail = await prisma.tripStop.findUnique({ where: { id: tripStop1.id } })
    const dbOrder1AfterFail = await prisma.order.findUnique({ where: { id: testOrder.id } })
    const dbTripAfterFail = await prisma.trip.findUnique({ where: { id: driverTrip.id } })

    logResult(
      'Check 5.1: Sync FAILED API Response',
      'POST /api/driver/sync processes FAILED event successfully',
      resSyncFail.status === 200 && bodySyncFail.processedCount === 1,
      `Status: ${resSyncFail.status}, processedCount: ${bodySyncFail.processedCount}`
    )
    logResult(
      'Check 5.2: Stop 1 DB Outcome FAILED',
      'TripStop 1 in PostgreSQL reflects outcome: FAILED',
      dbStop1AfterFail?.outcome === 'FAILED',
      `TripStop 1 outcome: ${dbStop1AfterFail?.outcome}`
    )
    logResult(
      'Check 5.3: Order 1 Integrity on FAILED Outcome',
      'Order 1 in PostgreSQL is NOT DELIVERED when stop outcome is FAILED (remains IN_TRANSIT)',
      dbOrder1AfterFail?.status === OrderStatus.IN_TRANSIT,
      `Order 1 status: ${dbOrder1AfterFail?.status}`
    )
    logResult(
      'Check 5.4: Trip remains IN_TRANSIT with pending stops',
      'Trip remains IN_TRANSIT while pending stops remain',
      dbTripAfterFail?.status === TripStatus.IN_TRANSIT,
      `Trip status: ${dbTripAfterFail?.status}`
    )

    // Test 5B: Outcome SUCCESS on stop 2 must mark order 2 DELIVERED and Trip COMPLETED
    const successEventId = `forensic-success-${Date.now()}`
    createdSyncEventIds.push(successEventId)

    const resSyncSuccess = await fetch(`${baseUrl}/api/driver/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: driverCookie },
      body: JSON.stringify({
        events: [
          {
            id: successEventId,
            type: 'STOP_COMPLETION',
            tripStopId: tripStop2.id,
            outcome: 'SUCCESS',
            photoUrl: 'https://example.com/pod.jpg',
            signatureUrl: 'https://example.com/sig.png',
            createdAt: new Date().toISOString()
          }
        ]
      })
    })
    const bodySyncSuccess = await resSyncSuccess.json().catch(() => ({}))

    const dbStop2AfterSuccess = await prisma.tripStop.findUnique({ where: { id: tripStop2.id } })
    const dbOrder2AfterSuccess = await prisma.order.findUnique({ where: { id: testOrder2.id } })
    const dbTripAfterSuccess = await prisma.trip.findUnique({ where: { id: driverTrip.id } })
    const dbPod = await prisma.proofOfDelivery.findFirst({ where: { clientEventId: successEventId } })
    const dbSyncEvent = await prisma.syncEvent.findUnique({ where: { clientEventId: successEventId } })

    logResult(
      'Check 5.5: Sync SUCCESS API Response',
      'POST /api/driver/sync processes SUCCESS event successfully',
      resSyncSuccess.status === 200 && bodySyncSuccess.processedCount === 1,
      `Status: ${resSyncSuccess.status}, processedCount: ${bodySyncSuccess.processedCount}`
    )
    logResult(
      'Check 5.6: Stop 2 DB Outcome SUCCESS',
      'TripStop 2 in PostgreSQL reflects outcome: SUCCESS',
      dbStop2AfterSuccess?.outcome === 'SUCCESS',
      `TripStop 2 outcome: ${dbStop2AfterSuccess?.outcome}`
    )
    logResult(
      'Check 5.7: Order 2 DB Status DELIVERED',
      'Order 2 in PostgreSQL is transitioned to DELIVERED when stop outcome is SUCCESS',
      dbOrder2AfterSuccess?.status === OrderStatus.DELIVERED,
      `Order 2 status: ${dbOrder2AfterSuccess?.status}`
    )
    logResult(
      'Check 5.8: Trip DB Status COMPLETED',
      'Trip in PostgreSQL is transitioned to COMPLETED when all stops are completed',
      dbTripAfterSuccess?.status === TripStatus.COMPLETED,
      `Trip status: ${dbTripAfterSuccess?.status}`
    )
    logResult(
      'Check 5.9: ProofOfDelivery in PostgreSQL',
      'ProofOfDelivery record created in PostgreSQL with photoUrl and signatureUrl',
      dbPod !== null && dbPod.photoUrl === 'https://example.com/pod.jpg' && dbPod.signatureUrl === 'https://example.com/sig.png',
      `POD found: ${!!dbPod}`
    )
    logResult(
      'Check 5.10: SyncEvent Idempotency Record',
      'SyncEvent record created in PostgreSQL to guarantee idempotency',
      dbSyncEvent !== null,
      `SyncEvent found: ${!!dbSyncEvent}`
    )

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANING UP FORENSIC TEST ENTITIES ---')
    if (createdStopIds.length > 0) {
      await prisma.proofOfDelivery.deleteMany({ where: { tripStopId: { in: createdStopIds } } })
    }
    if (createdSyncEventIds.length > 0) {
      await prisma.syncEvent.deleteMany({ where: { clientEventId: { in: createdSyncEventIds } } })
    }
    if (createdTripIds.length > 0) {
      await prisma.tripStop.deleteMany({ where: { tripId: { in: createdTripIds } } })
      await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } })
    }
    if (createdOrderIds.length > 0) {
      await prisma.orderLine.deleteMany({ where: { orderId: { in: createdOrderIds } } })
      await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } })
    }
    if (createdOrderIds.length > 0 || createdTripIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          action: { in: ['STORE_RECEIPT_CONFIRMED', 'DRIVER_START_ROUTE'] },
          OR: [
            ...createdOrderIds.map(oid => ({ details: { path: ['orderId'], equals: oid } })),
            ...createdTripIds.map(tid => ({ details: { path: ['tripId'], equals: tid } }))
          ]
        }
      })
    }
    console.log('Cleanup completed.')
  }

  // -------------------------------------------------------------------------
  // AUDIT SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n======================================================================')
  const total = results.length
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  console.log(`TOTAL FORENSIC CHECKS: ${total} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('======================================================================')

  if (failed > 0) {
    console.log('\n❌ INTEGRITY VIOLATION DETECTED!')
    process.exit(1)
  } else {
    console.log('\n🏆 AUDIT VERDICT: CLEAN - ALL EMPIRICAL CHECKS PASSED!')
    process.exit(0)
  }
}

runAudit()
  .catch(async err => {
    console.error('Fatal audit failure:', err)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
