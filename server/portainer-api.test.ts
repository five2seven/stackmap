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
