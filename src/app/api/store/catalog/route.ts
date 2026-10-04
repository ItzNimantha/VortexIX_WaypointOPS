import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      where: { brand: 'FRESH' }
    })
    return NextResponse.json({ products })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 })
  }
}
