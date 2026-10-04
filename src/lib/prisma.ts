import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

function getConnectionString(): string {
  let url = process.env.DATABASE_URL || process.env.DIRECT_URL || ''

  // If connection string points to direct Supabase host db.<ref>.supabase.co:5432,
  // rewrite to Supabase IPv4 Pooler host to ensure Vercel serverless functions can connect.
  if (url.includes('@db.') && url.includes('.supabase.co')) {
    const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@db\.([^.]+)\.supabase\.co:5432\/(.+)/)
    if (match) {
      const [, user, password, projectRef, dbName] = match
      const db = dbName.split('?')[0]
      url = `postgresql://${user}.${projectRef}:${password}@aws-0-ap-northeast-1.pooler.supabase.com:6543/${db}?pgbouncer=true`
    }
  }

  return url
}

const prismaClientSingleton = () => {
  const connectionString = getConnectionString()
  const pool = new Pool({ 
    connectionString,
    ssl: { rejectUnauthorized: false }
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined
} & typeof global

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma
}
