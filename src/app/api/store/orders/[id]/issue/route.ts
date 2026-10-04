import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getSession } from '@/lib/session'

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
    const body = await req.json()
    const { issueType, note } = body

    const order = await prisma.order.findFirst({
      where: { 
        id,
        outletId: session.outletId
      }
    })

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const issue = await prisma.issueReport.create({
      data: {
        reporterId: session.userId,
        relatedEntityType: 'ORDER',
        relatedEntityId: id,
        issueType: issueType || 'OTHER',
        note: note || ''
      }
    })

    await prisma.auditLog.create({
      data: {
        userId: session.userId,
        action: 'STORE_ISSUE_REPORTED',
        details: { orderId: id, issueId: issue.id, issueType, timestamp: new Date().toISOString() }
      }
    })

    return NextResponse.json({ success: true, issue })
  } catch (error: any) {
    console.error('Error reporting issue:', error)
    return NextResponse.json({ error: 'Failed to report issue' }, { status: 500 })
  }
}
