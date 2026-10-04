'use client'

export function LogoutButton({ className }: { className?: string }) {
  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // Hard refresh to clear all client states and trigger middleware
    window.location.href = '/login'
  }

  return (
    <button onClick={handleLogout} className={className || "text-red-600 font-medium text-sm"}>
      Log Out
    </button>
  )
}
