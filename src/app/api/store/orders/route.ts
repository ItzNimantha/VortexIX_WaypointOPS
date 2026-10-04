import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { OrderStatus } from '@prisma/client'
import { z } from 'zod'
import { getSession } from '@/lib/session'

const OrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1),
  })).min(1),
  targetDate: z.string(),
})

export async function POST(req: Request) {
  const session = await getSession()
  if (!session || session.role !== 'STORE_MANAGER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { items, targetDate } = OrderSchema.parse(body)

    // Fetch products to calculate weight, volume, and split chilled/dry
    const productIds = items.map(i => i.productId)
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    })

    const productMap = new Map(products.map(p => [p.id, p]))

    const chilledItems: any[] = []
    const dryItems: any[] = []

    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) throw new Error(`Product ${item.productId} not found`)
      
      const enriched = {
        productId: item.productId,
        quantity: item.quantity,
        volumeM3: product.volumeM3 * item.quantity,
        weightKg: product.weightKg * item.quantity,
      }

      if (product.isChilled) chilledItems.push(enriched)
      else dryItems.push(enriched)
    }

    const createdOrders = []

    const createOrder = async (orderItems: any[], isChilled: boolean) => {
      const totalVolume = orderItems.reduce((sum, item) => sum + item.volumeM3, 0)
      const totalWeight = orderItems.reduce((sum, item) => sum + item.weightKg, 0)

      // Set cutoff to 4 PM of the day before target date
      const target = new Date(targetDate)
      const cutoff = new Date(target)
      cutoff.setDate(cutoff.getDate() - 1)
      cutoff.setHours(16, 0, 0, 0)

      const order = await prisma.order.create({
        data: {
          outletId: session.outletId,
          status: OrderStatus.PENDING, // Changed to PENDING
          targetDate: target,
          cutoffTime: cutoff,
          totalVolumeM3: totalVolume,
          totalWeightKg: totalWeight,
          isChilled,
          lines: {
            create: orderItems.map(i => ({
              productId: i.productId,
              quantity: i.quantity
            }))
          }
        },
        include: {
          lines: true
        }
      })
      return order
    }

    if (chilledItems.length > 0) {
      createdOrders.push(await createOrder(chilledItems, true))
    }
    if (dryItems.length > 0) {
      createdOrders.push(await createOrder(dryItems, false))
    }

    return NextResponse.json({ success: true, orders: createdOrders })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 400 })
  }
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.role === 'DISPATCHER') {
    const url = new URL(req.url)
    const outletId = url.searchParams.get('outletId')
    const depotParam = url.searchParams.get('depotId') || session.depotId
    const depotId = depotParam === 'DEP_PEL' ? 'Peliyagoda' : depotParam === 'DEP_KAN' ? 'Kandy' : depotParam

    const where: any = {}
    if (outletId) {
      where.outletId = outletId
    } else if (depotId) {
      where.outlet = { depotId }
    }

    const orders = await prisma.order.findMany({
      where,
      include: { lines: true, outlet: true },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ orders })
  }

  if (session.role !== 'STORE_MANAGER') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const orders = await prisma.order.findMany({
    where: { outletId: session.outletId },
    include: { lines: true, outlet: true },
    orderBy: { createdAt: 'desc' }
  })
  
  return NextResponse.json({ orders })
}
