import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { TripStatus, OrderStatus } from '@prisma/client'
import { z } from 'zod'

const EventItemSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  payload: z.any().optional(),
  tripStopId: z.string().optional(),
  outcome: z.string().optional(),
  signature: z.string().optional(),
  signatureUrl: z.string().optional(),
  photo: z.string().optional(),
  photoUrl: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  createdAt: z.string().optional(),
}).passthrough()

const SyncBatchSchema = z.array(EventItemSchema)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const rawEvents = Array.isArray(body) ? body : (body.events || (body.type ? [body] : []))
    const events = SyncBatchSchema.parse(rawEvents)

    const results = []

    for (const rawEvent of events) {
      const eventId = rawEvent.id || (rawEvent.payload?.tripStopId ? `sync-${rawEvent.payload.tripStopId}` : (rawEvent.tripStopId ? `sync-${rawEvent.tripStopId}` : crypto.randomUUID()))
      const createdAtStr = rawEvent.createdAt || new Date().toISOString()
      const payload = rawEvent.payload || {}
      const tripStopId = payload.tripStopId || rawEvent.tripStopId
      const outcome = payload.outcome || rawEvent.outcome || 'SUCCESS'
      const photoUrl = payload.photoUrl || payload.photo || rawEvent.photoUrl || rawEvent.photo || null
      const signatureUrl = payload.signatureUrl || payload.signature || rawEvent.signatureUrl || rawEvent.signature || null
      const lat = payload.lat ?? rawEvent.lat ?? null
      const lng = payload.lng ?? rawEvent.lng ?? null

      try {
        // Idempotency check: see if event was already synced
        const existing = await prisma.syncEvent.findUnique({
          where: { clientEventId: eventId }
        })

        if (!existing) {
          // Process event transactionally
          await prisma.$transaction(async (tx: any) => {
            if (rawEvent.type === 'STOP_COMPLETION' && tripStopId) {
              const updatedStop = await tx.tripStop.update({
                where: { id: tripStopId },
                data: { 
                  outcome: outcome as any, 
                  actualArrival: new Date(createdAtStr) 
                }
              })

              await tx.proofOfDelivery.create({
                data: {
                  clientEventId: eventId,
                  tripStopId,
                  photoUrl,
                  signatureUrl,
                  timestamp: new Date(createdAtStr),
                  lat,
                  lng
                }
              })

              // CRITICAL: Update the stop's Order.status to DELIVERED only on successful completion!
              if (outcome === 'SUCCESS' && updatedStop?.orderId && tx.order?.update) {
                await tx.order.update({
                  where: { id: updatedStop.orderId },
                  data: { status: OrderStatus.DELIVERED }
                })
              }

              // If all stops for the trip are completed, update Trip.status to COMPLETED!
              if (updatedStop?.tripId && tx.tripStop?.findMany && tx.trip?.update) {
                const remainingStops = await tx.tripStop.findMany({
                  where: {
                    tripId: updatedStop.tripId,
                    id: { not: updatedStop.id },
                    outcome: null
                  }
                })
                if (remainingStops.length === 0) {
                  await tx.trip.update({
                    where: { id: updatedStop.tripId },
                    data: { status: TripStatus.COMPLETED }
                  })
                }
              }
            } else if (rawEvent.type === 'ISSUE_REPORT') {
               // Handle issues
            }

            // Record the sync event to prevent duplicates
            await tx.syncEvent.create({
              data: {
                clientEventId: eventId,
                payload: rawEvent.payload || rawEvent
              }
            })
          })
        }
        
        results.push({ id: eventId, success: true })
      } catch (err: any) {
        console.error(`Event ${eventId} failed:`, err)
        results.push({ id: eventId, success: false, error: err.message })
      }
    }

    const processedCount = results.filter(r => r.success).length
    return NextResponse.json({ success: true, processedCount, results })
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid batch' }, { status: 400 })
  }
}
