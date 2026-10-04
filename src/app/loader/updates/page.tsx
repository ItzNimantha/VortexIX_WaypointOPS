import { Bell, AlertTriangle, CheckCircle, Info } from 'lucide-react'

export default function LoaderUpdates() {
  const notifications = [
    {
      id: 1,
      title: 'Urgent Task: Reefer Priority',
      desc: 'Reefer breakdown on VEH007 resolved. Prioritize loading replacement VEH012 at Dock 5.',
      time: '10 mins ago',
      type: 'warning'
    },
    {
      id: 2,
      title: 'Wave 1 Plan Published',
      desc: 'Dispatcher has released 3 trips for Peliyagoda morning departure.',
      time: '25 mins ago',
      type: 'info'
    },
    {
      id: 3,
      title: 'Gate 2 Loading Bay Cleared',
      desc: 'Vehicle VEH001 cleared for staging and reverse-order crate loading.',
      time: '45 mins ago',
      type: 'success'
    }
  ]

  return (
    <div className="p-4 pb-24 w-full max-w-full overflow-x-hidden box-border">
      <header className="mb-5">
        <h1 className="text-22 font-bold text-navy-900 tracking-tight">Updates</h1>
        <p className="text-12 text-muted mt-0.5">Depot Operations & Dispatch Alerts</p>
      </header>

      <div className="space-y-3">
        {notifications.map(n => (
          <div
            key={n.id}
            className={`border rounded-12 p-4 shadow-sm w-full box-border ${
              n.type === 'warning'
                ? 'bg-warning-surface/50 border-warning/30'
                : n.type === 'success'
                ? 'bg-success/5 border-success/30'
                : 'bg-card border-border'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {n.type === 'warning' && (
                <AlertTriangle size={18} className="text-warning-text shrink-0 mt-0.5" />
              )}
              {n.type === 'success' && (
                <CheckCircle size={18} className="text-success shrink-0 mt-0.5" />
              )}
              {n.type === 'info' && (
                <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-14 text-navy-900 leading-snug">{n.title}</h2>
                <p className="text-12 text-muted mt-1 leading-relaxed">{n.desc}</p>
                <p className="text-[10px] text-muted font-medium mt-2">{n.time}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
