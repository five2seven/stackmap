import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { StackMapRepository } from './data/database'
import { createService } from './domain/serviceUtils'
import type { Host, Service, StackMapData } from './domain/types'

class MemoryRepository implements StackMapRepository {
  data: StackMapData

  constructor(data: StackMapData = { services: [], hosts: [] }) {
    this.data = structuredClone(data)
  }

  async getAll() {
    return structuredClone(this.data)
  }

  async putService(service: Service) {
    this.data.services = [
      ...this.data.services.filter((item) => item.id !== service.id),
      structuredClone(service),
    ]
  }

  async deleteService(id: string) {
    this.data.services = this.data.services.filter((service) => service.id !== id)
    this.data.services = this.data.services.map((service) => ({
      ...service,
      dependencyIds: service.dependencyIds.filter((dependencyId) => dependencyId !== id),
    }))
  }

  async putHost(host: Host) {
    this.data.hosts = [
      ...this.data.hosts.filter((item) => item.id !== host.id),
      structuredClone(host),
    ]
  }

  async deleteHost(id: string) {
    if (this.data.services.some((service) => service.hostId === id)) {
      throw new Error('This host is assigned to one or more services.')
    }
    this.data.hosts = this.data.hosts.filter((host) => host.id !== id)
  }

  async replaceAll(data: StackMapData) {
    this.data = structuredClone(data)
  }

  async getSchemaVersion() {
    return 3
  }
}

function serviceNamed(name: string) {
  return { ...createService(name), id: name.toLowerCase().replaceAll(' ', '-') }
}

describe('StackMap service workflows', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a service with only a name', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository()
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Add service' }))
    await user.type(screen.getByLabelText('Service name *'), 'Jellyfin')
    await user.click(screen.getByRole('button', { name: 'Create service' }))

    expect(await screen.findByRole('heading', { level: 3, name: 'Jellyfin' })).toBeInTheDocument()
    expect(repository.data.services[0].name).toBe('Jellyfin')
    expect(screen.getAllByText('Incomplete')).toHaveLength(2)
  })

  it('creates services, hosts, paths, and port rows without crypto.randomUUID', async () => {
    vi.stubGlobal('crypto', undefined)
    const user = userEvent.setup()
    const existing = serviceNamed('Existing service')
    const repository = new MemoryRepository({ services: [existing], hosts: [] })
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Add service' }))
    await user.type(screen.getByLabelText('Service name *'), 'HTTP service')
    await user.click(screen.getByRole('button', { name: 'Add path' }))
    expect(screen.getByLabelText('HTTP service host path 1')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add port' }))
    expect(screen.getByLabelText('Host port 1')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Create service' }))

    await user.click(screen.getByRole('button', { name: 'Manage hosts' }))
    await user.type(screen.getByLabelText('Host name *'), 'HTTP host')
    await user.click(screen.getByRole('button', { name: 'Create host' }))

    expect(repository.data.services.find((service) => service.name === 'HTTP service')?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(repository.data.hosts[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(repository.data.services.find((service) => service.name === 'Existing service')?.id).toBe(
      existing.id,
    )
  })

  it('edits a service', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository({ services: [serviceNamed('Plex')], hosts: [] })
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Edit Plex' }))
    const name = screen.getByLabelText('Service name *')
    await user.clear(name)
    await user.type(name, 'Plex Media')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('heading', { level: 3, name: 'Plex Media' })).toBeInTheDocument()
    await waitFor(() => expect(repository.data.services[0].name).toBe('Plex Media'))
  })

  it('creates, displays, edits, and searches service identity fields', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository()
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Add service' }))
    await user.type(screen.getByLabelText('Service name *'), 'Media')
    await user.type(screen.getByLabelText('Description'), '  Family library  ')
    await user.type(screen.getByLabelText('Container name'), '  jellyfin  ')
    await user.type(screen.getByLabelText('Docker image'), '  jellyfin/jellyfin:latest  ')
    await user.type(screen.getByLabelText('Application URL'), 'https://media.example.test')
    await user.click(screen.getByRole('button', { name: 'Create service' }))

    expect(repository.data.services[0]).toMatchObject({
      description: 'Family library',
      containerName: 'jellyfin',
      dockerImage: 'jellyfin/jellyfin:latest',
      applicationUrl: 'https://media.example.test',
    })
    expect(screen.getByText('Family library')).toBeVisible()
    expect(screen.getByText('jellyfin/jellyfin:latest')).toBeVisible()

    for (const query of ['jellyfin', 'JELLYFIN/JELLYFIN', 'family library', 'media.example.test']) {
      const search = screen.getByRole('searchbox', { name: 'Search services' })
      await user.clear(search)
      await user.type(search, query)
      expect(screen.getByRole('heading', { name: 'Media' })).toBeVisible()
    }

    await user.clear(screen.getByRole('searchbox', { name: 'Search services' }))
    await user.click(screen.getByRole('button', { name: 'Edit Media' }))
    const description = screen.getByLabelText('Description')
    await user.clear(description)
    await user.type(description, 'Updated description')
    const containerName = screen.getByLabelText('Container name')
    await user.clear(containerName)
    await user.type(containerName, 'updated-container')
    const dockerImage = screen.getByLabelText('Docker image')
    await user.clear(dockerImage)
    await user.type(dockerImage, 'example/updated:2')
    const applicationUrl = screen.getByLabelText('Application URL')
    await user.clear(applicationUrl)
    await user.type(applicationUrl, 'https://updated.example.test')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Updated description')).toBeVisible()
    expect(repository.data.services[0]).toMatchObject({
      description: 'Updated description',
      containerName: 'updated-container',
      dockerImage: 'example/updated:2',
      applicationUrl: 'https://updated.example.test',
    })
  })

  it('shows container-name conflicts and affected-service count', async () => {
    const hostId = 'host-1'
    const services = [
      { ...serviceNamed('One'), hostId, containerName: ' App ' },
      { ...serviceNamed('Two'), hostId, containerName: 'app' },
    ]
    render(<App repository={new MemoryRepository({ services, hosts: [] })} />)

    expect(await screen.findAllByText('Container-name conflict')).toHaveLength(2)
    const summary = screen.getByRole('region', { name: 'Service summary' })
    expect(within(summary).getByText('Container conflicts').previousElementSibling).toHaveTextContent('2')
  })

  it('retires a service', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository({ services: [serviceNamed('Sonarr')], hosts: [] })
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Retire Sonarr' }))

    await waitFor(() => expect(document.querySelector('.status-retired')).toHaveTextContent('retired'))
    expect(repository.data.services[0].status).toBe('retired')
    expect(screen.getByRole('status')).toHaveTextContent('Sonarr retired.')
  })

  it('permanently deletes a service only after confirmation', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository({ services: [serviceNamed('Radarr')], hosts: [] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Delete Radarr' }))
    expect(repository.data.services).toHaveLength(1)

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Delete Radarr' }))
    expect(await screen.findByRole('heading', { name: 'Map your first service' })).toBeInTheDocument()
    expect(repository.data.services).toHaveLength(0)
  })

  it('adds a host and assigns it to a service', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository()
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Manage hosts' }))
    await user.type(screen.getByLabelText('Host name *'), 'nas-01')
    await user.click(screen.getByRole('button', { name: 'Create host' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Add service' }))
    await user.type(screen.getByLabelText('Service name *'), 'Home Assistant')
    const serviceEditor = screen.getByRole('heading', { name: 'Add service' }).closest('section')
    expect(serviceEditor).not.toBeNull()
    await user.selectOptions(
      within(serviceEditor as HTMLElement).getByLabelText('Host'),
      repository.data.hosts[0].id,
    )
    await user.click(screen.getByRole('button', { name: 'Create service' }))

    expect(repository.data.hosts).toHaveLength(1)
    expect(repository.data.services[0].hostId).toBe(repository.data.hosts[0].id)
    const serviceCard = (await screen.findByRole('heading', { name: 'Home Assistant' })).closest(
      'article',
    )
    expect(serviceCard).not.toBeNull()
    expect(within(serviceCard as HTMLElement).getByText('nas-01')).toBeInTheDocument()
  })

  it('prevents deletion of a referenced host', async () => {
    const user = userEvent.setup()
    const host: Host = {
      id: 'host-1',
      name: 'server-01',
      type: 'physical',
      ipAddress: '',
      operatingSystem: '',
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const service = { ...serviceNamed('Portainer'), hostId: host.id }
    render(<App repository={new MemoryRepository({ services: [service], hosts: [host] })} />)

    await user.click(await screen.findByRole('button', { name: 'Manage hosts' }))
    const hostItem = screen.getByRole('button', { name: 'Edit host server-01' }).closest('.host-list-item')
    expect(hostItem).not.toBeNull()
    expect(
      within(hostItem as HTMLElement).getByRole('button', { name: 'Delete host server-01' }),
    ).toBeDisabled()
    expect(within(hostItem as HTMLElement).getByText('Reassign services before deleting.')).toBeVisible()
  })

  it('creates a complete service with multiple ports and dependencies', async () => {
    const user = userEvent.setup()
    const host: Host = {
      id: 'host-1',
      name: 'nas-01',
      type: 'nas',
      ipAddress: '192.168.1.10',
      operatingSystem: 'TrueNAS',
      notes: '',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const dependency = serviceNamed('Postgres')
    const repository = new MemoryRepository({ services: [dependency], hosts: [host] })
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Add service' }))
    const editor = screen.getByRole('heading', { name: 'Add service' }).closest('section')
    expect(editor).not.toBeNull()
    const form = within(editor as HTMLElement)
    await user.type(form.getByLabelText('Service name *'), 'Immich')
    await user.selectOptions(form.getByLabelText('Host'), host.id)
    await user.type(form.getByLabelText('Internal hostname or IP'), 'http://192.168.1.10:2283')
    await user.selectOptions(form.getByLabelText('External exposure'), 'vpn')
    await user.click(form.getByRole('button', { name: 'Add path' }))
    await user.type(form.getByLabelText('Immich host path 1'), '/opt/immich')
    await user.type(form.getByLabelText('Immich container path 1'), '/config')
    await user.type(form.getByLabelText('Immich path purpose 1'), 'Configuration')
    await user.type(form.getByLabelText('Docker network'), 'photos')
    await user.click(form.getByLabelText('Postgres'))
    await user.click(form.getByRole('button', { name: 'Add port' }))
    await user.type(form.getByLabelText('Host port 1'), '2283')
    await user.type(form.getByLabelText('Container port 1'), '2283')
    await user.click(form.getByRole('button', { name: 'Add port' }))
    await user.type(form.getByLabelText('Host port 2'), '2284')
    await user.type(form.getByLabelText('Container port 2'), '2284')
    await user.click(form.getByRole('button', { name: 'Create service' }))

    const created = repository.data.services.find((service) => service.name === 'Immich')
    expect(created).toMatchObject({
      hostId: host.id,
      internalUrl: 'http://192.168.1.10:2283',
      network: 'photos',
      exposure: 'vpn',
      dependencyIds: [dependency.id],
    })
    expect(created?.ports).toHaveLength(2)
    expect(screen.getByText('Postgres', { selector: '.service-dependencies span' })).toBeVisible()
  })

  it('discards a completely blank port row', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository()
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Add service' }))
    await user.type(screen.getByLabelText('Service name *'), 'Blank port')
    await user.click(screen.getByRole('button', { name: 'Add port' }))
    await user.click(screen.getByRole('button', { name: 'Create service' }))

    expect(repository.data.services[0].ports).toEqual([])
  })

  it('adds, edits, removes, trims, and searches path mappings', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository()
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Add service' }))
    await user.type(screen.getByLabelText('Service name *'), 'Paths')
    expect(screen.getByRole('group', { name: 'Path mappings' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add path' }))
    await user.type(screen.getByLabelText('Paths host path 1'), '  /srv/config  ')
    await user.type(screen.getByLabelText('Paths container path 1'), '/config')
    await user.type(screen.getByLabelText('Paths path purpose 1'), ' Configuration ')
    await user.click(screen.getByLabelText('Paths path 1 read-only'))
    await user.click(screen.getByRole('button', { name: 'Add path' }))
    await user.type(screen.getByLabelText('Paths host path 2'), 'relative/data')
    await user.type(screen.getByLabelText('Paths path purpose 2'), 'Media')
    await user.click(screen.getByRole('button', { name: 'Add path' }))
    await user.click(screen.getByRole('button', { name: 'Create service' }))

    expect(repository.data.services[0].paths).toHaveLength(2)
    expect(repository.data.services[0].paths[0]).toMatchObject({ hostPath: '/srv/config', purpose: 'Configuration', readOnly: true })
    expect(screen.getByText('Read-only')).toBeVisible()
    expect(screen.getByText('Host paths mix absolute and relative styles.')).toBeVisible()
    expect(screen.getByText('Mapping 2 is incomplete')).toBeVisible()

    for (const query of ['/srv/config', '/config', 'media']) {
      const search = screen.getByRole('searchbox', { name: 'Search services' })
      await user.clear(search)
      await user.type(search, query)
      expect(screen.getByRole('heading', { name: 'Paths' })).toBeVisible()
    }

    await user.clear(screen.getByRole('searchbox', { name: 'Search services' }))
    await user.click(screen.getByRole('button', { name: 'Edit Paths' }))
    await user.clear(screen.getByLabelText('Paths path purpose 2'))
    await user.type(screen.getByLabelText('Paths path purpose 2'), 'Library')
    await user.click(screen.getByRole('button', { name: 'Remove Paths path 1' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(repository.data.services[0].paths).toHaveLength(1)
    expect(repository.data.services[0].paths[0].purpose).toBe('Library')
  })

  it('shows persistence failures without closing the service form', async () => {
    const user = userEvent.setup()
    const repository = new MemoryRepository()
    repository.putService = vi.fn().mockRejectedValue(new Error('Storage unavailable.'))
    render(<App repository={repository} />)

    await user.click(await screen.findByRole('button', { name: 'Add service' }))
    await user.type(screen.getByLabelText('Service name *'), 'Unsaved service')
    await user.click(screen.getByRole('button', { name: 'Add path' }))
    await user.type(screen.getByLabelText('Unsaved service host path 1'), '/keep/me')
    await user.click(screen.getByRole('button', { name: 'Create service' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Storage unavailable.')
    expect(screen.getByRole('heading', { name: 'Add service' })).toBeVisible()
    expect(screen.getByLabelText('Unsaved service host path 1')).toHaveValue('/keep/me')
  })

  it('defaults to Services and switches accessibly to grouped Port Map assignments', async () => {
    const user = userEvent.setup()
    const host: Host = { id: 'host-1', name: 'NAS', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: '2026-08-02T12:00:00.000Z', updatedAt: '2026-08-02T12:00:00.000Z' }
    const services = [
      { ...serviceNamed('Alpha'), hostId: host.id, ports: [{ hostPort: 80, containerPort: 8080, protocol: 'tcp' as const, description: '' }] },
      { ...serviceNamed('Beta'), hostId: host.id, ports: [{ hostPort: 80, protocol: 'both' as const, description: '' }] },
      { ...serviceNamed('Loose'), ports: [{ containerPort: 3000, protocol: 'unknown' as const, description: '' }] },
    ]
    render(<App repository={new MemoryRepository({ services, hosts: [host] })} />)

    const servicesSwitch = await screen.findByRole('button', { name: 'Services' })
    const portMapSwitch = screen.getByRole('button', { name: 'Port Map' })
    expect(servicesSwitch).toHaveAttribute('aria-pressed', 'true')
    expect(portMapSwitch).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('heading', { name: 'Services' })).toBeVisible()

    await user.click(portMapSwitch)
    expect(portMapSwitch).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'Port Map' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'NAS' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Unassigned host' })).toBeVisible()
    expect(screen.getByText(/also used by Beta/)).toBeVisible()
    expect(screen.getByText('Host port is missing.')).toBeVisible()
    expect(screen.getByText('Protocol is unknown.')).toBeVisible()
    expect(screen.getByText('Service has no assigned host.')).toBeVisible()
  })

  it('does not render a service as also using its own conflicting port', async () => {
    const user = userEvent.setup()
    const host: Host = { id: 'host-1', name: 'NAS', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: '2026-08-02T12:00:00.000Z', updatedAt: '2026-08-02T12:00:00.000Z' }
    const overlapping = {
      ...serviceNamed('Alpha'),
      hostId: host.id,
      ports: [
        { hostPort: 8080, containerPort: 80, protocol: 'tcp' as const, description: '' },
        { hostPort: 8080, containerPort: 81, protocol: 'both' as const, description: '' },
      ],
    }
    render(<App repository={new MemoryRepository({ services: [overlapping], hosts: [host] })} />)

    await user.click(await screen.findByRole('button', { name: 'Port Map' }))
    expect(screen.getAllByText(/Conflict: 8080\//)).toHaveLength(2)
    expect(screen.queryByText(/also used by Alpha/)).not.toBeInTheDocument()
  })

  it('filters Port Map hosts and preserves the filter after editing a service', async () => {
    const user = userEvent.setup()
    const timestamp = '2026-08-02T12:00:00.000Z'
    const hosts: Host[] = [
      { id: 'one', name: 'Host one', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
      { id: 'two', name: 'Host two', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
    ]
    const repository = new MemoryRepository({
      hosts,
      services: [
        { ...serviceNamed('One'), hostId: 'one', ports: [{ hostPort: 10, containerPort: 10, protocol: 'tcp', description: '' }] },
        { ...serviceNamed('Two'), hostId: 'two', ports: [{ hostPort: 20, containerPort: 20, protocol: 'udp', description: '' }] },
      ],
    })
    render(<App repository={repository} />)
    await user.click(await screen.findByRole('button', { name: 'Port Map' }))
    const filter = screen.getByLabelText('Filter Port Map by host')
    await user.selectOptions(filter, 'one')
    expect(screen.getByRole('heading', { name: 'Host one' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Host two' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit service One' }))
    const name = screen.getByLabelText('Service name *')
    await user.clear(name)
    await user.type(name, 'One updated')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { name: 'Port Map' })).toBeVisible()
    expect(filter).toHaveValue('one')
    expect(screen.getByText('One updated')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Port Map' })).toHaveFocus()
  })

  it('shows Port Map empty states for no services, no ports, and a host without assignments', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App repository={new MemoryRepository()} />)
    await user.click(await screen.findByRole('button', { name: 'Port Map' }))
    expect(screen.getByRole('heading', { name: 'No services yet' })).toBeVisible()
    unmount()

    const timestamp = '2026-08-02T12:00:00.000Z'
    const hosts: Host[] = [
      { id: 'one', name: 'Host one', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
      { id: 'two', name: 'Host two', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
    ]
    const second = render(<App repository={new MemoryRepository({ services: [serviceNamed('No ports')], hosts })} />)
    await user.click(await screen.findByRole('button', { name: 'Port Map' }))
    expect(screen.getByRole('heading', { name: 'No port mappings yet' })).toBeVisible()
    second.unmount()

    render(<App repository={new MemoryRepository({ services: [{ ...serviceNamed('Mapped'), hostId: 'one', ports: [{ hostPort: 1, protocol: 'tcp', description: '' }] }], hosts })} />)
    await user.click(await screen.findByRole('button', { name: 'Port Map' }))
    await user.selectOptions(screen.getByLabelText('Filter Port Map by host'), 'two')
    expect(screen.getByRole('heading', { name: 'No ports for this host' })).toBeVisible()
  })

  it('switches to an accessible Path Map with host/path groups, sharing, and warnings', async () => {
    const user = userEvent.setup()
    const timestamp = '2026-08-02T12:00:00.000Z'
    const host: Host = { id: 'nas', name: 'NAS', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp }
    const services: Service[] = [
      { ...serviceNamed('Alpha'), hostId: 'nas', paths: [
        { id: 'a1', hostPath: '/srv/shared', containerPath: '/data', purpose: 'Media', readOnly: true },
        { id: 'a2', hostPath: 'relative', containerPath: '', purpose: '', readOnly: false },
      ] },
      { ...serviceNamed('Beta'), hostId: 'nas', paths: [{ id: 'b', hostPath: ' /SRV/SHARED ', containerPath: '/library', purpose: 'Library', readOnly: false }] },
      { ...serviceNamed('Loose'), paths: [{ id: 'l', hostPath: '', containerPath: '', purpose: '', readOnly: false }] },
    ]
    render(<App repository={new MemoryRepository({ services, hosts: [host] })} />)

    const servicesView = await screen.findByRole('button', { name: 'Services' })
    const portMapView = screen.getByRole('button', { name: 'Port Map' })
    const pathMapView = screen.getByRole('button', { name: 'Path Map' })
    expect(servicesView).toHaveAttribute('aria-pressed', 'true')
    await user.click(portMapView)
    expect(screen.getByRole('heading', { name: 'Port Map' })).toBeVisible()
    await user.click(pathMapView)
    expect(pathMapView).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: 'NAS' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '/srv/shared' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Unassigned host' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Host path missing' })).toBeVisible()
    expect(screen.getByText('Shared with Beta')).toBeVisible()
    expect(screen.getByText('Read-only')).toBeVisible()
    expect(screen.getAllByText('Mapping is incomplete.')).toHaveLength(2)
    expect(screen.getAllByText('Service warning: host paths mix absolute and relative styles.')).toHaveLength(2)
    expect(screen.getAllByText('Service warning: no configuration-purpose mapping recorded.').length).toBeGreaterThan(0)
  })

  it('preserves stored host paths and gives every path group one valid unique accessible label', async () => {
    const user = userEvent.setup()
    const timestamp = '2026-08-02T12:00:00.000Z'
    const hosts: Host[] = [
      { id: 'host one', name: 'Host one', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
      { id: 'host:two', name: 'Host two', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
    ]
    const services: Service[] = [
      { ...serviceNamed('Alpha'), hostId: 'host one', paths: [{ id: 'alpha-path', hostPath: '/Data Folder', containerPath: '/alpha', purpose: '', readOnly: false }] },
      { ...serviceNamed('Beta'), hostId: 'host one', paths: [{ id: 'beta-path', hostPath: ' /data folder ', containerPath: '/beta', purpose: '', readOnly: false }] },
      { ...serviceNamed('Windows'), hostId: 'host one', paths: [{ id: 'windows-path', hostPath: String.raw`C:\Media Files`, containerPath: '/media', purpose: '', readOnly: false }] },
      { ...serviceNamed('Gamma'), hostId: 'host:two', paths: [{ id: 'gamma-path', hostPath: '/DATA FOLDER', containerPath: '/gamma', purpose: '', readOnly: false }] },
      { ...serviceNamed('Loose'), paths: [{ id: 'missing-path', hostPath: '', containerPath: '/loose', purpose: '', readOnly: false }] },
    ]
    const { container } = render(<App repository={new MemoryRepository({ services, hosts })} />)

    await user.click(await screen.findByRole('button', { name: 'Path Map' }))

    const alphaRow = screen.getByRole('row', { name: /Alpha, host path \/Data Folder/ })
    const betaRow = screen.getByRole('row', { name: /Beta, host path \/data folder/ })
    expect(within(alphaRow).getByRole('cell', { name: /\/Data Folder/ })).toHaveTextContent('/Data Folderabsolute')
    expect(within(betaRow).getByRole('cell', { name: /\/data folder/ }).textContent).toBe(' /data folder absolute')
    expect(within(alphaRow).getByRole('cell', { name: /\/alpha/ })).toBeVisible()
    expect(within(betaRow).getByRole('cell', { name: /\/beta/ })).toBeVisible()
    expect(screen.getByText('Shared with Beta')).toBeVisible()
    expect(screen.getByText('Shared with Alpha')).toBeVisible()
    const windowsRow = screen.getByRole('row', { name: /Windows, host path C:\\Media Files/ })
    expect(within(windowsRow).getByRole('cell', { name: /C:\\Media Files/ })).toBeVisible()
    expect(screen.getByRole('row', { name: /Loose, host path missing/ })).toHaveTextContent('Missing')

    const pathGroups = [...container.querySelectorAll<HTMLElement>('.path-group')]
    const labelledBy = pathGroups.map((group) => group.getAttribute('aria-labelledby'))
    expect(labelledBy).toHaveLength(4)
    expect(new Set(labelledBy).size).toBe(labelledBy.length)
    labelledBy.forEach((id) => {
      expect(id).toBeTruthy()
      expect(id).not.toMatch(/\s/)
      expect(container.querySelectorAll(`[id="${id}"]`)).toHaveLength(1)
    })
    expect(screen.getByRole('region', { name: 'Host path missing' })).toBeVisible()
  })

  it('filters and searches Path Map, then returns from save and cancel with focus restored', async () => {
    const user = userEvent.setup()
    const timestamp = '2026-08-02T12:00:00.000Z'
    const hosts: Host[] = [
      { id: 'one', name: 'Host one', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
      { id: 'two', name: 'Host two', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
    ]
    const repository = new MemoryRepository({ hosts, services: [
      { ...serviceNamed('One'), hostId: 'one', paths: [{ id: 'one-path', hostPath: '/srv/config', containerPath: '/config', purpose: 'Configuration', readOnly: true }] },
      { ...serviceNamed('Two'), hostId: 'two', paths: [{ id: 'two-path', hostPath: '/srv/media', containerPath: '/media', purpose: 'Library', readOnly: false }] },
    ] })
    render(<App repository={repository} />)
    const pathMapView = await screen.findByRole('button', { name: 'Path Map' })
    await user.click(pathMapView)
    const filter = screen.getByLabelText('Filter Path Map by host')
    await user.selectOptions(filter, 'one')
    expect(screen.getByRole('heading', { name: 'Host one' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Host two' })).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search Path Map' }), 'configuration')
    expect(screen.getByText('/config')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Edit service One' }))
    const name = screen.getByLabelText('Service name *')
    await user.clear(name)
    await user.type(name, 'One updated')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('heading', { name: 'Path Map' })).toBeVisible()
    expect(filter).toHaveValue('one')
    expect(screen.getByText('One updated')).toBeVisible()
    expect(pathMapView).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Edit service One updated' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('heading', { name: 'Path Map' })).toBeVisible()
    expect(pathMapView).toHaveFocus()
  })

  it('shows Path Map empty states for no services, no paths, host filters, and search', async () => {
    const user = userEvent.setup()
    const first = render(<App repository={new MemoryRepository()} />)
    await user.click(await screen.findByRole('button', { name: 'Path Map' }))
    expect(screen.getByRole('heading', { name: 'No services yet' })).toBeVisible()
    first.unmount()

    const timestamp = '2026-08-02T12:00:00.000Z'
    const hosts: Host[] = [
      { id: 'one', name: 'Host one', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
      { id: 'two', name: 'Host two', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
    ]
    const second = render(<App repository={new MemoryRepository({ services: [serviceNamed('No paths')], hosts })} />)
    await user.click(await screen.findByRole('button', { name: 'Path Map' }))
    expect(screen.getByRole('heading', { name: 'No path mappings yet' })).toBeVisible()
    second.unmount()

    render(<App repository={new MemoryRepository({ services: [{ ...serviceNamed('Mapped'), hostId: 'one', paths: [{ id: 'p', hostPath: '/data', containerPath: '/data', purpose: '', readOnly: false }] }], hosts })} />)
    await user.click(await screen.findByRole('button', { name: 'Path Map' }))
    await user.selectOptions(screen.getByLabelText('Filter Path Map by host'), 'two')
    expect(screen.getByRole('heading', { name: 'No paths for this host' })).toBeVisible()
    await user.selectOptions(screen.getByLabelText('Filter Path Map by host'), 'all')
    await user.type(screen.getByRole('searchbox', { name: 'Search Path Map' }), 'no match')
    expect(screen.getByRole('heading', { name: 'No path mappings match' })).toBeVisible()
  })
})
