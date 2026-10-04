'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Package, Truck, CheckCircle2, Clock, AlertTriangle } from 'lucide-react'

export default function StoreOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/store/orders')
      .then(res => res.json())
      .then(data => {
        setOrders(data.orders || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-4 text-12 font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            DELIVERED
          </span>
        )
      case 'IN_TRANSIT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-4 text-12 font-semibold bg-amber-100 text-amber-800">
            <Truck className="w-3.5 h-3.5 text-amber-600" />
            IN_TRANSIT
          </span>
        )
      case 'LOADING':
      case 'LOADED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-4 text-12 font-semibold bg-indigo-100 text-indigo-800">
            <Package className="w-3.5 h-3.5 text-indigo-600" />
            {status}
          </span>
        )
      case 'PLANNED':
      case 'CONFIRMED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-4 text-12 font-semibold bg-blue-100 text-blue-800">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            {status}
          </span>
        )
      case 'DEFERRED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-4 text-12 font-semibold bg-orange-100 text-orange-800">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
            DEFERRED
          </span>
        )
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-4 text-12 font-semibold bg-gray-100 text-gray-800">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
            {status || 'PENDING'}
          </span>
        )
    }
  }

  if (loading) return <div className="p-6 text-center text-muted">Loading orders...</div>

  return (
    <div className="p-4 md:p-6 pb-24 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-20 font-bold text-navy-900">Store Orders</h1>
          <p className="text-12 text-muted">Track order status from Dispatch to Delivery</p>
        </div>
        <Link 
          href="/store/new-order" 
          className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-8 text-14 font-medium"
        >
          + New Order
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="text-center p-8 bg-surface rounded-12 border border-border">
          <Package className="w-10 h-10 text-muted mx-auto mb-2 opacity-50" />
          <p className="text-muted text-14 font-medium">No recent orders found.</p>
          <p className="text-muted text-12 mt-1">Place an order to start the fulfillment workflow.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const itemCount = order.lines?.reduce((sum: number, l: any) => sum + l.quantity, 0) || order.lines?.length || 0
            const isDelivered = order.status === 'DELIVERED'

            return (
              <div key={order.id} className="bg-card p-4 rounded-12 border border-border shadow-sm hover:border-blue-300 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-16 text-navy-900">Order {order.id.slice(0, 8)}</h3>
                    <p className="text-12 text-muted">
                      Target Delivery: {new Date(order.targetDate).toLocaleDateString()}
                    </p>
                  </div>
                  {getStatusBadge(order.status)}
                </div>

                <div className="mt-3 pt-3 border-t border-border flex justify-between items-center text-12 text-muted">
                  <span>
                    {itemCount} units • {order.isChilled ? 'Chilled Reefer' : 'Ambient Dry'}
                  </span>
                  
                  {isDelivered && (
                    <Link 
                      href={`/store/confirm-receipt?orderId=${order.id}`}
                      className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                    >
                      Confirm Receipt →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
