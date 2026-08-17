// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase, type StackMapDatabase } from './database.js'
import type { NewInventoryHost, NewInventoryService } from './inventory.js'
import { PortainerImportConflictError, SqliteInventoryRepository, type PortainerImportStage } from './repository.js'

const databases: StackMapDatabase[] = []
afterEach(() => { for (const database of databases.splice(0)) database.checkpointAndClose() })
const time = '2026-08-12T15:00:00.000Z'
const host = (id = 'import-host'): NewInventoryHost => ({ id, name: 'Docker', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: time, updatedAt: time })
const service = (id = 'import-service', hostId = 'import-host'): NewInventoryService => ({
  id, name: 'App', containerName: 'app', dockerImage: 'app:1', description: '', applicationUrl: '', status: 'active', hostId,
  internalUrl: '', ports: [{ id: 'port', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }],
  paths: [{ id: 'path', hostPath: '/srv/app', containerPath: '/data', purpose: '', readOnly: true }], network: 'bridge', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: time, updatedAt: time,
})
function fixture() { const database = openDatabase(':memory:'); databases.push(database); return { database, repository: new SqliteInventoryRepository(database.connection, () => time) } }

describe('atomic Portainer import repository', () => {
  it('creates records, children, and non-secret bindings atomically with one global revision', () => {
    const { database, repository } = fixture()
    const result = repository.importPortainer({ origin: 'https://portainer.example', expectedRevision: 0, hosts: [{ environmentId: 7, host: host() }], services: [{ environmentId: 7, containerId: 'container-id', service: service() }] })
    expect(result).toEqual({ inventoryRevision: 1, hostIds: ['import-host'], serviceIds: ['import-service'] })
    expect(repository.getHost('import-host')?.revision).toBe(1)
    expect(repository.getService('import-service')).toMatchObject({ revision: 1, ports: [{ id: 'port' }], paths: [{ id: 'path' }] })
    expect(repository.portainerBindings('https://portainer.example')).toEqual({ environments: [{ environmentId: 7, hostId: 'import-host' }], containers: [{ environmentId: 7, containerId: 'container-id', serviceId: 'import-service' }] })
    expect(JSON.stringify(database.connection.prepare('SELECT * FROM portainer_sources').all())).not.toContain('token')
  })

  it('attaches to an existing host without updating it', () => {
    const { repository } = fixture()
    repository.createHost(host('existing'))
    const before = repository.getHost('existing')
    const result = repository.importPortainer({ origin: 'https://portainer.example', expectedRevision: 1, hosts: [], services: [{ environmentId: 7, containerId: 'container-id', service: service('import-service', 'existing') }] })
    expect(result.hostIds).toEqual([])
    expect(repository.getHost('existing')).toEqual(before)
    expect(repository.getService('import-service')?.hostId).toBe('existing')
    expect(repository.portainerBindings('https://portainer.example').environments).toEqual([{ environmentId: 7, hostId: 'existing' }])
  })

  it('rolls back stale and repeated imports without advancing inventory', () => {
    const { database, repository } = fixture()
    const selection = { origin: 'https://portainer.example', expectedRevision: 0, hosts: [{ environmentId: 7, host: host() }], services: [{ environmentId: 7, containerId: 'container-id', service: service() }] }
    expect(() => repository.importPortainer({ ...selection, expectedRevision: 1 })).toThrowError(PortainerImportConflictError)
    expect(repository.inventorySnapshot()).toEqual({ revision: 0, hosts: [], services: [] })
    repository.importPortainer(selection)
    const before = database.connection.serialize()
    expect(() => repository.importPortainer({ ...selection, expectedRevision: 1, hosts: [], services: [{ ...selection.services[0], service: service('replacement') }] })).toThrowError(PortainerImportConflictError)
    expect(database.connection.serialize()).toEqual(before)
  })

  it('atomically rebinds deleted-service provenance and restores repeat-import protection', () => {
    const { database, repository } = fixture()
    repository.importPortainer({ origin: 'https://portainer.example', expectedRevision: 0, hosts: [{ environmentId: 7, host: host() }], services: [{ environmentId: 7, containerId: 'container-id', service: service() }] })
    repository.deleteService('import-service', 1)

    expect(repository.portainerBindings('https://portainer.example').containers).toEqual([{ environmentId: 7, containerId: 'container-id' }])
    const result = repository.importPortainer({
      origin: 'https://portainer.example', expectedRevision: 2, hosts: [],
      services: [{ environmentId: 7, containerId: 'container-id', service: service('replacement') }],
    })

    expect(result).toEqual({ inventoryRevision: 3, hostIds: [], serviceIds: ['replacement'] })
    expect(repository.getService('replacement')).toMatchObject({ hostId: 'import-host', revision: 1 })
    expect(repository.portainerBindings('https://portainer.example').containers).toEqual([{ environmentId: 7, containerId: 'container-id', serviceId: 'replacement' }])
    const before = database.connection.serialize()
    expect(() => repository.importPortainer({
      origin: 'https://portainer.example', expectedRevision: 3, hosts: [],
      services: [{ environmentId: 7, containerId: 'container-id', service: service('duplicate') }],
    })).toThrowError(new PortainerImportConflictError('PORTAINER_ALREADY_BOUND'))
    expect(database.connection.serialize()).toEqual(before)
  })

  it('rolls back a stale-binding re-import failure without changing inventory or provenance', () => {
    const { database, repository } = fixture()
    repository.importPortainer({ origin: 'https://portainer.example', expectedRevision: 0, hosts: [{ environmentId: 7, host: host() }], services: [{ environmentId: 7, containerId: 'container-id', service: service() }] })
    repository.deleteService('import-service', 1)
    const before = database.connection.serialize()
    expect(() => repository.importPortainer({
      origin: 'https://portainer.example', expectedRevision: 1, hosts: [],
      services: [{ environmentId: 7, containerId: 'container-id', service: service('stale-revision') }],
    })).toThrowError(new PortainerImportConflictError('PORTAINER_PREVIEW_STALE'))
    expect(database.connection.serialize()).toEqual(before)
    const failingRepository = new SqliteInventoryRepository(database.connection, () => time, (stage) => {
      if (stage === 'binding') throw new Error('injected stale-binding failure')
    })

    expect(() => failingRepository.importPortainer({
      origin: 'https://portainer.example', expectedRevision: 2, hosts: [],
      services: [{ environmentId: 7, containerId: 'container-id', service: service('replacement') }],
    })).toThrow('injected stale-binding failure')
    expect(database.connection.serialize()).toEqual(before)
    expect(repository.getService('replacement')).toBeUndefined()
    expect(repository.portainerBindings('https://portainer.example').containers).toEqual([{ environmentId: 7, containerId: 'container-id' }])
  })

  it.each<PortainerImportStage>(['source', 'host', 'service', 'children', 'binding', 'revision'])(
    'rolls back every inventory and provenance write after the %s stage fails',
    (failedStage) => {
      const database = openDatabase(':memory:')
      databases.push(database)
      const before = database.connection.serialize()
      const repository = new SqliteInventoryRepository(database.connection, () => time, (stage) => {
        if (stage === failedStage) throw new Error(`injected ${stage} failure`)
      })

      expect(() => repository.importPortainer({
        origin: 'https://portainer.example', expectedRevision: 0,
        hosts: [{ environmentId: 7, host: host() }],
        services: [{ environmentId: 7, containerId: 'container-id', service: service() }],
      })).toThrow(`injected ${failedStage} failure`)

      expect(database.connection.serialize()).toEqual(before)
      expect(repository.inventorySnapshot()).toEqual({ revision: 0, hosts: [], services: [] })
      expect(repository.portainerBindings('https://portainer.example')).toEqual({ environments: [], containers: [] })
      for (const table of ['service_ports', 'service_paths', 'portainer_sources', 'portainer_host_bindings', 'portainer_container_bindings']) {
        expect(database.connection.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0)
      }
    },
  )

  it('clears provenance transactionally on full restore without changing backup shape', () => {
    const { repository } = fixture()
    repository.importPortainer({ origin: 'https://portainer.example', expectedRevision: 0, hosts: [{ environmentId: 7, host: host() }], services: [{ environmentId: 7, containerId: 'container-id', service: service() }] })
    repository.replaceInventory([], [], 1)
    expect(repository.portainerBindings('https://portainer.example')).toEqual({ environments: [], containers: [] })
    expect(repository.inventoryRevision()).toBe(2)
  })

  it('retains provenance when full restore rolls back', () => {
    const { repository } = fixture()
    repository.importPortainer({ origin: 'https://portainer.example', expectedRevision: 0, hosts: [{ environmentId: 7, host: host() }], services: [{ environmentId: 7, containerId: 'container-id', service: service() }] })
    expect(() => repository.replaceInventory([], [service('invalid', 'missing-host')], 1)).toThrow()
    expect(repository.portainerBindings('https://portainer.example').containers).toEqual([{ environmentId: 7, containerId: 'container-id', serviceId: 'import-service' }])
    expect(repository.inventoryRevision()).toBe(1)
  })
})
