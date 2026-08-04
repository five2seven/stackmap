import type { Host, Service, StackMapData } from '../domain/types'
import { createUuid } from '../utils/uuid'
import { RepositoryError, type StackMapRepository } from './repository'

type ApiHost = Host & { revision: number }
type ApiService = Service & {
  revision: number
  ports: Array<Service['ports'][number] & { id: string }>
}

type ApiEnvelope<T> = { data: T; meta: { inventoryRevision: number } }
type ErrorEnvelope = { error?: { code?: string; message?: string; requestId?: string } }

export interface ApiClient {
  request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>>
}

export class SameOriginApiClient implements ApiClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
    let response: Response
    try {
      response = await this.fetcher.call(globalThis, path, {
        ...init,
        headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
      })
    } catch {
      throw new RepositoryError(
        'StackMap could not reach the server. Your changes are still in the form; retry when the connection is available.',
        'NETWORK_ERROR',
      )
    }

    if (!response.ok) {
      const body = await safeJson<ErrorEnvelope>(response)
      const code = body?.error?.code ?? 'REQUEST_FAILED'
      if (response.status === 409 && code === 'REVISION_CONFLICT') {
        throw new RepositoryError(
          'This record changed in another browser. Your edits are still in the form; reload the inventory before trying again.',
          code,
        )
      }
      if (response.status === 409) {
        throw new RepositoryError(
          'The change conflicts with the current server inventory. Review the latest inventory and try again.',
          code,
        )
      }
      if (response.status === 400) {
        throw new RepositoryError('The server rejected this change. Review the form and try again.', code)
      }
      if (response.status === 404) {
        throw new RepositoryError('This record no longer exists. Reload the inventory to continue.', code)
      }
      throw new RepositoryError(
        'The server could not complete the request. Your local form values were not discarded.',
        code,
      )
    }

    const body = await safeJson<ApiEnvelope<T>>(response)
    if (!body || !('data' in body) || !body.meta || !Number.isSafeInteger(body.meta.inventoryRevision)) {
      throw new RepositoryError('The server returned an invalid response. No local fallback write was attempted.', 'INVALID_RESPONSE')
    }
    return body
  }
}

async function safeJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T
  } catch {
    return undefined
  }
}

function withoutRevision<T extends { revision: number }>(record: T): Omit<T, 'revision'> {
  const value = { ...record }
  delete (value as Partial<T>).revision
  return value
}

export class HttpStackMapRepository implements StackMapRepository {
  private readonly hostRevisions = new Map<string, number>()
  private readonly serviceRevisions = new Map<string, number>()
  private inventoryRevision = 0

  constructor(private readonly client: ApiClient = new SameOriginApiClient()) {}

  getInventoryRevision(): number {
    return this.inventoryRevision
  }

  async getAll(): Promise<StackMapData> {
    let hostsResponse: ApiEnvelope<ApiHost[]> | undefined
    let servicesResponse: ApiEnvelope<ApiService[]> | undefined
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const responses = await Promise.all([
        this.client.request<ApiHost[]>('/api/v1/hosts'),
        this.client.request<ApiService[]>('/api/v1/services'),
      ])
      hostsResponse = responses[0]
      servicesResponse = responses[1]
      if (hostsResponse.meta.inventoryRevision === servicesResponse.meta.inventoryRevision) break
    }
    if (!hostsResponse || !servicesResponse || hostsResponse.meta.inventoryRevision !== servicesResponse.meta.inventoryRevision) {
      throw new RepositoryError(
        'The server inventory changed while it was loading. Retry to load one consistent revision.',
        'INCONSISTENT_INVENTORY_REVISION',
      )
    }
    this.inventoryRevision = hostsResponse.meta.inventoryRevision
    this.hostRevisions.clear()
    this.serviceRevisions.clear()
    const hosts = hostsResponse.data.map((host) => {
      this.hostRevisions.set(host.id, host.revision)
      return withoutRevision(host)
    })
    const services = servicesResponse.data.map((service) => {
      this.serviceRevisions.set(service.id, service.revision)
      return withoutRevision(service)
    })
    return { hosts, services }
  }

  async putHost(host: Host): Promise<void> {
    const expectedRevision = this.hostRevisions.get(host.id)
    const response = expectedRevision === undefined
      ? await this.client.request<ApiHost>('/api/v1/hosts', { method: 'POST', body: JSON.stringify(host) })
      : await this.client.request<ApiHost>(`/api/v1/hosts/${encodeURIComponent(host.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ expectedRevision, host }),
        })
    this.hostRevisions.set(host.id, response.data.revision)
    this.inventoryRevision = response.meta.inventoryRevision
  }

  async deleteHost(id: string): Promise<void> {
    const expectedRevision = this.requireRevision(this.hostRevisions, id)
    const response = await this.client.request<null>(`/api/v1/hosts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expectedRevision }),
    })
    this.hostRevisions.delete(id)
    this.inventoryRevision = response.meta.inventoryRevision
  }

  async putService(service: Service): Promise<void> {
    const record = {
      ...service,
      ports: service.ports.map((port) => ({ ...port, id: port.id ?? createUuid() })),
    }
    const expectedRevision = this.serviceRevisions.get(service.id)
    const response = expectedRevision === undefined
      ? await this.client.request<ApiService>('/api/v1/services', { method: 'POST', body: JSON.stringify(record) })
      : await this.client.request<ApiService>(`/api/v1/services/${encodeURIComponent(service.id)}`, {
          method: 'PUT',
          body: JSON.stringify({ expectedRevision, service: record }),
        })
    this.serviceRevisions.set(service.id, response.data.revision)
    this.inventoryRevision = response.meta.inventoryRevision
  }

  async deleteService(id: string): Promise<void> {
    const expectedRevision = this.requireRevision(this.serviceRevisions, id)
    const response = await this.client.request<null>(`/api/v1/services/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      body: JSON.stringify({ expectedRevision }),
    })
    this.serviceRevisions.delete(id)
    this.inventoryRevision = response.meta.inventoryRevision
  }

  private requireRevision(revisions: Map<string, number>, id: string): number {
    const revision = revisions.get(id)
    if (revision === undefined) {
      throw new RepositoryError('The record revision is unavailable. Reload the inventory and try again.', 'MISSING_REVISION')
    }
    return revision
  }
}

export const repository = new HttpStackMapRepository()
