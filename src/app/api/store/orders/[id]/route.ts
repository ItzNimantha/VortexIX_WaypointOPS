import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'

export async function GET(
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
      },
      include: {
        lines: true
      }
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Need product names, let's fetch products
    const productIds = order.lines.map(l => l.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    })
    
    const productMap = new Map(products.map(p => [p.id, p]))

    const linesWithProducts = order.lines.map(l => ({
      ...l,
      product: productMap.get(l.productId)
    }))

    return NextResponse.json({ 
      success: true, 
      order: { ...order, lines: linesWithProducts } 
    })
  } catch (error: any) {
    console.error('Error fetching order:', error)
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}
