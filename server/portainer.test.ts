// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { PortainerClient, PortainerError, PortainerPreviewService } from './portainer.js'
import type { InventorySnapshot } from './repository.js'

const emptyInventory = (): InventorySnapshot => ({ revision: 4, hosts: [], services: [] })
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

function fixtures() {
  return {
    endpoints: [{ Id: 7, Name: 'docker-01', ContainerEngine: 'docker', PublicURL: 'https://192.0.2.10:9443', Labels: { secret: 'do-not-return' } }],
    info: { Name: 'engine', OperatingSystem: 'Debian', OSType: 'linux', Architecture: 'x86_64', RegistryConfig: { password: 'do-not-return' } },
    version: { Version: '28.0.0', ApiVersion: '1.48', Secret: 'do-not-return' },
    containers: [{
      Id: 'container-secret-id', Names: ['/web'], Image: 'nginx:latest', State: 'running',
      Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp', IP: '127.0.0.1' }, { PrivatePort: 53, Type: 'sctp', IP: '' }],
      Mounts: [{ Type: 'bind', Source: '/srv/web', Destination: '/data', RW: false }, { Type: 'volume', Source: '/var/lib/docker/secret', Destination: '/cache', RW: true }],
      NetworkSettings: { Networks: { frontend: {}, backend: {} } },
      Labels: { password: 'do-not-return' }, Env: ['TOKEN=do-not-return'],
    }],
  }
}

describe('Portainer discovery', () => {
  it('uses only allowlisted GET routes with X-API-Key and projects sensitive fields out', async () => {
    const data = fixtures()
    const requests: Array<{ url: string; init: RequestInit }> = []
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      if (url.endsWith('/api/endpoints')) return response(data.endpoints)
      if (url.endsWith('/docker/info')) return response(data.info)
      if (url.endsWith('/docker/version')) return response(data.version)
      return response(data.containers)
    })
    const service = new PortainerPreviewService(new PortainerClient('https://portainer.example', fetcher), emptyInventory)
    const connected = await service.connect('top-secret-token')
    const preview = await service.preview(connected.sessionToken, [7])

    expect(requests.map(({ url }) => url)).toEqual([
      'https://portainer.example/api/endpoints',
      'https://portainer.example/api/endpoints/7/docker/info',
      'https://portainer.example/api/endpoints/7/docker/version',
      'https://portainer.example/api/endpoints/7/docker/containers/json?all=true',
    ])
    expect(requests.every(({ init }) => init.method === 'GET' && (init.headers as Record<string, string>)['X-API-Key'] === 'top-secret-token')).toBe(true)
    expect(JSON.stringify({ connected, preview })).not.toContain('top-secret-token')
    expect(JSON.stringify(preview)).not.toContain('do-not-return')
    expect(preview.hosts[0]).toMatchObject({ name: 'docker-01', type: 'container-host', ipAddress: '192.0.2.10' })
    expect(preview.services[0]).toMatchObject({ name: 'web', status: 'active', exposure: 'local', network: '', dependencyIds: [] })
    expect(preview.services[0].networkOptions).toEqual(['backend', 'frontend'])
    expect(preview.services[0].paths).toHaveLength(1)
    expect(preview.services[0].warnings.map(({ code }) => code)).toEqual(expect.arrayContaining(['PROTOCOL_UNSUPPORTED', 'VOLUME_SKIPPED']))
    expect(preview.services[0].conflicts).toContainEqual(expect.objectContaining({ code: 'NETWORK_SELECTION_REQUIRED', blocking: true }))
  })

  it('rejects malformed, oversized, unauthorized, expired, and unselected discovery safely', async () => {
    const unauthorized = new PortainerClient('https://portainer.example', async () => response({}, 403))
    await expect(unauthorized.environments('secret')).rejects.toMatchObject({ code: 'PORTAINER_AUTH_FAILED' })
    const malformed = new PortainerClient('https://portainer.example', async () => response([{ Id: 'bad' }]))
    await expect(malformed.environments('secret')).rejects.toMatchObject({ code: 'PORTAINER_INVALID_RESPONSE' })
    const oversized = new PortainerClient('https://portainer.example', async () => new Response('[]', { headers: { 'content-length': String(11 * 1024 * 1024), 'content-type': 'application/json' } }))
    await expect(oversized.environments('secret')).rejects.toMatchObject({ code: 'PORTAINER_RESPONSE_TOO_LARGE' })
    const wrongType = new PortainerClient('https://portainer.example', async () => new Response('[]', { headers: { 'content-type': 'text/plain' } }))
    await expect(wrongType.environments('secret')).rejects.toMatchObject({ code: 'PORTAINER_INVALID_RESPONSE' })

    let now = 0
    const client = new PortainerClient('https://portainer.example', async () => response(fixtures().endpoints))
    const service = new PortainerPreviewService(client, emptyInventory, () => now)
    const connected = await service.connect('secret')
    await expect(service.preview(connected.sessionToken, [])).rejects.toMatchObject({ code: 'PORTAINER_SELECTION_INVALID' })
    now = 5 * 60 * 1000
    await expect(service.preview(connected.sessionToken, [7])).rejects.toMatchObject({ code: 'PORTAINER_SESSION_INVALID' })
  })

  it('clears sessions and previews on cancellation', async () => {
    const data = fixtures()
    const client = new PortainerClient('https://portainer.example', async (url) => response(url.endsWith('/api/endpoints') ? data.endpoints : url.endsWith('/info') ? data.info : url.endsWith('/version') ? data.version : data.containers))
    const service = new PortainerPreviewService(client, emptyInventory)
    const connected = await service.connect('secret')
    service.cancelSession(connected.sessionToken)
    await expect(service.preview(connected.sessionToken, [7])).rejects.toBeInstanceOf(PortainerError)
  })
})
