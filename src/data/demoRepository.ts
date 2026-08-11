import type { Host, Service, StackMapData } from '../domain/types'
import { RepositoryError, type StackMapRepository } from './repository'
import { demoSampleData } from './demoSampleData'

function cloneData(data: Readonly<StackMapData>): StackMapData {
  return {
    hosts: data.hosts.map((host) => ({ ...host })),
    services: data.services.map((service) => ({
      ...service,
      ports: service.ports.map((port) => ({ ...port })),
      paths: service.paths.map((path) => ({ ...path })),
      dependencyIds: [...service.dependencyIds],
    })),
  }
}

export class DemoMemoryRepository implements StackMapRepository {
  private data: StackMapData

  constructor(seed: Readonly<StackMapData> = demoSampleData) {
    this.data = cloneData(seed)
  }

  async getAll(): Promise<StackMapData> {
    return cloneData(this.data)
  }

  async putService(service: Service): Promise<void> {
    const index = this.data.services.findIndex(({ id }) => id === service.id)
    const next = cloneData({ hosts: [], services: [service] }).services[0]
    if (index === -1) this.data.services.push(next)
    else this.data.services[index] = next
  }

  async deleteService(id: string): Promise<void> {
    this.data.services = this.data.services
      .filter((service) => service.id !== id)
      .map((service) => ({
        ...service,
        dependencyIds: service.dependencyIds.filter((dependencyId) => dependencyId !== id),
      }))
  }

  async putHost(host: Host): Promise<void> {
    const index = this.data.hosts.findIndex(({ id }) => id === host.id)
    if (index === -1) this.data.hosts.push({ ...host })
    else this.data.hosts[index] = { ...host }
  }

  async deleteHost(id: string): Promise<void> {
    if (this.data.services.some(({ hostId }) => hostId === id)) {
      throw new RepositoryError(
        'This host still has services assigned. Reassign or remove them before deleting the host.',
        'HOST_IN_USE',
      )
    }
    this.data.hosts = this.data.hosts.filter((host) => host.id !== id)
  }
}

export function createDemoRepository(): StackMapRepository {
  return new DemoMemoryRepository()
}
