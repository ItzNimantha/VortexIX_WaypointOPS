import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Waypoint OPS',
  description: 'Waypoint Group Dispatch & Delivery Operations',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-surface text-text">
        {children}
      </body>
    </html>
  )
}
