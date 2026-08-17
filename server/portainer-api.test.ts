// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from './app.js'
import { openDatabase } from './database.js'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => { for (const app of apps.splice(0)) await app.close() })

describe('Portainer preview API', () => {
  it('is disabled without configuration and exposes no discovery mutation route', async () => {
    const app = await buildApp({ database: openDatabase(':memory:'), staticRoot: 'missing' }); apps.push(app)
    expect((await app.inject('/api/v1/portainer/status')).json()).toEqual({ data: { enabled: false } })
    expect((await app.inject({ method: 'POST', url: '/api/v1/portainer/sessions', payload: { apiToken: 'secret' } })).statusCode).toBe(404)
    expect((await app.inject({ method: 'POST', url: '/api/v1/portainer/imports', payload: {} })).statusCode).toBe(404)
  })

  it('confirms the exact preview once, preserves deselection, and defaults bound containers to skipped', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      if (url.endsWith('/api/endpoints')) return json([{ Id: 1, Name: 'host', ContainerEngine: 'docker', PublicURL: '' }])
      if (url.endsWith('/info')) return json({ Name: 'host', OperatingSystem: 'Linux', OSType: 'linux', Architecture: 'amd64' })
      if (url.endsWith('/version')) return json({ Version: '28', ApiVersion: '1.48' })
      return json([{ Id: 'abc', Names: ['/app'], Image: 'app:1', State: 'running', Ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp', IP: '' }], Mounts: [{ Type: 'bind', Source: '/srv', Destination: '/data', RW: true }], NetworkSettings: { Networks: { bridge: {} } } }])
    })
    const database = openDatabase(':memory:')
    const app = await buildApp({ database, staticRoot: 'missing', portainerUrl: 'https://portainer.example', portainerFetcher: fetcher }); apps.push(app)
    const connection = (await app.inject({ method: 'POST', url: '/api/v1/portainer/sessions', payload: { apiToken: 'secret' } })).json().data
    const preview = (await app.inject({ method: 'POST', url: '/api/v1/portainer/previews', payload: { sessionToken: connection.sessionToken, environmentIds: [1] } })).json().data
    const selected = [{ ...preview.services[0], ports: [], paths: [] }]
    const tampered = await app.inject({ method: 'POST', url: '/api/v1/portainer/imports', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, selectedServices: [{ ...selected[0], containerId: 'tampered' }], acknowledged: true } })
    expect(tampered.statusCode).toBe(400)
    const malformed = await app.inject({ method: 'POST', url: '/api/v1/portainer/imports', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, selectedServices: [{ ...selected[0], ports: [null] }], acknowledged: true } })
    expect(malformed.statusCode).toBe(400)
    const confirmation = await app.inject({ method: 'POST', url: '/api/v1/portainer/imports', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, selectedServices: selected, acknowledged: true } })
    expect(confirmation.statusCode).toBe(200)
    expect(confirmation.json().data).toMatchObject({ inventoryRevision: 1, hostIds: [preview.hosts[0].id], serviceIds: [preview.services[0].id] })
    expect((await app.inject('/api/v1/services')).json().data[0]).toMatchObject({ revision: 1, ports: [], paths: [] })
    expect((await app.inject({ method: 'POST', url: '/api/v1/portainer/imports', payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, selectedServices: selected, acknowledged: true } })).statusCode).toBe(409)

    const secondConnection = (await app.inject({ method: 'POST', url: '/api/v1/portainer/sessions', payload: { apiToken: 'secret' } })).json().data
    const secondPreview = (await app.inject({ method: 'POST', url: '/api/v1/portainer/previews', payload: { sessionToken: secondConnection.sessionToken, environmentIds: [1] } })).json().data
    expect(secondPreview.services[0]).toMatchObject({ alreadyBound: true })
    expect(secondPreview.services[0].conflicts).toContainEqual(expect.objectContaining({ code: 'ALREADY_BOUND', blocking: true }))
  })

  it('persists inferred, overridden, and cleared bind-mount purposes while rejecting mount tampering', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      if (url.endsWith('/api/endpoints')) return json([{ Id: 1, Name: 'host', ContainerEngine: 'docker', PublicURL: '' }])
      if (url.endsWith('/info')) return json({ Name: 'host', OperatingSystem: 'Linux', OSType: 'linux', Architecture: 'amd64' })
      if (url.endsWith('/version')) return json({ Version: '28', ApiVersion: '1.48' })
      return json([{
        Id: 'purpose-app', Names: ['/purpose-app'], Image: 'app:1', State: 'running', Ports: [],
        Mounts: [
          { Type: 'bind', Source: '/srv/config', Destination: '/config', RW: true },
          { Type: 'bind', Source: '/srv/metadata', Destination: '/metadata/', RW: false },
          { Type: 'bind', Source: '/srv/movies', Destination: '/library/movies', RW: false },
          { Type: 'bind', Source: '/srv/config-name-only', Destination: '/data', RW: true },
        ],
        NetworkSettings: { Networks: { bridge: {} } },
      }])
    })
    const database = openDatabase(':memory:')
    const app = await buildApp({ database, staticRoot: 'missing', portainerUrl: 'https://portainer.example', portainerFetcher: fetcher }); apps.push(app)
    const connection = (await app.inject({ method: 'POST', url: '/api/v1/portainer/sessions', payload: { apiToken: 'secret' } })).json().data
    const preview = (await app.inject({ method: 'POST', url: '/api/v1/portainer/previews', payload: { sessionToken: connection.sessionToken, environmentIds: [1] } })).json().data
    expect(preview.services[0].paths).toEqual([
      expect.objectContaining({ hostPath: '/srv/config', containerPath: '/config', purpose: 'Configuration', readOnly: false }),
      expect.objectContaining({ hostPath: '/srv/metadata', containerPath: '/metadata/', purpose: 'Metadata', readOnly: true }),
      expect.objectContaining({ hostPath: '/srv/movies', containerPath: '/library/movies', purpose: 'Media library', readOnly: true }),
      expect.objectContaining({ hostPath: '/srv/config-name-only', containerPath: '/data', purpose: '', readOnly: false }),
    ])

    const finalPaths = preview.services[0].paths.map((path: { containerPath: string }) => path.containerPath === '/config'
      ? { ...path, purpose: 'Secrets and settings' }
      : path.containerPath === '/metadata/' ? { ...path, purpose: '' } : path)
    const selected = [{ ...preview.services[0], paths: finalPaths }]
    const before = database.connection.serialize()
    for (const paths of [
      finalPaths.map((path: { containerPath: string }) => path.containerPath === '/config' ? { ...path, hostPath: '/tampered' } : path),
      finalPaths.map((path: { containerPath: string }) => path.containerPath === '/config' ? { ...path, containerPath: '/tampered' } : path),
      finalPaths.map((path: { containerPath: string }) => path.containerPath === '/config' ? { ...path, readOnly: true } : path),
      [...finalPaths, { ...finalPaths[0], id: 'unoffered' }],
      [...finalPaths, finalPaths[0]],
      finalPaths.map((path: { containerPath: string }) => path.containerPath === '/config' ? { ...path, unknown: true } : path),
      finalPaths.map((path: { containerPath: string }) => path.containerPath === '/config' ? { ...path, purpose: 42 } : path),
    ]) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/portainer/imports',
        payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, selectedServices: [{ ...selected[0], paths }], acknowledged: true },
      })
      expect(response.statusCode).toBe(400)
      expect(database.connection.serialize()).toEqual(before)
    }

    const confirmed = await app.inject({
      method: 'POST', url: '/api/v1/portainer/imports',
      payload: { previewToken: preview.previewToken, expectedInventoryRevision: 0, selectedServices: selected, acknowledged: true },
    })
    expect(confirmed.statusCode).toBe(200)
    expect((await app.inject('/api/v1/services')).json().data[0].paths).toEqual([
      expect.objectContaining({ containerPath: '/config', purpose: 'Secrets and settings' }),
      expect.objectContaining({ containerPath: '/metadata/', purpose: '' }),
      expect.objectContaining({ containerPath: '/library/movies', purpose: 'Media library' }),
      expect.objectContaining({ containerPath: '/data', purpose: '' }),
    ])
  })

  it('re-imports a container after its bound service is deleted, then protects the new live binding', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      if (url.endsWith('/api/endpoints')) return json([{ Id: 1, Name: 'host', ContainerEngine: 'docker', PublicURL: '' }])
      if (url.endsWith('/info')) return json({ Name: 'host', OperatingSystem: 'Linux', OSType: 'linux', Architecture: 'amd64' })
      if (url.endsWith('/version')) return json({ Version: '28', ApiVersion: '1.48' })
      return json([{ Id: 'abc', Names: ['/app'], Image: 'app:1', State: 'running', Ports: [], Mounts: [], NetworkSettings: { Networks: { bridge: {} } } }])
    })
    const database = openDatabase(':memory:')
    const app = await buildApp({ database, staticRoot: 'missing', portainerUrl: 'https://portainer.example', portainerFetcher: fetcher }); apps.push(app)
    const session = async () => (await app.inject({ method: 'POST', url: '/api/v1/portainer/sessions', payload: { apiToken: 'secret' } })).json().data
    const preview = async () => {
      const connection = await session()
      return (await app.inject({ method: 'POST', url: '/api/v1/portainer/previews', payload: { sessionToken: connection.sessionToken, environmentIds: [1] } })).json().data
    }

    const initial = await preview()
    expect((await app.inject({ method: 'POST', url: '/api/v1/portainer/imports', payload: { previewToken: initial.previewToken, expectedInventoryRevision: 0, selectedServices: initial.services, acknowledged: true } })).statusCode).toBe(200)
    const originalId = initial.services[0].id
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/services/${originalId}`, payload: { expectedRevision: 1 } })).statusCode).toBe(200)

    const stale = await preview()
    expect(stale.expectedInventoryRevision).toBe(2)
    expect(stale.services[0]).toMatchObject({ alreadyBound: false })
    expect(stale.services[0].conflicts).not.toContainEqual(expect.objectContaining({ code: 'ALREADY_BOUND' }))
    const existingHostId = stale.existingHosts[0].id
    const selected = [{ ...stale.services[0], hostId: existingHostId }]
    const beforeTamper = database.connection.serialize()
    expect((await app.inject({
      method: 'POST', url: '/api/v1/portainer/imports',
      payload: { previewToken: stale.previewToken, expectedInventoryRevision: 2, selectedServices: [{ ...selected[0], containerId: 'tampered' }], acknowledged: true },
    })).statusCode).toBe(400)
    expect(database.connection.serialize()).toEqual(beforeTamper)
    const reimport = await app.inject({ method: 'POST', url: '/api/v1/portainer/imports', payload: { previewToken: stale.previewToken, expectedInventoryRevision: 2, selectedServices: selected, acknowledged: true } })
    expect(reimport.statusCode).toBe(200)
    const replacementId = reimport.json().data.serviceIds[0]
    expect(replacementId).not.toBe(originalId)
    expect((await app.inject(`/api/v1/services/${replacementId}`)).json().data).toMatchObject({ id: replacementId, hostId: existingHostId })
    expect(database.connection.prepare('SELECT service_id FROM portainer_container_bindings WHERE container_id = ?').pluck().get('abc')).toBe(replacementId)

    const protectedPreview = await preview()
    expect(protectedPreview.services[0]).toMatchObject({ alreadyBound: true })
    expect(protectedPreview.services[0].conflicts).toContainEqual(expect.objectContaining({ code: 'ALREADY_BOUND', blocking: true }))
  })

  it('previews and imports the real OMV unpublished-port shape without false host bindings', async () => {
    const unpublishedPorts = [2442, 2443, 3306, 8118, 8080, 9443]
    const fetcher = vi.fn(async (url: string) => {
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      if (url.endsWith('/api/endpoints')) return json([{ Id: 1, Name: 'local', Type: 1, ContainerEngine: '', URL: 'unix:///var/run/docker.sock', Status: 1 }])
      if (url.endsWith('/info')) return json({ Name: 'omv', OperatingSystem: 'Debian GNU/Linux 10 (buster)', OSType: 'linux', Architecture: 'x86_64' })
      if (url.endsWith('/version')) return json({ Version: '28', ApiVersion: '1.48' })
      return json([{
        Id: 'omv-container', Names: ['/omv-app'], Image: 'example/omv:1', State: 'running',
        Ports: unpublishedPorts.map((PrivatePort, index) => ({ PrivatePort, ...(index === 0 ? { PublicPort: null } : {}), Type: 'tcp' })),
        Mounts: [], NetworkSettings: { Networks: { bridge: {} } },
      }])
    })
    const database = openDatabase(':memory:')
    const app = await buildApp({ database, staticRoot: 'missing', portainerUrl: 'https://portainer.example', portainerFetcher: fetcher }); apps.push(app)
    const connection = (await app.inject({ method: 'POST', url: '/api/v1/portainer/sessions', payload: { apiToken: 'secret' } })).json().data
    const previewResponse = await app.inject({ method: 'POST', url: '/api/v1/portainer/previews', payload: { sessionToken: connection.sessionToken, environmentIds: [1] } })

    expect(previewResponse.statusCode).toBe(200)
    const preview = previewResponse.json().data
    expect(preview.hosts[0]).toMatchObject({ name: 'local', operatingSystem: 'Debian GNU/Linux 10 (buster) · linux · x86_64' })
    expect(preview.services[0].ports.map(({ hostPort, containerPort, protocol }: { hostPort?: number; containerPort?: number; protocol: string }) => ({ hostPort, containerPort, protocol }))).toEqual(
      unpublishedPorts.map((containerPort) => ({ hostPort: undefined, containerPort, protocol: 'tcp' })),
    )
    expect(preview.services[0].exposure).toBe('unknown')
    expect(preview.services[0].conflicts.filter(({ code }: { code: string }) => code.includes('HOST_PORT'))).toEqual([])

    const imported = await app.inject({
      method: 'POST', url: '/api/v1/portainer/imports',
      payload: { previewToken: preview.previewToken, expectedInventoryRevision: preview.expectedInventoryRevision, selectedServices: preview.services, acknowledged: true },
    })
    expect(imported.statusCode).toBe(200)
    const service = (await app.inject('/api/v1/services')).json().data[0]
    expect(service.ports.map(({ hostPort, containerPort, protocol }: { hostPort?: number; containerPort?: number; protocol: string }) => ({ hostPort, containerPort, protocol }))).toEqual(
      unpublishedPorts.map((containerPort) => ({ hostPort: undefined, containerPort, protocol: 'tcp' })),
    )
  })

  it('returns sanitized discovery data and leaves inventory unchanged', async () => {
    const requests: string[] = []
    const fetcher = vi.fn(async (url: string) => {
      requests.push(url)
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
      if (url.endsWith('/api/endpoints')) return json([{ Id: 1, Name: 'host', ContainerEngine: 'docker', PublicURL: '' }])
      if (url.endsWith('/info')) return json({ Name: 'host', OperatingSystem: 'Linux', OSType: 'linux', Architecture: 'amd64' })
      if (url.endsWith('/version')) return json({ Version: '28', ApiVersion: '1.48' })
      return json([{ Id: 'abc', Names: ['/app'], Image: 'app:1', State: 'exited', Ports: [], Mounts: [], NetworkSettings: { Networks: { default: {} } }, Labels: { token: 'planted-secret' } }])
    })
    const database = openDatabase(':memory:')
    const app = await buildApp({ database, staticRoot: 'missing', portainerUrl: 'https://portainer.example', portainerFetcher: fetcher }); apps.push(app)
    const before = database.connection.serialize()
    const connection = (await app.inject({ method: 'POST', url: '/api/v1/portainer/sessions', payload: { apiToken: 'api-secret' } })).json().data
    expect(JSON.stringify(connection)).not.toContain('api-secret')
    const previewResponse = await app.inject({ method: 'POST', url: '/api/v1/portainer/previews', payload: { sessionToken: connection.sessionToken, environmentIds: [1] } })
    expect(previewResponse.statusCode).toBe(200)
    expect(previewResponse.body).not.toContain('planted-secret')
    expect(previewResponse.json().data.services[0]).toMatchObject({ status: 'paused', network: 'default' })
    expect(database.connection.serialize()).toEqual(before)
    expect(requests).toHaveLength(4)
  })
})
