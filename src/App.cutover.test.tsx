import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { LegacyInventoryReader } from './data/legacyInventory'
import type { StackMapRepository } from './data/repository'
import { createService } from './domain/serviceUtils'
import type { StackMapData } from './domain/types'

const emptyData: StackMapData = { services: [], hosts: [] }
const repository = (getAll = vi.fn(async () => emptyData)): StackMapRepository => ({
  getAll, putService: vi.fn(), deleteService: vi.fn(), putHost: vi.fn(), deleteHost: vi.fn(),
})

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('coordinated cutover boundary', () => {
  it('loads server inventory directly when legacy inventory is empty', async () => {
    const getAll = vi.fn(async () => ({ services: [createService('Server app')], hosts: [] }))
    render(<App repository={repository(getAll)} legacyReader={{ detect: async () => false, read: async () => emptyData }} />)
    expect(await screen.findByRole('heading', { name: 'Server app' })).toBeInTheDocument()
    expect(getAll).toHaveBeenCalledOnce()
  })

  it('blocks all server access until deliberate acknowledgement and never writes IndexedDB', async () => {
    const user = userEvent.setup()
    const getAll = vi.fn(async () => emptyData)
    const read = vi.fn(async () => ({ services: [createService('Legacy app')], hosts: [] }))
    const legacyReader: LegacyInventoryReader = { detect: vi.fn(async () => true), read }
    render(<App repository={repository(getAll)} legacyReader={legacyReader} />)
    const dialog = await screen.findByRole('alertdialog', { name: 'Choose how to continue safely' })
    expect(dialog).toHaveTextContent('not stored in SQLite')
    expect(dialog).toHaveTextContent('may be empty or different')
    expect(screen.queryByRole('button', { name: 'Add service' })).not.toBeInTheDocument()
    expect(getAll).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Continue to StackMap server inventory without importing' }))
    await screen.findByRole('button', { name: 'Add service' })
    expect(getAll).toHaveBeenCalledOnce()
    expect(read).not.toHaveBeenCalled()
  })

  it('keeps editing blocked when the acknowledged server load fails', async () => {
    const user = userEvent.setup()
    const getAll = vi.fn(async () => { throw new Error('internal') })
    render(<App repository={repository(getAll)} legacyReader={{ detect: async () => true, read: async () => emptyData }} />)
    await user.click(await screen.findByRole('button', { name: 'Continue to StackMap server inventory without importing' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('could not load the server inventory')
    expect(screen.queryByRole('button', { name: 'Add service' })).not.toBeInTheDocument()
  })

  it('offers a distinctly named read-only legacy export', async () => {
    const user = userEvent.setup()
    const read = vi.fn(async () => ({ services: [createService('Legacy app')], hosts: [] }))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(<App repository={repository()} legacyReader={{ detect: async () => true, read }} />)
    await user.click(await screen.findByRole('button', { name: 'Export legacy browser data from IndexedDB' }))
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent('Legacy browser-data backup exported')
  })
})
