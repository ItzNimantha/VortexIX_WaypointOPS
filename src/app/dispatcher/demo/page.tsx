'use client'
import { useRouter } from 'next/navigation'

export default function DemoControlsPage() {
  const router = useRouter()

  const handleBreakdown = () => {
    router.push('/dispatcher/breakdown')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-24 font-bold text-navy-900 mb-6">Demo Controls (Admin)</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        <div className="bg-card p-6 rounded-12 border border-border shadow-sm">
          <h2 className="font-bold text-18 mb-2">Simulate Breakdown</h2>
          <p className="text-14 text-muted mb-4">Triggers the Reefer breakdown scenario mid-route for VEH007.</p>
          <button onClick={handleBreakdown} className="bg-danger text-white px-4 py-2 rounded-8 font-medium w-full">
            Trigger Breakdown
          </button>
        </div>

        <div className="bg-card p-6 rounded-12 border border-border shadow-sm">
          <h2 className="font-bold text-18 mb-2">Time Travel (Demo Clock)</h2>
          <p className="text-14 text-muted mb-4">Fast forward past the 4 PM cutoff to lock incoming orders.</p>
          <input type="time" className="w-full border border-border p-2 rounded-8 mb-4" defaultValue="16:01" />
          <button onClick={() => alert('Clock set')} className="bg-blue-600 text-white px-4 py-2 rounded-8 font-medium w-full">
            Set Clock
          </button>
        </div>

        <div className="bg-card p-6 rounded-12 border border-border shadow-sm">
          <h2 className="font-bold text-18 mb-2">Force Driver Offline</h2>
          <p className="text-14 text-muted mb-4">Simulates connection loss for a specific driver.</p>
          <button onClick={() => alert('Driver offline signal sent via socket')} className="bg-warning text-white px-4 py-2 rounded-8 font-medium w-full">
            Disconnect Driver
          </button>
        </div>

        <div className="bg-card p-6 rounded-12 border border-border shadow-sm">
          <h2 className="font-bold text-18 mb-2">Reset State</h2>
          <p className="text-14 text-muted mb-4">Restores the DB to the seeded state for a fresh demo run.</p>
          <button onClick={() => alert('DB Reset')} className="bg-navy-900 text-white px-4 py-2 rounded-8 font-medium w-full">
            Reset to Seed
          </button>
        </div>

      </div>
    </div>
  )
}
