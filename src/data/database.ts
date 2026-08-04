import Dexie, { type EntityTable } from 'dexie'
import { CURRENT_SCHEMA_VERSION } from '../domain/schema'
import { migrateLegacyPaths } from '../domain/pathMappings'
import type { Host, Service, StackMapData } from '../domain/types'
import type { StackMapRepository } from './repository'

export type { StackMapRepository } from './repository'

interface StackMapMetadata {
  key: 'schemaVersion'
  value: number
}

export class StackMapDatabase extends Dexie {
  services!: EntityTable<Service, 'id'>
  hosts!: EntityTable<Host, 'id'>
  metadata!: EntityTable<StackMapMetadata, 'key'>

  constructor(name = 'stackmap') {
    super(name)
    this.version(1).stores({
      services: 'id, name, status, hostId, network, exposure, updatedAt',
      hosts: 'id, name, type, updatedAt',
    })
    this.version(2)
      .stores({
        services: 'id, name, status, hostId, network, exposure, updatedAt',
        hosts: 'id, name, type, updatedAt',
        metadata: 'key',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StackMapMetadata, 'key'>('metadata')
          .put({ key: 'schemaVersion', value: CURRENT_SCHEMA_VERSION })
      })
    this.version(3)
      .stores({
        services: 'id, name, status, hostId, network, exposure, updatedAt',
        hosts: 'id, name, type, updatedAt',
        metadata: 'key',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Service, 'id'>('services')
          .toCollection()
          .modify((service) => {
            service.containerName ??= ''
            service.dockerImage ??= ''
            service.description ??= ''
            service.applicationUrl ??= ''
          })
        await transaction
          .table<StackMapMetadata, 'key'>('metadata')
          .put({ key: 'schemaVersion', value: CURRENT_SCHEMA_VERSION })
      })
    this.version(4)
      .stores({
        services: 'id, name, status, hostId, network, exposure, updatedAt',
        hosts: 'id, name, type, updatedAt',
        metadata: 'key',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Record<string, unknown>, 'id'>('services')
          .toCollection()
          .modify((service) => {
            const configPath = typeof service.configPath === 'string' ? service.configPath : ''
            const dataPath = typeof service.dataPath === 'string' ? service.dataPath : ''
            service.paths = migrateLegacyPaths(String(service.id), { configPath, dataPath })
            delete service.configPath
            delete service.dataPath
          })
        await transaction
          .table<StackMapMetadata, 'key'>('metadata')
          .put({ key: 'schemaVersion', value: CURRENT_SCHEMA_VERSION })
      })
  }
}

export class DexieStackMapRepository implements StackMapRepository {
  constructor(private readonly database = new StackMapDatabase()) {}

  async getAll(): Promise<StackMapData> {
    await this.getSchemaVersion()
    const [services, hosts] = await Promise.all([
      this.database.services.toArray(),
      this.database.hosts.toArray(),
    ])
    return { services, hosts }
  }

  async putService(service: Service) {
    if (service.hostId && !(await this.database.hosts.get(service.hostId))) {
      throw new Error('The selected host no longer exists.')
    }
    const dependencyCount = await this.database.services
      .where('id')
      .anyOf(service.dependencyIds)
      .count()
    if (dependencyCount !== new Set(service.dependencyIds).size) {
      throw new Error('One or more selected dependencies no longer exist.')
    }
    await this.database.services.put(service)
  }

  async deleteService(id: string) {
    await this.database.transaction('rw', this.database.services, async () => {
      await this.database.services.delete(id)
      const dependents = await this.database.services
        .filter((service) => service.dependencyIds.includes(id))
        .toArray()
      await this.database.services.bulkPut(
        dependents.map((service) => ({
          ...service,
          dependencyIds: service.dependencyIds.filter((dependencyId) => dependencyId !== id),
          updatedAt: new Date().toISOString(),
        })),
      )
    })
  }

  async putHost(host: Host) {
    await this.database.hosts.put(host)
  }

  async deleteHost(id: string) {
    const referenceCount = await this.database.services.where('hostId').equals(id).count()
    if (referenceCount > 0) {
      throw new Error('This host is assigned to one or more services.')
    }
    await this.database.hosts.delete(id)
  }

  async replaceAll(data: StackMapData) {
    await this.database.transaction(
      'rw',
      this.database.services,
      this.database.hosts,
      async () => {
        await Promise.all([this.database.services.clear(), this.database.hosts.clear()])
        await this.database.services.bulkAdd(data.services)
        await this.database.hosts.bulkAdd(data.hosts)
      },
    )
  }

  async getSchemaVersion() {
    const metadata = await this.database.metadata.get('schemaVersion')
    if (!metadata) {
      await this.database.metadata.put({
        key: 'schemaVersion',
        value: CURRENT_SCHEMA_VERSION,
      })
      return CURRENT_SCHEMA_VERSION
    }
    return metadata.value
  }
}

export const repository = new DexieStackMapRepository()
