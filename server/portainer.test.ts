// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type StackMapDatabase } from './database.js'
import { inferBindMountPurpose, PortainerClient, PortainerError, PortainerPreviewService } from './portainer.js'
import { SqliteInventoryRepository, type InventorySnapshot } from './repository.js'

const emptyInventory = (): InventorySnapshot => ({ revision: 4, hosts: [], services: [] })
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const databases: StackMapDatabase[] = []
afterEach(() => { vi.useRealTimers(); for (const database of databases.splice(0)) database.checkpointAndClose() })

const localDockerEndpoint = {
  Id: 1,
  Name: 'local',
  Type: 1,
  ContainerEngine: '',
  URL: 'unix:///var/run/docker.sock',
  Status: 1,
}

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
  it.each([
    ['/config', 'Configuration'], ['/app/config/', 'Configuration'], [' /APP//CONFIGS/// ', 'Configuration'],
    ['/configuration', 'Configuration'], ['/opt/app/conf', 'Configuration'], ['/metadata', 'Metadata'],
    ['/movies', 'Media library'], ['/library/tv/', 'Media library'], ['/MUSIC', 'Media library'],
    ['/audiobooks', 'Media library'], ['/books', 'Media library'], ['/photos', 'Media library'],
    ['/data', ''], ['/srv/myconfig', ''], ['/metadata-cache', ''], ['/movies-old', ''],
    ['config', ''], [String.raw`C:\config`, ''], ['/', ''], ['', ''],
  ])('infers a conservative purpose for container path %j', (containerPath, expected) => {
    expect(inferBindMountPurpose(containerPath)).toBe(expected)
  })

  it('accepts documented Docker endpoint types and rejects unsupported or non-Docker environments', async () => {
    const client = new PortainerClient('https://portainer.example', async () => response([
      localDockerEndpoint,
      { Id: 2, Name: 'docker-agent', Type: 2, ContainerEngine: 'DoCkEr', PublicURL: '' },
      { Id: 3, Name: 'legacy-docker', ContainerEngine: 'docker', PublicURL: '' },
      { Id: 4, Name: 'kubernetes', Type: 5, ContainerEngine: 'docker', PublicURL: '' },
      { Id: 5, Name: 'podman', Type: 1, ContainerEngine: 'podman', PublicURL: '' },
      { Id: 6, Name: 'local', Type: 99, ContainerEngine: '', URL: 'unix:///var/run/docker.sock', Status: 1 },
    ]))
    const service = new PortainerPreviewService(client, emptyInventory)

    const connected = await service.connect('secret')

    expect(connected.environments).toEqual([
      { id: 1, name: 'local', containerEngine: '', publicUrl: '' },
      { id: 2, name: 'docker-agent', containerEngine: 'DoCkEr', publicUrl: '' },
      { id: 3, name: 'legacy-docker', containerEngine: 'docker', publicUrl: '' },
    ])
    service.clear()
  })

  it('accepts documented unpublished port summaries while keeping required fields strict', async () => {
    const container = (ports: unknown[]) => [{
      Id: 'omv-container', Names: ['/omv-app'], Image: 'example/omv:1', State: 'running',
      Ports: ports, Mounts: [], NetworkSettings: { Networks: { bridge: {} } },
    }]
    const client = new PortainerClient('https://portainer.example', async () => response(container([
      { PrivatePort: 2442, Type: 'tcp' },
      { PrivatePort: 2443, PublicPort: null, Type: 'tcp' },
      { PrivatePort: 80, PublicPort: 8080, Type: 'tcp', IP: '0.0.0.0' },
    ])))

    await expect(client.containers(1, 'secret')).resolves.toMatchObject([{
      ports: [
        { privatePort: 2442, type: 'tcp', ip: '' },
        { privatePort: 2443, type: 'tcp', ip: '' },
        { privatePort: 80, publicPort: 8080, type: 'tcp', ip: '0.0.0.0' },
      ],
    }])

    for (const invalidPort of [
      { Type: 'tcp' },
      { PrivatePort: null, Type: 'tcp' },
      { PrivatePort: 2442 },
      { PrivatePort: 2442, Type: null },
      { PrivatePort: 2442, Type: 'tcp', IP: null },
      { PrivatePort: 2442, Type: 'tcp', PublicPort: '8080' },
    ]) {
      const invalidClient = new PortainerClient('https://portainer.example', async () => response(container([invalidPort])))
      await expect(invalidClient.containers(1, 'secret')).rejects.toMatchObject({ code: 'PORTAINER_INVALID_RESPONSE' })
    }
  })

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
    expect(preview.services[0].paths[0]).toMatchObject({ hostPath: '/srv/web', containerPath: '/data', purpose: '' })
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
    vi.useFakeTimers()
    const data = fixtures()
    const client = new PortainerClient('https://portainer.example', async (url) => response(url.endsWith('/api/endpoints') ? data.endpoints : url.endsWith('/info') ? data.info : url.endsWith('/version') ? data.version : data.containers))
    const service = new PortainerPreviewService(client, emptyInventory)
    const connected = await service.connect('secret')
    expect(vi.getTimerCount()).toBe(1)
    service.cancelSession(connected.sessionToken)
    expect(vi.getTimerCount()).toBe(0)
    await expect(service.preview(connected.sessionToken, [7])).rejects.toBeInstanceOf(PortainerError)
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000)
    await expect(service.preview(connected.sessionToken, [7])).rejects.toMatchObject({ code: 'PORTAINER_SESSION_INVALID' })
  })

  it('accepts own proposed or existing hosts and rejects cross-environment proposed hosts', async () => {
    async function setup() {
      const database = openDatabase(':memory:')
      databases.push(database)
      const repository = new SqliteInventoryRepository(database.connection)
      repository.createHost({ id: 'existing-host', name: 'Existing', type: 'physical', ipAddress: '', operatingSystem: '', notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })
      const endpoints = [
        { Id: 1, Name: 'Docker one', Type: 1, ContainerEngine: 'docker', PublicURL: '' },
        { Id: 2, Name: 'Docker two', Type: 1, ContainerEngine: 'docker', PublicURL: '' },
      ]
      const client = new PortainerClient('https://portainer.example', async (url) => {
        if (url.endsWith('/api/endpoints')) return response(endpoints)
        if (url.endsWith('/docker/info')) return response({ Name: 'engine', OperatingSystem: 'Linux', OSType: 'linux', Architecture: 'amd64' })
        if (url.endsWith('/docker/version')) return response({ Version: '28.0.0', ApiVersion: '1.48' })
        const environmentId = Number(url.match(/endpoints\/(\d+)/)?.[1])
        return response([{ Id: `container-${environmentId}`, Names: [`/app-${environmentId}`], Image: 'example/app:1', State: 'running', Ports: [], Mounts: [], NetworkSettings: { Networks: { bridge: {} } } }])
      })
      const service = new PortainerPreviewService(client, () => repository.inventorySnapshot(), Date.now, 5 * 60 * 1000, 'https://portainer.example', repository)
      const connected = await service.connect('secret')
      const preview = await service.preview(connected.sessionToken, [1, 2])
      return { service, preview }
    }

    for (const environmentId of [1, 2]) {
      for (const target of ['own', 'existing'] as const) {
        const { service, preview } = await setup()
        const candidate = preview.services.find((item) => item.environmentId === environmentId)!
        const ownHost = preview.hosts.find((host) => host.environmentId === environmentId)!.id
        expect(() => service.confirm(preview.previewToken, preview.expectedInventoryRevision, [{ ...candidate, hostId: target === 'own' ? ownHost : 'existing-host' }])).not.toThrow()
      }
    }

    const { service, preview } = await setup()
    const environmentOne = preview.services.find(({ environmentId }) => environmentId === 1)!
    const environmentTwoHost = preview.hosts.find(({ environmentId }) => environmentId === 2)!.id
    expect(() => service.confirm(preview.previewToken, preview.expectedInventoryRevision, [{ ...environmentOne, hostId: environmentTwoHost }]))
      .toThrowError(expect.objectContaining<Partial<PortainerError>>({ code: 'PORTAINER_CONFIRMATION_INVALID' }))
  })

  it('actively expires idle sessions and releases their token capacity without another request', async () => {
    vi.useFakeTimers()
    const data = fixtures()
    const client = new PortainerClient('https://portainer.example', async () => response(data.endpoints))
    const service = new PortainerPreviewService(client, emptyInventory, Date.now, 1_000)
    const connected = await service.connect('idle-secret-token')
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(1_000)

    expect(vi.getTimerCount()).toBe(0)
    await expect(service.preview(connected.sessionToken, [7])).rejects.toMatchObject({ code: 'PORTAINER_SESSION_INVALID' })
    const replacements = await Promise.all(Array.from({ length: 8 }, (_, index) => service.connect(`replacement-${index}`)))
    expect(replacements).toHaveLength(8)
    service.clear()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores stale expiry events after a session TTL refresh', async () => {
    vi.useFakeTimers()
    const data = fixtures()
    const client = new PortainerClient('https://portainer.example', async (url) => response(url.endsWith('/api/endpoints') ? data.endpoints : url.endsWith('/info') ? data.info : url.endsWith('/version') ? data.version : data.containers))
    const service = new PortainerPreviewService(client, emptyInventory, Date.now, 1_000)
    const connected = await service.connect('secret')
    await vi.advanceTimersByTimeAsync(500)
    await service.preview(connected.sessionToken, [7])

    await vi.advanceTimersByTimeAsync(500)

    await expect(service.preview(connected.sessionToken, [7])).resolves.toMatchObject({ expectedInventoryRevision: 4 })
    service.clear()
  })

  it('does not revive a session when discovery completes after active expiry', async () => {
    vi.useFakeTimers()
    const data = fixtures()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const client = new PortainerClient('https://portainer.example', async (url) => {
      if (url.endsWith('/api/endpoints')) return response(data.endpoints)
      await gate
      return response(url.endsWith('/info') ? data.info : url.endsWith('/version') ? data.version : data.containers)
    })
    const service = new PortainerPreviewService(client, emptyInventory, Date.now, 1_000)
    const connected = await service.connect('late-secret-token')
    const outcome = service.preview(connected.sessionToken, [7]).catch((error: unknown) => error)
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(1_000)
    release()

    await expect(outcome).resolves.toMatchObject({ code: 'PORTAINER_SESSION_INVALID' })
    await expect(service.preview(connected.sessionToken, [7])).rejects.toMatchObject({ code: 'PORTAINER_SESSION_INVALID' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
