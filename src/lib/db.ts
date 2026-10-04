import Dexie, { Table } from 'dexie'

export interface OutboxEvent {
  id: string // Client UUID
  type: string
  payload: any
  createdAt: string
  status: 'pending' | 'syncing' | 'failed'
  error?: string
}

export class DriverDB extends Dexie {
  outbox!: Table<OutboxEvent, string>

  constructor() {
    super('DriverOfflineDB')
    this.version(1).stores({
      outbox: 'id, type, status, createdAt'
    })
  }
}

export const db = typeof window !== 'undefined' ? new DriverDB() : null as any
