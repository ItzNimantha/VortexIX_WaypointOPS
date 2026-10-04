'use server'

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { encrypt } from '@/lib/session'

const prisma = new PrismaClient()

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const user = await prisma.user.findUnique({
    where: { email }
  })

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return { error: 'Invalid email or password' }
  }

  const sessionData = {
    userId: user.id,
    role: user.role,
    email: user.email,
    outletId: user.outletId,
    depotId: user.depotId,
    vehicleId: user.vehicleId,
  }

  const expires = new Date(Date.now() + 10 * 60 * 60 * 1000)
  const session = await encrypt({ ...sessionData, expires })

  cookies().set('session', session, {
    httpOnly: true,
    expires,
  })

  return { success: true, role: user.role }
}

export async function logout() {
  cookies().delete('session')
}
