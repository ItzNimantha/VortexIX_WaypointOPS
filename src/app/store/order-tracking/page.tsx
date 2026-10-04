'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function OrderTrackingPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/store/orders')
      .then(res => res.json())
      .then(data => {
        if (data.orders) {
          setOrders(data.orders)
        }
        setLoading(false)
      })
  }, [])

  if (loading) return <div className="p-4">Loading orders...</div>

  return (
    <div className="max-w-[390px] mx-auto min-h-screen bg-gray-50 flex flex-col relative">
      <header className="px-4 py-4 bg-white border-b sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/store" className="text-gray-500 font-medium">← Back</Link>
          <h1 className="text-lg font-semibold">Track Orders</h1>
        </div>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {orders.length === 0 ? (
          <p className="text-center text-gray-500 mt-8">No orders found.</p>
        ) : (
          orders.map((order: any) => (
            <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border">
              <div className="flex justify-between items-center mb-1">
                <h2 className="font-semibold text-lg">{order.id.substring(0,8).toUpperCase()}</h2>
                <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                  order.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                  order.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {order.status}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-4">Date: {new Date(order.targetDate).toLocaleDateString()}</p>
              
              <div className="flex gap-2">
                <Link href={`/store/updates?orderId=${order.id}`} className="flex-1 bg-gray-100 text-gray-800 text-center py-2 rounded-lg text-sm font-medium">
                  History
                </Link>
                {order.status === 'DELIVERED' && (
                  <Link href={`/store/confirm-receipt?orderId=${order.id}`} className="flex-1 bg-blue-600 text-white text-center py-2 rounded-lg text-sm font-medium">
                    Confirm Receipt
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  )
}
