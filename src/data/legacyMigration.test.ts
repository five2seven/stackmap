import { describe, expect, it, vi } from 'vitest'
import { createService } from '../domain/serviceUtils'
import { legacyMigrationDataset, LegacyMigrationError, SameOriginLegacyMigrationClient } from './legacyMigration'

describe('legacy migration client', () => {
  it('builds a stable schema-3 dataset without mutating source records', () => {
    const service = createService('Legacy')
    const data = { hosts: [], services: [service] }
    const before = JSON.stringify(data)
    const first = legacyMigrationDataset(data)
    const second = legacyMigrationDataset(data)
    expect(first).toEqual(second)
    expect(first.schemaVersion).toBe(3)
    expect(first.exportedAt).toBe(service.updatedAt)
    expect(JSON.stringify(data)).toBe(before)
  })

  it('sends acknowledgement and current legacy data on confirmation', async () => {
    const fetcher = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args
      return new Response(JSON.stringify({ data: { summary: {}, inventoryRevision: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    const client = new SameOriginLegacyMigrationClient(fetcher as typeof fetch)
    const data = legacyMigrationDataset({ hosts: [], services: [] })
    await client.confirm('opaque', 0, data)
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ previewToken: 'opaque', expectedInventoryRevision: 0, acknowledged: true, legacyData: data })
  })

  it('surfaces safe server codes without automatic retry', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'LEGACY_MIGRATION_TARGET_NOT_EMPTY', message: 'Use a separate workflow.' } }), { status: 409, headers: { 'content-type': 'application/json' } }))
    const client = new SameOriginLegacyMigrationClient(fetcher as typeof fetch)
    await expect(client.preview(legacyMigrationDataset({ hosts: [], services: [] }))).rejects.toEqual(expect.objectContaining<Partial<LegacyMigrationError>>({ code: 'LEGACY_MIGRATION_TARGET_NOT_EMPTY', message: 'Use a separate workflow.' }))
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
