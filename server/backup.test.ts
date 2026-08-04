import { describe, expect, it } from 'vitest'
import {
  RESTORE_PREVIEW_CAPACITY,
  RestorePreviewCapacityError,
  RestorePreviewStore,
  validateBackup,
} from './backup.js'
import { openDatabase } from './database.js'
import { RestoreConflictError, SqliteInventoryRepository } from './repository.js'

const timestamp = '2026-08-04T12:00:00.000Z'
const emptyBackup = {
  schemaVersion: 1,
  metadata: { exportedAt: timestamp, sourceInstallationId: 'source', sourceInventoryRevision: 7, applicationVersion: '1.0.0' },
  hosts: [], services: [],
}

function service(id: string) {
  return {
    id, name: id, containerName: '', dockerImage: '', description: '', applicationUrl: '', status: 'active',
    internalUrl: '', ports: [{ id: 'shared', containerPort: 80, protocol: 'tcp', description: '' }],
    paths: [{ id: 'shared', hostPath: `/srv/${id}`, containerPath: '', purpose: '', readOnly: false }],
    network: '', exposure: 'local', dependencyIds: [], notes: '', revision: 1,
    createdAt: timestamp, updatedAt: timestamp,
  }
}

describe('backup validation and preview handles', () => {
  it('does not mutate the uploaded object', () => {
    const uploaded = structuredClone(emptyBackup)
    const before = structuredClone(uploaded)
    validateBackup(uploaded)
    expect(uploaded).toEqual(before)
  })

  it('expires opaque preview tokens without changing inventory', () => {
    const database = openDatabase(':memory:')
    let now = 1_000
    const repository = new SqliteInventoryRepository(database.connection)
    const store = new RestorePreviewStore(repository, () => now, 100)
    const preview = store.preview(emptyBackup)
    expect(preview.previewToken).not.toContain('source')
    now = 1_101
    expect(() => store.confirm(preview.previewToken, 0)).toThrowError(
      expect.objectContaining<Partial<RestoreConflictError>>({ code: 'RESTORE_PREVIEW_INVALID' }),
    )
    expect(repository.inventoryRevision()).toBe(0)
    database.checkpointAndClose()
  })

  it('accepts repeated port and path IDs across services but rejects them within one service', () => {
    const valid = { ...emptyBackup, services: [service('one'), service('two')] }
    expect(validateBackup(valid).services).toHaveLength(2)
    expect(() => validateBackup({
      ...valid,
      services: [{ ...service('one'), ports: [service('one').ports[0], service('one').ports[0]] }],
    })).toThrowError()
    expect(() => validateBackup({
      ...valid,
      services: [{ ...service('one'), paths: [service('one').paths[0], service('one').paths[0]] }],
    })).toThrowError()
  })

  it('bounds active previews and cleans expired or consumed previews before enforcing capacity', () => {
    const database = openDatabase(':memory:')
    let now = 1_000
    const repository = new SqliteInventoryRepository(database.connection)
    const store = new RestorePreviewStore(repository, () => now, 100, 2)
    const first = store.preview(emptyBackup)
    store.preview(emptyBackup)
    expect(() => store.preview(emptyBackup)).toThrowError(RestorePreviewCapacityError)
    store.confirm(first.previewToken, first.expectedInventoryRevision)
    expect(store.preview(emptyBackup).previewToken).toBeTruthy()
    now = 1_101
    expect(store.preview(emptyBackup).previewToken).toBeTruthy()
    expect(RESTORE_PREVIEW_CAPACITY).toBe(8)
    database.checkpointAndClose()
  })

  it('does not consume capacity when validation fails', () => {
    const database = openDatabase(':memory:')
    const store = new RestorePreviewStore(new SqliteInventoryRepository(database.connection), Date.now, 100, 1)
    expect(() => store.preview({})).toThrowError()
    expect(store.preview(emptyBackup).previewToken).toBeTruthy()
    database.checkpointAndClose()
  })
})
