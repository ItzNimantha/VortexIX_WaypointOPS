import { CheckCircle2, Package, Truck, AlertTriangle } from 'lucide-react'

export default function LoaderSummary() {
  const stats = [
    { label: 'Crates Staged & Loaded', value: '43', icon: <Package size={18} className="text-blue-600" /> },
    { label: 'Vehicles Dispatched', value: '2', icon: <Truck size={18} className="text-success" /> },
    { label: 'Shortfall Flags Raised', value: '0', icon: <AlertTriangle size={18} className="text-amber-500" /> }
  ]

  return (
    <div className="p-4 pb-24 w-full max-w-full overflow-x-hidden box-border">
      <header className="mb-5">
        <h1 className="text-22 font-bold text-navy-900 tracking-tight">Shift Summary</h1>
        <p className="text-12 text-muted mt-0.5">Loader Shift Log • Peliyagoda</p>
      </header>

      <div className="grid grid-cols-1 gap-3 mb-5">
        {stats.map((s, i) => (
          <div
            key={i}
            className="bg-card border border-border rounded-12 p-4 shadow-sm flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-surface rounded-8">{s.icon}</div>
              <span className="text-13 font-medium text-navy-900">{s.label}</span>
            </div>
            <span className="text-20 font-bold text-navy-900">{s.value}</span>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-12 p-4 shadow-sm">
        <h2 className="font-semibold text-15 text-navy-900 mb-2 flex items-center gap-2">
          <CheckCircle2 size={16} className="text-success" />
          Shift Status: Active
        </h2>
        <p className="text-12 text-muted leading-relaxed">
          Staging and reverse loading operations for morning dispatch wave are ongoing. Follow cold-chain protocols for all reefer units.
        </p>
      </div>
    </div>
  )
}
