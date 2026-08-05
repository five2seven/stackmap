import { createHash, randomBytes } from 'node:crypto'
import { BackupValidationError, validateBackup } from './backup.js'
import {
  LegacyMigrationConflictError, SqliteInventoryRepository,
} from './repository.js'

export const LEGACY_SCHEMA_VERSION = 3
export const LEGACY_PREVIEW_TTL_MS = 5 * 60 * 1000
export const LEGACY_PREVIEW_CAPACITY = 8

export class LegacyMigrationValidationError extends Error {}
export class LegacyMigrationPreviewCapacityError extends Error {}
export class LegacyMigrationPreviewError extends Error {
  constructor(public readonly code: 'LEGACY_MIGRATION_PREVIEW_INVALID' | 'LEGACY_MIGRATION_PREVIEW_STALE') { super(code) }
}

export interface LegacyDataset {
  schemaVersion: 3
  exportedAt: string
  hosts: unknown[]
  services: unknown[]
}

type Validated = ReturnType<typeof validateLegacyDataset>
type Preview = Validated & { expectedRevision: number; expiresAt: number }

export class LegacyMigrationPreviewStore {
  private readonly previews = new Map<string, Preview>()
  private committing = false
  constructor(
    private readonly repository: SqliteInventoryRepository,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = LEGACY_PREVIEW_TTL_MS,
    private readonly capacity = LEGACY_PREVIEW_CAPACITY,
  ) {}

  status(value: unknown) {
    const { fingerprint } = validateLegacyDataset(value)
    const receipt = this.repository.legacyMigrationReceipt()
    return { status: receipt ? (receipt.fingerprint === fingerprint ? 'matched' : 'changed') : 'missing' }
  }

  preview(value: unknown) {
    const validated = validateLegacyDataset(value)
    const target = this.repository.legacyMigrationTargetState()
    if (!target.empty) throw new LegacyMigrationConflictError('LEGACY_MIGRATION_TARGET_NOT_EMPTY')
    this.cleanup()
    if (this.previews.size >= this.capacity) throw new LegacyMigrationPreviewCapacityError()
    const token = randomBytes(32).toString('base64url')
    const expectedRevision = target.revision
    this.previews.set(token, { ...validated, expectedRevision, expiresAt: this.now() + this.ttlMs })
    return { summary: validated.summary, expectedInventoryRevision: expectedRevision, previewToken: token }
  }

  confirm(token: string, expectedRevision: number, value: unknown) {
    this.cleanup()
    const current = validateLegacyDataset(value)
    const preview = this.previews.get(token)
    if (!preview || preview.expectedRevision !== expectedRevision) throw new LegacyMigrationPreviewError('LEGACY_MIGRATION_PREVIEW_INVALID')
    if (preview.fingerprint !== current.fingerprint) {
      this.previews.delete(token)
      throw new LegacyMigrationPreviewError('LEGACY_MIGRATION_PREVIEW_STALE')
    }
    if (this.committing) throw new LegacyMigrationPreviewError('LEGACY_MIGRATION_PREVIEW_STALE')
    this.committing = true
    try {
      const inventoryRevision = this.repository.importLegacyInventory(
        preview.hosts, preview.services, expectedRevision, preview.fingerprint, new Date(this.now()).toISOString(),
      )
      this.previews.delete(token)
      return { summary: preview.summary, inventoryRevision }
    } catch (error) {
      if (error instanceof LegacyMigrationConflictError) this.previews.delete(token)
      throw error
    } finally { this.committing = false }
  }

  private cleanup() {
    const now = this.now()
    for (const [token, preview] of this.previews) if (preview.expiresAt <= now) this.previews.delete(token)
  }
}

export function validateLegacyDataset(value: unknown) {
  const root = exact(value, ['schemaVersion', 'exportedAt', 'hosts', 'services'])
  if (root.schemaVersion !== 3 || !Array.isArray(root.hosts) || !Array.isArray(root.services)) invalid()
  const exportedAt = timestamp(root.exportedAt)
  const backupValue = {
    schemaVersion: 1,
    metadata: { exportedAt, sourceInstallationId: 'legacy-browser', sourceInventoryRevision: 0, applicationVersion: 'legacy-schema-3' },
    hosts: root.hosts.map((host) => ({ ...exact(host, ['id', 'name', 'type', 'ipAddress', 'operatingSystem', 'notes', 'createdAt', 'updatedAt']), revision: 1 })),
    services: root.services.map((service) => ({
      ...exact(service, ['id', 'name', 'containerName', 'dockerImage', 'description', 'applicationUrl', 'status', 'hostId', 'internalUrl', 'ports', 'paths', 'network', 'exposure', 'dependencyIds', 'notes', 'createdAt', 'updatedAt'], ['hostId']),
      revision: 1,
    })),
  }
  let validated: ReturnType<typeof validateBackup>
  try { validated = validateBackup(backupValue) }
  catch (error) {
    if (error instanceof BackupValidationError) invalid()
    throw error
  }
  const dataset = {
    schemaVersion: 3 as const, exportedAt,
    hosts: validated.backup.hosts.map(stripRevision),
    services: validated.backup.services.map(stripRevision),
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(dataset)).digest('hex')
  const summary = {
    legacySchemaVersion: 3, legacyExportedAt: exportedAt,
    hostCount: dataset.hosts.length, serviceCount: dataset.services.length,
    portCount: dataset.services.reduce((sum, service) => sum + service.ports.length, 0),
    pathCount: dataset.services.reduce((sum, service) => sum + service.paths.length, 0),
    dependencyCount: dataset.services.reduce((sum, service) => sum + service.dependencyIds.length, 0),
  }
  return { dataset, fingerprint, summary, hosts: validated.hosts, services: validated.services }
}

function exact(value: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !keys.includes(key)) || keys.some((key) => !optional.includes(key) && !Object.hasOwn(record, key))) invalid()
  return record
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) invalid()
  return value
}
function invalid(): never { throw new LegacyMigrationValidationError('Invalid legacy inventory') }
function stripRevision<T extends { revision: number }>(record: T): Omit<T, 'revision'> {
  const copy = { ...record }
  delete (copy as Partial<T>).revision
  return copy
}
