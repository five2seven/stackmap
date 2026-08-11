import { describe, expect, it } from 'vitest'
import { DemoMemoryRepository } from './demoRepository'

describe('public demo repository', () => {
  it('starts from realistic bundled data and returns defensive copies', async () => {
    const repository = new DemoMemoryRepository()
    const first = await repository.getAll()
    expect(first.hosts.map(({ name }) => name)).toEqual(['Atlas NAS', 'Orion', 'Gateway'])
    expect(first.services.map(({ name }) => name)).toContain('Plex')
    expect(first.services.length).toBeGreaterThanOrEqual(6)

    first.hosts[0].name = 'Mutated outside repository'
    first.services[0].paths[0].hostPath = '/changed'
    const second = await repository.getAll()
    expect(second.hosts[0].name).toBe('Atlas NAS')
    expect(second.services[0].paths[0].hostPath).toBe('/srv/traefik/config')
  })

  it('keeps edits only in one repository instance and resets with a fresh page instance', async () => {
    const session = new DemoMemoryRepository()
    const original = await session.getAll()
    const plex = original.services.find(({ name }) => name === 'Plex')
    expect(plex).toBeDefined()

    await session.putService({ ...plex!, notes: 'Temporary demo edit' })
    expect((await session.getAll()).services.find(({ name }) => name === 'Plex')?.notes).toBe(
      'Temporary demo edit',
    )

    const refreshedPage = new DemoMemoryRepository()
    expect((await refreshedPage.getAll()).services.find(({ name }) => name === 'Plex')?.notes).toBe('')
  })

  it('supports session CRUD while preserving host reference safety', async () => {
    const repository = new DemoMemoryRepository()
    const data = await repository.getAll()
    const paperless = data.services.find(({ name }) => name === 'Paperless-ngx')!
    await repository.deleteService(paperless.id)
    expect((await repository.getAll()).services.some(({ id }) => id === paperless.id)).toBe(false)

    await expect(repository.deleteHost('demo-host-nas')).rejects.toMatchObject({ code: 'HOST_IN_USE' })
    await repository.putHost({
      id: 'temporary-host',
      name: 'Temporary host',
      type: 'virtual-machine',
      ipAddress: '',
      operatingSystem: '',
      notes: '',
      createdAt: '2026-08-11T12:00:00.000Z',
      updatedAt: '2026-08-11T12:00:00.000Z',
    })
    expect((await repository.getAll()).hosts.some(({ id }) => id === 'temporary-host')).toBe(true)
    await repository.deleteHost('temporary-host')
    expect((await repository.getAll()).hosts.some(({ id }) => id === 'temporary-host')).toBe(false)
  })
})
