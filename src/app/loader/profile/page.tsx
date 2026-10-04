import { User, MapPin, BadgeCheck, LogOut } from 'lucide-react'
import { LogoutButton } from '@/components/LogoutButton'

export default function LoaderProfile() {
  return (
    <div className="p-4 pb-24 w-full max-w-full overflow-x-hidden box-border">
      <header className="mb-5">
        <h1 className="text-22 font-bold text-navy-900 tracking-tight">Profile</h1>
        <p className="text-12 text-muted mt-0.5">Loader Operator Details</p>
      </header>

      <div className="bg-card border border-border rounded-12 p-4 shadow-sm mb-4">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-16">
            LO
          </div>
          <div>
            <h2 className="font-bold text-16 text-navy-900">Peliyagoda Loader</h2>
            <p className="text-12 text-muted">loader@waypoint.com</p>
          </div>
        </div>

        <div className="space-y-2.5 text-13">
          <div className="flex items-center justify-between py-1">
            <span className="text-muted flex items-center gap-2">
              <BadgeCheck size={16} className="text-blue-600" /> Role
            </span>
            <span className="font-semibold text-navy-900">LOADER</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted flex items-center gap-2">
              <MapPin size={16} className="text-blue-600" /> Assigned Depot
            </span>
            <span className="font-semibold text-navy-900">Peliyagoda (DEP_PEL)</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-muted flex items-center gap-2">
              <User size={16} className="text-blue-600" /> Operator ID
            </span>
            <span className="font-semibold text-navy-900">OPR-PEL-04</span>
          </div>
        </div>
      </div>

      <LogoutButton className="w-full bg-surface hover:bg-slate-200 text-danger border border-border font-medium py-2.5 rounded-12 text-14 flex items-center justify-center gap-2 transition-colors" />
    </div>
  )
}
