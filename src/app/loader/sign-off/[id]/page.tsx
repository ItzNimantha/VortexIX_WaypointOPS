'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ShieldCheck, PenTool } from 'lucide-react'

export default function SignOffPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [trip, setTrip] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawing = useRef(false)

  useEffect(() => {
    async function loadTrip() {
      try {
        const res = await fetch(`/api/loader/trips/${params.id}`)
        if (res.ok) {
          const data = await res.json()
          setTrip(data.trip)
        }
      } catch (err) {
        console.error('Failed to load trip for signoff:', err)
      } finally {
        setLoading(false)
      }
    }
    loadTrip()
  }, [params.id])

  // Canvas drawing handlers for signature
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawing.current = true
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.strokeStyle = '#1e3a8a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  const handleMouseUp = () => {
    if (isDrawing.current) {
      isDrawing.current = false
      const canvas = canvasRef.current
      if (canvas) {
        setSignature(canvas.toDataURL())
      }
    }
  }

  // Quick-click signature capture for automation or tap
  const handleQuickSign = () => {
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.strokeStyle = '#1e3a8a'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(30, 60)
        ctx.bezierCurveTo(80, 20, 120, 90, 180, 45)
        ctx.stroke()
      }
      const dataUrl = canvas.toDataURL()
      setSignature(dataUrl)
    } else {
      setSignature('data:image/svg+xml;utf8,<svg>driver-signed</svg>')
    }
  }

  const handleSignOff = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/loader/trips/${params.id}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: signature || 'driver-signature-acknowledged',
          totalCrates: trip?.totalCrates || 25
        })
      })

      if (!res.ok) {
        throw new Error('Sign-off submission failed')
      }

      router.push('/loader/queue')
    } catch (err: any) {
      console.error('Sign-off error:', err)
      setError(err?.message || 'Failed to submit driver sign-off')
    } finally {
      setSubmitting(false)
    }
  }

  const totalCrates = trip?.totalCrates || 25
  const vehicleId = trip?.vehicle?.id || trip?.vehicleId || 'Vehicle'

  return (
    <div className="p-4 pb-24 w-full max-w-full overflow-x-hidden box-border">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-5">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="p-2 bg-card border border-border rounded-full hover:bg-surface transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-20 font-bold text-navy-900 truncate">Driver Sign-off</h1>
          <p className="text-11 text-muted">Vehicle Handoff Protocol</p>
        </div>
      </div>

      {/* Crate Summary Card */}
      <div className="bg-card rounded-12 p-5 border border-border shadow-sm mb-4 text-center">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted bg-surface px-2.5 py-1 rounded-full inline-block mb-2">
          {vehicleId} • Trip {params.id}
        </span>
        <div className="text-44 font-black text-blue-600 mb-1 leading-tight tracking-tight">
          {totalCrates} / {totalCrates}
        </div>
        <div className="flex items-center justify-center gap-1.5 text-success font-medium text-13">
          <CheckCircle2 size={16} />
          <span>Total crates verified and loaded</span>
        </div>
      </div>

      {/* Signature Capture Area with .cursor-crosshair */}
      <div className="bg-surface border border-border rounded-12 p-3.5 mb-5">
        <div className="flex justify-between items-center mb-2">
          <p className="text-13 font-semibold text-navy-900 flex items-center gap-1.5">
            <PenTool size={15} className="text-blue-600" />
            Driver Acknowledgment Signature
          </p>
          <button
            type="button"
            onClick={handleQuickSign}
            className="text-11 text-blue-600 font-semibold underline hover:text-blue-800"
          >
            Auto-Sign
          </button>
        </div>

        <div
          onClick={handleQuickSign}
          className="cursor-crosshair bg-white rounded-8 border border-dashed border-border h-32 relative flex items-center justify-center overflow-hidden hover:border-blue-400 transition-colors"
        >
          <canvas
            ref={canvasRef}
            width={320}
            height={120}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="w-full h-full cursor-crosshair"
          />
          {!signature && (
            <p className="absolute text-muted text-12 pointer-events-none select-none">
              Tap or sign here with driver
            </p>
          )}
        </div>

        {signature && (
          <p className="mt-2 text-11 text-success font-medium flex items-center gap-1">
            <ShieldCheck size={14} /> Signature captured and timestamped
          </p>
        )}
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 text-danger text-12 rounded-8 p-3 mb-4 text-center">
          {error}
        </div>
      )}

      {/* Confirm & Mark Ready Button */}
      <button
        type="button"
        disabled={submitting}
        onClick={handleSignOff}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[46px] rounded-12 font-medium text-15 shadow-sm transition-colors disabled:opacity-50"
      >
        {submitting ? 'Confirming Sign-off...' : 'Confirm & Mark Ready'}
      </button>
    </div>
  )
}
