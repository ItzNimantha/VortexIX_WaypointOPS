import Link from 'next/link'
import { LayoutDashboard, Truck, CalendarX, Activity, ClipboardCheck } from 'lucide-react'
import { LogoutButton } from '@/components/LogoutButton'

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-card border-r border-border md:h-screen sticky top-0 z-50">
        <div className="p-6">
          <h1 className="text-20 font-bold text-navy-900">Waypoint OPS</h1>
          <p className="text-12 text-muted">Dispatcher • Desktop</p>
          
          <div className="mt-4 border border-border rounded-8 p-2 bg-surface">
            <select className="w-full bg-transparent text-14 font-medium outline-none">
              <option value="DEP_PEL">Peliyagoda Depot</option>
              <option value="DEP_KAN">Kandy Depot</option>
            </select>
          </div>
        </div>
        <nav className="px-4 space-y-2 pb-6 hidden md:flex md:flex-col md:h-full">
          <div className="space-y-2">
            <NavLink href="/dispatcher/queue" icon={<LayoutDashboard />} label="01 Order Queue" />
            <NavLink href="/dispatcher/plan" icon={<Truck />} label="02 Plan & Allocate" />
            <NavLink href="/dispatcher/deferrals" icon={<CalendarX />} label="03 Deferrals" />
            <NavLink href="/dispatcher/monitor" icon={<Activity />} label="04a Live Monitor" />
            <NavLink href="/dispatcher/readiness" icon={<ClipboardCheck />} label="04b Readiness" />
            <NavLink href="/dispatcher/demo" icon={<Activity />} label="Demo Controls" />
          </div>
          <div className="mt-auto pt-8 pb-4">
            <LogoutButton className="flex w-full items-center space-x-3 p-3 rounded-12 text-danger hover:bg-red-50 hover:text-red-700 transition-colors font-medium text-14" />
          </div>
        </nav>
      </aside>

      <main className="flex-1 overflow-x-hidden overflow-y-auto">
        {children}
      </main>
    </div>
  )
}

function NavLink({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <Link href={href} className="flex items-center space-x-3 p-3 rounded-12 text-text hover:bg-blue-100 hover:text-blue-600 transition-colors font-medium text-14">
      <span className="w-5 h-5">{icon}</span>
      <span>{label}</span>
    </Link>
  )
}
