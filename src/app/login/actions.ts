'use server'

import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { encrypt } from '@/lib/session'

export async function login(formData: FormData) {
  try {
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

    const cookieStore = await cookies()
    cookieStore.set('session', session, {
      httpOnly: true,
      expires,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })

    return { success: true, role: user.role }
  } catch (err: any) {
    console.error('Login error:', err)
    return { error: err?.message || 'Login failed due to a server error' }
  }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}
