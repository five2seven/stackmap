import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { openDatabase, type StackMapDatabase } from './database.js'

const fixtures: Array<{ app: FastifyInstance; database: StackMapDatabase }> = []

async function fixture() {
  const database = openDatabase(':memory:')
  const app = await buildApp({ database, staticRoot: 'missing' })
  fixtures.push({ app, database })
  return { app, database }
}

afterEach(async () => {
  for (const { app } of fixtures.splice(0)) await app.close()
})

const timestamp = '2026-08-04T12:00:00.000Z'
const host = { id: 'host-1', name: 'Host', type: 'nas', ipAddress: '10.0.0.2', operatingSystem: 'Linux', notes: '', createdAt: timestamp, updatedAt: timestamp }
const service = {
  id: 'service-1', name: 'Service', containerName: 'service', dockerImage: 'example:1', description: '',
  applicationUrl: '', status: 'active', hostId: 'host-1', internalUrl: '',
  ports: [{ id: 'port-1', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: 'web' }],
  paths: [{ id: 'path-1', hostPath: '/srv/app', containerPath: '/config', purpose: 'config', readOnly: false }],
  network: 'proxy', exposure: 'local', dependencyIds: [], notes: '', createdAt: timestamp, updatedAt: timestamp,
}

async function seed(app: FastifyInstance) {
  await app.inject({ method: 'POST', url: '/api/v1/hosts', payload: host })
  await app.inject({ method: 'POST', url: '/api/v1/services', payload: service })
}

describe('server backup and restore API', () => {
  it('exports fresh and complete SQLite inventory with informational metadata', async () => {
    const { app, database } = await fixture()
    const empty = await app.inject({ method: 'GET', url: '/api/v1/backup' })
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toMatchObject({ schemaVersion: 1, hosts: [], services: [], metadata: { sourceInstallationId: database.installationId(), sourceInventoryRevision: 0 } })

    await seed(app)
    const backup = (await app.inject({ method: 'GET', url: '/api/v1/backup' })).json()
    expect(backup.services[0]).toMatchObject({ ...service, revision: 1 })
    expect(backup.hosts[0]).toMatchObject({ ...host, revision: 1 })
    expect(backup.services[0].ports.map((port: { id: string }) => port.id)).toEqual(['port-1'])
    expect(backup.metadata.sourceInventoryRevision).toBe(2)
  })

  it('previews without mutation and atomically restores IDs, timestamps, order, and revision policy', async () => {
    const { app, database } = await fixture()
    await seed(app)
    const installationId = database.installationId()
    const createdAt = database.connection.prepare("SELECT value FROM application_metadata WHERE key = 'created_at'").pluck().get()
    const backup = (await app.inject({ method: 'GET', url: '/api/v1/backup' })).json()
    backup.metadata.sourceInstallationId = 'source-installation'
    backup.metadata.sourceInventoryRevision = 999
    backup.hosts[0].revision = 42
    backup.services[0].revision = 84

    const preview = await app.inject({ method: 'POST', url: '/api/v1/restore/preview', payload: backup })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().data).toMatchObject({ expectedInventoryRevision: 2, summary: { hostCount: 1, serviceCount: 1, portCount: 1, pathCount: 1 } })
    expect(database.connection.prepare("SELECT value FROM application_metadata WHERE key = 'inventory_revision'").pluck().get()).toBe('2')

    const confirmed = await app.inject({ method: 'POST', url: '/api/v1/restore/confirm', payload: {
      previewToken: preview.json().data.previewToken, expectedInventoryRevision: 2,
    } })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json().data.inventoryRevision).toBe(3)
    expect((await app.inject({ method: 'GET', url: '/api/v1/hosts' })).json().data[0]).toMatchObject({ id: 'host-1', revision: 1, createdAt: timestamp, updatedAt: timestamp })
    expect((await app.inject({ method: 'GET', url: '/api/v1/services' })).json().data[0]).toMatchObject({ id: 'service-1', revision: 1, ports: service.ports, paths: service.paths })
    expect(database.installationId()).toBe(installationId)
    expect(database.connection.prepare("SELECT value FROM application_metadata WHERE key = 'created_at'").pluck().get()).toBe(createdAt)

    const reused = await app.inject({ method: 'POST', url: '/api/v1/restore/confirm', payload: {
      previewToken: preview.json().data.previewToken, expectedInventoryRevision: 2,
    } })
    expect(reused.statusCode).toBe(409)
    expect(reused.json().error.code).toBe('RESTORE_PREVIEW_INVALID')
    expect(reused.json().error.requestId).toBeTruthy()
  })

  it('rejects malformed exact shapes, duplicates, invalid references, self dependencies, and future versions without mutation', async () => {
    const { app } = await fixture()
    await seed(app)
    const original = (await app.inject({ method: 'GET', url: '/api/v1/backup' })).json()
    const cases = [
      { ...original, unknown: true },
      { ...original, schemaVersion: 2 },
      { ...original, metadata: { ...original.metadata, unknown: true } },
      { ...original, hosts: [...original.hosts, original.hosts[0]] },
      { ...original, services: [{ ...original.services[0], hostId: 'missing' }] },
      { ...original, services: [{ ...original.services[0], dependencyIds: ['service-1'] }] },
      { ...original, services: [{ ...original.services[0], ports: [original.services[0].ports[0], original.services[0].ports[0]] }] },
      { ...original, services: [{ ...original.services[0], paths: [original.services[0].paths[0], original.services[0].paths[0]] }] },
    ]
    for (const payload of cases) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/restore/preview', payload })
      expect(response.statusCode).toBe(400)
      expect(response.json().error).toMatchObject({ code: 'BACKUP_VALIDATION_ERROR' })
    }
    expect((await app.inject({ method: 'GET', url: '/api/v1/backup' })).json().metadata.sourceInventoryRevision).toBe(2)
  })

  it('fails stale confirmation without mutation or revision increment', async () => {
    const { app } = await fixture()
    await seed(app)
    const backup = (await app.inject({ method: 'GET', url: '/api/v1/backup' })).json()
    const preview = (await app.inject({ method: 'POST', url: '/api/v1/restore/preview', payload: backup })).json().data
    await app.inject({ method: 'PUT', url: '/api/v1/hosts/host-1', payload: { expectedRevision: 1, host: { ...host, name: 'Newer' } } })
    const response = await app.inject({ method: 'POST', url: '/api/v1/restore/confirm', payload: { previewToken: preview.previewToken, expectedInventoryRevision: preview.expectedInventoryRevision } })
    expect(response.statusCode).toBe(409)
    expect(response.json().error.code).toBe('RESTORE_PREVIEW_STALE')
    expect((await app.inject({ method: 'GET', url: '/api/v1/hosts' })).json()).toMatchObject({ data: [{ name: 'Newer' }], meta: { inventoryRevision: 3 } })
  })

  it('allows at most one competing preview to commit and leaves the other stale', async () => {
    const { app } = await fixture()
    await seed(app)
    const backup = (await app.inject({ method: 'GET', url: '/api/v1/backup' })).json()
    const first = (await app.inject({ method: 'POST', url: '/api/v1/restore/preview', payload: backup })).json().data
    const second = (await app.inject({ method: 'POST', url: '/api/v1/restore/preview', payload: backup })).json().data
    const success = await app.inject({ method: 'POST', url: '/api/v1/restore/confirm', payload: { previewToken: first.previewToken, expectedInventoryRevision: first.expectedInventoryRevision } })
    const conflict = await app.inject({ method: 'POST', url: '/api/v1/restore/confirm', payload: { previewToken: second.previewToken, expectedInventoryRevision: second.expectedInventoryRevision } })
    expect(success.statusCode).toBe(200)
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error.code).toBe('RESTORE_PREVIEW_STALE')
    expect((await app.inject({ method: 'GET', url: '/api/v1/meta' })).json().inventoryRevision).toBe(3)
  })

  it('rolls back every record and the global revision on a database write failure', async () => {
    const { app, database } = await fixture()
    await seed(app)
    const backup = (await app.inject({ method: 'GET', url: '/api/v1/backup' })).json()
    backup.hosts[0].name = 'Restored name'
    const preview = (await app.inject({ method: 'POST', url: '/api/v1/restore/preview', payload: backup })).json().data
    database.connection.exec("CREATE TRIGGER fail_restore BEFORE INSERT ON hosts BEGIN SELECT RAISE(ABORT, 'private failure'); END")
    const failed = await app.inject({ method: 'POST', url: '/api/v1/restore/confirm', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 2 } })
    expect(failed.statusCode).toBe(409)
    expect(failed.json().error.code).toBe('INVALID_REFERENCE')
    expect(failed.body).not.toMatch(/private failure|trigger|SQLITE/i)
    expect((await app.inject({ method: 'GET', url: '/api/v1/hosts' })).json()).toMatchObject({ data: [{ name: 'Host' }], meta: { inventoryRevision: 2 } })
    database.connection.exec('DROP TRIGGER fail_restore')
    const retried = await app.inject({ method: 'POST', url: '/api/v1/restore/confirm', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 2 } })
    expect(retried.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/v1/hosts' })).json()).toMatchObject({ data: [{ name: 'Restored name', revision: 1 }], meta: { inventoryRevision: 3 } })
  })
})
