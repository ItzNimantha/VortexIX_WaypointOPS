import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession, decrypt } from '@/lib/session'
import { OrderStatus } from '@prisma/client'

async function resolveSession(req: Request) {
  try {
    const s = await getSession()
    if (s) return s
  } catch (_) {}
  const cookieHeader = req.headers.get('cookie') || ''
  const match = cookieHeader.match(/session=([^;]+)/)
  if (match) {
    try {
      return await decrypt(match[1])
    } catch (_) {}
  }
  return null
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await resolveSession(req)
    if (!session || session.role !== 'STORE_MANAGER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    const order = await prisma.order.findFirst({
      where: { 
        id,
        ...(session.outletId ? { outletId: session.outletId } : {})
      },
      include: {
        lines: true,
        outlet: true
      }
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Ensure status is DELIVERED
    if (order.status !== OrderStatus.DELIVERED) {
      return NextResponse.json(
        { error: 'Order must be DELIVERED to confirm receipt' },
        { status: 400 }
      )
    }

    // Record receipt confirmation in AuditLog
    await prisma.auditLog.create({
      data: {
        userId: session.userId || 'store-manager',
        action: 'STORE_RECEIPT_CONFIRMED',
        details: { 
          orderId: id, 
          outletId: order.outletId,
          verifiedAt: new Date().toISOString() 
        }
      }
    })

    return NextResponse.json({ 
      success: true, 
      orderId: id, 
      status: OrderStatus.DELIVERED 
    })
  } catch (error: any) {
    console.error('Error confirming receipt:', error)
    return NextResponse.json({ error: 'Failed to confirm receipt' }, { status: 500 })
  }
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await resolveSession(req)
    if (!session || session.role !== 'STORE_MANAGER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const order = await prisma.order.findFirst({
      where: { 
        id,
        ...(session.outletId ? { outletId: session.outletId } : {})
      },
      include: {
        lines: true,
        outlet: true,
        tripStop: {
          include: {
            trip: true
          }
        }
      }
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, order })
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}
