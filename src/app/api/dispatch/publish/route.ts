import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { OrderStatus, TripStatus } from '@prisma/client'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || (session.role !== 'DISPATCHER' && session.role !== 'STORE_MANAGER')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { planId } = body

  const tripWhere: any = { status: TripStatus.PLANNED }
  if (planId) {
    tripWhere.planId = planId
  }

  let tripsToUpdate = await prisma.trip.findMany({
    where: tripWhere,
    include: { stops: true }
  })

  // Fallback: If no trips match specific planId, publish any PLANNED trips
  if (tripsToUpdate.length === 0) {
    tripsToUpdate = await prisma.trip.findMany({
      where: { status: TripStatus.PLANNED },
      include: { stops: true }
    })
  }

  const tripIds = tripsToUpdate.map(t => t.id)
  const orderIds = tripsToUpdate.flatMap(t => t.stops.map(s => s.orderId).filter(Boolean) as string[])

  if (tripIds.length > 0) {
    await prisma.trip.updateMany({
      where: { id: { in: tripIds } },
      data: { status: TripStatus.LOADING }
    })
  }

  if (orderIds.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { status: OrderStatus.LOADING }
    })
  }

  return NextResponse.json({
    success: true,
    updatedCount: tripsToUpdate.length,
    tripIds,
    orderIds
  })
}
