import { encrypt } from '../src/lib/session'
import prisma from '../src/lib/prisma'
import { OrderStatus } from '@prisma/client'

async function testHttpEndpoints() {
  console.log('=== HTTP ENDPOINT FORENSIC VERIFICATION ===')

  // Generate valid LOADER session
  const expires = new Date(Date.now() + 10 * 60 * 60 * 1000)
  const sessionToken = await encrypt({
    userId: 'test-loader-id',
    role: 'LOADER',
    email: 'loader@waypoint.com',
    depotId: 'Peliyagoda',
    expires
  })

  const headers = {
    'Cookie': `session=${sessionToken}`,
    'Content-Type': 'application/json'
  }

  // 1. GET /api/loader/trips
  console.log('1. Calling GET http://localhost:3005/api/loader/trips')
  const resTrips = await fetch('http://localhost:3005/api/loader/trips?depotId=DEP_PEL', { headers })
  console.log('Status:', resTrips.status)
  const tripsData = await resTrips.json()
  console.log('Success:', tripsData.success)
  console.log('Trips count:', tripsData.trips?.length)

  if (!tripsData.success || !tripsData.trips || tripsData.trips.length === 0) {
    throw new Error('GET /api/loader/trips returned non-success or empty trips')
  }

  const testTrip = tripsData.trips.find((t: any) => t.stopsCount > 1) || tripsData.trips[0]
  console.log(`Selected test trip: ${testTrip.id} with ${testTrip.stopsCount} stops, vehicle: ${testTrip.vehicle}`)

  // 2. GET /api/loader/trips/[id]
  console.log(`\n2. Calling GET http://localhost:3005/api/loader/trips/${testTrip.id}`)
  const resDetail = await fetch(`http://localhost:3005/api/loader/trips/${testTrip.id}`, { headers })
  console.log('Status:', resDetail.status)
  const detailData = await resDetail.json()
  console.log('Success:', detailData.success)
  console.log('Stops returned:', detailData.stops?.length)

  const stopSeqs = detailData.stops.map((s: any) => s.sequence)
  const loadSeqs = detailData.stops.map((s: any) => s.loadSequence)
  console.log('Sequences (reverse delivery):', stopSeqs)
  console.log('Load sequences (1..N):', loadSeqs)

  // Verify reverse order
  for (let i = 0; i < stopSeqs.length - 1; i++) {
    if (stopSeqs[i] < stopSeqs[i + 1]) {
      throw new Error(`Reverse ordering failed: ${stopSeqs[i]} < ${stopSeqs[i+1]}`)
    }
  }

  // 3. POST /api/loader/trips/[id]/load
  console.log(`\n3. Calling POST http://localhost:3005/api/loader/trips/${testTrip.id}/load`)
  const resLoad = await fetch(`http://localhost:3005/api/loader/trips/${testTrip.id}/load`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      loadedCrates: { [stopSeqs[0]]: 5 },
      shortfall: {
        stopId: stopSeqs[0],
        qty: 1,
        reason: 'Forensic HTTP test shortfall'
      }
    })
  })
  console.log('Load status:', resLoad.status)
  const loadData = await resLoad.json()
  console.log('Load response:', loadData)
  if (!loadData.success) throw new Error('POST load failed')

  // 4. POST /api/loader/trips/[id]/signoff
  console.log(`\n4. Calling POST http://localhost:3005/api/loader/trips/${testTrip.id}/signoff`)
  const resSignoff = await fetch(`http://localhost:3005/api/loader/trips/${testTrip.id}/signoff`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      signature: 'data:image/svg+xml;utf8,<svg>driver-forensic-test</svg>',
      totalCrates: testTrip.crates
    })
  })
  console.log('Signoff status:', resSignoff.status)
  const signoffData = await resSignoff.json()
  console.log('Signoff response:', signoffData)
  if (!signoffData.success) throw new Error('POST signoff failed')

  // 5. Verify PostgreSQL DB changes
  console.log('\n5. Verifying Postgres changes directly...')
  const dbRec = await prisma.loadingRecord.findUnique({ where: { tripId: testTrip.id } })
  console.log('LoadingRecord in DB:', dbRec?.status)

  const updatedTrip = await prisma.trip.findUnique({
    where: { id: testTrip.id },
    include: { stops: { include: { order: true } } }
  })
  const orders = updatedTrip?.stops.map(s => s.order).filter(Boolean) || []
  for (const o of orders) {
    console.log(`Order ${o?.id} Status in DB:`, o?.status)
    if (o?.status !== OrderStatus.LOADED) {
      throw new Error(`Expected order ${o?.id} to be LOADED, was ${o?.status}`)
    }
  }

  const audit = await prisma.auditLog.findFirst({
    where: { action: 'LOADER_DRIVER_SIGNOFF' },
    orderBy: { createdAt: 'desc' }
  })
  console.log('AuditLog entry in DB:', audit?.action, audit?.details)

  console.log('\n=== ALL LIVE HTTP AND POSTGRES TESTS PASSED SUCCESSFULLY! ===')
  await prisma.$disconnect()
}

testHttpEndpoints().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
