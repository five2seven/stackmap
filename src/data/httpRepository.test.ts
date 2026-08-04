import { describe, expect, it, vi } from 'vitest'
import { createService } from '../domain/serviceUtils'
import type { Host } from '../domain/types'
import { HttpStackMapRepository, SameOriginApiClient, type ApiClient } from './httpRepository'
import { RepositoryError } from './repository'

const host: Host = {
  id: 'host-1', name: 'Host', type: 'nas', ipAddress: '', operatingSystem: '', notes: '',
  createdAt: '2026-08-04T00:00:00.000Z', updatedAt: '2026-08-04T00:00:00.000Z',
}
const timestamp = '2026-08-04T00:00:00.000Z'
const apiHost = { ...host, revision: 1 }
const apiService = {
  ...createService('Complete app'),
  id: 'service-1',
  ports: [{ id: 'port-1', hostPort: 8080, containerPort: 80, protocol: 'tcp' as const, description: 'HTTP' }],
  paths: [{ id: 'path-1', hostPath: '/srv/app', containerPath: '/config', purpose: 'Configuration', readOnly: false }],
  dependencyIds: ['dependency-1'],
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: 2,
}

function response(data: unknown, meta: unknown = { inventoryRevision: 1 }) {
  return new Response(JSON.stringify({ data, meta }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('HttpStackMapRepository', () => {
  it('loads the complete model and propagates expected revisions', async () => {
    const service = { ...createService('App'), id: 'service-1', ports: [{ id: 'port-1', hostPort: 80, protocol: 'tcp' as const, description: '' }] }
    const requests: Array<{ path: string; init?: RequestInit }> = []
    const client: ApiClient = {
      request: vi.fn(async (path: string, init?: RequestInit) => {
        requests.push({ path, init })
        if (!init && path.endsWith('/hosts')) return { data: [{ ...host, revision: 3 }], meta: { inventoryRevision: 5 } }
        if (!init && path.endsWith('/services')) return { data: [{ ...service, revision: 7 }], meta: { inventoryRevision: 5 } }
        if (path.includes('/hosts/')) return { data: { ...host, revision: 4 }, meta: { inventoryRevision: 6 } }
        return { data: { ...service, revision: 8 }, meta: { inventoryRevision: 6 } }
      }) as ApiClient['request'],
    }
    const repository = new HttpStackMapRepository(client)
    const data = await repository.getAll()
    expect(data).toEqual({ hosts: [host], services: [service] })
    expect(repository.getInventoryRevision()).toBe(5)
    await repository.putHost({ ...host, name: 'Updated' })
    await repository.putService({ ...service, name: 'Updated app' })
    expect(JSON.parse(String(requests[2].init?.body))).toMatchObject({ expectedRevision: 3 })
    expect(JSON.parse(String(requests[3].init?.body))).toMatchObject({ expectedRevision: 7 })
  })

  it('creates new records without dual writes and gives new ports stable ids', async () => {
    const calls: Array<{ path: string; body: unknown }> = []
    const client: ApiClient = { request: vi.fn(async (path, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ path, body })
      return { data: { ...body, revision: 1 }, meta: { inventoryRevision: 1 } }
    }) as ApiClient['request'] }
    const repository = new HttpStackMapRepository(client)
    await repository.putService({ ...createService('New'), ports: [{ hostPort: 80, protocol: 'tcp', description: '' }] })
    expect(calls).toHaveLength(1)
    expect(calls[0].path).toBe('/api/v1/services')
    expect(calls[0].body).toMatchObject({ ports: [{ id: expect.any(String), hostPort: 80 }] })
  })

  it('retries split list revisions and fails closed without exposing a mixed snapshot', async () => {
    let requestCount = 0
    const client: ApiClient = { request: vi.fn(async (path) => {
      requestCount += 1
      return {
        data: [],
        meta: { inventoryRevision: path.endsWith('/hosts') ? requestCount : requestCount + 1 },
      }
    }) as ApiClient['request'] }
    await expect(new HttpStackMapRepository(client).getAll()).rejects.toMatchObject({
      code: 'INCONSISTENT_INVENTORY_REVISION',
    })
    expect(requestCount).toBe(6)
  })

  it('maps conflicts and network failures to safe recoverable messages', async () => {
    const conflictClient = new SameOriginApiClient(vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'REVISION_CONFLICT', message: 'internal', requestId: 'x' } }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch)
    await expect(conflictClient.request('/api/v1/hosts/x')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    const offlineClient = new SameOriginApiClient(vi.fn(async () => { throw new Error('secret') }) as typeof fetch)
    await expect(offlineClient.request('/api/v1/hosts')).rejects.toBeInstanceOf(RepositoryError)
    await expect(offlineClient.request('/api/v1/hosts')).rejects.not.toThrow('secret')
  })

  it('accepts complete valid host and service list responses without changing order', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('/hosts') ? response([apiHost]) : response([apiService])) as typeof fetch
    const client = new SameOriginApiClient(fetcher)
    expect((await client.request('/api/v1/hosts')).data).toEqual([apiHost])
    expect((await client.request('/api/v1/services')).data).toEqual([apiService])
  })

  it.each([
    ['envelope', { extra: true }, '/api/v1/hosts'],
    ['meta', { data: [], meta: { inventoryRevision: -1 } }, '/api/v1/hosts'],
    ['host list', { data: {}, meta: { inventoryRevision: 1 } }, '/api/v1/hosts'],
    ['host record', { data: [{ ...apiHost, name: '' }], meta: { inventoryRevision: 1 } }, '/api/v1/hosts'],
    ['service list', { data: {}, meta: { inventoryRevision: 1 } }, '/api/v1/services'],
    ['service record', { data: [{ ...apiService, notes: 4 }], meta: { inventoryRevision: 1 } }, '/api/v1/services'],
    ['nested port', { data: [{ ...apiService, ports: [{ ...apiService.ports[0], hostPort: 0 }] }], meta: { inventoryRevision: 1 } }, '/api/v1/services'],
    ['nested path', { data: [{ ...apiService, paths: [{ ...apiService.paths[0], hostPath: '', containerPath: '', purpose: '' }] }], meta: { inventoryRevision: 1 } }, '/api/v1/services'],
    ['dependency list', { data: [{ ...apiService, dependencyIds: [''] }], meta: { inventoryRevision: 1 } }, '/api/v1/services'],
    ['timestamp', { data: [{ ...apiHost, updatedAt: 'not-a-time' }], meta: { inventoryRevision: 1 } }, '/api/v1/hosts'],
    ['revision', { data: [{ ...apiHost, revision: 0 }], meta: { inventoryRevision: 1 } }, '/api/v1/hosts'],
    ['enum', { data: [{ ...apiService, status: 'broken' }], meta: { inventoryRevision: 1 } }, '/api/v1/services'],
  ])('fails closed for a malformed successful %s response', async (_label, body, path) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as typeof fetch
    await expect(new SameOriginApiClient(fetcher).request(path)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('times out safely, clears its timer, and permits a later retry without duplicating the mutation', async () => {
    vi.useFakeTimers()
    const clearTimeout = vi.spyOn(globalThis, 'clearTimeout')
    let calls = 0
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      calls += 1
      if (calls === 2) return Promise.resolve(response(apiHost))
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      })
    }) as typeof fetch
    const client = new SameOriginApiClient(fetcher, 100)
    const first = client.request('/api/v1/hosts', { method: 'POST', body: JSON.stringify(host) })
    const firstAssertion = expect(first).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', message: expect.stringContaining('timed out') })
    await vi.advanceTimersByTimeAsync(100)
    await firstAssertion
    expect(calls).toBe(1)
    await expect(client.request('/api/v1/hosts', { method: 'POST', body: JSON.stringify(host) })).resolves.toMatchObject({ data: apiHost })
    expect(calls).toBe(2)
    expect(clearTimeout).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
