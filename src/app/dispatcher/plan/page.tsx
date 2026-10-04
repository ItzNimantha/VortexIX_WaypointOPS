'use client'

import { useState } from 'react'

export default function PlanAllocatePage() {
  const [trips, setTrips] = useState<any[]>([])
  const [deferrals, setDeferrals] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [planId, setPlanId] = useState<string | null>(null)

  const handleAutoAllocate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dispatch/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depotId: 'DEP_PEL' })
      })
      const data = await res.json()
      setTrips(data.trips || [])
      setDeferrals(data.deferrals || [])
      if (data.planId) setPlanId(data.planId)
    } catch (e) {
      alert('Error running allocation')
    }
    setLoading(false)
  }

  const handlePublish = async () => {
    setPublishing(true)
    try {
      const res = await fetch('/api/dispatch/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
      })
      const data = await res.json()
      if (data.success) {
        setPublished(true)
      } else {
        alert('Error publishing plan')
      }
    } catch (e) {
      alert('Error publishing plan')
    }
    setPublishing(false)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto pb-24">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-24 font-bold text-navy-900">02 Plan & Allocate</h1>
          <p className="text-muted">Assign orders to vehicles and resolve constraints.</p>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={handleAutoAllocate}
            disabled={loading}
            className="bg-surface text-navy-900 border border-border px-6 py-2 rounded-8 font-medium disabled:opacity-50"
          >
            {loading ? 'Running Engine...' : 'Auto-Allocate'}
          </button>
          <button 
            onClick={handlePublish}
            disabled={trips.length === 0 || published}
            className="bg-blue-600 text-white px-6 py-2 rounded-8 font-medium disabled:opacity-50"
          >
            {published ? 'Published' : 'Publish Plan'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="md:col-span-3 space-y-6">
          {trips.length === 0 && !loading && (
            <div className="text-center p-12 bg-card rounded-12 border border-border border-dashed">
              <p className="text-muted mb-4">No trips planned yet.</p>
              <button onClick={handleAutoAllocate} className="text-blue-600 font-medium hover:underline">
                Run Auto-Allocator
              </button>
            </div>
          )}
          
          {trips.map((trip, i) => (
            <div key={i} className="bg-card rounded-12 border border-border shadow-sm p-4">
              <div className="flex justify-between items-center mb-4 pb-4 border-b border-border">
                <div>
                  <h3 className="font-bold text-16 text-navy-900">{trip.vehicleId} • Trip {trip.tripNumber}</h3>
                  <p className="text-12 text-muted">{trip.brand} • {trip.districtId}</p>
                </div>
                <div className="text-right">
                  <p className="text-14 font-medium text-navy-900">{trip.orders.length} stops</p>
                  <p className="text-12 text-success font-bold">Feasible</p>
                </div>
              </div>
              <div className="space-y-2">
                {trip.orders.map((o: any) => (
                  <div key={o.id} className="flex justify-between p-2 bg-surface rounded-8 text-14">
                    <span>Order {o.id.slice(0, 8)}</span>
                    <span className="text-muted">{o.totalVolumeM3.toFixed(2)} m³</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="md:col-span-1">
          <div className="bg-card rounded-12 border border-border shadow-sm p-4 sticky top-6">
            <h3 className="font-bold text-navy-900 mb-4">Deferrals ({deferrals.length})</h3>
            {deferrals.length === 0 ? (
              <p className="text-12 text-muted">All orders fit in the plan.</p>
            ) : (
              <ul className="space-y-3">
                {deferrals.map((d: any, i) => (
                  <li key={i} className="bg-warning-surface text-warning-text p-3 rounded-8 text-12">
                    <span className="font-bold block mb-1">Order {d.orderId.slice(0, 8)}</span>
                    {d.reason}
                  </li>
                ))}
              </ul>
            )}
            {deferrals.length > 0 && (
              <button className="w-full mt-4 bg-surface border border-border text-navy-900 py-2 rounded-8 font-medium text-14">
                Review Deferrals
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
