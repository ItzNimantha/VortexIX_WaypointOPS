import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSession } from './lib/session'

const protectedRoutes = {
  '/store': 'STORE_MANAGER',
  '/dispatcher': 'DISPATCHER',
  '/loader': 'LOADER',
  '/driver': 'DRIVER'
}

export async function middleware(request: NextRequest) {
  const session = await getSession()
  const path = request.nextUrl.pathname

  if (!session && path !== '/login' && !path.startsWith('/api/health')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && path === '/') {
    const roleMap: Record<string, string> = {
      'STORE_MANAGER': '/store',
      'DISPATCHER': '/dispatcher',
      'LOADER': '/loader',
      'DRIVER': '/driver'
    }
    return NextResponse.redirect(new URL(roleMap[session.role] || '/login', request.url))
  }

  // Role based protection
  for (const [route, role] of Object.entries(protectedRoutes)) {
    if (path.startsWith(route) && session?.role !== role) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
