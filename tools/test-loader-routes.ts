import prisma from '../src/lib/prisma'
import { GET as getTrips } from '../src/app/api/loader/trips/route'
import { GET as getTripDetail } from '../src/app/api/loader/trips/[id]/route'
import { POST as postLoadProgress } from '../src/app/api/loader/trips/[id]/load/route'
import { POST as postSignoff } from '../src/app/api/loader/trips/[id]/signoff/route'
import { OrderStatus, TripStatus } from '@prisma/client'

async function runForensicRouteAudit() {
  console.log('=== FORENSIC AUDIT: LOADER API ROUTES & POSTGRESQL ===')

  // 1. Test GET /api/loader/trips
  console.log('\n--- Test 1: GET /api/loader/trips ---')
  const reqTrips = new Request('http://localhost:3000/api/loader/trips?depotId=DEP_PEL')
  const resTrips = await getTrips(reqTrips)
  const tripsData = await resTrips.json()

  console.log(`Response Status: ${resTrips.status}`)
  console.log(`Success flag: ${tripsData.success}`)
  console.log(`Trips returned count: ${tripsData.trips?.length}`)

  if (!tripsData.success || !Array.isArray(tripsData.trips) || tripsData.trips.length === 0) {
    throw new Error('GET /api/loader/trips failed or returned empty trips array')
  }

  const sampleTrip = tripsData.trips[0]
  console.log('Sample Trip from API:', {
    id: sampleTrip.id,
    vehicle: sampleTrip.vehicle,
    status: sampleTrip.status,
    departure: sampleTrip.departure,
    stopsCount: sampleTrip.stopsCount,
    crates: sampleTrip.crates
  })

  // 2. Test GET /api/loader/trips/[id] with reverse ordering check
  console.log('\n--- Test 2: GET /api/loader/trips/[id] & Reverse Load Sequencing ---')
  // Find a multi-stop trip
  const multiStopTrip = tripsData.trips.find((t: any) => t.stopsCount > 1) || sampleTrip
  console.log(`Testing trip: ${multiStopTrip.id} with ${multiStopTrip.stopsCount} stops`)

  const reqTripDetail = new Request(`http://localhost:3000/api/loader/trips/${multiStopTrip.id}`)
  const resTripDetail = await getTripDetail(reqTripDetail, { params: { id: multiStopTrip.id } })
  const detailData = await resTripDetail.json()

  console.log(`Detail Response Status: ${resTripDetail.status}`)
  console.log(`Trip ID: ${detailData.trip?.id}`)
  console.log(`Stops returned: ${detailData.stops?.length}`)

  if (!detailData.success || !detailData.stops || detailData.stops.length === 0) {
    throw new Error('GET /api/loader/trips/[id] failed')
  }

  // Verify reverse sequencing
  const sequences = detailData.stops.map((s: any) => s.sequence)
  const loadSequences = detailData.stops.map((s: any) => s.loadSequence)
  console.log('Stop sequences (should be descending):', sequences)
  console.log('Load sequences (should be ascending 1..N):', loadSequences)

  for (let i = 0; i < sequences.length - 1; i++) {
    if (sequences[i] < sequences[i + 1]) {
      throw new Error(`Reverse sequence violation: index ${i} has sequence ${sequences[i]} < index ${i+1} sequence ${sequences[i+1]}`)
    }
  }

  for (let i = 0; i < loadSequences.length; i++) {
    if (loadSequences[i] !== i + 1) {
      throw new Error(`Load sequence mismatch: index ${i} expected ${i + 1}, got ${loadSequences[i]}`)
    }
  }
  console.log('CONFIRMED: Reverse load sequencing strictly enforced!')

  // 3. Test POST /api/loader/trips/[id]/load (shortfall reporting)
  console.log('\n--- Test 3: POST /api/loader/trips/[id]/load ---')
  const reqLoad = new Request(`http://localhost:3000/api/loader/trips/${multiStopTrip.id}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loadedCrates: { [sequences[0]]: 5 },
      shortfall: {
        stopId: sequences[0],
        qty: 2,
        reason: 'Forensic test shortfall note'
      }
    })
  })

  const resLoad = await postLoadProgress(reqLoad, { params: { id: multiStopTrip.id } })
  const loadData = await resLoad.json()
  console.log('Load Response:', loadData)

  if (!loadData.success || !loadData.loadingRecordId) {
    throw new Error('POST /api/loader/trips/[id]/load failed')
  }

  // Verify in PostgreSQL
  const dbLoadingRecord = await prisma.loadingRecord.findUnique({
    where: { tripId: multiStopTrip.id }
  })
  console.log('DB LoadingRecord:', dbLoadingRecord)
  if (!dbLoadingRecord || dbLoadingRecord.status !== 'IN_PROGRESS') {
    throw new Error('LoadingRecord not found or status not IN_PROGRESS in Postgres')
  }

  const dbFlags = await prisma.loadingItemFlag.findMany({
    where: { loadingRecordId: dbLoadingRecord.id }
  })
  console.log(`DB LoadingItemFlags count: ${dbFlags.length}`)
  if (dbFlags.length === 0) {
    throw new Error('LoadingItemFlag not found in Postgres')
  }

  const dbIssue = await prisma.issueReport.findFirst({
    where: { relatedEntityId: multiStopTrip.id }
  })
  console.log('DB IssueReport created:', dbIssue?.id, dbIssue?.note)
  if (!dbIssue) {
    throw new Error('IssueReport not found in Postgres')
  }

  // 4. Test POST /api/loader/trips/[id]/signoff
  console.log('\n--- Test 4: POST /api/loader/trips/[id]/signoff ---')
  const reqSignoff = new Request(`http://localhost:3000/api/loader/trips/${multiStopTrip.id}/signoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signature: 'data:image/svg+xml;utf8,<svg>auditor-signed</svg>',
      totalCrates: 25
    })
  })

  const resSignoff = await postSignoff(reqSignoff, { params: { id: multiStopTrip.id } })
  const signoffData = await resSignoff.json()
  console.log('Signoff Response:', signoffData)

  if (!signoffData.success) {
    throw new Error('POST /api/loader/trips/[id]/signoff failed')
  }

  // Verify in PostgreSQL
  const updatedLoadingRecord = await prisma.loadingRecord.findUnique({
    where: { tripId: multiStopTrip.id }
  })
  console.log('Updated DB LoadingRecord status:', updatedLoadingRecord?.status)
  if (updatedLoadingRecord?.status !== 'COMPLETED') {
    throw new Error('LoadingRecord status was not updated to COMPLETED in Postgres')
  }

  const updatedTrip = await prisma.trip.findUnique({
    where: { id: multiStopTrip.id },
    include: { stops: { include: { order: true } } }
  })
  console.log('Updated Trip Status in DB:', updatedTrip?.status)

  const stopOrders = updatedTrip?.stops.map(s => s.order).filter(Boolean) || []
  console.log(`Updated Orders count: ${stopOrders.length}`)
  for (const o of stopOrders) {
    console.log(`Order ${o?.id} Status: ${o?.status}`)
    if (o?.status !== OrderStatus.LOADED) {
      throw new Error(`Order ${o?.id} status was ${o?.status}, expected LOADED`)
    }
  }

  const auditLog = await prisma.auditLog.findFirst({
    where: { action: 'LOADER_DRIVER_SIGNOFF' },
    orderBy: { createdAt: 'desc' }
  })
  console.log('AuditLog record in DB:', auditLog?.id, auditLog?.action, auditLog?.details)
  if (!auditLog) {
    throw new Error('AuditLog entry was not written to Postgres')
  }

  console.log('\n=== ALL FORENSIC CHECKS PASSED: 100% GENUINE INTEGRITY ===')
  await prisma.$disconnect()
}

runForensicRouteAudit().catch(err => {
  console.error('Forensic check failed:', err)
  process.exit(1)
})
