import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function POST(
  req: Request,
  { params }: { params: { stopId: string } }
) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { stopId } = params
    const body = await req.json()
    const { signatureUrl, photoUrl, lat, lng, clientEventId } = body

    const eventId = clientEventId || `pod-${stopId}-${Date.now()}`

    // Upsert ProofOfDelivery
    await prisma.proofOfDelivery.upsert({
      where: { tripStopId: stopId },
      update: {
        signatureUrl,
        photoUrl,
        lat,
        lng,
        timestamp: new Date()
      },
      create: {
        tripStopId: stopId,
        signatureUrl,
        photoUrl,
        lat,
        lng,
        timestamp: new Date(),
        clientEventId: eventId
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error saving POD:', error)
    return NextResponse.json({ error: 'Failed to save POD' }, { status: 500 })
  }
}
