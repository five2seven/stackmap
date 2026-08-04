import { randomBytes } from 'node:crypto'
import {
  exposures, hostTypes, portProtocols, serviceStatuses,
  type InventoryHost, type InventoryService, type NewInventoryHost, type NewInventoryService,
} from './inventory.js'
import { RestoreConflictError, SqliteInventoryRepository } from './repository.js'

export const BACKUP_SCHEMA_VERSION = 1
export const RESTORE_PREVIEW_TTL_MS = 5 * 60 * 1000
export const RESTORE_PREVIEW_CAPACITY = 8

export interface StackMapBackup {
  schemaVersion: 1
  metadata: {
    exportedAt: string
    sourceInstallationId: string
    sourceInventoryRevision: number
    applicationVersion: string
  }
  hosts: InventoryHost[]
  services: InventoryService[]
}

export interface RestoreSummary {
  backupVersion: number
  exportedAt: string
  sourceInstallationId: string
  sourceInventoryRevision: number
  hostCount: number
  serviceCount: number
  portCount: number
  pathCount: number
  dependencyCount: number
}

type ValidatedBackup = { backup: StackMapBackup; hosts: NewInventoryHost[]; services: NewInventoryService[] }
type Preview = ValidatedBackup & { expiresAt: number; expectedRevision: number }

export class BackupValidationError extends Error {}
export class RestorePreviewCapacityError extends Error {}

export class RestorePreviewStore {
  private readonly previews = new Map<string, Preview>()
  private committing = false

  constructor(
    private readonly repository: SqliteInventoryRepository,
    private readonly now: () => number = Date.now,
    private readonly ttlMs = RESTORE_PREVIEW_TTL_MS,
    private readonly capacity = RESTORE_PREVIEW_CAPACITY,
  ) {}

  preview(value: unknown) {
    const validated = validateBackup(value)
    this.cleanup()
    if (this.previews.size >= this.capacity) throw new RestorePreviewCapacityError()
    const token = randomBytes(32).toString('base64url')
    const expectedRevision = this.repository.inventoryRevision()
    this.previews.set(token, { ...validated, expectedRevision, expiresAt: this.now() + this.ttlMs })
    return { summary: summarize(validated.backup), expectedInventoryRevision: expectedRevision, previewToken: token }
  }

  confirm(token: string, expectedRevision: number) {
    this.cleanup()
    const preview = this.previews.get(token)
    if (!preview || preview.expectedRevision !== expectedRevision) {
      throw new RestoreConflictError('RESTORE_PREVIEW_INVALID')
    }
    if (this.committing) throw new RestoreConflictError('RESTORE_PREVIEW_STALE')
    this.committing = true
    try {
      const inventoryRevision = this.repository.replaceInventory(
        preview.hosts, preview.services, expectedRevision,
      )
      this.previews.delete(token)
      return { summary: summarize(preview.backup), inventoryRevision }
    } catch (error) {
      if (error instanceof RestoreConflictError) this.previews.delete(token)
      throw error
    } finally {
      this.committing = false
    }
  }

  private cleanup() {
    const now = this.now()
    for (const [token, preview] of this.previews) {
      if (preview.expiresAt <= now) this.previews.delete(token)
    }
  }
}

export function createBackup(
  repository: SqliteInventoryRepository,
  installationId: string,
  applicationVersion: string,
  exportedAt = new Date().toISOString(),
): StackMapBackup {
  const snapshot = repository.inventorySnapshot()
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    metadata: {
      exportedAt,
      sourceInstallationId: installationId,
      sourceInventoryRevision: snapshot.revision,
      applicationVersion,
    },
    hosts: snapshot.hosts.map((host) => ({ ...host })),
    services: snapshot.services.map((service) => ({
      ...service,
      ports: service.ports.map((port) => ({ ...port })),
      paths: service.paths.map((path) => ({ ...path })),
      dependencyIds: [...service.dependencyIds],
    })),
  }
}

export function validateBackup(value: unknown): ValidatedBackup {
  const root = exact(value, ['schemaVersion', 'metadata', 'hosts', 'services'])
  if (root.schemaVersion !== BACKUP_SCHEMA_VERSION) invalid()
  const metadata = exact(root.metadata, [
    'exportedAt', 'sourceInstallationId', 'sourceInventoryRevision', 'applicationVersion',
  ])
  const backup: StackMapBackup = {
    schemaVersion: 1,
    metadata: {
      exportedAt: timestamp(metadata.exportedAt),
      sourceInstallationId: nonBlank(metadata.sourceInstallationId),
      sourceInventoryRevision: nonNegativeInteger(metadata.sourceInventoryRevision),
      applicationVersion: string(metadata.applicationVersion),
    },
    hosts: array(root.hosts).map(parseHost),
    services: array(root.services).map(parseService),
  }
  validateDataset(backup)
  const hosts = backup.hosts.map((host) => withoutRevision(host))
  const services = backup.services.map((service) => withoutRevision(service))
  return { backup, hosts, services }
}

function validateDataset(backup: StackMapBackup) {
  unique(backup.hosts.map(({ id }) => id))
  unique(backup.services.map(({ id }) => id))
  unique([...backup.hosts, ...backup.services].map(({ id }) => id))
  const hostIds = new Set(backup.hosts.map(({ id }) => id))
  const serviceIds = new Set(backup.services.map(({ id }) => id))
  for (const service of backup.services) {
    unique(service.ports.map(({ id }) => id))
    unique(service.paths.map(({ id }) => id))
    if (service.hostId !== undefined && !hostIds.has(service.hostId)) invalid()
    unique(service.dependencyIds)
    if (service.dependencyIds.includes(service.id)) invalid()
    if (service.dependencyIds.some((id) => !serviceIds.has(id))) invalid()
  }
}

function parseHost(value: unknown): InventoryHost {
  const host = exact(value, ['id', 'name', 'type', 'ipAddress', 'operatingSystem', 'notes', 'revision', 'createdAt', 'updatedAt'])
  return {
    id: nonBlank(host.id), name: nonBlank(host.name), type: enumeration(host.type, hostTypes),
    ipAddress: string(host.ipAddress), operatingSystem: string(host.operatingSystem), notes: string(host.notes),
    revision: positiveInteger(host.revision), createdAt: timestamp(host.createdAt), updatedAt: timestamp(host.updatedAt),
  }
}

function parseService(value: unknown): InventoryService {
  const service = exact(value, [
    'id', 'name', 'containerName', 'dockerImage', 'description', 'applicationUrl', 'status', 'hostId',
    'internalUrl', 'ports', 'paths', 'network', 'exposure', 'dependencyIds', 'notes', 'revision',
    'createdAt', 'updatedAt',
  ], ['hostId'])
  return {
    id: nonBlank(service.id), name: nonBlank(service.name), containerName: string(service.containerName),
    dockerImage: string(service.dockerImage), description: string(service.description),
    applicationUrl: string(service.applicationUrl), status: enumeration(service.status, serviceStatuses),
    ...(service.hostId === undefined ? {} : { hostId: nonBlank(service.hostId) }),
    internalUrl: string(service.internalUrl), ports: array(service.ports).map(parsePort),
    paths: array(service.paths).map(parsePath), network: string(service.network),
    exposure: enumeration(service.exposure, exposures), dependencyIds: array(service.dependencyIds).map(nonBlank),
    notes: string(service.notes), revision: positiveInteger(service.revision),
    createdAt: timestamp(service.createdAt), updatedAt: timestamp(service.updatedAt),
  }
}

function parsePort(value: unknown): InventoryService['ports'][number] {
  const port = exact(value, ['id', 'hostPort', 'containerPort', 'protocol', 'description'], ['hostPort', 'containerPort'])
  const parsed = {
    id: nonBlank(port.id),
    ...(port.hostPort === undefined ? {} : { hostPort: portNumber(port.hostPort) }),
    ...(port.containerPort === undefined ? {} : { containerPort: portNumber(port.containerPort) }),
    protocol: enumeration(port.protocol, portProtocols), description: string(port.description),
  }
  if (parsed.hostPort === undefined && parsed.containerPort === undefined) invalid()
  return parsed
}

function parsePath(value: unknown): InventoryService['paths'][number] {
  const path = exact(value, ['id', 'hostPath', 'containerPath', 'purpose', 'readOnly'])
  const parsed = { id: nonBlank(path.id), hostPath: string(path.hostPath), containerPath: string(path.containerPath), purpose: string(path.purpose), readOnly: boolean(path.readOnly) }
  if (!parsed.hostPath.trim() && !parsed.containerPath.trim() && !parsed.purpose.trim()) invalid()
  return parsed
}

function summarize(backup: StackMapBackup): RestoreSummary {
  return {
    backupVersion: backup.schemaVersion, exportedAt: backup.metadata.exportedAt,
    sourceInstallationId: backup.metadata.sourceInstallationId,
    sourceInventoryRevision: backup.metadata.sourceInventoryRevision,
    hostCount: backup.hosts.length, serviceCount: backup.services.length,
    portCount: backup.services.reduce((sum, service) => sum + service.ports.length, 0),
    pathCount: backup.services.reduce((sum, service) => sum + service.paths.length, 0),
    dependencyCount: backup.services.reduce((sum, service) => sum + service.dependencyIds.length, 0),
  }
}

function exact(value: unknown, allowed: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !allowed.includes(key)) || allowed.some((key) => !optional.includes(key) && !Object.hasOwn(record, key))) invalid()
  return record
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) invalid(); return value }
function string(value: unknown): string { if (typeof value !== 'string') invalid(); return value }
function nonBlank(value: unknown): string { const parsed = string(value); if (!parsed.trim()) invalid(); return parsed }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') invalid(); return value }
function positiveInteger(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 1) invalid(); return Number(value) }
function nonNegativeInteger(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 0) invalid(); return Number(value) }
function portNumber(value: unknown): number { const parsed = positiveInteger(value); if (parsed > 65_535) invalid(); return parsed }
function timestamp(value: unknown): string { const parsed = string(value); if (Number.isNaN(Date.parse(parsed)) || new Date(parsed).toISOString() !== parsed) invalid(); return parsed }
function enumeration<T extends readonly string[]>(value: unknown, allowed: T): T[number] { const parsed = string(value); if (!allowed.includes(parsed)) invalid(); return parsed as T[number] }
function unique(values: string[]) { if (new Set(values).size !== values.length) invalid() }
function withoutRevision<T extends { revision: number }>(record: T): Omit<T, 'revision'> {
  const result = { ...record }
  delete (result as Partial<T>).revision
  return result
}
function invalid(): never { throw new BackupValidationError('Invalid StackMap backup') }
