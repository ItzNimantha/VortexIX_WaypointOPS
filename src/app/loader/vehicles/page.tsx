import { Truck, Thermometer, CheckCircle2 } from 'lucide-react'

export default function LoaderVehicles() {
  const fleet = [
    { id: 'VEH001', type: 'TRUCK', temp: 'REEFER', cap: '35 m³', status: 'LOADING', dock: 'Dock 4' },
    { id: 'VEH002', type: 'TRUCK', temp: 'REEFER', cap: '25 m³', status: 'AVAILABLE', dock: 'Dock 2' },
    { id: 'VEH003', type: 'VAN', temp: 'AMBIENT', cap: '15 m³', status: 'AVAILABLE', dock: 'Dock 1' },
    { id: 'VEH012', type: 'TRUCK', temp: 'REEFER', cap: '28 m³', status: 'LOADING', dock: 'Dock 5' }
  ]

  return (
    <div className="p-4 pb-24 w-full max-w-full overflow-x-hidden box-border">
      <header className="mb-5">
        <h1 className="text-22 font-bold text-navy-900 tracking-tight">Depot Fleet</h1>
        <p className="text-12 text-muted mt-0.5">Peliyagoda Vehicle Bay Status</p>
      </header>

      <div className="space-y-3">
        {fleet.map(v => (
          <div
            key={v.id}
            className="bg-card border border-border rounded-12 p-4 shadow-sm w-full box-border"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Truck size={18} className="text-blue-600" />
                <h2 className="font-bold text-16 text-navy-900">{v.id}</h2>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  v.temp === 'REEFER'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {v.temp}
              </span>
            </div>

            <div className="flex justify-between items-center text-12 text-muted mt-2 pt-2 border-t border-border">
              <span>{v.dock} • Capacity {v.cap}</span>
              <span
                className={`font-semibold ${
                  v.status === 'LOADING' ? 'text-amber-600' : 'text-success'
                }`}
              >
                {v.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
