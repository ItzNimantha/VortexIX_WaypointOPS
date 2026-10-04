import Link from 'next/link'
import { LayoutList, Truck, Bell, User } from 'lucide-react'

export default function LoaderLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[390px] mx-auto overflow-x-hidden min-h-screen flex flex-col bg-surface relative">
      {/* Main Area */}
      <main className="flex-1 pb-20 overflow-y-auto overflow-x-hidden w-full max-w-full min-w-0">
        {children}
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[390px] mx-auto w-full bg-card border-t border-border flex justify-between px-6 py-3 z-50">
        <MobileNavLink href="/loader/queue" icon={<LayoutList size={22} />} label="Queue" />
        <MobileNavLink href="/loader/vehicles" icon={<Truck size={22} />} label="Vehicles" />
        <MobileNavLink href="/loader/updates" icon={<Bell size={22} />} label="Updates" />
        <MobileNavLink href="/loader/profile" icon={<User size={22} />} label="Profile" />
      </nav>
    </div>
  )
}

function MobileNavLink({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center text-muted hover:text-blue-600 transition-colors">
      <span className="w-6 h-6 flex items-center justify-center mb-1">{icon}</span>
      <span className="text-[10px] font-medium">{label}</span>
    </Link>
  )
}
