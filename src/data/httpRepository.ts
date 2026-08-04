import {
  EXPOSURES,
  HOST_TYPES,
  PORT_PROTOCOLS,
  SERVICE_STATUSES,
  type Host,
  type Service,
  type StackMapData,
} from '../domain/types'
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
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 15_000,
  ) {}

  async request<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T>> {
    let response: Response
    const controller = new AbortController()
    let timedOut = false
    const abortFromCaller = () => controller.abort()
    init?.signal?.addEventListener('abort', abortFromCaller, { once: true })
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.timeoutMs)
    try {
      response = await this.fetcher.call(globalThis, path, {
        ...init,
        signal: controller.signal,
        headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
      })
    } catch {
      if (timedOut) {
        throw new RepositoryError(
          'The server request timed out. Your changes are still in the form; retry when the server is available.',
          'REQUEST_TIMEOUT',
        )
      }
      throw new RepositoryError(
        'StackMap could not reach the server. Your changes are still in the form; retry when the connection is available.',
        'NETWORK_ERROR',
      )
    } finally {
      globalThis.clearTimeout(timeout)
      init?.signal?.removeEventListener('abort', abortFromCaller)
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

    const body = await safeJson<unknown>(response)
    if (!isValidEnvelope(body) || !isValidResponseData(path, init?.method, body.data)) {
      throw new RepositoryError('The server returned an invalid response. No local fallback write was attempted.', 'INVALID_RESPONSE')
    }
    return body as ApiEnvelope<T>
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const hasExactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key))
const hasAllowedKeys = (value: Record<string, unknown>, allowed: string[], required: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key)) && required.every((key) => key in value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNonblank = (value: unknown): value is string => isString(value) && value.trim().length > 0
const isTimestamp = (value: unknown): value is string =>
  isString(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
const isRevision = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0
const isPortNumber = (value: unknown) =>
  value === undefined || (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 65_535)

function isValidEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (!isObject(value) || !hasExactKeys(value, ['data', 'meta']) || !isObject(value.meta)) return false
  return hasExactKeys(value.meta, ['inventoryRevision']) &&
    Number.isSafeInteger(value.meta.inventoryRevision) && Number(value.meta.inventoryRevision) >= 0
}

function isApiHost(value: unknown): value is ApiHost {
  if (!isObject(value) || !hasExactKeys(value, [
    'id', 'name', 'type', 'ipAddress', 'operatingSystem', 'notes', 'createdAt', 'updatedAt', 'revision',
  ])) return false
  return isNonblank(value.id) && isNonblank(value.name) && HOST_TYPES.includes(value.type as Host['type']) &&
    isString(value.ipAddress) && isString(value.operatingSystem) && isString(value.notes) &&
    isTimestamp(value.createdAt) && isTimestamp(value.updatedAt) && isRevision(value.revision)
}

function isApiPort(value: unknown): boolean {
  if (!isObject(value) || !hasAllowedKeys(
    value,
    ['id', 'hostPort', 'containerPort', 'protocol', 'description'],
    ['id', 'protocol', 'description'],
  )) return false
  return isNonblank(value.id) && isPortNumber(value.hostPort) && isPortNumber(value.containerPort) &&
    (value.hostPort !== undefined || value.containerPort !== undefined) &&
    PORT_PROTOCOLS.includes(value.protocol as Service['ports'][number]['protocol']) && isString(value.description)
}

function isApiPath(value: unknown): boolean {
  if (!isObject(value) || !hasExactKeys(value, ['id', 'hostPath', 'containerPath', 'purpose', 'readOnly'])) return false
  return isNonblank(value.id) && isString(value.hostPath) && isString(value.containerPath) &&
    isString(value.purpose) && typeof value.readOnly === 'boolean' &&
    Boolean(value.hostPath.trim() || value.containerPath.trim() || value.purpose.trim())
}

function isApiService(value: unknown): value is ApiService {
  const keys = [
    'id', 'name', 'containerName', 'dockerImage', 'description', 'applicationUrl', 'status', 'hostId',
    'internalUrl', 'ports', 'paths', 'network', 'exposure', 'dependencyIds', 'notes', 'createdAt',
    'updatedAt', 'revision',
  ]
  if (!isObject(value) || !hasAllowedKeys(value, keys, keys.filter((key) => key !== 'hostId'))) return false
  const ports = value.ports
  const paths = value.paths
  const dependencies = value.dependencyIds
  return isNonblank(value.id) && isNonblank(value.name) && isString(value.containerName) &&
    isString(value.dockerImage) && isString(value.description) && isString(value.applicationUrl) &&
    SERVICE_STATUSES.includes(value.status as Service['status']) &&
    (value.hostId === undefined || isNonblank(value.hostId)) && isString(value.internalUrl) &&
    Array.isArray(ports) && ports.every(isApiPort) &&
    new Set(ports.map((port) => (port as Record<string, unknown>).id)).size === ports.length &&
    Array.isArray(paths) && paths.every(isApiPath) &&
    new Set(paths.map((path) => (path as Record<string, unknown>).id)).size === paths.length &&
    isString(value.network) && EXPOSURES.includes(value.exposure as Service['exposure']) &&
    Array.isArray(dependencies) && dependencies.every(isNonblank) && new Set(dependencies).size === dependencies.length &&
    isString(value.notes) && isTimestamp(value.createdAt) && isTimestamp(value.updatedAt) && isRevision(value.revision)
}

function isValidResponseData(path: string, method = 'GET', data: unknown): boolean {
  if (method === 'DELETE') return data === null
  const isHosts = path === '/api/v1/hosts' || path.startsWith('/api/v1/hosts/')
  const isServices = path === '/api/v1/services' || path.startsWith('/api/v1/services/')
  if (!isHosts && !isServices) return false
  if (method === 'GET' && !path.endsWith('/')) {
    if (path === '/api/v1/hosts') return Array.isArray(data) && data.every(isApiHost)
    if (path === '/api/v1/services') return Array.isArray(data) && data.every(isApiService)
  }
  return isHosts ? isApiHost(data) : isApiService(data)
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
