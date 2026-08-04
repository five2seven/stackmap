// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { openDatabase, type StackMapDatabase } from './database.js'
import type { NewInventoryHost, NewInventoryService } from './inventory.js'

const timestamp = '2026-08-03T12:00:00.000Z'
const later = '2026-08-03T13:00:00.000Z'
const fixtures: Array<{ app: FastifyInstance; database: StackMapDatabase }> = []

afterEach(async () => {
  for (const { app } of fixtures.splice(0)) await app.close()
})

async function fixture() {
  const database = openDatabase(':memory:')
  const app = await buildApp({ database, staticRoot: 'missing' })
  await app.ready()
  const result = { app, database }
  fixtures.push(result)
  return result
}

function host(id: string, name = id): NewInventoryHost {
  return {
    id,
    name,
    type: 'nas',
    ipAddress: '192.0.2.10',
    operatingSystem: 'Linux',
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function service(id: string, details: Partial<NewInventoryService> = {}): NewInventoryService {
  return {
    id,
    name: id,
    containerName: '',
    dockerImage: '',
    description: '',
    applicationUrl: '',
    status: 'planned',
    internalUrl: '',
    ports: [],
    paths: [],
    network: '',
    exposure: 'unknown',
    dependencyIds: [],
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...details,
  }
}

async function createHost(app: FastifyInstance, record = host('host-1')) {
  return app.inject({ method: 'POST', url: '/api/v1/hosts', payload: record })
}

async function createService(app: FastifyInstance, record: NewInventoryService) {
  return app.inject({ method: 'POST', url: '/api/v1/services', payload: record })
}

function expectSafeError(
  response: Awaited<ReturnType<FastifyInstance['inject']>>,
  status: number,
  code: string,
) {
  expect(response.statusCode).toBe(status)
  expect(response.json()).toEqual({
    error: {
      code,
      message: expect.any(String),
      requestId: expect.any(String),
    },
  })
}

describe('inventory API', () => {
  it('exposes inventory metadata and complete deterministic host CRUD contracts', async () => {
    const { app } = await fixture()
    expect((await app.inject('/api/v1/meta')).json()).toMatchObject({
      datastoreAuthority: 'indexeddb',
      inventoryRevision: 0,
    })

    const second = await createHost(app, host('host-b', 'beta'))
    const first = await createHost(app, host('host-a', 'Alpha'))
    expect(second.statusCode).toBe(201)
    expect(first.json()).toEqual({
      data: { ...host('host-a', 'Alpha'), revision: 1 },
      meta: { inventoryRevision: 2 },
    })
    expect((await app.inject('/api/v1/hosts')).json()).toEqual({
      data: [
        { ...host('host-a', 'Alpha'), revision: 1 },
        { ...host('host-b', 'beta'), revision: 1 },
      ],
      meta: { inventoryRevision: 2 },
    })

    const updatedRecord = { ...host('host-a', 'Updated'), createdAt: timestamp, updatedAt: later }
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/v1/hosts/host-a',
      payload: { expectedRevision: 1, host: updatedRecord },
    })
    expect(updated.json()).toEqual({
      data: { ...updatedRecord, revision: 2 },
      meta: { inventoryRevision: 3 },
    })
    const deleted = await app.inject({
      method: 'DELETE',
      url: '/api/v1/hosts/host-a',
      payload: { expectedRevision: 2 },
    })
    expect(deleted.json()).toEqual({ data: null, meta: { inventoryRevision: 4 } })
  })

  it('round-trips complete nested services and preserves child ordering', async () => {
    const { app } = await fixture()
    await createHost(app)
    await createService(app, service('database'))
    const record = service('app', {
      name: 'Application',
      hostId: 'host-1',
      status: 'active',
      exposure: 'reverse-proxy',
      ports: [
        { id: 'https', hostPort: 443, containerPort: 8443, protocol: 'tcp', description: 'TLS' },
        { id: 'dns', containerPort: 53, protocol: 'both', description: '' },
      ],
      paths: [
        { id: 'config', hostPath: '/srv/app', containerPath: '/config', purpose: 'Config', readOnly: false },
        { id: 'certs', hostPath: '/srv/certs', containerPath: '/certs', purpose: 'TLS', readOnly: true },
      ],
      dependencyIds: ['database'],
    })
    const created = await createService(app, record)
    expect(created.statusCode).toBe(201)
    expect(created.json()).toEqual({
      data: { ...record, revision: 1 },
      meta: { inventoryRevision: 3 },
    })
    expect((await app.inject('/api/v1/services/app')).json()).toEqual(created.json())

    const updatedRecord = {
      ...record,
      ports: [...record.ports].reverse(),
      paths: [...record.paths].reverse(),
      updatedAt: later,
    }
    const updated = await app.inject({
      method: 'PUT',
      url: '/api/v1/services/app',
      payload: { expectedRevision: 1, service: updatedRecord },
    })
    expect(updated.json()).toEqual({
      data: { ...updatedRecord, revision: 2 },
      meta: { inventoryRevision: 4 },
    })
    expect((await app.inject('/api/v1/services')).json()).toMatchObject({
      data: [{ id: 'app' }, { id: 'database' }],
      meta: { inventoryRevision: 4 },
    })
  })

  it('validates exact request shapes before mutation', async () => {
    const { app } = await fixture()
    const invalidRequests = [
      { method: 'POST', url: '/api/v1/hosts', payload: { ...host('bad'), secret: 'value' } },
      { method: 'POST', url: '/api/v1/hosts', payload: { ...host('bad'), name: ' ' } },
      { method: 'POST', url: '/api/v1/services', payload: service('bad', { ports: [{ id: 'p', protocol: 'tcp', description: '' }] }) },
      { method: 'PUT', url: '/api/v1/hosts/path-id', payload: { expectedRevision: 1, host: host('body-id') } },
      { method: 'DELETE', url: '/api/v1/hosts/missing', payload: { expectedRevision: 0 } },
    ] as const
    for (const request of invalidRequests) {
      const response = await app.inject(request)
      expectSafeError(response, 400, 'VALIDATION_ERROR')
    }
    expect((await app.inject('/api/v1/hosts')).json()).toEqual({
      data: [],
      meta: { inventoryRevision: 0 },
    })
  })

  it('returns safe not-found responses for every missing record operation', async () => {
    const { app } = await fixture()
    for (const url of ['/api/v1/hosts/missing', '/api/v1/services/missing']) {
      expectSafeError(await app.inject(url), 404, 'NOT_FOUND')
      expectSafeError(
        await app.inject({
          method: 'DELETE',
          url,
          payload: { expectedRevision: 1 },
        }),
        404,
        'NOT_FOUND',
      )
    }
  })

  it('maps stale updates and deletes to conflicts without partial writes', async () => {
    const { app } = await fixture()
    await createHost(app)
    const staleUpdate = await app.inject({
      method: 'PUT',
      url: '/api/v1/hosts/host-1',
      payload: { expectedRevision: 2, host: { ...host('host-1'), name: 'Stale', updatedAt: later } },
    })
    expectSafeError(staleUpdate, 409, 'REVISION_CONFLICT')
    const staleDelete = await app.inject({
      method: 'DELETE',
      url: '/api/v1/hosts/host-1',
      payload: { expectedRevision: 2 },
    })
    expectSafeError(staleDelete, 409, 'REVISION_CONFLICT')
    expect((await app.inject('/api/v1/hosts/host-1')).json()).toEqual({
      data: { ...host('host-1'), revision: 1 },
      meta: { inventoryRevision: 1 },
    })
  })

  it('maps invalid references safely and rolls back complete nested mutations', async () => {
    const { app, database } = await fixture()
    const orphan = await createService(app, service('orphan', {
      hostId: 'C:\\private\\secret-host',
      ports: [{ id: 'web', hostPort: 80, protocol: 'tcp', description: '' }],
    }))
    expectSafeError(orphan, 409, 'INVALID_REFERENCE')
    expect(orphan.body).not.toMatch(/private|secret-host|FOREIGN KEY|INSERT/i)
    expect(
      database.connection.prepare("SELECT COUNT(*) FROM service_ports WHERE service_id = 'orphan'").pluck().get(),
    ).toBe(0)
    expect((await app.inject('/api/v1/services')).json()).toEqual({
      data: [],
      meta: { inventoryRevision: 0 },
    })
  })

  it('protects referenced hosts and cleans dependency links transactionally', async () => {
    const { app } = await fixture()
    await createHost(app)
    await createService(app, service('database', { hostId: 'host-1' }))
    await createService(app, service('app', { dependencyIds: ['database'] }))
    const protectedHost = await app.inject({
      method: 'DELETE', url: '/api/v1/hosts/host-1', payload: { expectedRevision: 1 },
    })
    expectSafeError(protectedHost, 409, 'INVALID_REFERENCE')

    const deleted = await app.inject({
      method: 'DELETE', url: '/api/v1/services/database', payload: { expectedRevision: 1 },
    })
    expect(deleted.json()).toEqual({ data: null, meta: { inventoryRevision: 4 } })
    expect((await app.inject('/api/v1/services/app')).json()).toMatchObject({
      data: { dependencyIds: [], revision: 2 },
      meta: { inventoryRevision: 4 },
    })
  })

  it('maps duplicate IDs to stable conflicts without leaking SQLite details', async () => {
    const { app } = await fixture()
    await createHost(app)
    const duplicate = await createHost(app)
    expectSafeError(duplicate, 409, 'RECORD_CONFLICT')
    expect(duplicate.body).not.toMatch(/SQLITE|UNIQUE|INSERT|hosts/i)
    expect((await app.inject('/api/v1/hosts')).json()).toMatchObject({
      data: [{ id: 'host-1' }],
      meta: { inventoryRevision: 1 },
    })
  })

  it('returns safe request-ID envelopes for malformed JSON and unexpected failures', async () => {
    const { app, database } = await fixture()
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/v1/hosts',
      headers: { 'content-type': 'application/json' },
      payload: '{',
    })
    expectSafeError(malformed, 400, 'VALIDATION_ERROR')

    database.connection
      .prepare("UPDATE application_metadata SET value = 'C:\\private\\secret.db' WHERE key = 'inventory_revision'")
      .run()
    const failure = await app.inject('/api/v1/hosts')
    expectSafeError(failure, 500, 'INTERNAL_ERROR')
    expect(failure.body).not.toMatch(/private|secret|SELECT|revision metadata/i)
  })

  it('normalizes unsupported media types without mutating inventory', async () => {
    const { app } = await fixture()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/hosts',
      headers: { 'content-type': 'application/xml' },
      payload: '<host><name>hidden parser detail</name></host>',
    })

    expectSafeError(response, 400, 'VALIDATION_ERROR')
    expect(response.json().error.message).toBe('The request is invalid.')
    expect(response.body).not.toMatch(/application\/xml|content.type|parser|hidden/i)
    expect((await app.inject('/api/v1/hosts')).json()).toEqual({
      data: [],
      meta: { inventoryRevision: 0 },
    })
  })

  it('does not add cross-origin headers', async () => {
    const { app } = await fixture()
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/hosts',
      headers: { origin: 'https://example.test' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })
})
