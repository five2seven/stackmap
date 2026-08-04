// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { NewInventoryHost, NewInventoryService } from './inventory.js'
import { openDatabase, type StackMapDatabase } from './database.js'
import {
  InventoryConflictError,
  InventoryNotFoundError,
  InventoryValidationError,
  SqliteInventoryRepository,
} from './repository.js'

const timestamp = '2026-08-03T12:00:00.000Z'
const later = '2026-08-03T13:00:00.000Z'
const cleanupTime = '2026-08-03T14:00:00.000Z'
const databases: StackMapDatabase[] = []
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.checkpointAndClose()
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

function fixture() {
  const database = openDatabase(':memory:')
  databases.push(database)
  return {
    database,
    repository: new SqliteInventoryRepository(database.connection, () => cleanupTime),
  }
}

function host(id = 'host-1', name = 'NAS'): NewInventoryHost {
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

describe('SqliteInventoryRepository', () => {
  it.each(['host', 'service'] as const)('reads a coherent snapshot across an interleaved %s mutation', (kind) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackmap-snapshot-'))
    temporaryDirectories.push(directory)
    const filename = path.join(directory, 'stackmap.db')
    const firstDatabase = openDatabase(filename)
    const secondDatabase = openDatabase(filename)
    databases.push(firstDatabase, secondDatabase)
    const reader = new SqliteInventoryRepository(firstDatabase.connection)
    const writer = new SqliteInventoryRepository(secondDatabase.connection)
    reader.createHost(host())
    const expectedRevision = reader.inventoryRevision()

    const snapshot = reader.inventorySnapshot(() => {
      if (kind === 'host') writer.createHost(host('host-2', 'Later host'))
      else writer.createService(service('later-service'))
    })

    expect(snapshot.revision).toBe(expectedRevision)
    expect(snapshot.hosts.map(({ id }) => id)).toEqual(['host-1'])
    expect(snapshot.services).toEqual([])
    expect(reader.inventoryRevision()).toBe(expectedRevision + 1)
  })

  it('round-trips complete records with stable IDs, timestamps, and child ordering', () => {
    const { repository } = fixture()
    expect(repository.inventoryRevision()).toBe(0)
    const createdHost = repository.createHost(host())
    const dependency = repository.createService(service('database', { name: 'Database' }))
    const created = repository.createService(
      service('app', {
        name: 'Application',
        hostId: createdHost.id,
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
        dependencyIds: [dependency.id],
      }),
    )

    expect(created).toMatchObject({
      id: 'app',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      ports: [{ id: 'https' }, { id: 'dns' }],
      paths: [{ id: 'config' }, { id: 'certs' }],
      dependencyIds: ['database'],
    })
    expect(repository.getHost('host-1')).toEqual({ ...host(), revision: 1 })
    expect(repository.listHosts().map(({ id }) => id)).toEqual(['host-1'])
    expect(repository.listServices().map(({ id }) => id)).toEqual(['app', 'database'])
    expect(repository.inventoryRevision()).toBe(3)
  })

  it('updates atomically, preserves creation timestamps, and rejects stale revisions', () => {
    const { repository } = fixture()
    const original = repository.createService(
      service('app', {
        ports: [{ id: 'web', hostPort: 80, protocol: 'tcp', description: '' }],
      }),
    )
    const updated = repository.updateService(
      {
        ...original,
        name: 'Updated',
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: later,
        ports: [{ id: 'web', hostPort: 8080, protocol: 'tcp', description: 'HTTP' }],
      },
      original.revision,
    )
    expect(updated).toMatchObject({
      name: 'Updated',
      revision: 2,
      createdAt: timestamp,
      updatedAt: later,
      ports: [{ id: 'web', hostPort: 8080 }],
    })
    const inventoryRevision = repository.inventoryRevision()
    expect(() =>
      repository.updateService(
        { ...updated, name: 'Stale', updatedAt: cleanupTime },
        original.revision,
      ),
    ).toThrow(InventoryConflictError)
    expect(repository.getService('app')).toEqual(updated)
    expect(repository.inventoryRevision()).toBe(inventoryRevision)
  })

  it('applies optimistic concurrency to host updates and deletes', () => {
    const { repository } = fixture()
    const created = repository.createHost(host())
    const updated = repository.updateHost(
      { ...created, name: 'Storage', createdAt: later, updatedAt: later },
      1,
    )
    expect(updated).toMatchObject({ name: 'Storage', revision: 2, createdAt: timestamp })
    expect(() => repository.deleteHost(created.id, 1)).toThrow(InventoryConflictError)
    repository.deleteHost(created.id, 2)
    expect(repository.getHost(created.id)).toBeUndefined()
    expect(() => repository.deleteHost(created.id, 2)).toThrow(InventoryNotFoundError)
  })

  it('rejects invalid references and rolls back the complete mutation', () => {
    const { database, repository } = fixture()
    expect(() =>
      repository.createService(service('orphan', { hostId: 'missing-host' })),
    ).toThrow(/FOREIGN KEY/)
    expect(repository.getService('orphan')).toBeUndefined()
    expect(repository.inventoryRevision()).toBe(0)

    repository.createService(service('dependency'))
    expect(() =>
      repository.createService(
        service('app', {
          dependencyIds: ['dependency', 'missing-service'],
          ports: [{ id: 'web', hostPort: 80, protocol: 'tcp', description: '' }],
        }),
      ),
    ).toThrow(/FOREIGN KEY/)
    expect(repository.getService('app')).toBeUndefined()
    expect(
      database.connection.prepare("SELECT COUNT(*) FROM service_ports WHERE service_id = 'app'").pluck().get(),
    ).toBe(0)
    expect(repository.inventoryRevision()).toBe(1)
  })

  it('protects referenced hosts and permits deletion after reassignment', () => {
    const { repository } = fixture()
    const createdHost = repository.createHost(host())
    const assigned = repository.createService(service('app', { hostId: createdHost.id }))
    expect(() => repository.deleteHost(createdHost.id, createdHost.revision)).toThrow(/FOREIGN KEY/)
    expect(repository.inventoryRevision()).toBe(2)
    repository.updateService({ ...assigned, hostId: undefined, updatedAt: later }, assigned.revision)
    repository.deleteHost(createdHost.id, createdHost.revision)
    expect(repository.getHost(createdHost.id)).toBeUndefined()
  })

  it('cascades service children and dependency links while revisioning dependents', () => {
    const { database, repository } = fixture()
    const dependency = repository.createService(
      service('database', {
        ports: [{ id: 'sql', containerPort: 5432, protocol: 'tcp', description: '' }],
        paths: [{ id: 'data', hostPath: '/data', containerPath: '/data', purpose: 'Data', readOnly: false }],
      }),
    )
    repository.createService(service('app', { dependencyIds: [dependency.id] }))
    repository.deleteService(dependency.id, dependency.revision)

    expect(repository.getService(dependency.id)).toBeUndefined()
    expect(repository.getService('app')).toMatchObject({
      dependencyIds: [],
      revision: 2,
      updatedAt: cleanupTime,
    })
    for (const table of ['service_ports', 'service_paths', 'service_dependencies']) {
      expect(
        database.connection.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get(),
      ).toBe(0)
    }
  })

  it('validates IDs, timestamps, ports, paths, and dependency uniqueness before writing', () => {
    const { repository } = fixture()
    const invalidRecords: NewInventoryService[] = [
      service(' ', {}),
      service('bad-time', { updatedAt: 'not-a-date' }),
      service('bad-port', { ports: [{ id: 'port', hostPort: 0, protocol: 'tcp', description: '' }] }),
      service('empty-port', { ports: [{ id: 'port', protocol: 'tcp', description: '' }] }),
      service('blank-path', { paths: [{ id: 'path', hostPath: '', containerPath: '', purpose: '', readOnly: false }] }),
      service('self', { dependencyIds: ['self'] }),
      service('duplicates', { dependencyIds: ['other', 'other'] }),
    ]
    for (const record of invalidRecords) {
      expect(() => repository.createService(record)).toThrow(InventoryValidationError)
    }
    expect(repository.listServices()).toEqual([])
    expect(repository.inventoryRevision()).toBe(0)
  })

  it('fails closed without writing when inventory revision metadata is invalid', () => {
    const { database, repository } = fixture()
    const invalidValues = [
      String(Number.MAX_SAFE_INTEGER + 1),
      '9'.repeat(400),
      '-1',
      '+1',
      '1.5',
      ' 1',
      '1 ',
      '1e3',
    ]
    const updateRevision = database.connection.prepare(
      "UPDATE application_metadata SET value = ? WHERE key = 'inventory_revision'",
    )
    const storedRevision = database.connection
      .prepare("SELECT value FROM application_metadata WHERE key = 'inventory_revision'")
      .pluck()

    for (const value of invalidValues) {
      updateRevision.run(value)
      expect(() => repository.inventoryRevision()).toThrow(
        /revision metadata is missing or invalid/,
      )
      expect(() => repository.createHost(host())).toThrow(
        /revision metadata is missing or invalid/,
      )
      expect(repository.getHost('host-1')).toBeUndefined()
      expect(storedRevision.get()).toBe(value)
    }
  })

  it('reads MAX_SAFE_INTEGER but fails closed before incrementing it', () => {
    const { database, repository } = fixture()
    const maximumRevision = String(Number.MAX_SAFE_INTEGER)
    database.connection
      .prepare("UPDATE application_metadata SET value = ? WHERE key = 'inventory_revision'")
      .run(maximumRevision)

    expect(repository.inventoryRevision()).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => repository.createService(service('app'))).toThrow(
      /revision cannot be incremented safely/,
    )
    expect(repository.getService('app')).toBeUndefined()
    expect(
      database.connection
        .prepare("SELECT value FROM application_metadata WHERE key = 'inventory_revision'")
        .pluck()
        .get(),
    ).toBe(maximumRevision)
  })

  it('increments an accepted safe revision from its exact stored representation', () => {
    const { database, repository } = fixture()
    database.connection
      .prepare("UPDATE application_metadata SET value = '0001' WHERE key = 'inventory_revision'")
      .run()

    expect(repository.inventoryRevision()).toBe(1)
    repository.createHost(host())
    expect(repository.inventoryRevision()).toBe(2)
  })
})
