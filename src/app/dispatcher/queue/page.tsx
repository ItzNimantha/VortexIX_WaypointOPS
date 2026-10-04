'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function OrderQueuePage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dispatch/orders')
      .then(res => {
        if (!res.ok) return fetch('/api/store/orders').then(r => r.json())
        return res.json()
      })
      .then(data => {
        setOrders(data.orders || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleConfirm = async (id: string) => {
    try {
      const res = await fetch(`/api/dispatch/orders/${id}/confirm`, { method: 'POST' })
      if (res.ok) {
        setOrders(orders.map(o => o.id === id ? { ...o, status: 'CONFIRMED' } : o))
      }
    } catch (error) {
      console.error('Failed to confirm', error)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-24 font-bold text-navy-900">01 Order Queue</h1>
          <p className="text-muted">Review incoming demand before allocation.</p>
        </div>
        <Link 
          href="/dispatcher/plan"
          className="bg-blue-600 text-white px-6 py-2 rounded-8 font-medium inline-block text-center hover:bg-blue-700 transition"
        >
          Plan & Allocate
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-card p-6 rounded-12 border border-border shadow-sm">
          <p className="text-muted text-14 font-medium">Total Orders</p>
          <div className="text-32 font-bold text-navy-900 mt-2">{orders.length}</div>
          <p className="text-12 text-blue-600 mt-1">{orders.filter(o => o.status === 'PENDING').length} Pending</p>
        </div>
        <div className="bg-card p-6 rounded-12 border border-border shadow-sm">
          <p className="text-muted text-14 font-medium flex items-center justify-between">
            Demand vs Capacity
            <span className="bg-danger-surface text-danger px-2 py-1 text-12 rounded-4 font-bold">Over Capacity</span>
          </p>
          <div className="text-32 font-bold text-navy-900 mt-2">
            {orders.reduce((sum, o) => sum + o.totalVolumeM3, 0).toFixed(1)} <span className="text-16 text-muted font-normal">/ 180 m³</span>
          </div>
        </div>
        <div className="bg-card p-6 rounded-12 border border-border shadow-sm">
          <p className="text-muted text-14 font-medium">Late Orders</p>
          <div className="text-32 font-bold text-navy-900 mt-2">0</div>
          <p className="text-12 text-muted mt-1">Waiting for next run</p>
        </div>
      </div>

      <div className="bg-card rounded-12 border border-border shadow-sm overflow-hidden">
        <table className="w-full text-left text-14">
          <thead className="bg-surface border-b border-border text-muted">
            <tr>
              <th className="p-4 font-medium">Order Ref</th>
              <th className="p-4 font-medium">Target Date</th>
              <th className="p-4 font-medium">Type</th>
              <th className="p-4 font-medium">Volume</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface/50">
                <td className="p-4 font-medium text-navy-900">{o.id.slice(0, 8)}</td>
                <td className="p-4">{new Date(o.targetDate).toLocaleDateString()}</td>
                <td className="p-4">
                  {o.isChilled ? (
                    <span className="bg-blue-100 text-blue-600 px-2 py-1 rounded-4 text-12 font-medium">Chilled</span>
                  ) : (
                    <span className="bg-surface text-text px-2 py-1 rounded-4 text-12 font-medium">Ambient</span>
                  )}
                </td>
                <td className="p-4">{o.totalVolumeM3.toFixed(2)} m³</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-4 text-12 font-medium ${
                    o.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {o.status}
                  </span>
                </td>
                <td className="p-4">
                  {o.status === 'PENDING' && (
                    <button 
                      onClick={() => handleConfirm(o.id)}
                      className="text-blue-600 font-medium hover:underline cursor-pointer"
                    >
                      Confirm
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted">Queue is empty</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
