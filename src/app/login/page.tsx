'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await login(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else if (result.success) {
      const roleMap: Record<string, string> = {
        'STORE_MANAGER': '/store',
        'DISPATCHER': '/dispatcher',
        'LOADER': '/loader',
        'DRIVER': '/driver'
      }
      router.push(roleMap[result.role as string] || '/')
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-16 shadow-lg p-6">
        <h1 className="text-20 font-bold text-navy-900 mb-6 text-center">Waypoint OPS</h1>
        
        {error && (
          <div className="bg-danger-surface border-l-4 border-danger text-danger p-4 mb-4 rounded-4">
            <p className="font-medium text-14">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-14 font-medium text-text mb-1">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full border border-border rounded-8 p-3 text-14 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="name@waypoint.com"
            />
          </div>
          
          <div>
            <label className="block text-14 font-medium text-text mb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              className="w-full border border-border rounded-8 p-3 text-14 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-medium rounded-12 min-h-[44px] flex items-center justify-center mt-6 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
