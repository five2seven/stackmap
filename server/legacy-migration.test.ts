// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openDatabase } from './database.js'
import {
  LegacyMigrationPreviewStore, LegacyMigrationValidationError, validateLegacyDataset,
} from './legacy-migration.js'
import { LegacyMigrationConflictError, SqliteInventoryRepository } from './repository.js'

const timestamp = '2026-01-02T03:04:05.000Z'
function dataset() {
  return {
    schemaVersion: 3, exportedAt: timestamp,
    hosts: [{ id: 'host-1', name: 'Host', type: 'physical', ipAddress: '10.0.0.1', operatingSystem: 'Linux', notes: '', createdAt: timestamp, updatedAt: timestamp }],
    services: [{
      id: 'service-1', name: 'Service', containerName: 'service', dockerImage: 'example/service:1',
      description: '', applicationUrl: 'https://service.example', status: 'active', hostId: 'host-1',
      internalUrl: 'http://service:8080', ports: [{ id: 'port-1', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }],
      paths: [{ id: 'path-1', hostPath: '/config', containerPath: '/config', purpose: 'Configuration', readOnly: false }],
      network: 'default', exposure: 'local', dependencyIds: [], notes: '', createdAt: timestamp, updatedAt: timestamp,
    }],
  }
}

function fixture(now = () => Date.parse('2026-02-01T00:00:00.000Z')) {
  const database = openDatabase(':memory:')
  const repository = new SqliteInventoryRepository(database.connection)
  return { database, repository, previews: new LegacyMigrationPreviewStore(repository, now) }
}

describe('legacy migration validation', () => {
  it('accepts exact schema 3 and returns deterministic counts and fingerprint', () => {
    const first = validateLegacyDataset(dataset())
    const second = validateLegacyDataset(structuredClone(dataset()))
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.summary).toMatchObject({ hostCount: 1, serviceCount: 1, portCount: 1, pathCount: 1, dependencyCount: 0, legacySchemaVersion: 3 })
    expect(first.hosts[0]).toMatchObject({ id: 'host-1', createdAt: timestamp })
    expect(first.services[0].ports[0]).toMatchObject({ id: 'port-1' })
  })

  it.each([
    ['older version', { ...dataset(), schemaVersion: 2 }],
    ['future version', { ...dataset(), schemaVersion: 4 }],
    ['unknown top-level field', { ...dataset(), extra: true }],
    ['missing field', (() => { const value = { ...dataset() } as Record<string, unknown>; delete value.hosts; return value })()],
    ['unknown host field', { ...dataset(), hosts: [{ ...dataset().hosts[0], revision: 1 }] }],
    ['unknown service field', { ...dataset(), services: [{ ...dataset().services[0], revision: 1 }] }],
  ])('rejects %s', (_name, value) => {
    expect(() => validateLegacyDataset(value)).toThrow(LegacyMigrationValidationError)
  })

  it.each([
    ['missing host reference', () => { const value = dataset(); value.services[0].hostId = 'missing'; return value }],
    ['self dependency', () => { const value = dataset(); value.services[0].dependencyIds = ['service-1']; return value }],
    ['duplicate dependency', () => { const value = dataset(); value.services.push({ ...structuredClone(value.services[0]), id: 'service-2', name: 'Other', dependencyIds: ['service-1', 'service-1'] }); return value }],
    ['duplicate host ID', () => { const value = dataset(); value.hosts.push({ ...value.hosts[0] }); return value }],
    ['duplicate service ID', () => { const value = dataset(); value.services.push(structuredClone(value.services[0])); return value }],
    ['duplicate port ID in service', () => { const value = dataset(); value.services[0].ports.push({ ...value.services[0].ports[0] }); return value }],
    ['duplicate path ID in service', () => { const value = dataset(); value.services[0].paths.push({ ...value.services[0].paths[0] }); return value }],
  ])('rejects %s', (_name, change) => expect(() => validateLegacyDataset(change())).toThrow(LegacyMigrationValidationError))

  it('allows repeated nested IDs in different services and preserves ordering without mutation', () => {
    const value = dataset()
    value.services.push({ ...structuredClone(value.services[0]), id: 'service-2', name: 'Other' })
    const before = JSON.stringify(value)
    const result = validateLegacyDataset(value)
    expect(JSON.stringify(value)).toBe(before)
    expect(result.services.map(({ id }) => id)).toEqual(['service-1', 'service-2'])
  })
})

describe('legacy migration preview and transaction', () => {
  it('previews without mutation and imports atomically with revisions and receipt', () => {
    const { repository, previews } = fixture()
    const preview = previews.preview(dataset())
    expect(repository.inventorySnapshot()).toMatchObject({ revision: 0, hosts: [], services: [] })
    const result = previews.confirm(preview.previewToken, preview.expectedInventoryRevision, dataset())
    expect(result.inventoryRevision).toBe(1)
    expect(repository.inventorySnapshot()).toMatchObject({ revision: 1 })
    expect(repository.listHosts()[0]).toMatchObject({ id: 'host-1', revision: 1, createdAt: timestamp, updatedAt: timestamp })
    expect(repository.listServices()[0]).toMatchObject({ id: 'service-1', revision: 1, createdAt: timestamp, updatedAt: timestamp })
    expect(repository.legacyMigrationReceipt()).toMatchObject({ inventoryRevision: 1, legacySchemaVersion: 3 })
    expect(() => previews.confirm(preview.previewToken, 0, dataset())).toThrow('LEGACY_MIGRATION_PREVIEW_INVALID')
  })

  it('rejects populated targets before issuing a usable token without revision mutation', () => {
    const { repository, previews } = fixture()
    repository.createHost({ ...validateLegacyDataset(dataset()).hosts[0] })
    const revision = repository.inventoryRevision()
    expect(() => previews.preview(dataset())).toThrowError(new LegacyMigrationConflictError('LEGACY_MIGRATION_TARGET_NOT_EMPTY'))
    expect(repository.inventoryRevision()).toBe(revision)
  })

  it('rejects changed source and changed target after preview', () => {
    const changedSource = fixture()
    const sourcePreview = changedSource.previews.preview(dataset())
    const changed = dataset(); changed.services[0].name = 'Changed'
    expect(() => changedSource.previews.confirm(sourcePreview.previewToken, 0, changed)).toThrow('LEGACY_MIGRATION_PREVIEW_STALE')
    expect(changedSource.repository.inventoryRevision()).toBe(0)

    const changedTarget = fixture()
    const targetPreview = changedTarget.previews.preview(dataset())
    changedTarget.repository.createHost({ ...validateLegacyDataset(dataset()).hosts[0] })
    expect(() => changedTarget.previews.confirm(targetPreview.previewToken, 0, dataset())).toThrow('LEGACY_MIGRATION_PREVIEW_STALE')
  })

  it('expires tokens and bounds active previews', () => {
    let now = 0
    const { repository } = fixture(() => now)
    const expiring = new LegacyMigrationPreviewStore(repository, () => now, 10, 1)
    const preview = expiring.preview(dataset())
    expect(() => expiring.preview(dataset())).toThrow()
    now = 11
    expect(() => expiring.confirm(preview.previewToken, 0, dataset())).toThrow('LEGACY_MIGRATION_PREVIEW_INVALID')
    expect(expiring.preview(dataset()).previewToken).toBeTruthy()
  })

  it('rejects mismatched tokens without importing', () => {
    const { repository, previews } = fixture()
    const preview = previews.preview(dataset())
    expect(() => previews.confirm(`${preview.previewToken}-wrong`, 0, dataset())).toThrow('LEGACY_MIGRATION_PREVIEW_INVALID')
    expect(repository.inventorySnapshot()).toMatchObject({ revision: 0, hosts: [], services: [] })
  })

  it('allows at most one success when a confirmation re-enters the application guard', () => {
    const { repository, previews } = fixture()
    const preview = previews.preview(dataset())
    const originalImport = repository.importLegacyInventory.bind(repository)
    repository.importLegacyInventory = (...arguments_) => {
      expect(() => previews.confirm(preview.previewToken, 0, dataset())).toThrow('LEGACY_MIGRATION_PREVIEW_STALE')
      return originalImport(...arguments_)
    }
    expect(previews.confirm(preview.previewToken, 0, dataset()).inventoryRevision).toBe(1)
    expect(repository.inventorySnapshot()).toMatchObject({ revision: 1 })
  })

  it('rolls back inventory, revision, and receipt when receipt insertion fails', () => {
    const { database, repository, previews } = fixture()
    database.connection.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON legacy_migration_receipt BEGIN SELECT RAISE(ABORT, 'forced'); END`)
    const preview = previews.preview(dataset())
    expect(() => previews.confirm(preview.previewToken, 0, dataset())).toThrow()
    expect(repository.inventorySnapshot()).toMatchObject({ revision: 0, hosts: [], services: [] })
    expect(repository.legacyMigrationReceipt()).toBeUndefined()
  })

  it.each([
    ['host insertion', `CREATE TRIGGER fail_stage BEFORE INSERT ON hosts BEGIN SELECT RAISE(ABORT, 'forced'); END`],
    ['service insertion', `CREATE TRIGGER fail_stage BEFORE INSERT ON services BEGIN SELECT RAISE(ABORT, 'forced'); END`],
    ['port insertion', `CREATE TRIGGER fail_stage BEFORE INSERT ON service_ports BEGIN SELECT RAISE(ABORT, 'forced'); END`],
    ['path insertion', `CREATE TRIGGER fail_stage BEFORE INSERT ON service_paths BEGIN SELECT RAISE(ABORT, 'forced'); END`],
    ['dependency insertion', `CREATE TRIGGER fail_stage BEFORE INSERT ON service_dependencies BEGIN SELECT RAISE(ABORT, 'forced'); END`],
    ['revision write', `CREATE TRIGGER fail_stage BEFORE UPDATE ON application_metadata WHEN OLD.key = 'inventory_revision' BEGIN SELECT RAISE(ABORT, 'forced'); END`],
  ])('rolls back after %s fails', (_name, trigger) => {
    const { database, repository, previews } = fixture()
    const value = dataset()
    value.services.push({
      ...structuredClone(value.services[0]), id: 'service-2', name: 'Dependent',
      ports: [{ ...value.services[0].ports[0] }], paths: [{ ...value.services[0].paths[0] }],
      dependencyIds: ['service-1'],
    })
    database.connection.exec(trigger)
    const preview = previews.preview(value)
    expect(() => previews.confirm(preview.previewToken, 0, value)).toThrow()
    expect(repository.inventorySnapshot()).toMatchObject({ revision: 0, hosts: [], services: [] })
    expect(repository.legacyMigrationReceipt()).toBeUndefined()
  })

  it('fails closed on inventory revision overflow', () => {
    const { database, repository, previews } = fixture()
    database.connection.prepare("UPDATE application_metadata SET value = ? WHERE key = 'inventory_revision'").run(String(Number.MAX_SAFE_INTEGER))
    const preview = previews.preview(dataset())
    expect(() => previews.confirm(preview.previewToken, Number.MAX_SAFE_INTEGER, dataset())).toThrow('LEGACY_MIGRATION_PREVIEW_STALE')
    expect(repository.inventorySnapshot()).toMatchObject({ revision: Number.MAX_SAFE_INTEGER, hosts: [], services: [] })
    expect(repository.legacyMigrationReceipt()).toBeUndefined()
  })

  it('matches receipt fingerprint and fails closed for changed legacy data', () => {
    const { previews } = fixture()
    expect(previews.status(dataset())).toEqual({ status: 'missing' })
    const preview = previews.preview(dataset())
    previews.confirm(preview.previewToken, 0, dataset())
    expect(previews.status(dataset())).toEqual({ status: 'matched' })
    const changed = dataset(); changed.services[0].notes = 'changed'
    expect(previews.status(changed)).toEqual({ status: 'changed' })
  })
})
