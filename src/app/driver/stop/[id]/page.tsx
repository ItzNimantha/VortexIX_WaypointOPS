'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { Camera, Check, CheckCircle2 } from 'lucide-react'

export default function DriverStop({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { id } = params
  const [stop, setStop] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [photoCaptured, setPhotoCaptured] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasSigned, setHasSigned] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)

  useEffect(() => {
    fetch(`/api/driver/trip?stopId=${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          const stops = data.stops || data.trip?.stops || []
          const currentStop = stops.find((s: any) => s.id === id)
          setStop(currentStop)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  // Canvas drawing setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.parentElement?.clientWidth || 300
    canvas.height = canvas.parentElement?.clientHeight || 150

    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect()
      if ('touches' in e && e.touches[0]) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
      } else if ('clientX' in e) {
        return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top }
      }
      return { x: 0, y: 0 }
    }

    const startDrawing = (e: MouseEvent | TouchEvent) => {
      isDrawing.current = true
      setHasSigned(true)
      const pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    const draw = (e: MouseEvent | TouchEvent) => {
      if (!isDrawing.current) return
      const pos = getPos(e)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    }

    const stopDrawing = () => {
      isDrawing.current = false
    }

    canvas.addEventListener('mousedown', startDrawing)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDrawing)
    canvas.addEventListener('touchstart', startDrawing)
    canvas.addEventListener('touchmove', draw)
    canvas.addEventListener('touchend', stopDrawing)

    return () => {
      canvas.removeEventListener('mousedown', startDrawing)
      canvas.removeEventListener('mousemove', draw)
      canvas.removeEventListener('mouseup', stopDrawing)
      canvas.removeEventListener('touchstart', startDrawing)
      canvas.removeEventListener('touchmove', draw)
      canvas.removeEventListener('touchend', stopDrawing)
    }
  }, [stop])

  const handleCompleteDelivery = async () => {
    if (!stop || isSubmitting) return
    setIsSubmitting(true)
    try {
      const canvas = canvasRef.current
      const signatureData = canvas ? canvas.toDataURL() : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxwYXRoIGQ9Ik0xMCAxMCBMMTAwIDEwMCIvPjwvc3ZnPg=='
      const photoUrl = photoCaptured 
        ? `https://waypoint.mock/pod/photo-${stop.id}.jpg` 
        : 'https://waypoint.mock/pod-photo.jpg'

      const res = await fetch('/api/driver/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              type: 'STOP_COMPLETION',
              tripStopId: stop.id,
              outcome: 'SUCCESS',
              signature: signatureData,
              photo: photoUrl,
              createdAt: new Date().toISOString()
            }
          ]
        })
      })

      if (res.ok) {
        router.push('/driver')
      } else {
        alert('Failed to sync delivery. Retrying offline...')
        router.push('/driver')
      }
    } catch (err) {
      console.error('Error completing delivery:', err)
      router.push('/driver')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) return <div className="p-6 text-white h-full bg-navy-900">Loading stop...</div>
  if (!stop) return <div className="p-6 text-white h-full bg-navy-900">Stop not found.</div>

  const totalCrates = stop.order?.lines?.reduce((sum: number, l: any) => sum + l.quantity, 0) || Math.max(1, Math.round((stop.order?.totalVolumeM3 || 0.5) * 8))

  return (
    <div className="p-6 h-full flex flex-col pb-24 text-white">
      <header className="mb-6">
        <button onClick={() => router.back()} className="text-muted-on-navy mb-4">← Back to Route</button>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-24 font-bold">{stop.order?.outlet?.name || 'Unknown Outlet'}</h1>
            <p className="text-muted-on-navy">Stop {stop.sequence}</p>
          </div>
          {stop.order?.isChilled && <span className="bg-blue-100 text-blue-600 font-bold px-3 py-1 rounded-8 text-14">Chilled</span>}
        </div>
      </header>

      <div className="flex-1 space-y-6">
        <div className="bg-navy-800 rounded-12 p-4">
          <h3 className="font-bold mb-4 text-muted-on-navy">Delivery Details</h3>
          <div className="flex justify-between items-center py-2 border-b border-navy-700">
            <span>Total Crates</span>
            <span className="font-bold text-18">{totalCrates}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span>Volume</span>
            <span className="font-bold">{stop.order?.totalVolumeM3 ? Number(stop.order.totalVolumeM3).toFixed(2) : '0.50'} m³</span>
          </div>
        </div>

        {/* Photo Proof */}
        <div className="bg-navy-800 rounded-12 p-4">
          <h3 className="font-bold mb-3 text-muted-on-navy">Delivery Photo</h3>
          <div className="flex items-center justify-between mb-3">
            <span className="text-14">{photoCaptured ? 'Photo captured' : 'No photo taken'}</span>
            {photoCaptured && <CheckCircle2 className="w-5 h-5 text-success" />}
          </div>
          <button 
            type="button"
            onClick={() => setPhotoCaptured(!photoCaptured)}
            className="w-full bg-navy-700 hover:bg-navy-600 text-white font-medium py-3 rounded-8 flex items-center justify-center gap-2 border border-navy-600"
          >
            <Camera className="w-4 h-4" />
            Take Photo
          </button>
        </div>

        {/* Signature Box */}
        <div className="bg-navy-800 rounded-12 p-4">
          <h3 className="font-bold mb-4 text-muted-on-navy">Proof of Delivery</h3>
          <p className="text-14 mb-2">Store Manager Signature</p>
          <div className="bg-white rounded-8 h-40 border-2 border-dashed border-muted relative cursor-crosshair">
            <canvas ref={canvasRef} className="w-full h-full rounded-8 cursor-crosshair" />
            {!hasSigned && (
              <span className="absolute inset-0 flex items-center justify-center text-muted pointer-events-none text-14">
                Sign here
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button 
          onClick={handleCompleteDelivery}
          disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 rounded-12 text-16 shadow-lg shadow-blue-600/20 disabled:opacity-50"
        >
          {isSubmitting ? 'Syncing...' : 'Complete Delivery'}
        </button>
      </div>
    </div>
  )
}
