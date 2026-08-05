import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { LegacyInventoryError, type LegacyInventoryReader } from './data/legacyInventory'
import type { StackMapRepository } from './data/repository'
import { createService } from './domain/serviceUtils'
import type { StackMapData } from './domain/types'
import type { LegacyMigrationClient } from './data/legacyMigration'

const emptyData: StackMapData = { services: [], hosts: [] }
const repository = (getAll = vi.fn(async () => emptyData)): StackMapRepository => ({
  getAll, putService: vi.fn(), deleteService: vi.fn(), putHost: vi.fn(), deleteHost: vi.fn(),
})
const migrationClient = (overrides: Partial<LegacyMigrationClient> = {}): LegacyMigrationClient => ({
  status: vi.fn(async () => ({ status: 'missing' as const })),
  preview: vi.fn(async () => ({
    summary: { legacySchemaVersion: 3, legacyExportedAt: '2026-01-01T00:00:00.000Z', hostCount: 0, serviceCount: 1, portCount: 0, pathCount: 0, dependencyCount: 0 },
    expectedInventoryRevision: 0, previewToken: 'opaque',
  })),
  confirm: vi.fn(async () => ({
    summary: { legacySchemaVersion: 3, legacyExportedAt: '2026-01-01T00:00:00.000Z', hostCount: 0, serviceCount: 1, portCount: 0, pathCount: 0, dependencyCount: 0 }, inventoryRevision: 1,
  })), ...overrides,
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('coordinated cutover boundary', () => {
  it('loads server inventory directly when legacy inventory is empty', async () => {
    const getAll = vi.fn(async () => ({ services: [createService('Server app')], hosts: [] }))
    render(<App repository={repository(getAll)} legacyReader={{ detect: async () => false, read: async () => emptyData }} />)
    expect(await screen.findByRole('heading', { name: 'Server app' })).toBeInTheDocument()
    expect(getAll).toHaveBeenCalledOnce()
  })

  it('blocks server access until explicit migration confirmation', async () => {
    const user = userEvent.setup()
    const getAll = vi.fn(async () => emptyData)
    const read = vi.fn(async () => ({ services: [createService('Legacy app')], hosts: [] }))
    const legacyReader: LegacyInventoryReader = { detect: vi.fn(async () => true), read }
    render(<App repository={repository(getAll)} legacyReader={legacyReader} migrationClient={migrationClient()} />)
    const dialog = await screen.findByRole('alertdialog', { name: 'Choose how to continue safely' })
    expect(dialog).toHaveTextContent('empty SQLite server inventory')
    expect(screen.queryByRole('button', { name: 'Add service' })).not.toBeInTheDocument()
    expect(getAll).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Preview migration' }))
    await user.click(await screen.findByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Confirm migration' }))
    await screen.findByRole('button', { name: 'Add service' })
    expect(getAll).toHaveBeenCalledOnce()
    expect(read).toHaveBeenCalled()
  })

  it('keeps editing blocked when receipt lookup fails', async () => {
    const getAll = vi.fn(async () => { throw new Error('internal') })
    render(<App repository={repository(getAll)} legacyReader={{ detect: async () => true, read: async () => emptyData }} migrationClient={migrationClient({ status: vi.fn(async () => { throw new Error('unavailable') }) })} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('safely check for legacy browser data')
    expect(screen.queryByRole('button', { name: 'Add service' })).not.toBeInTheDocument()
  })

  it('offers a distinctly named read-only legacy export', async () => {
    const user = userEvent.setup()
    const read = vi.fn(async () => ({ services: [createService('Legacy app')], hosts: [] }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<App repository={repository()} legacyReader={{ detect: async () => true, read }} migrationClient={migrationClient()} />)
    await user.click(await screen.findByRole('button', { name: 'Export legacy browser data from IndexedDB' }))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent('Legacy browser-data backup exported')
  })

  it('returns focus to preview after cancelling without reading or migrating again', async () => {
    const user = userEvent.setup()
    const read = vi.fn(async () => ({ services: [createService('Legacy app')], hosts: [] }))
    const client = migrationClient()
    render(<App repository={repository()} legacyReader={{ detect: async () => true, read }} migrationClient={client} />)
    const previewButton = await screen.findByRole('button', { name: 'Preview migration' })
    await user.click(previewButton)
    const callsAfterPreview = read.mock.calls.length
    const cancel = await screen.findByRole('button', { name: 'Cancel' })
    cancel.focus()
    expect(cancel).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview migration' })).toHaveFocus())
    expect(read).toHaveBeenCalledTimes(callsAfterPreview)
    expect(client.preview).toHaveBeenCalledOnce()
    expect(client.confirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Legacy migration preview' })).not.toBeInTheDocument()
  })

  it('uses a matching server receipt to bypass repeat blocking', async () => {
    const getAll = vi.fn(async () => ({ services: [createService('Migrated app')], hosts: [] }))
    render(<App repository={repository(getAll)} legacyReader={{ detect: async () => true, read: async () => ({ services: [createService('Migrated app')], hosts: [] }) }} migrationClient={migrationClient({ status: vi.fn(async () => ({ status: 'matched' as const })) })} />)
    expect(await screen.findByRole('heading', { name: 'Migrated app' })).toBeVisible()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('fails closed when the legacy fingerprint differs from the receipt', async () => {
    const getAll = vi.fn(async () => emptyData)
    render(<App repository={repository(getAll)} legacyReader={{ detect: async () => true, read: async () => ({ services: [createService('Changed legacy')], hosts: [] }) }} migrationClient={migrationClient({ status: vi.fn(async () => ({ status: 'changed' as const })) })} />)
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('differs from the dataset previously migrated')
    expect(getAll).not.toHaveBeenCalled()
  })

  it('offers explicit supported-browser recovery without server access before acknowledgement', async () => {
    const user = userEvent.setup()
    const getAll = vi.fn(async () => emptyData)
    const detect = vi.fn(async () => {
      throw new LegacyInventoryError('unsupported', 'UNSUPPORTED_ENUMERATION')
    })
    render(<App repository={repository(getAll)} legacyReader={{ detect, read: async () => emptyData }} />)
    expect(await screen.findByText(/current version of Chrome, Edge/)).toBeInTheDocument()
    expect(screen.getByText(/Legacy browser data might still be present/)).toBeInTheDocument()
    expect(getAll).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Retry legacy browser-data check' }))
    await waitFor(() => expect(detect).toHaveBeenCalledTimes(2))
    expect(getAll).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Continue to server inventory/ }))
    await screen.findByRole('button', { name: 'Add service' })
    expect(getAll).toHaveBeenCalledOnce()
  })

  it('keeps transient detection failures fail-closed with retry only', async () => {
    render(<App repository={repository()} legacyReader={{
      detect: async () => { throw new LegacyInventoryError('timeout', 'TIMEOUT') },
      read: async () => emptyData,
    }} />)
    await screen.findByText(/This may be temporary/)
    expect(screen.getByRole('button', { name: 'Retry legacy browser-data check' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Continue to server inventory/ })).not.toBeInTheDocument()
  })

  it('shows the corrected SQLite server footer', async () => {
    render(<App repository={repository()} legacyReader={{ detect: async () => false, read: async () => emptyData }} />)
    expect(await screen.findByText(/Inventory is stored in server SQLite/)).toBeInTheDocument()
    expect(screen.getByText(/persistent \/config mount/)).toBeInTheDocument()
    expect(screen.queryByText(/Data stays in this browser/)).not.toBeInTheDocument()
  })
})
