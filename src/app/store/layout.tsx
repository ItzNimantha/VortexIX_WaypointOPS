import Link from 'next/link'
import { Home, PlusSquare, List, Bell, User } from 'lucide-react'
import { LogoutButton } from '@/components/LogoutButton'

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col max-w-[390px] mx-auto relative md:max-w-none md:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-card border-r border-border h-screen sticky top-0">
        <div className="p-6">
          <h1 className="text-20 font-bold text-navy-900">Waypoint OPS</h1>
          <p className="text-12 text-muted">Store Manager</p>
        </div>
        <nav className="flex-1 px-4 space-y-2 flex flex-col">
          <div className="space-y-2">
            <NavLink href="/store" icon={<Home />} label="Home" />
            <NavLink href="/store/new-order" icon={<PlusSquare />} label="New Order" />
            <NavLink href="/store/orders" icon={<List />} label="Orders" />
            <NavLink href="/store/updates" icon={<Bell />} label="Updates" />
            <NavLink href="/store/profile" icon={<User />} label="Profile" />
          </div>
          <div className="mt-auto pt-8">
            <LogoutButton className="flex items-center w-full space-x-3 p-3 rounded-12 text-red-600 hover:bg-red-50 transition-colors text-14" />
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto min-h-screen">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full max-w-[390px] bg-card border-t border-border flex justify-between px-6 py-3 z-50">
        <MobileNavLink href="/store" icon={<Home />} label="Home" />
        <MobileNavLink href="/store/new-order" icon={<PlusSquare />} label="Order" />
        <MobileNavLink href="/store/orders" icon={<List />} label="Orders" />
        <MobileNavLink href="/store/updates" icon={<Bell />} label="Updates" />
      </nav>
    </div>
  )
}

function NavLink({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <Link href={href} className="flex items-center space-x-3 p-3 rounded-12 text-text hover:bg-blue-100 hover:text-blue-600 transition-colors">
      <span className="w-5 h-5">{icon}</span>
      <span className="font-medium text-14">{label}</span>
    </Link>
  )
}

function MobileNavLink({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center text-muted hover:text-blue-600">
      <span className="w-6 h-6 mb-1">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}
