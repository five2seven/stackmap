import type { Host, Service, StackMapData } from '../domain/types'

export interface StackMapRepository {
  getAll(): Promise<StackMapData>
  putService(service: Service): Promise<void>
  deleteService(id: string): Promise<void>
  putHost(host: Host): Promise<void>
  deleteHost(id: string): Promise<void>
}

export type InventoryRecordKind = 'host' | 'service'

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly recoverable = true,
  ) {
    super(message)
    this.name = 'RepositoryError'
  }
}
