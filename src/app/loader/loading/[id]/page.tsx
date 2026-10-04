'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ArrowLeft, AlertCircle, RefreshCw } from 'lucide-react'

interface StopItem {
  id: string
  sequence: number
  loadSequence: number
  outlet: string
  outletId?: string | null
  dockType?: string
  crates: number
  plannedEta?: string
  orderId?: string | null
}

interface TripDetails {
  id: string
  vehicleId?: string | null
  vehicle?: any
  vehicleType?: string
  vehicleTemp?: string
  brand?: string
  totalCrates: number
  status: string
}

export default function VehicleLoadingPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [trip, setTrip] = useState<TripDetails | null>(null)
  const [stops, setStops] = useState<StopItem[]>([])
  const [loadedCrates, setLoadedCrates] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [shortfall, setShortfall] = useState<{
    stopId: number
    outlet: string
    qty: number
    reason: string
  } | null>(null)

  const [savingIssue, setSavingIssue] = useState(false)
  const [planChanged, setPlanChanged] = useState(false)

  const fetchTripDetails = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/loader/trips/${params.id}`)
      if (!res.ok) {
        throw new Error(`Failed to load trip details (${res.status})`)
      }
      const data = await res.json()
      if (data.trip && data.stops) {
        setTrip(data.trip)
        setStops(data.stops)

        // Initialize loaded crates: preserve existing or default to 0
        setLoadedCrates(prev => {
          const next = { ...prev }
          for (const s of data.stops) {
            if (next[s.sequence] === undefined) {
              next[s.sequence] = 0
            }
          }
          return next
        })
      }
    } catch (err: any) {
      console.error('Error loading trip:', err)
      setError(err?.message || 'Failed to fetch trip data')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchTripDetails()
  }, [fetchTripDetails])

  // Save loading state to backend whenever crates update
  const persistLoadedCrates = async (cratesMap: Record<number, number>) => {
    try {
      await fetch(`/api/loader/trips/${params.id}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadedCrates: cratesMap })
      })
    } catch (err) {
      console.warn('Failed to background-sync crate count:', err)
    }
  }

  const handleIncrement = (sequence: number, maxCrates: number) => {
    setLoadedCrates(prev => {
      const current = prev[sequence] || 0
      const updated = Math.min(maxCrates, current + 1)
      const nextMap = { ...prev, [sequence]: updated }
      persistLoadedCrates(nextMap)
      return nextMap
    })
  }

  const handleLoadAll = (sequence: number, maxCrates: number) => {
    setLoadedCrates(prev => {
      const nextMap = { ...prev, [sequence]: maxCrates }
      persistLoadedCrates(nextMap)
      return nextMap
    })
  }

  const handleFlagIssue = async () => {
    if (!shortfall) return
    setSavingIssue(true)
    try {
      await fetch(`/api/loader/trips/${params.id}/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shortfall: {
            stopId: shortfall.stopId,
            qty: shortfall.qty,
            reason: shortfall.reason || 'Missing or damaged item'
          }
        })
      })
      alert('Shortfall recorded! Dispatcher alerted immediately. Departure paused.')
      setShortfall(null)
    } catch (err) {
      console.error('Error reporting shortfall:', err)
      alert('Failed to report shortfall. Please try again.')
    } finally {
      setSavingIssue(false)
    }
  }

  const allLoaded =
    stops.length > 0 &&
    stops.every(s => (loadedCrates[s.sequence] || 0) >= s.crates)

  const handleProceed = async () => {
    if (!allLoaded) return
    try {
      await persistLoadedCrates(loadedCrates)
    } finally {
      router.push(`/loader/sign-off/${params.id}`)
    }
  }

  if (loading && stops.length === 0) {
    return (
      <div className="p-4 pb-36 w-full max-w-full overflow-x-hidden box-border flex flex-col items-center justify-center min-h-[50vh]">
        <RefreshCw className="animate-spin text-blue-600 mb-3" size={28} />
        <p className="text-14 text-muted font-medium">Loading vehicle manifest...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 pb-36 w-full max-w-full overflow-x-hidden box-border">
        <div className="bg-danger/10 border border-danger/20 rounded-12 p-5 text-center my-6">
          <AlertCircle className="mx-auto text-danger mb-2" size={28} />
          <p className="text-14 text-danger font-medium mb-3">{error}</p>
          <button
            onClick={fetchTripDetails}
            className="text-12 text-blue-600 font-semibold underline"
          >
            Retry Loading
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pb-36 w-full max-w-full overflow-x-hidden box-border relative">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <button
          onClick={() => router.back()}
          aria-label="Back to queue"
          className="p-2 bg-card border border-border rounded-full hover:bg-surface transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-19 font-bold text-navy-900 truncate">
            Load: {trip?.vehicle?.id || trip?.vehicleId || params.id}
          </h1>
          <p className="text-11 text-muted">Trip ID: {params.id}</p>
        </div>
      </div>

      {planChanged && (
        <div className="bg-warning-surface text-warning-text p-3.5 rounded-12 mb-4 flex items-start gap-2.5 border border-warning/20">
          <AlertTriangle className="shrink-0 mt-0.5" size={18} />
          <div className="text-13">
            <p className="font-bold">Plan Changed!</p>
            <p className="text-12 mt-0.5">Dispatcher updated the route manifest.</p>
            <button
              className="mt-1.5 text-11 font-bold underline"
              onClick={() => {
                setPlanChanged(false)
                fetchTripDetails()
              }}
            >
              Refresh Checklist
            </button>
          </div>
        </div>
      )}

      {/* Reverse Loading Notice */}
      <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-12 mb-4 text-12 font-medium flex gap-2.5 items-start">
        <Check size={18} className="shrink-0 text-blue-600 mt-0.5" />
        <p className="leading-snug">
          <strong>REVERSE LOAD SEQUENCE:</strong> The final delivery stop is loaded first into the rear of the vehicle.
        </p>
      </div>

      {/* Stops Checklist (Reverse Ordered) */}
      <div className="space-y-3.5">
        {stops.map(stop => {
          const loaded = loadedCrates[stop.sequence] || 0
          const isComplete = loaded >= stop.crates

          return (
            <div
              key={stop.sequence}
              className={`bg-card rounded-12 p-3.5 border transition-all ${
                isComplete ? 'border-success/40 bg-success/5' : 'border-border shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start mb-3 border-b border-border pb-2.5">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] font-bold text-blue-600 uppercase bg-blue-50 px-1.5 py-0.5 rounded">
                    Load Step {stop.loadSequence}
                  </span>
                  <h3 className="font-bold text-15 text-navy-900 mt-1 truncate">
                    Stop {stop.sequence}: {stop.outlet}
                  </h3>
                  {stop.dockType && (
                    <span className="text-[10px] text-muted">Dock: {stop.dockType}</span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-20 font-black text-navy-900 leading-tight">
                    {loaded} / {stop.crates}
                  </p>
                  <p className="text-[10px] text-muted uppercase font-semibold">Crates</p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleIncrement(stop.sequence, stop.crates)}
                  disabled={isComplete}
                  className="flex-1 bg-surface hover:bg-slate-200 text-navy-900 font-medium py-2 rounded-8 text-13 disabled:opacity-40 transition-colors border border-border"
                >
                  +1 Crate
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadAll(stop.sequence, stop.crates)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-8 text-13 transition-colors shadow-sm"
                >
                  Load All
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShortfall({
                    stopId: stop.sequence,
                    outlet: stop.outlet,
                    qty: 1,
                    reason: ''
                  })
                }
                className="mt-2 text-11 text-danger font-medium hover:underline flex items-center justify-center w-full py-1"
              >
                Flag Missing or Damaged Item
              </button>
            </div>
          )
        })}
      </div>

      {/* Shortfall Modal strictly bounded to 342px */}
      {shortfall && (
        <div className="fixed inset-0 bg-navy-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
          <div className="bg-card rounded-16 p-5 w-full max-w-[342px] mx-auto border border-border shadow-xl box-border">
            <h3 className="font-bold text-16 text-navy-900 mb-1">Report Shortfall</h3>
            <p className="text-12 text-muted mb-3 leading-snug">
              Stop {shortfall.stopId} ({shortfall.outlet}). Pauses vehicle departure and notifies dispatcher.
            </p>

            <label className="block text-11 font-medium text-navy-900 mb-1">
              Quantity Shortfall
            </label>
            <input
              type="number"
              min={1}
              value={shortfall.qty}
              onChange={e =>
                setShortfall(prev => prev && { ...prev, qty: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="w-full border border-border rounded-8 p-2 text-13 mb-3 bg-surface"
            />

            <label className="block text-11 font-medium text-navy-900 mb-1">
              Reason / Damaged Item Note
            </label>
            <textarea
              className="w-full border border-border rounded-8 p-2.5 text-13 mb-4 bg-surface"
              placeholder="e.g., 1 carton crushed during warehouse staging"
              rows={3}
              value={shortfall.reason}
              onChange={e =>
                setShortfall(prev => prev && { ...prev, reason: e.target.value })
              }
            />

            <div className="flex gap-2">
              <button
                type="button"
                disabled={savingIssue}
                onClick={() => setShortfall(null)}
                className="flex-1 bg-surface hover:bg-slate-200 py-2 rounded-8 font-medium text-13 border border-border text-navy-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingIssue}
                onClick={handleFlagIssue}
                className="flex-1 bg-danger hover:bg-danger/90 text-white py-2 rounded-8 font-medium text-13 transition-colors shadow-sm disabled:opacity-50"
              >
                {savingIssue ? 'Reporting...' : 'Report Issue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Action Bar: Constrained to 390px, Zero Horizontal Overflow */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto z-[60] bg-card/95 backdrop-blur-sm border-t border-border p-4 pb-6 box-border">
        <button
          type="button"
          disabled={!allLoaded}
          onClick={handleProceed}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] rounded-12 font-medium text-14 disabled:opacity-40 transition-colors shadow-sm"
        >
          Proceed to Driver Sign-off
        </button>
      </div>
    </div>
  )
}
