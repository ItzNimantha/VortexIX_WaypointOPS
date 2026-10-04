import { describe, it, expect, vi } from 'vitest'

// Mocking Prisma Client
const { mockPrisma, mockTx } = vi.hoisted(() => {
  const mockTx = {
    tripStop: { update: vi.fn() },
    proofOfDelivery: { create: vi.fn() },
    syncEvent: { create: vi.fn() }
  }

  const mockPrisma = {
    syncEvent: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn(async (callback: any) => {
      return await callback(mockTx)
    })
  }

  return { mockPrisma, mockTx }
})

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma)
}))

// Import after mocking
import { POST } from '../../app/api/driver/sync/route'

describe('Offline Sync Idempotency', () => {
  it('processes a new event and ignores a duplicate event', async () => {
    const event = {
      id: 'UUID-123',
      type: 'STOP_COMPLETION',
      payload: { tripStopId: 'STOP-1', outcome: 'SUCCESS', photoUrl: 'img', signatureUrl: 'sig' },
      createdAt: new Date().toISOString()
    }

    // 1. First run: event does not exist in DB
    mockPrisma.syncEvent.findUnique.mockResolvedValueOnce(null)
    
    const req1 = new Request('http://localhost/api/driver/sync', {
      method: 'POST',
      body: JSON.stringify({ events: [event] })
    })
    
    const res1 = await POST(req1)
    const json1 = await res1.json()

    expect(json1.results[0].success).toBe(true)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockTx.tripStop.update).toHaveBeenCalledTimes(1)
    expect(mockTx.syncEvent.create).toHaveBeenCalledTimes(1)

    // 2. Second run: event DOES exist (sent again due to network retry)
    mockPrisma.syncEvent.findUnique.mockResolvedValueOnce({ clientEventId: 'UUID-123' })
    
    const req2 = new Request('http://localhost/api/driver/sync', {
      method: 'POST',
      body: JSON.stringify({ events: [event] })
    })
    
    const res2 = await POST(req2)
    const json2 = await res2.json()

    // Should return success without running the transaction again
    expect(json2.results[0].success).toBe(true)
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1) // Still 1, didn't run again!
  })
})
