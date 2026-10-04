'use client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, Suspense } from 'react'
import { CheckCircle2, PackageCheck } from 'lucide-react'

function ConfirmReceiptContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialOrderId = searchParams.get('orderId')
  
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId)
  const [order, setOrder] = useState<any>(null)
  const [deliveredOrders, setDeliveredOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})

  // Fetch orders or specified order
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const ordersRes = await fetch('/api/store/orders')
        const ordersData = await ordersRes.json()
        const ordersList: any[] = ordersData.orders || []
        
        // Find delivered orders
        const delivered = ordersList.filter(o => o.status === 'DELIVERED')
        setDeliveredOrders(delivered)

        const activeId = initialOrderId || (delivered.length > 0 ? delivered[0].id : null)
        setSelectedOrderId(activeId)

        if (activeId) {
          const orderRes = await fetch(`/api/store/orders/${activeId}/confirm-receipt`)
          if (orderRes.ok) {
            const data = await orderRes.json()
            setOrder(data.order)
          } else {
            // Fallback to finding in ordersList
            const found = ordersList.find(o => o.id === activeId)
            setOrder(found || null)
          }
        } else {
          setOrder(null)
        }
      } catch (err) {
        console.error('Error loading orders:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [initialOrderId])

  const handleSelectOrder = async (orderId: string) => {
    setSelectedOrderId(orderId)
    setError(null)
    setConfirmed(false)
    setLoading(true)
    try {
      const res = await fetch(`/api/store/orders/${orderId}/confirm-receipt`)
      if (res.ok) {
        const data = await res.json()
        setOrder(data.order)
      } else {
        const found = deliveredOrders.find(o => o.id === orderId)
        setOrder(found || null)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmAll = async () => {
    if (!selectedOrderId) return
    setError(null)
    try {
      const res = await fetch(`/api/store/orders/${selectedOrderId}/confirm-receipt`, {
        method: 'POST'
      })
      if (res.ok) {
        setConfirmed(true)
        setError(null)
        setTimeout(() => {
          router.push('/store/orders')
        }, 1200)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Failed to confirm receipt: Order must be DELIVERED')
      }
    } catch (err: any) {
      console.error('Error confirming receipt:', err)
      setError(err.message || 'An unexpected network error occurred')
    }
  }

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) return <div className="p-6 text-center text-muted">Loading orders...</div>

  return (
    <div className="max-w-[420px] mx-auto min-h-screen bg-gray-50 flex flex-col relative pb-32">
      <header className="px-4 py-4 bg-white border-b sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/store/orders" className="text-gray-500 hover:text-gray-800">←</Link>
          <h1 className="text-lg font-semibold">Confirm Receipt</h1>
        </div>
        {selectedOrderId && (
          <Link href={`/store/report-issue?orderId=${selectedOrderId}`} className="text-red-600 text-sm font-medium">
            Report Issue
          </Link>
        )}
      </header>

      <main className="flex-1 p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-8 text-red-700 text-sm font-medium flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold ml-2">×</button>
          </div>
        )}

        {confirmed && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-12 flex items-center gap-3 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-sm">Receipt Confirmed!</p>
              <p className="text-xs">Order verified and marked received.</p>
            </div>
          </div>
        )}

        {deliveredOrders.length > 1 && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase">Select Delivered Order</label>
            <select 
              value={selectedOrderId || ''} 
              onChange={(e) => handleSelectOrder(e.target.value)}
              className="mt-1 w-full p-2.5 bg-white border border-gray-300 rounded-8 text-sm"
            >
              {deliveredOrders.map(o => (
                <option key={o.id} value={o.id}>
                  Order {o.id.slice(0, 8)} ({o.isChilled ? 'Chilled' : 'Dry'}) - {new Date(o.targetDate).toLocaleDateString()}
                </option>
              ))}
            </select>
          </div>
        )}

        {!order ? (
          <div className="text-center p-8 bg-white rounded-12 border border-gray-200 shadow-sm">
            <PackageCheck className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-700">No Orders to Confirm</h3>
            <p className="text-xs text-gray-500 mt-1">
              Delivered orders from drivers will appear here for receipt verification.
            </p>
            <Link href="/store/orders" className="mt-4 inline-block text-blue-600 text-sm font-medium">
              View All Orders →
            </Link>
          </div>
        ) : (
          <div>
            <div className="bg-white p-4 rounded-12 border border-gray-200 shadow-sm mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="font-bold text-gray-900">Order {order.id.slice(0, 8)}</h2>
                  <p className="text-xs text-gray-500">
                    Delivery Target: {new Date(order.targetDate).toLocaleDateString()}
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-4 text-xs font-semibold">
                  {order.status}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-600">
                <span>Type: {order.isChilled ? 'Chilled' : 'Dry'}</span>
                <span>Volume: {order.totalVolumeM3 ? Number(order.totalVolumeM3).toFixed(2) : '0.00'} m³</span>
                <span>Weight: {order.totalWeightKg ? Number(order.totalWeightKg).toFixed(1) : '0.0'} kg</span>
              </div>
            </div>

            <div className="mb-3">
              <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">Verify Items</h3>
              <p className="text-xs text-gray-500 mb-3">Please check off items before confirming delivery.</p>
            </div>

            <div className="space-y-2.5 mb-6">
              {order.lines && order.lines.length > 0 ? (
                order.lines.map((line: any) => {
                  const isChecked = checkedItems[line.id] ?? true
                  return (
                    <div 
                      key={line.id} 
                      onClick={() => toggleCheck(line.id)}
                      className="bg-white p-3.5 rounded-12 border border-gray-200 shadow-sm flex items-center gap-3 cursor-pointer hover:border-blue-400 transition-colors"
                    >
                      <input 
                        type="checkbox" 
                        checked={isChecked} 
                        onChange={() => toggleCheck(line.id)}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 pointer-events-none" 
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-gray-800 truncate">
                          {line.product?.name || `Product ${line.productId}`}
                        </h4>
                        <p className="text-xs text-gray-500">Qty: {line.quantity} units</p>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="bg-white p-4 rounded-12 border border-gray-200 text-center text-xs text-gray-500">
                  No line items listed for this order.
                </div>
              )}
            </div>

            <div className="bg-white border-t p-4 fixed bottom-0 left-0 right-0 max-w-[420px] mx-auto z-20">
              {order.status !== 'DELIVERED' && (
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-8 text-amber-800 text-xs">
                  This order is currently {order.status}. It can only be confirmed after delivery.
                </div>
              )}
              <button
                onClick={handleConfirmAll}
                disabled={confirmed || order.status !== 'DELIVERED'}
                className="w-full bg-emerald-600 text-white font-medium py-3 rounded-8 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm All Received
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function ConfirmReceiptPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-muted">Loading...</div>}>
      <ConfirmReceiptContent />
    </Suspense>
  )
}
