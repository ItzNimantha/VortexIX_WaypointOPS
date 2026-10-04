import prisma from '../src/lib/prisma'
import { encrypt } from '../src/lib/session'
import { GET as getDriverTrip } from '../src/app/api/driver/trip/route'
import { POST as startDriverTrip } from '../src/app/api/driver/trip/start/route'
import { POST as syncDriver } from '../src/app/api/driver/sync/route'
import { Role, TripStatus, OrderStatus, StopOutcome } from '@prisma/client'

interface AdversarialResult {
  name: string
  category: string
  expected: string
  actual: string
  passed: boolean
  notes?: string
}

const testResults: AdversarialResult[] = []

function logCheck(
  passed: boolean,
  category: string,
  name: string,
  expected: string,
  actual: string,
  notes?: string
) {
  testResults.push({ name, category, expected, actual, passed, notes })
  const icon = passed ? '🛡️ PASS' : '⚠️ FAIL'
  console.log(`${icon} [${category}] ${name}`)
  if (!passed) {
    console.error(`   Expected: ${expected}`)
    console.error(`   Actual:   ${actual}`)
    if (notes) console.error(`   Notes:    ${notes}`)
  }
}

async function runAdversarialSuite() {
  console.log('====================================================================')
  console.log('   ADVERSARIAL STRESS-TESTING & EDGE-CASE HARNESS (CHALLENGER M3_1)')
  console.log('====================================================================\n')

  const driverUser = await prisma.user.findFirst({ where: { role: Role.DRIVER } })
  if (!driverUser) throw new Error('No driver user found')

  // -------------------------------------------------------------------------
  // TEST 1: Driver Session with Custom Vehicle ID (e.g. VEH004)
  // -------------------------------------------------------------------------
  console.log('--- TEST 1: Driver Session with Custom vehicleId ---')
  const veh004Token = await encrypt({
    userId: driverUser.id,
    role: Role.DRIVER,
    email: driverUser.email,
    vehicleId: 'VEH004',
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const veh004Cookie = `session=${veh004Token}`

  const veh004Req = new Request('http://localhost:3000/api/driver/trip', {
    headers: { cookie: veh004Cookie }
  })
  const veh004Res = await getDriverTrip(veh004Req)
  const veh004Data = await veh004Res.json()

  logCheck(
    veh004Res.status === 200 && veh004Data.vehicle?.id === 'VEH004',
    'Session Customization',
    'Custom vehicleId VEH004 returns VEH004 active trip',
    'vehicle.id === VEH004',
    `status=${veh004Res.status}, vehicleId=${veh004Data.vehicle?.id}`
  )

  // -------------------------------------------------------------------------
  // TEST 2: Driver Session without vehicleId Defaults to VEH001
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 2: Driver Session without vehicleId Defaults to VEH001 ---')
  const noVehToken = await encrypt({
    userId: driverUser.id,
    role: Role.DRIVER,
    email: driverUser.email,
    vehicleId: null,
    expires: new Date(Date.now() + 10 * 60 * 60 * 1000)
  })
  const noVehCookie = `session=${noVehToken}`

  const noVehReq = new Request('http://localhost:3000/api/driver/trip', {
    headers: { cookie: noVehCookie }
  })
  const noVehRes = await getDriverTrip(noVehReq)
  const noVehData = await noVehRes.json()

  // In DB, VEH001 might have COMPLETED trip right now, but it should query for VEH001
  logCheck(
    noVehRes.status === 200,
    'Defaulting',
    'Session without vehicleId successfully defaults query without crashing',
    'HTTP 200',
    `HTTP ${noVehRes.status}`
  )

  // -------------------------------------------------------------------------
  // TEST 3: Sync Handler - Non-Existent tripStopId Isolation
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 3: Sync Handler Fault Isolation (Non-Existent tripStopId) ---')
  const bogusStopReq = new Request('http://localhost:3000/api/driver/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events: [
        {
          id: `bogus-${Date.now()}`,
          type: 'STOP_COMPLETION',
          tripStopId: 'bogus-stop-id-999999',
          outcome: 'SUCCESS'
        }
      ]
    })
  })
  const bogusRes = await syncDriver(bogusStopReq)
  const bogusData = await bogusRes.json()

  logCheck(
    bogusRes.status === 200 && bogusData.processedCount === 0 && bogusData.results?.[0]?.success === false,
    'Fault Isolation',
    'Non-existent stop returns individual failure without crashing endpoint',
    'processedCount: 0, results[0].success: false',
    `processedCount: ${bogusData.processedCount}, results[0].success: ${bogusData.results?.[0]?.success}`
  )

  // -------------------------------------------------------------------------
  // TEST 4: Partial Batch Failure Isolation (1 Valid + 1 Invalid Event)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 4: Partial Batch Failure Isolation ---')
  // Find a pending stop on any trip
  const pendingTrip = await prisma.trip.findFirst({
    where: { status: TripStatus.LOADING },
    include: { stops: { include: { order: true } } }
  })

  if (pendingTrip && pendingTrip.stops.length > 0) {
    const validStop = pendingTrip.stops[0]
    const validEventId = `partial-test-valid-${Date.now()}`
    const invalidEventId = `partial-test-invalid-${Date.now()}`

    const mixedReq = new Request('http://localhost:3000/api/driver/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            id: validEventId,
            type: 'STOP_COMPLETION',
            tripStopId: validStop.id,
            outcome: 'SUCCESS',
            signature: 'sig-valid'
          },
          {
            id: invalidEventId,
            type: 'STOP_COMPLETION',
            tripStopId: 'invalid-stop-xyz-123',
            outcome: 'SUCCESS'
          }
        ]
      })
    })
    const mixedRes = await syncDriver(mixedReq)
    const mixedData = await mixedRes.json()

    const validResult = mixedData.results?.find((r: any) => r.id === validEventId)
    const invalidResult = mixedData.results?.find((r: any) => r.id === invalidEventId)

    logCheck(
      mixedRes.status === 200 && validResult?.success === true && invalidResult?.success === false,
      'Batch Fault Isolation',
      'Valid event succeeds while invalid event fails in mixed batch',
      'valid: true, invalid: false',
      `valid: ${validResult?.success}, invalid: ${invalidResult?.success}`
    )

    // Cleanup the test valid stop
    await prisma.proofOfDelivery.deleteMany({ where: { tripStopId: validStop.id } })
    await prisma.syncEvent.deleteMany({ where: { clientEventId: validEventId } })
    await prisma.tripStop.update({ where: { id: validStop.id }, data: { outcome: null } })
    if (validStop.orderId) {
      await prisma.order.update({ where: { id: validStop.orderId }, data: { status: OrderStatus.LOADING } })
    }
  }

  // -------------------------------------------------------------------------
  // TEST 5: Out-of-Order Stop Completion & Auto-Completion Trigger
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 5: Out-of-Order Stop Completion & Auto-Completion ---')
  // We will test on a trip with multiple stops (e.g. TRIP-bss6sni has 2 stops)
  const multiTrip = await prisma.trip.findFirst({
    where: { id: 'TRIP-bss6sni' },
    include: { stops: true }
  })

  if (multiTrip && multiTrip.stops.length === 2) {
    const s1 = multiTrip.stops[0]
    const s2 = multiTrip.stops[1]

    // Complete stop 2 first, then stop 1
    const s2Req = new Request('http://localhost:3000/api/driver/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'STOP_COMPLETION',
        tripStopId: s2.id,
        outcome: 'SUCCESS'
      })
    })
    await syncDriver(s2Req)

    const tripAfterS2 = await prisma.trip.findUnique({ where: { id: multiTrip.id } })
    logCheck(
      tripAfterS2?.status === multiTrip.status, // Not completed yet
      'Out of Order',
      'Completing stop 2 first leaves trip not yet COMPLETED',
      'not COMPLETED',
      tripAfterS2?.status || ''
    )

    // Now complete stop 1
    const s1Req = new Request('http://localhost:3000/api/driver/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'STOP_COMPLETION',
        tripStopId: s1.id,
        outcome: 'SUCCESS'
      })
    })
    await syncDriver(s1Req)

    const tripAfterS1 = await prisma.trip.findUnique({ where: { id: multiTrip.id } })
    logCheck(
      tripAfterS1?.status === TripStatus.COMPLETED,
      'Out of Order',
      'Completing remaining stop 1 automatically completes the trip',
      'COMPLETED',
      tripAfterS1?.status || ''
    )

    // Cleanup TRIP-bss6sni back to LOADING
    await prisma.proofOfDelivery.deleteMany({ where: { tripStopId: { in: [s1.id, s2.id] } } })
    await prisma.syncEvent.deleteMany({
      where: {
        OR: [
          { clientEventId: `sync-${s1.id}` },
          { clientEventId: `sync-${s2.id}` }
        ]
      }
    })
    await prisma.tripStop.updateMany({
      where: { id: { in: [s1.id, s2.id] } },
      data: { outcome: null }
    })
    await prisma.trip.update({
      where: { id: multiTrip.id },
      data: { status: TripStatus.LOADING }
    })
    const orderIds = [s1.orderId, s2.orderId].filter(Boolean) as string[]
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: OrderStatus.LOADING }
    })
  }

  // -------------------------------------------------------------------------
  // TEST 6: Rapid Concurrent Idempotent Sync Requests (Race Condition Probe)
  // -------------------------------------------------------------------------
  console.log('\n--- TEST 6: Rapid Concurrent Sync Requests ---')
  const tempTrip = await prisma.trip.findFirst({
    where: { id: 'TRIP-g31kstq' },
    include: { stops: true }
  })
  if (tempTrip && tempTrip.stops.length > 0) {
    const testStop = tempTrip.stops[0]
    const testClientEventId = `race-test-${Date.now()}`

    const payload = JSON.stringify({
      events: [
        {
          id: testClientEventId,
          type: 'STOP_COMPLETION',
          tripStopId: testStop.id,
          outcome: 'SUCCESS',
          signature: 'sig-race'
        }
      ]
    })

    // Fire 5 identical requests concurrently
    const promises = Array.from({ length: 5 }, () => {
      const req = new Request('http://localhost:3000/api/driver/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      })
      return syncDriver(req).then(r => r.json())
    })

    const concurrentResults = await Promise.all(promises)
    const successCount = concurrentResults.filter(r => r.success === true).length

    // Verify exactly 1 ProofOfDelivery in DB
    const podCount = await prisma.proofOfDelivery.count({
      where: { tripStopId: testStop.id }
    })

    logCheck(
      successCount === 5 && podCount === 1,
      'Concurrency',
      '5 concurrent identical sync requests result in exactly 1 POD record without crashing',
      'All 5 success, podCount === 1',
      `successCount: ${successCount}, podCount: ${podCount}`
    )

    // Cleanup
    await prisma.proofOfDelivery.deleteMany({ where: { tripStopId: testStop.id } })
    await prisma.syncEvent.deleteMany({ where: { clientEventId: testClientEventId } })
    await prisma.tripStop.update({ where: { id: testStop.id }, data: { outcome: null } })
    if (testStop.orderId) {
      await prisma.order.update({ where: { id: testStop.orderId }, data: { status: OrderStatus.LOADING } })
    }
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n====================================================================')
  const total = testResults.length
  const passed = testResults.filter(r => r.passed).length
  const failed = testResults.filter(r => !r.passed).length
  console.log(`TOTAL ADVERSARIAL CHECKS: ${total} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('====================================================================')

  if (failed > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

runAdversarialSuite()
  .catch(err => {
    console.error('Fatal error:', err)
    process.exit(2)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
