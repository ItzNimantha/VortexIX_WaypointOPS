'use client'
import { useState } from 'react'
import { AlertOctagon, Snowflake, Clock, Check, X, BellRing } from 'lucide-react'

export default function ReeferBreakdownPage() {
  const [reassigning, setReassigning] = useState(false)
  const [done, setDone] = useState(false)

  const handleReassign = () => {
    setReassigning(true)
    setTimeout(() => {
      setReassigning(false)
      setDone(true)
      alert("Reassigned! 3 Notifications fired. Loader task created. Store ETA updated.")
    }, 1500)
  }

  if (done) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-screen text-center">
        <Check className="text-success mb-4" size={64} />
        <h1 className="text-24 font-bold text-navy-900 mb-2">Emergency Handled</h1>
        <p className="text-muted">Vehicle reassigned. Driver, Loader, and Store Manager have been notified.</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      
      {/* Emergency Banner */}
      <div className="bg-danger-surface border border-danger p-6 rounded-16 mb-6 relative overflow-hidden">
        <div className="flex items-start gap-4 relative z-10">
          <div className="bg-danger p-3 rounded-full text-white">
            <AlertOctagon size={32} />
          </div>
          <div>
            <h1 className="text-24 font-black text-danger">EMERGENCY: Reefer Breakdown</h1>
            <p className="text-16 font-bold text-danger">Vehicle VEH007 reported cooling failure at 05:42 AM.</p>
            <div className="flex gap-6 mt-4">
              <div className="bg-white/80 p-3 rounded-8">
                <p className="text-12 text-muted uppercase font-bold">Chamber Temp</p>
                <p className="text-24 font-black text-navy-900 flex items-center gap-2">
                  <Snowflake size={20} className="text-blue-600"/> 12°C <span className="text-14 text-danger">↑</span>
                </p>
              </div>
              <div className="bg-white/80 p-3 rounded-8">
                <p className="text-12 text-muted uppercase font-bold">Time to Spoilage</p>
                <p className="text-24 font-black text-danger flex items-center gap-2">
                  <Clock size={20}/> 45 mins
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="font-bold text-18 text-navy-900 mb-4">Stops at Risk (3)</h2>
      <div className="bg-card rounded-12 p-4 border border-border mb-6">
        <p className="font-medium">OUT001 • OUT002 • OUT003</p>
        <p className="text-muted text-14">Total Volume: 4.5 m³ | All Chilled</p>
      </div>

      <h2 className="font-bold text-18 text-navy-900 mb-4">Replacement Options</h2>
      <div className="space-y-4 mb-6">
        
        {/* Option 1: Pass */}
        <div className="bg-success-surface border-2 border-success p-4 rounded-12 flex justify-between items-center cursor-pointer">
          <div>
            <h3 className="font-bold text-18 flex items-center gap-2">
              <Check className="text-success" /> VEH012 (Reefer Truck)
            </h3>
            <p className="text-14 font-medium mt-1">Available at Depot • ETA to broken vehicle: 22 mins</p>
            <div className="flex gap-2 mt-2">
              <span className="bg-success/20 text-success px-2 py-1 rounded-4 text-12 font-bold">Capacity OK</span>
              <span className="bg-success/20 text-success px-2 py-1 rounded-4 text-12 font-bold">Reefer OK</span>
              <span className="bg-success/20 text-success px-2 py-1 rounded-4 text-12 font-bold">Window OK (Margin 15m)</span>
            </div>
          </div>
          <div className="w-6 h-6 rounded-full border-4 border-success bg-white"></div>
        </div>

        {/* Option 2: Fail Capacity */}
        <div className="bg-card border border-border p-4 rounded-12 opacity-60">
          <h3 className="font-bold text-18 text-muted flex items-center gap-2">
            <X className="text-danger" /> VEH022 (Reefer Van)
          </h3>
          <p className="text-14 font-medium mt-1">Available at Depot</p>
          <div className="flex gap-2 mt-2">
            <span className="bg-danger-surface text-danger px-2 py-1 rounded-4 text-12 font-bold">Capacity FAIL (Exceeds by 2.1 m³)</span>
            <span className="bg-success/20 text-success px-2 py-1 rounded-4 text-12 font-bold">Reefer OK</span>
          </div>
        </div>

        {/* Option 3: Fail Temp */}
        <div className="bg-card border border-border p-4 rounded-12 opacity-60">
          <h3 className="font-bold text-18 text-muted flex items-center gap-2">
            <X className="text-danger" /> VEH005 (Dry Truck)
          </h3>
          <p className="text-14 font-medium mt-1">Available at Depot</p>
          <div className="flex gap-2 mt-2">
            <span className="bg-success/20 text-success px-2 py-1 rounded-4 text-12 font-bold">Capacity OK</span>
            <span className="bg-danger-surface text-danger px-2 py-1 rounded-4 text-12 font-bold">Temp FAIL (Ambient vs Chilled)</span>
          </div>
        </div>
      </div>

      <button 
        onClick={handleReassign}
        disabled={reassigning}
        className="w-full bg-blue-600 text-white min-h-[56px] rounded-12 font-bold text-16 flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <BellRing /> {reassigning ? 'Reassigning & Notifying...' : 'Reassign to VEH012 & Notify Everyone'}
      </button>

    </div>
  )
}
