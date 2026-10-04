'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MapPin, CheckCircle2, Clock } from 'lucide-react'
import { LogoutButton } from '@/components/LogoutButton'

export default function DriverHome() {
  const router = useRouter()
  const [trip, setTrip] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadTrip = () => {
    fetch('/api/driver/trip')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.trip) {
          const formattedTrip = {
            ...data.trip,
            vehicle: data.vehicle || data.trip.vehicle || { id: 'VEH001', type: 'TRUCK' },
            stops: data.stops || data.trip.stops || []
          }
          setTrip(formattedTrip)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => {
    loadTrip()
  }, [])

  const handleStartRoute = async () => {
    if (!trip) return
    try {
      const res = await fetch('/api/driver/trip/start', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: trip.id })
      })
      const data = await res.json()
      if (data.success) {
        setTrip((prev: any) => ({ ...prev, status: 'IN_TRANSIT' }))
      }
    } catch (err) {
      console.error('Failed to start route:', err)
    }
  }

  if (loading) return (
    <div className="p-6 text-slate-800 h-full flex flex-col items-center justify-center">
      <Clock className="w-8 h-8 animate-spin mb-4 text-blue-600" />
      <p>Loading route...</p>
    </div>
  )

  if (!trip) return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="bg-[#0A192F] text-white p-6 pb-8 pt-10 rounded-b-3xl shadow-md">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-12 font-medium tracking-wider text-slate-300 uppercase mb-1">Today's Route</p>
            <h1 className="text-24 font-bold">Waiting for dispatch</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="text-12 font-medium">Online</span>
          </div>
        </div>
      </header>
      
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 mt-[-20px] pb-24">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 w-full max-w-[342px] flex flex-col items-center">
          <MapPin className="w-16 h-16 text-slate-300 mb-4" />
          <h2 className="text-18 font-bold text-slate-800 mb-2">No Active Route</h2>
          <p className="text-14 text-slate-500 mb-6">Your dispatcher has not allocated a route for your vehicle yet today.</p>
          <LogoutButton className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-colors text-14" />
        </div>
      </div>
    </div>
  )

  const totalStops = trip.stops?.length || 0
  const completedStops = trip.stops?.filter((s: any) => s.outcome === 'SUCCESS').length || 0
  const progressPercent = totalStops === 0 ? 0 : Math.round((completedStops / totalStops) * 100)
  
  const nextStop = trip.stops?.find((s: any) => !s.outcome)

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-24">
      {/* Dark Header */}
      <header className="bg-[#0A192F] text-white px-6 pt-10 pb-16">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-10 font-bold tracking-wider text-slate-300 uppercase mb-1">Today's Route</p>
            <h1 className="text-22 font-bold">{trip.districtId || 'Central'} • R-{trip.tripNumber?.toString().substring(0,3) || trip.id.substring(0,3).toUpperCase()}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span className="text-12 font-medium">Online</span>
          </div>
        </div>
      </header>

      <div className="px-4 -mt-10 space-y-4">
        {/* Progress Card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
          <div className="flex-1 mr-4">
            <div className="flex justify-between mb-2">
              <span className="text-14 font-semibold text-slate-600">Route progress</span>
              <span className="text-14 font-bold text-blue-600">{completedStops} of {totalStops} stops</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full w-full mb-3 overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${progressPercent}%` }}></div>
            </div>
            <div className="flex gap-4 text-12 text-slate-500 font-medium">
              <span className="flex items-center gap-1"><Clock size={14} /> 3h 20m left</span>
              <span className="flex items-center gap-1"><MapPin size={14} /> 42.8 km</span>
            </div>
          </div>
          <div className="w-14 h-14 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-16 border-4 border-blue-100 shrink-0">
            {progressPercent}%
          </div>
        </div>

        {/* Next Stop Card */}
        {nextStop ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm border-2 border-blue-600 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-2 h-full bg-blue-600"></div>
            <div className="pl-3">
              <div className="flex justify-between items-center mb-3">
                <span className="bg-blue-600 text-white text-10 font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                  Next • Stop {nextStop.sequence}
                </span>
                <span className="text-12 font-semibold text-slate-500">ETA {new Date(nextStop.plannedEta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
              
              <h2 className="text-18 font-bold text-slate-900 mb-1">{nextStop.order?.outlet?.name || 'Unknown Outlet'}</h2>
              <p className="text-14 text-slate-500 flex items-center gap-1 mb-3">
                <MapPin size={14} /> {nextStop.order?.outlet?.address || 'Address pending'}
              </p>
              
              <div className="flex gap-4 text-12 font-medium text-slate-600 mb-4 bg-slate-50 p-2 rounded-lg inline-flex">
                <span className="flex items-center gap-1">📦 Order #{nextStop.order?.id?.substring(0,6).toUpperCase()}</span>
                <span className="flex items-center gap-1 text-blue-600">❄️ {nextStop.order?.lines?.reduce((acc: number, l: any) => acc + l.quantity, 0)} crates</span>
              </div>
              
              {trip.status === 'IN_TRANSIT' ? (
                <div className="space-y-2 mt-2">
                  <button 
                    onClick={() => router.push(`/driver/stop/${nextStop.id}`)}
                    className="w-full bg-[#1A8245] hover:bg-[#156a38] text-white font-bold py-3.5 rounded-xl transition-colors flex justify-center items-center gap-2"
                  >
                    <CheckCircle2 size={18} /> Confirm order
                  </button>
                  <button className="w-full bg-white border border-red-200 text-red-600 hover:bg-red-50 font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2">
                    <span className="text-16">⚠️</span> Report an issue
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleStartRoute}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-colors mt-2"
                >
                  Start Route
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-18 font-bold text-slate-900 mb-1">Route Complete!</h2>
            <p className="text-14 text-slate-500">You have delivered all orders for this trip.</p>
          </div>
        )}

        {/* Ordered Stops List */}
        <div className="mt-6 pt-4">
          <div className="flex justify-between items-center mb-4 px-1">
            <h3 className="font-bold text-16 text-slate-900">Ordered stops</h3>
            <span className="text-14 font-medium text-slate-500">{totalStops} stops</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2">
            {trip.stops?.map((stop: any, idx: number) => {
              const isPast = stop.outcome === 'SUCCESS'
              const isNext = stop.id === nextStop?.id
              const isFuture = !isPast && !isNext

              return (
                <div key={stop.id} className="relative flex gap-4 p-3">
                  {/* Vertical Line */}
                  {idx !== trip.stops.length - 1 && (
                    <div className="absolute left-7 top-10 bottom-[-10px] w-0.5 bg-slate-200"></div>
                  )}
                  
                  {/* Node */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-14 shrink-0 relative z-10 ${
                    isPast ? 'bg-emerald-100 text-emerald-700' :
                    isNext ? 'bg-blue-600 text-white' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {stop.sequence}
                  </div>
                  
                  {/* Details */}
                  <div className="flex-1 flex justify-between items-start pt-1">
                    <div>
                      <h4 className={`font-bold text-15 ${isFuture ? 'text-slate-600' : 'text-slate-900'}`}>
                        {stop.order?.outlet?.name || 'Unknown Outlet'}
                      </h4>
                      <p className="text-13 text-slate-500">{stop.order?.outlet?.address?.split(',')[0] || 'Pending'} • 1.8 km</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-11 font-bold mb-1 ${
                        isPast ? 'bg-emerald-100 text-emerald-700' :
                        isNext ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {isPast ? 'Delivered' : isNext ? 'Next' : 'Pending'}
                      </span>
                      <p className="text-12 font-medium text-slate-500">
                        {new Date(stop.plannedEta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
