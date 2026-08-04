import { describe, expect, it } from 'vitest'
import { RestorePreviewStore, validateBackup } from './backup.js'
import { openDatabase } from './database.js'
import { RestoreConflictError, SqliteInventoryRepository } from './repository.js'

const timestamp = '2026-08-04T12:00:00.000Z'
const emptyBackup = {
  schemaVersion: 1,
  metadata: { exportedAt: timestamp, sourceInstallationId: 'source', sourceInventoryRevision: 7, applicationVersion: '1.0.0' },
  hosts: [], services: [],
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
})
