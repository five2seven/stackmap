import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortainerImportPanel } from './PortainerImportPanel'
import { portainerImportClient } from '../data/portainerImport'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('PortainerImportPanel', () => {
  it('stays absent when disabled', async () => {
    vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: false })
    render(<PortainerImportPanel hosts={[]} services={[]} />)
    await waitFor(() => expect(portainerImportClient.status).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Import from Portainer' })).not.toBeInTheDocument()
  })

  it('accepts only a token, previews selected discovery, edits safe choices, and cancels', async () => {
    const user = userEvent.setup()
    vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: true })
    vi.spyOn(portainerImportClient, 'connect').mockResolvedValue({ sessionToken: 'opaque', environments: [{ id: 1, name: 'Docker', containerEngine: 'docker', publicUrl: '' }] })
    vi.spyOn(portainerImportClient, 'preview').mockResolvedValue({
      previewToken: 'preview', expectedInventoryRevision: 3, existingHosts: [],
      hosts: [{ environmentId: 1, existingHostMatches: [], id: 'h', name: 'Docker', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      services: [{ environmentId: 1, containerId: 'c', sourceState: 'exited', networkOptions: ['a', 'b'], warnings: [{ code: 'VOLUME_SKIPPED', message: 'Skipped volume.' }], conflicts: [{ code: 'NETWORK_SELECTION_REQUIRED', message: 'Select one network.', blocking: true }], id: 's', name: 'App', containerName: 'App', dockerImage: 'app:1', description: '', applicationUrl: '', status: 'paused', hostId: 'h', internalUrl: '', ports: [{ id: 'p', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }], paths: [{ id: 'm', hostPath: '/srv', containerPath: '/data', purpose: '', readOnly: true }], network: '', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const cancel = vi.spyOn(portainerImportClient, 'cancelPreview').mockResolvedValue(null)
    render(<PortainerImportPanel hosts={[]} services={[]} />)
    await user.click(await screen.findByRole('button', { name: 'Import from Portainer' }))
    expect(screen.queryByLabelText(/URL/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Portainer API token'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Discover environments' }))
    expect(screen.queryByLabelText('Portainer API token')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('checkbox', { name: 'Docker' }))
    await user.click(screen.getByRole('button', { name: 'Build preview' }))
    expect(await screen.findByText('Phase 1 cannot write inventory. Import confirmation will be added only in Phase 2.')).toBeVisible()
    expect(screen.getByText('Skipped volume.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /confirm|import selected/i })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Network'), 'a')
    await user.click(screen.getByRole('button', { name: 'Cancel preview' }))
    expect(cancel).toHaveBeenCalledWith('preview')
  })

  it('recomputes host-scoped conflicts and stores nested deselection in the preview candidate', async () => {
    const user = userEvent.setup()
    vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: true })
    vi.spyOn(portainerImportClient, 'connect').mockResolvedValue({ sessionToken: 'opaque', environments: [{ id: 1, name: 'Docker', containerEngine: 'docker', publicUrl: '' }] })
    vi.spyOn(portainerImportClient, 'preview').mockResolvedValue({
      previewToken: 'preview', expectedInventoryRevision: 3,
      existingHosts: [{ id: 'existing-host', name: 'Existing', ipAddress: '' }],
      hosts: [{ environmentId: 1, existingHostMatches: [], id: 'new-host', name: 'Docker', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      services: [{ environmentId: 1, containerId: 'c', sourceState: 'running', networkOptions: ['bridge'], warnings: [], conflicts: [], id: 's', name: 'App', containerName: 'App', dockerImage: 'app:1', description: '', applicationUrl: '', status: 'active', hostId: 'new-host', internalUrl: '', ports: [{ id: 'p', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }], paths: [{ id: 'm', hostPath: '/srv', containerPath: '/data', purpose: '', readOnly: true }], network: 'bridge', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const existingService = { id: 'existing-service', name: 'App', containerName: 'App', dockerImage: '', description: '', applicationUrl: '', status: 'active' as const, hostId: 'existing-host', internalUrl: '', ports: [{ id: 'existing-port', hostPort: 8080, containerPort: 8080, protocol: 'tcp' as const, description: '' }], paths: [], network: '', exposure: 'unknown' as const, dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

    render(<PortainerImportPanel hosts={[]} services={[existingService]} />)
    await user.click(await screen.findByRole('button', { name: 'Import from Portainer' }))
    await user.type(screen.getByLabelText('Portainer API token'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Discover environments' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Docker' }))
    await user.click(screen.getByRole('button', { name: 'Build preview' }))
    await screen.findByRole('checkbox', { name: /App running/i })
    expect(screen.queryByText(/Container name matches .* on the selected host/)).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Target host'), 'existing-host')
    expect(screen.getByText('Container name matches App on the selected host.')).toBeVisible()
    expect(screen.getByText('8080/tcp overlaps App on the selected host.')).toBeVisible()

    await user.click(screen.getByRole('checkbox', { name: /8080.*80/ }))
    await user.click(screen.getByRole('checkbox', { name: /\/srv.*\/data/ }))
    expect(screen.getByText((_, element) => element?.textContent === 'Ports: none')).toBeVisible()
    expect(screen.getByText((_, element) => element?.textContent === 'Bind mounts: none')).toBeVisible()
    expect(screen.queryByText('8080/tcp overlaps App on the selected host.')).not.toBeInTheDocument()
  })
})
