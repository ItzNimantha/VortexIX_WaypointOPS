'use client'

import { useState, useEffect } from 'react'

export default function StoreHome() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // 4 PM cutoff logic (demo clock just uses system time for simplicity)
  const cutoff = new Date(now)
  cutoff.setHours(16, 0, 0, 0)
  if (now > cutoff) {
    cutoff.setDate(cutoff.getDate() + 1)
  }
  
  const diffMs = cutoff.getTime() - now.getTime()
  const hoursLeft = Math.floor(diffMs / (1000 * 60 * 60))
  const minsLeft = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  return (
    <div className="p-4 md:p-6 pb-24">
      <header className="mb-6">
        <h1 className="text-24 font-bold text-navy-900">Today</h1>
        <p className="text-muted">Welcome back, Store Manager</p>
      </header>

      <div className="bg-navy-900 text-white rounded-16 p-6 mb-6 shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <p className="text-muted-on-navy font-medium mb-1">Order Cutoff for Tomorrow</p>
          <div className="text-32 font-bold flex items-baseline gap-2">
            <span>{hoursLeft}h {minsLeft}m</span>
          </div>
          <p className="text-12 text-muted-on-navy mt-2">Closes at 4:00 PM daily</p>
        </div>
        {/* Decorative circle */}
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-navy-800 opacity-50"></div>
      </div>

      <h2 className="text-18 font-bold mb-4">Next Arrival</h2>
      <div className="bg-card rounded-12 p-4 border border-border shadow-sm flex items-center justify-between">
        <div>
          <p className="font-bold text-navy-900">No active deliveries</p>
          <p className="text-12 text-muted mt-1">Check back once dispatcher plans routes.</p>
        </div>
      </div>
    </div>
  )
}
