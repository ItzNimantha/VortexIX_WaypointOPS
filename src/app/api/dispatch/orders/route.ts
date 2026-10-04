import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'

function normalizeDepotId(depotId?: string | null): string | undefined {
  if (!depotId) return undefined
  if (depotId === 'DEP_PEL') return 'Peliyagoda'
  if (depotId === 'DEP_KAN') return 'Kandy'
  return depotId
}

export async function GET(req: Request) {
  const session = await getSession()
  if (!session || (session.role !== 'DISPATCHER' && session.role !== 'STORE_MANAGER')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const depotParam = url.searchParams.get('depotId') || session.depotId
  const depotId = normalizeDepotId(depotParam)

  const where: any = {}
  if (depotId) {
    where.outlet = { depotId }
  }

  const orders = await prisma.order.findMany({
    where,
    include: { lines: true, outlet: true },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json({ orders })
}
