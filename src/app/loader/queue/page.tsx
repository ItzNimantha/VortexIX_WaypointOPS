'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { RefreshCw, Truck, AlertCircle } from 'lucide-react'

interface TripItem {
  id: string
  vehicle: string
  vehicleType?: string
  vehicleTemp?: string
  departure: string
  status: string
  orders: number
  crates: number
}

export default function LoadingQueue() {
  const [trips, setTrips] = useState<TripItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTrips = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/loader/trips')
      if (!res.ok) {
        throw new Error(`Failed to fetch trips (${res.status})`)
      }
      const data = await res.json()
      if (data.trips) {
        setTrips(data.trips)
      } else {
        setTrips([])
      }
    } catch (err: any) {
      console.error('Error fetching loader queue:', err)
      setError(err?.message || 'Failed to load trips')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTrips()
  }, [])

  return (
    <div className="p-4 pb-24 w-full max-w-full overflow-x-hidden box-border">
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-22 font-bold text-navy-900 tracking-tight">Loading Queue</h1>
          <p className="text-12 text-muted mt-0.5">Vehicles ready for departure • Peliyagoda</p>
        </div>
        <button
          onClick={fetchTrips}
          disabled={loading}
          aria-label="Refresh trips"
          className="p-2 text-muted hover:text-navy-900 rounded-8 bg-card border border-border transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      {loading && trips.length === 0 ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-card rounded-12 p-4 border border-border animate-pulse h-36" />
          ))}
        </div>
      ) : error ? (
        <div className="bg-danger/10 border border-danger/20 rounded-12 p-4 text-center my-6">
          <AlertCircle className="mx-auto text-danger mb-2" size={24} />
          <p className="text-14 text-danger font-medium">{error}</p>
          <button
            onClick={fetchTrips}
            className="mt-3 text-12 text-blue-600 font-semibold underline"
          >
            Try Again
          </button>
        </div>
      ) : trips.length === 0 ? (
        <div className="bg-card rounded-12 p-8 border border-border text-center my-6">
          <Truck className="mx-auto text-muted mb-3" size={36} />
          <h3 className="font-semibold text-16 text-navy-900 mb-1">No Trips in Queue</h3>
          <p className="text-13 text-muted">
            All allocated trips have been loaded, or dispatcher has not published today&apos;s plan yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {trips.map(t => (
            <div
              key={t.id}
              className="bg-card rounded-12 p-4 shadow-sm border border-border w-full box-border transition-all hover:border-blue-400"
            >
              <div className="flex justify-between items-start border-b border-border pb-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-17 text-navy-900">{t.vehicle}</h3>
                    {t.vehicleTemp === 'REEFER' && (
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded">
                        REEFER
                      </span>
                    )}
                  </div>
                  <p className="text-11 text-muted mt-0.5">Trip: {t.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-13 font-bold text-navy-900">Departs {t.departure}</p>
                  <span
                    className={`inline-block text-[10px] font-bold px-2 py-0.5 mt-1 rounded uppercase ${
                      t.status === 'LOADING'
                        ? 'bg-warning-surface text-warning-text'
                        : 'bg-surface text-muted'
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-3.5 text-13">
                <span className="font-medium text-navy-900">{t.orders} Stops</span>
                <span className="text-muted font-medium">{t.crates} Crates Estimated</span>
              </div>

              <Link href={`/loader/loading/${t.id}`} className="block w-full">
                <button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-8 py-2.5 font-medium text-14 transition-colors shadow-sm"
                >
                  Start Loading
                </button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
