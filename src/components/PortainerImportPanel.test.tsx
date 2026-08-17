import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortainerImportPanel } from './PortainerImportPanel'
import { portainerImportClient, type PortainerPreview } from '../data/portainerImport'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const timestamp = '2026-01-01T00:00:00.000Z'
const candidate = (
  id: string,
  sourceState: string,
  overrides: Partial<PortainerPreview['services'][number]> = {},
): PortainerPreview['services'][number] => ({
  environmentId: 1, containerId: `container-${id}`, sourceState, networkOptions: ['bridge'], alreadyBound: false,
  warnings: [], conflicts: [], id, name: id, containerName: id, dockerImage: `example/${id}:1`, description: '',
  applicationUrl: '', status: sourceState === 'running' ? 'active' : 'paused', hostId: 'new-host-one', internalUrl: '',
  ports: [], paths: [], network: 'bridge', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: timestamp, updatedAt: timestamp,
  ...overrides,
})

const previewFixture = (services: PortainerPreview['services']): PortainerPreview => ({
  previewToken: 'preview', expectedInventoryRevision: 3,
  existingHosts: [{ id: 'existing-host', name: 'Existing', ipAddress: '192.168.1.10' }],
  hosts: [
    { environmentId: 1, existingHostMatches: [], id: 'new-host-one', name: 'Docker one', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: timestamp, updatedAt: timestamp },
    { environmentId: 2, existingHostMatches: [], id: 'new-host-two', name: 'Docker two', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: timestamp, updatedAt: timestamp },
  ],
  services,
})

async function renderPreview(preview: PortainerPreview, inventoryServices: Parameters<typeof PortainerImportPanel>[0]['services'] = []) {
  const user = userEvent.setup()
  vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: true })
  vi.spyOn(portainerImportClient, 'connect').mockResolvedValue({ sessionToken: 'opaque', environments: [{ id: 1, name: 'Docker', containerEngine: 'docker', publicUrl: '' }] })
  vi.spyOn(portainerImportClient, 'preview').mockResolvedValue(preview)
  render(<PortainerImportPanel hosts={[]} services={inventoryServices} onImported={vi.fn()} />)
  await user.click(await screen.findByRole('button', { name: 'Import from Portainer' }))
  await user.type(screen.getByLabelText('Portainer API token'), 'secret')
  await user.click(screen.getByRole('button', { name: 'Discover environments' }))
  await user.click(await screen.findByRole('checkbox', { name: 'Docker' }))
  await user.click(screen.getByRole('button', { name: 'Build preview' }))
  await screen.findByLabelText('Select all services')
  return user
}

describe('PortainerImportPanel', () => {
  it('stays absent when disabled', async () => {
    vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: false })
    render(<PortainerImportPanel hosts={[]} services={[]} onImported={vi.fn()} />)
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
      services: [{ environmentId: 1, containerId: 'c', sourceState: 'exited', networkOptions: ['a', 'b'], alreadyBound: false, warnings: [{ code: 'VOLUME_SKIPPED', message: 'Skipped volume.' }], conflicts: [{ code: 'NETWORK_SELECTION_REQUIRED', message: 'Select one network.', blocking: true }], id: 's', name: 'App', containerName: 'App', dockerImage: 'app:1', description: '', applicationUrl: '', status: 'paused', hostId: 'h', internalUrl: '', ports: [{ id: 'p', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }], paths: [{ id: 'm', hostPath: '/srv', containerPath: '/data', purpose: '', readOnly: true }], network: '', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const cancel = vi.spyOn(portainerImportClient, 'cancelPreview').mockResolvedValue(null)
    render(<PortainerImportPanel hosts={[]} services={[]} onImported={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Import from Portainer' }))
    expect(screen.queryByLabelText(/URL/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Portainer API token'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Discover environments' }))
    expect(screen.queryByLabelText('Portainer API token')).not.toBeInTheDocument()
    await user.click(await screen.findByRole('checkbox', { name: 'Docker' }))
    await user.click(screen.getByRole('button', { name: 'Build preview' }))
    const container = await screen.findByRole('checkbox', { name: /App exited/i })
    expect(container).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Import selected' })).toBeDisabled()
    expect(await screen.findByText('Only the selected new records will be created. Existing services are never updated.')).toBeVisible()
    expect(screen.getByText('Skipped volume.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Import selected' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Network'), 'a')
    expect(screen.getByRole('button', { name: 'Import selected' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Cancel preview' }))
    expect(cancel).toHaveBeenCalledWith('preview')
  })

  it('selects and clears every importable service with accurate aggregate state', async () => {
    const running = candidate('Running app', 'running')
    const stopped = candidate('Stopped app', 'exited')
    const paused = candidate('Paused app', 'paused')
    const bound = candidate('Imported app', 'running', { alreadyBound: true })
    const user = await renderPreview(previewFixture([running, stopped, paused, bound]))
    const selectAll = screen.getByLabelText('Select all services')
    const runningCheckbox = screen.getByRole('checkbox', { name: /Running app running/i })
    const stoppedCheckbox = screen.getByRole('checkbox', { name: /Stopped app exited/i })
    const pausedCheckbox = screen.getByRole('checkbox', { name: /Paused app paused/i })
    const boundCheckbox = screen.getByRole('checkbox', { name: /Imported app running/i })

    expect(selectAll).not.toBeChecked()
    expect(selectAll).not.toBePartiallyChecked()
    expect(stoppedCheckbox).not.toBeChecked()
    expect(pausedCheckbox).not.toBeChecked()
    expect(boundCheckbox).toBeDisabled()

    await user.click(runningCheckbox)
    expect(selectAll).toBePartiallyChecked()

    await user.click(selectAll)
    expect(selectAll).toBeChecked()
    expect(runningCheckbox).toBeChecked()
    expect(stoppedCheckbox).toBeChecked()
    expect(pausedCheckbox).toBeChecked()
    expect(boundCheckbox).not.toBeChecked()

    await user.click(selectAll)
    expect(selectAll).not.toBeChecked()
    expect(selectAll).not.toBePartiallyChecked()
    expect(runningCheckbox).not.toBeChecked()
    expect(stoppedCheckbox).not.toBeChecked()
    expect(pausedCheckbox).not.toBeChecked()
  })

  it('assigns one host only to selected services and preserves individual controls and confirmation', async () => {
    const selected = candidate('Selected app', 'running', {
      containerName: 'shared-app',
      ports: [{ id: 'selected-port', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }],
    })
    const unselected = candidate('Unselected app', 'running', { environmentId: 2, hostId: 'new-host-two' })
    const existingService = {
      id: 'existing-service', name: 'Existing app', containerName: 'shared-app', dockerImage: '', description: '', applicationUrl: '',
      status: 'active' as const, hostId: 'existing-host', internalUrl: '',
      ports: [{ id: 'existing-port', hostPort: 8080, containerPort: 8080, protocol: 'tcp' as const, description: '' }],
      paths: [], network: '', exposure: 'unknown' as const, dependencyIds: [], notes: '', createdAt: timestamp, updatedAt: timestamp,
    }
    const confirm = vi.spyOn(portainerImportClient, 'confirm').mockResolvedValue({ inventoryRevision: 4, hostIds: [], serviceIds: [selected.id] })
    const user = await renderPreview(previewFixture([selected, unselected]), [existingService])
    const selectedCard = screen.getByRole('checkbox', { name: /^Selected app running$/i }).closest('article')!
    const unselectedCard = screen.getByRole('checkbox', { name: /^Unselected app running$/i }).closest('article')!

    await user.click(within(selectedCard).getByRole('checkbox', { name: /^Selected app running$/i }))
    await user.selectOptions(screen.getByLabelText('Set host for selected services'), 'existing-host')
    await user.click(screen.getByRole('button', { name: 'Apply host' }))

    expect(within(selectedCard).getByLabelText('Target host')).toHaveValue('existing-host')
    expect(within(unselectedCard).getByLabelText('Target host')).toHaveValue('new-host-two')
    expect(within(selectedCard).getByText('Container name matches Existing app on the selected host.')).toBeVisible()
    expect(within(selectedCard).getByText('8080/tcp overlaps Existing app on the selected host.')).toBeVisible()

    await user.selectOptions(within(selectedCard).getByLabelText('Target host'), 'new-host-two')
    expect(within(selectedCard).queryByText(/on the selected host/)).not.toBeInTheDocument()
    await user.selectOptions(within(selectedCard).getByLabelText('Target host'), 'existing-host')
    await user.click(within(unselectedCard).getByRole('checkbox', { name: /^Unselected app running$/i }))
    await user.click(within(unselectedCard).getByRole('checkbox', { name: /^Unselected app running$/i }))

    await user.click(screen.getByRole('checkbox', { name: /I reviewed this selection/ }))
    await user.click(screen.getByRole('button', { name: 'Import selected' }))
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect(confirm.mock.calls[0][2]).toHaveLength(1)
    expect(confirm.mock.calls[0][2][0]).toMatchObject({ id: selected.id, hostId: 'existing-host' })
  })

  it('confirms the stored edited candidate and refreshes inventory after success', async () => {
    const user = userEvent.setup()
    vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: true })
    vi.spyOn(portainerImportClient, 'connect').mockResolvedValue({ sessionToken: 'opaque', environments: [{ id: 1, name: 'Docker', containerEngine: 'docker', publicUrl: '' }] })
    vi.spyOn(portainerImportClient, 'preview').mockResolvedValue({
      previewToken: 'preview', expectedInventoryRevision: 3, existingHosts: [],
      hosts: [{ environmentId: 1, existingHostMatches: [], id: 'h', name: 'Docker', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      services: [{ environmentId: 1, containerId: 'c', sourceState: 'running', networkOptions: ['bridge'], alreadyBound: false, warnings: [], conflicts: [], id: 's', name: 'App', containerName: 'App', dockerImage: 'app:1', description: '', applicationUrl: '', status: 'active', hostId: 'h', internalUrl: '', ports: [{ id: 'p', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }], paths: [{ id: 'm', hostPath: '/srv', containerPath: '/data', purpose: '', readOnly: true }], network: 'bridge', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const confirm = vi.spyOn(portainerImportClient, 'confirm').mockResolvedValue({ inventoryRevision: 4, hostIds: ['h'], serviceIds: ['s'] })
    const onImported = vi.fn().mockResolvedValue(undefined)
    render(<PortainerImportPanel hosts={[]} services={[]} onImported={onImported} />)
    await user.click(await screen.findByRole('button', { name: 'Import from Portainer' }))
    await user.type(screen.getByLabelText('Portainer API token'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Discover environments' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Docker' }))
    await user.click(screen.getByRole('button', { name: 'Build preview' }))
    await user.click(await screen.findByRole('checkbox', { name: /App running/i }))
    await user.click(screen.getByRole('checkbox', { name: /8080.*80/ }))
    await user.click(screen.getByRole('checkbox', { name: /\/srv.*\/data/ }))
    await user.click(screen.getByRole('checkbox', { name: /I reviewed this selection/ }))
    await user.click(screen.getByRole('button', { name: 'Import selected' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(confirm.mock.calls[0][2][0]).toMatchObject({ id: 's', ports: [], paths: [] })
    expect(onImported).toHaveBeenCalled()
    expect(await screen.findByText('Imported 1 services and 1 hosts. Inventory revision 4.')).toBeVisible()
  })

  it('keeps a successful import complete when the following inventory refresh fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: true })
    vi.spyOn(portainerImportClient, 'connect').mockResolvedValue({ sessionToken: 'opaque', environments: [{ id: 1, name: 'Docker', containerEngine: 'docker', publicUrl: '' }] })
    vi.spyOn(portainerImportClient, 'preview').mockResolvedValue({
      previewToken: 'preview', expectedInventoryRevision: 3, existingHosts: [],
      hosts: [{ environmentId: 1, existingHostMatches: [], id: 'h', name: 'Docker', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      services: [{ environmentId: 1, containerId: 'c', sourceState: 'running', networkOptions: ['bridge'], alreadyBound: false, warnings: [], conflicts: [], id: 's', name: 'App', containerName: 'App', dockerImage: 'app:1', description: '', applicationUrl: '', status: 'active', hostId: 'h', internalUrl: '', ports: [], paths: [], network: 'bridge', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const confirm = vi.spyOn(portainerImportClient, 'confirm').mockResolvedValue({ inventoryRevision: 4, hostIds: ['h'], serviceIds: ['s'] })
    render(<PortainerImportPanel hosts={[]} services={[]} onImported={vi.fn().mockRejectedValue(new Error('refresh failed'))} />)

    await user.click(await screen.findByRole('button', { name: 'Import from Portainer' }))
    await user.type(screen.getByLabelText('Portainer API token'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Discover environments' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Docker' }))
    await user.click(screen.getByRole('button', { name: 'Build preview' }))
    await user.click(await screen.findByRole('checkbox', { name: /App running/i }))
    await user.click(screen.getByRole('checkbox', { name: /I reviewed this selection/ }))
    await user.click(screen.getByRole('button', { name: 'Import selected' }))

    expect(await screen.findByText('Imported 1 services and 1 hosts. Inventory revision 4.')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('The import succeeded, but StackMap could not refresh the inventory.')
    expect(screen.queryByRole('button', { name: 'Import selected' })).not.toBeInTheDocument()
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('recomputes host-scoped conflicts and stores nested deselection in the preview candidate', async () => {
    const user = userEvent.setup()
    vi.spyOn(portainerImportClient, 'status').mockResolvedValue({ enabled: true })
    vi.spyOn(portainerImportClient, 'connect').mockResolvedValue({ sessionToken: 'opaque', environments: [{ id: 1, name: 'Docker', containerEngine: 'docker', publicUrl: '' }] })
    vi.spyOn(portainerImportClient, 'preview').mockResolvedValue({
      previewToken: 'preview', expectedInventoryRevision: 3,
      existingHosts: [{ id: 'existing-host', name: 'Existing', ipAddress: '' }],
      hosts: [{ environmentId: 1, existingHostMatches: [], id: 'new-host', name: 'Docker', type: 'container-host', ipAddress: '', operatingSystem: 'Linux', notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      services: [{ environmentId: 1, containerId: 'c', sourceState: 'running', networkOptions: ['bridge'], alreadyBound: false, warnings: [], conflicts: [], id: 's', name: 'App', containerName: 'App', dockerImage: 'app:1', description: '', applicationUrl: '', status: 'active', hostId: 'new-host', internalUrl: '', ports: [{ id: 'p', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }], paths: [{ id: 'm', hostPath: '/srv', containerPath: '/data', purpose: '', readOnly: true }], network: 'bridge', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    const existingService = { id: 'existing-service', name: 'App', containerName: 'App', dockerImage: '', description: '', applicationUrl: '', status: 'active' as const, hostId: 'existing-host', internalUrl: '', ports: [{ id: 'existing-port', hostPort: 8080, containerPort: 8080, protocol: 'tcp' as const, description: '' }], paths: [], network: '', exposure: 'unknown' as const, dependencyIds: [], notes: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

    render(<PortainerImportPanel hosts={[]} services={[existingService]} onImported={vi.fn()} />)
    await user.click(await screen.findByRole('button', { name: 'Import from Portainer' }))
    await user.type(screen.getByLabelText('Portainer API token'), 'secret')
    await user.click(screen.getByRole('button', { name: 'Discover environments' }))
    await user.click(await screen.findByRole('checkbox', { name: 'Docker' }))
    await user.click(screen.getByRole('button', { name: 'Build preview' }))
    await user.click(await screen.findByRole('checkbox', { name: /App running/i }))
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
