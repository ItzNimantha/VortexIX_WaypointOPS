import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { TripStatus, OrderStatus } from '@prisma/client'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Trip ID is required' }, { status: 400 })
    }

    const session = await getSession()
    const loaderId = session?.id || 'loader-1'

    const body = await req.json().catch(() => ({}))
    const { loadedCrates, flags, shortfall } = body

    const trip = await prisma.trip.findUnique({
      where: { id },
      include: { stops: true }
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // 1. Create or update LoadingRecord
    const loadingRecord = await prisma.loadingRecord.upsert({
      where: { tripId: id },
      update: {
        loaderId,
        status: 'IN_PROGRESS'
      },
      create: {
        tripId: id,
        loaderId,
        status: 'IN_PROGRESS'
      }
    })

    // 2. Advance trip status from PLANNED to LOADING if not already
    if (trip.status === TripStatus.PLANNED) {
      await prisma.trip.update({
        where: { id },
        data: { status: TripStatus.LOADING }
      })

      const orderIds = trip.stops.map(s => s.orderId).filter(Boolean) as string[]
      if (orderIds.length > 0) {
        await prisma.order.updateMany({
          where: { id: { in: orderIds }, status: OrderStatus.PLANNED },
          data: { status: OrderStatus.LOADING }
        })
      }
    }

    // 3. Save shortfall flags if provided
    if (Array.isArray(flags) && flags.length > 0) {
      for (const flag of flags) {
        await prisma.loadingItemFlag.create({
          data: {
            loadingRecordId: loadingRecord.id,
            productId: flag.productId || 'GENERIC_PRODUCT',
            issueType: flag.issueType || 'MISSING',
            quantity: Number(flag.quantity || flag.qty || 1)
          }
        })
      }
    } else if (shortfall) {
      const issueType = shortfall.issueType || 'MISSING'
      const qty = Number(shortfall.qty || shortfall.quantity || 1)
      const productId = shortfall.productId || `STOP-${shortfall.stopId || 1}`

      await prisma.loadingItemFlag.create({
        data: {
          loadingRecordId: loadingRecord.id,
          productId,
          issueType,
          quantity: qty
        }
      })

      // Create an IssueReport for Dispatcher visibility
      await prisma.issueReport.create({
        data: {
          reporterId: loaderId,
          relatedEntityType: 'TRIP',
          relatedEntityId: id,
          issueType,
          note: shortfall.reason || `Shortfall of ${qty} items on stop ${shortfall.stopId || ''}`
        }
      })
    }

    return NextResponse.json({
      success: true,
      loadingRecordId: loadingRecord.id,
      loadedCrates: loadedCrates || null
    })
  } catch (error: any) {
    console.error('Error saving loading progress:', error)
    return NextResponse.json(
      { error: 'Failed to save loading progress', details: error?.message },
      { status: 500 }
    )
  }
}
