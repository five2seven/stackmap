// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { openDatabase } from './database.js'

const timestamp = '2026-01-01T00:00:00.000Z'
const valid = {
  schemaVersion: 3, exportedAt: timestamp, hosts: [], services: [{
    id: 'service', name: 'Legacy', containerName: '', dockerImage: '', description: '', applicationUrl: '',
    status: 'active', internalUrl: '', ports: [], paths: [], network: '', exposure: 'unknown',
    dependencyIds: [], notes: '', createdAt: timestamp, updatedAt: timestamp,
  }],
}

async function fixture() {
  const app = await buildApp({ database: openDatabase(':memory:'), staticRoot: 'missing' })
  await app.ready()
  return app
}

describe('legacy migration API', () => {
  it('returns safe validation errors with request IDs', async () => {
    const app = await fixture()
    const response = await app.inject({ method: 'POST', url: '/api/v1/legacy-migration/preview', payload: { ...valid, schemaVersion: 2 } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: { code: 'LEGACY_MIGRATION_VALIDATION_ERROR', requestId: expect.any(String) } })
    expect(response.body).not.toContain('SQL')
    await app.close()
  })

  it('requires acknowledgement and imports exactly once', async () => {
    const app = await fixture()
    const preview = (await app.inject({ method: 'POST', url: '/api/v1/legacy-migration/preview', payload: valid })).json().data
    const rejected = await app.inject({ method: 'POST', url: '/api/v1/legacy-migration/confirm', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, acknowledged: false, legacyData: valid } })
    expect(rejected.statusCode).toBe(400)
    const confirmed = await app.inject({ method: 'POST', url: '/api/v1/legacy-migration/confirm', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, acknowledged: true, legacyData: valid } })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().data.inventoryRevision).toBe(1)
    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/legacy-migration/confirm', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, acknowledged: true, legacyData: valid } })
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json()).toMatchObject({ error: { code: 'LEGACY_MIGRATION_PREVIEW_INVALID' } })
    await app.close()
  })

  it('rejects populated targets without issuing a token or changing revision', async () => {
    const app = await fixture()
    await app.inject({ method: 'POST', url: '/api/v1/services', payload: { ...valid.services[0], expectedRevision: undefined } })
    const before = (await app.inject('/api/v1/meta')).json().inventoryRevision
    const response = await app.inject({ method: 'POST', url: '/api/v1/legacy-migration/preview', payload: valid })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ error: { code: 'LEGACY_MIGRATION_TARGET_NOT_EMPTY', requestId: expect.any(String) } })
    expect(response.json().data).toBeUndefined()
    expect((await app.inject('/api/v1/meta')).json().inventoryRevision).toBe(before)
    await app.close()
  })
})
