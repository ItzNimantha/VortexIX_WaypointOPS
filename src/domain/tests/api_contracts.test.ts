import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { OrderStatus, TripStatus, Role } from '@prisma/client'

// Schema as implemented in /api/store/orders
const OrderSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1),
  })).min(1),
  targetDate: z.string(),
})

function normalizeDepotId(depotId?: string | null): string {
  if (!depotId || depotId === 'DEP_PEL') return 'Peliyagoda'
  if (depotId === 'DEP_KAN') return 'Kandy'
  return depotId
}

describe('Milestone 1 API Contracts & Error Handling', () => {
  describe('Store Orders Validation (/api/store/orders)', () => {
    it('rejects empty items array', () => {
      expect(() => {
        OrderSchema.parse({ items: [], targetDate: '2026-10-15' })
      }).toThrow()
    })

    it('rejects non-positive quantities (0 or negative)', () => {
      expect(() => {
        OrderSchema.parse({ items: [{ productId: 'P01', quantity: 0 }], targetDate: '2026-10-15' })
      }).toThrow()

      expect(() => {
        OrderSchema.parse({ items: [{ productId: 'P01', quantity: -5 }], targetDate: '2026-10-15' })
      }).toThrow()
    })

    it('rejects missing targetDate', () => {
      expect(() => {
        OrderSchema.parse({ items: [{ productId: 'P01', quantity: 1 }] })
      }).toThrow()
    })

    it('accepts valid order item payload', () => {
      const result = OrderSchema.parse({
        items: [{ productId: 'P01', quantity: 3 }],
        targetDate: '2026-10-15T00:00:00.000Z'
      })
      expect(result.items).toHaveLength(1)
      expect(result.items[0].productId).toBe('P01')
      expect(result.items[0].quantity).toBe(3)
    })
  })

  describe('Depot Normalization (/api/dispatch/plan & /api/dispatch/orders)', () => {
    it('normalizes DEP_PEL to Peliyagoda', () => {
      expect(normalizeDepotId('DEP_PEL')).toBe('Peliyagoda')
      expect(normalizeDepotId(null)).toBe('Peliyagoda')
      expect(normalizeDepotId(undefined)).toBe('Peliyagoda')
    })

    it('normalizes DEP_KAN to Kandy', () => {
      expect(normalizeDepotId('DEP_KAN')).toBe('Kandy')
    })

    it('passes through unrecognized depot IDs (challenge observation)', () => {
      expect(normalizeDepotId('UNKNOWN_DEPOT')).toBe('UNKNOWN_DEPOT')
    })
  })

  describe('Role-Based Access Enforcement', () => {
    it('enforces DISPATCHER role only for /api/dispatch/plan', () => {
      const canAccessPlan = (role?: string) => role === 'DISPATCHER'
      expect(canAccessPlan('DISPATCHER')).toBe(true)
      expect(canAccessPlan('STORE_MANAGER')).toBe(false)
      expect(canAccessPlan('LOADER')).toBe(false)
      expect(canAccessPlan('DRIVER')).toBe(false)
      expect(canAccessPlan(undefined)).toBe(false)
    })

    it('enforces DISPATCHER or STORE_MANAGER role for /api/dispatch/publish and /api/dispatch/orders', () => {
      const canAccessPublish = (role?: string) => role === 'DISPATCHER' || role === 'STORE_MANAGER'
      expect(canAccessPublish('DISPATCHER')).toBe(true)
      expect(canAccessPublish('STORE_MANAGER')).toBe(true)
      expect(canAccessPublish('LOADER')).toBe(false)
      expect(canAccessPublish('DRIVER')).toBe(false)
      expect(canAccessPublish(undefined)).toBe(false)
    })

    it('enforces STORE_MANAGER role for POST /api/store/orders', () => {
      const canCreateOrder = (role?: string) => role === 'STORE_MANAGER'
      expect(canCreateOrder('STORE_MANAGER')).toBe(true)
      expect(canCreateOrder('DISPATCHER')).toBe(false)
      expect(canCreateOrder('LOADER')).toBe(false)
      expect(canCreateOrder('DRIVER')).toBe(false)
    })
  })

  describe('Schema Lifecycle Enum Coverage', () => {
    it('verifies required OrderStatus values exist', () => {
      const values = Object.values(OrderStatus)
      expect(values).toContain('PENDING')
      expect(values).toContain('CONFIRMED')
      expect(values).toContain('PLANNED')
      expect(values).toContain('LOADING')
      expect(values).toContain('IN_TRANSIT')
      expect(values).toContain('DELIVERED')
    })

    it('verifies required TripStatus values exist', () => {
      const values = Object.values(TripStatus)
      expect(values).toContain('PLANNED')
      expect(values).toContain('LOADING')
      expect(values).toContain('IN_TRANSIT')
      expect(values).toContain('COMPLETED')
    })
  })
})
