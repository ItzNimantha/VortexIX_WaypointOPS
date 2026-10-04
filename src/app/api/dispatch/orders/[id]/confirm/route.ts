import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { OrderStatus } from '@prisma/client'

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'DISPATCHER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const order = await prisma.order.findUnique({ where: { id } })
    
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== OrderStatus.PENDING) {
      return NextResponse.json({ error: 'Order is not pending' }, { status: 400 })
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: OrderStatus.CONFIRMED }
    })

    return NextResponse.json({ success: true, order: updated })
  } catch (error: any) {
    console.error('Error confirming order:', error)
    return NextResponse.json({ error: 'Failed to confirm order' }, { status: 500 })
  }
}
