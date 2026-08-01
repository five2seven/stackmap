import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createService } from '../domain/serviceUtils'
import type { Host, Service } from '../domain/types'
import { DexieStackMapRepository, StackMapDatabase } from './database'

const databaseNames: string[] = []

function uniqueDatabaseName() {
  const name = `stackmap-test-${crypto.randomUUID()}`
  databaseNames.push(name)
  return name
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)))
})

describe('DexieStackMapRepository', () => {
  it('persists records and stores the local schema version', async () => {
    const database = new StackMapDatabase(uniqueDatabaseName())
    const repository = new DexieStackMapRepository(database)
    expect(database.verno).toBe(4)
    await repository.putService(createService('Persistent service'))

    expect(await repository.getSchemaVersion()).toBe(3)
    expect((await repository.getAll()).services[0].name).toBe('Persistent service')

    database.close()
    const reopened = new DexieStackMapRepository(new StackMapDatabase(database.name))
    expect((await reopened.getAll()).services[0].name).toBe('Persistent service')
  })

  it('migrates an existing version 1 database without losing records', async () => {
    const name = uniqueDatabaseName()
    class LegacyDatabase extends Dexie {
      services!: EntityTable<Service, 'id'>
      hosts!: EntityTable<Host, 'id'>

      constructor() {
        super(name)
        this.version(1).stores({
          services: 'id, name, status, hostId, network, exposure, updatedAt',
          hosts: 'id, name, type, updatedAt',
        })
      }
    }

    const current = {
      ...createService('Legacy service'),
      hostId: 'host-1',
      dependencyIds: ['dependency-1'],
      ports: [{ hostPort: 8080, containerPort: 80, protocol: 'tcp' as const, description: 'web' }],
      configPath: '/srv/appdata/legacy',
      dataPath: '/srv/data/legacy',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    }
    const legacyService: Record<string, unknown> = { ...current }
    delete legacyService.containerName
    delete legacyService.dockerImage
    delete legacyService.description
    delete legacyService.applicationUrl
    delete legacyService.paths
    const legacy = new LegacyDatabase()
    await legacy.services.add(legacyService as unknown as Service)
    legacy.close()

    const repository = new DexieStackMapRepository(new StackMapDatabase(name))
    expect(await repository.getSchemaVersion()).toBe(3)
    const migrated = (await repository.getAll()).services[0]
    const currentWithoutLegacy: Record<string, unknown> = { ...current }
    delete currentWithoutLegacy.configPath
    delete currentWithoutLegacy.dataPath
    expect(migrated).toEqual({
      ...currentWithoutLegacy,
      containerName: '',
      dockerImage: '',
      description: '',
      applicationUrl: '',
      paths: [
        { id: `${current.id}-configuration-path`, hostPath: '/srv/appdata/legacy', containerPath: '', purpose: 'Configuration', readOnly: false },
        { id: `${current.id}-data-path`, hostPath: '/srv/data/legacy', containerPath: '', purpose: 'Data', readOnly: false },
      ],
    })
  })

  it('keeps existing data when replacement fails', async () => {
    const database = new StackMapDatabase(uniqueDatabaseName())
    const repository = new DexieStackMapRepository(database)
    await repository.putService(createService('Keep me'))
    const duplicate = createService('Duplicate ID')

    await expect(
      repository.replaceAll({
        services: [duplicate, { ...duplicate, name: 'Second duplicate' }],
        hosts: [],
      }),
    ).rejects.toThrow()

    expect((await repository.getAll()).services.map((service) => service.name)).toEqual(['Keep me'])
  })

  it('migrates version 3 fixed paths individually and ignores empty values', async () => {
    const name = uniqueDatabaseName()
    class VersionThreeDatabase extends Dexie {
      services!: EntityTable<Service, 'id'>
      constructor() {
        super(name)
        this.version(3).stores({ services: 'id, name, status, hostId, network, exposure, updatedAt' })
      }
    }
    const legacy = new VersionThreeDatabase()
    const makeLegacy = (id: string, configPath: string, dataPath: string) => {
      const record: Record<string, unknown> = { ...createService(id), id, configPath, dataPath }
      delete record.paths
      return record as unknown as Service
    }
    await legacy.services.bulkAdd([
      makeLegacy('config-only', '/config', ''),
      makeLegacy('data-only', '', '/data'),
      makeLegacy('empty', '', ''),
    ])
    legacy.close()

    const migrated = (await new DexieStackMapRepository(new StackMapDatabase(name)).getAll()).services
    expect(migrated.find((service) => service.id === 'config-only')?.paths).toMatchObject([
      { hostPath: '/config', purpose: 'Configuration', readOnly: false },
    ])
    expect(migrated.find((service) => service.id === 'data-only')?.paths).toMatchObject([
      { hostPath: '/data', purpose: 'Data', readOnly: false },
    ])
    expect(migrated.find((service) => service.id === 'empty')?.paths).toEqual([])
  })
})
