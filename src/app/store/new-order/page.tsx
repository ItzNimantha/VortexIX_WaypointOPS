'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Product = {
  id: string
  name: string
  category: string
  isChilled: boolean
}

export default function NewOrderPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Record<string, number>>({})
  const [targetDate, setTargetDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/store/catalog')
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || [])
        setLoading(false)
      })
      .catch(err => {
        setError('Failed to load catalog')
        setLoading(false)
      })
      
    // Set default target date to tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setTargetDate(tomorrow.toISOString().split('T')[0])
  }, [])

  const handleQuantity = (id: string, delta: number) => {
    setCart(prev => {
      const current = prev[id] || 0
      const next = Math.max(0, current + delta)
      const updated = { ...prev }
      if (next === 0) delete updated[id]
      else updated[id] = next
      return updated
    })
  }

  const handleSubmit = async () => {
    if (Object.keys(cart).length === 0) {
      setError('Please add at least one item')
      return
    }
    
    setSubmitting(true)
    setError(null)
    
    const items = Object.entries(cart).map(([productId, quantity]) => ({
      productId,
      quantity
    }))

    try {
      const res = await fetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, targetDate })
      })
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || 'Failed to place order')
      
      router.push('/store/orders')
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return <div className="p-6">Loading catalog...</div>

  return (
    <div className="p-4 md:p-6 pb-32">
      <h1 className="text-20 font-bold text-navy-900 mb-6">New Order</h1>
      
      {error && <div className="bg-danger-surface text-danger p-3 rounded-8 mb-4">{error}</div>}

      <div className="mb-6">
        <label className="block text-14 font-medium mb-2">Delivery Date</label>
        <input 
          type="date" 
          value={targetDate}
          onChange={e => setTargetDate(e.target.value)}
          className="w-full p-3 border border-border rounded-8"
        />
      </div>

      <div className="space-y-4">
        {products.map(p => (
          <div key={p.id} className="flex items-center justify-between p-4 bg-card rounded-12 border border-border shadow-sm">
            <div>
              <h3 className="font-medium text-16">{p.name}</h3>
              <div className="flex gap-2 mt-1">
                <span className="text-12 text-muted bg-surface px-2 py-1 rounded-4">{p.category}</span>
                {p.isChilled && <span className="text-12 text-blue-600 bg-blue-100 px-2 py-1 rounded-4">Chilled</span>}
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => handleQuantity(p.id, -1)}
                className="w-8 h-8 flex items-center justify-center rounded-999 bg-surface text-navy-700 font-bold"
              >-</button>
              <span className="w-6 text-center font-medium">{cart[p.id] || 0}</span>
              <button 
                onClick={() => handleQuantity(p.id, 1)}
                className="w-8 h-8 flex items-center justify-center rounded-999 bg-blue-100 text-blue-600 font-bold"
              >+</button>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-16 md:bottom-0 left-0 w-full md:w-[calc(100%-256px)] md:ml-64 bg-card border-t border-border p-4 z-40">
        <button 
          onClick={handleSubmit}
          disabled={submitting || Object.keys(cart).length === 0}
          className="w-full bg-blue-600 text-white min-h-[44px] rounded-12 font-medium disabled:opacity-50"
        >
          {submitting ? 'Placing Order...' : `Review & Submit (${Object.keys(cart).length} items)`}
        </button>
      </div>
    </div>
  )
}
