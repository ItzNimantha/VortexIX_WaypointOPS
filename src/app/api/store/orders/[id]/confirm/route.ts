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
    if (!session || session.role !== 'STORE_MANAGER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    const order = await prisma.order.findFirst({
      where: { 
        id,
        outletId: session.outletId
      }
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== OrderStatus.DELIVERED) {
      return NextResponse.json({ error: 'Order must be DELIVERED to confirm receipt' }, { status: 400 })
    }

    // Since we don't have RECEIVED in the enum, we keep it as DELIVERED but create an audit log.
    // Or we can just reuse CONFIRMED if we want, but DELIVERED is the terminal state for the driver.
    // Let's just create the audit log.
    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'STORE_RECEIPT_CONFIRMED',
        details: { orderId: id, timestamp: new Date().toISOString() }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error confirming receipt:', error)
    return NextResponse.json({ error: 'Failed to confirm receipt' }, { status: 500 })
  }
}
