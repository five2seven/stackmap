import type Database from 'better-sqlite3'
import {
  exposures,
  hostTypes,
  portProtocols,
  serviceStatuses,
  type InventoryHost,
  type InventoryPath,
  type InventoryPort,
  type InventoryService,
  type NewInventoryHost,
  type NewInventoryService,
} from './inventory.js'

type HostRow = {
  id: string
  name: string
  type: InventoryHost['type']
  ip_address: string
  operating_system: string
  notes: string
  revision: number
  created_at: string
  updated_at: string
}

type ServiceRow = {
  id: string
  name: string
  container_name: string
  docker_image: string
  description: string
  application_url: string
  status: InventoryService['status']
  host_id: string | null
  internal_url: string
  network: string
  exposure: InventoryService['exposure']
  notes: string
  revision: number
  created_at: string
  updated_at: string
}

export class InventoryNotFoundError extends Error {}
export class InventoryConflictError extends Error {}
export class InventoryValidationError extends Error {}
export class RestoreConflictError extends Error {
  constructor(public readonly code: 'RESTORE_PREVIEW_STALE' | 'RESTORE_PREVIEW_INVALID') {
    super(code)
  }
}
export class PortainerImportConflictError extends Error {
  constructor(public readonly code: 'PORTAINER_PREVIEW_STALE' | 'PORTAINER_ALREADY_BOUND') { super(code) }
}
export interface InventorySnapshot {
  revision: number
  hosts: InventoryHost[]
  services: InventoryService[]
}
export interface PortainerBindingSnapshot {
  environments: Array<{ environmentId: number; hostId?: string }>
  containers: Array<{ environmentId: number; containerId: string; serviceId?: string }>
}
export interface PortainerImportSelection {
  origin: string
  expectedRevision: number
  hosts: Array<{ environmentId: number; host: NewInventoryHost }>
  services: Array<{ environmentId: number; containerId: string; service: NewInventoryService }>
}
export interface PortainerImportResult {
  inventoryRevision: number
  hostIds: string[]
  serviceIds: string[]
}

export class SqliteInventoryRepository {
  constructor(
    private readonly connection: Database.Database,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  inventoryRevision(): number {
    return this.readInventoryRevision().revision
  }

  inventorySnapshot(afterRevisionRead?: () => void): InventorySnapshot {
    return this.connection.transaction(() => {
      const revision = this.readInventoryRevision().revision
      afterRevisionRead?.()
      return {
        revision,
        hosts: this.listHosts(),
        services: this.listServices(),
      }
    })()
  }

  portainerBindings(origin: string): PortainerBindingSnapshot {
    const source = this.connection.prepare('SELECT id FROM portainer_sources WHERE origin = ?').get(origin) as { id: number } | undefined
    if (!source) return { environments: [], containers: [] }
    const environments = this.connection.prepare(`
      SELECT environment_id, host_id FROM portainer_host_bindings WHERE source_id = ?
    `).all(source.id) as Array<{ environment_id: number; host_id: string | null }>
    const containers = this.connection.prepare(`
      SELECT environment_id, container_id, service_id FROM portainer_container_bindings WHERE source_id = ?
    `).all(source.id) as Array<{ environment_id: number; container_id: string; service_id: string | null }>
    return {
      environments: environments.map((item) => ({ environmentId: item.environment_id, ...(item.host_id ? { hostId: item.host_id } : {}) })),
      containers: containers.map((item) => ({ environmentId: item.environment_id, containerId: item.container_id, ...(item.service_id ? { serviceId: item.service_id } : {}) })),
    }
  }

  importPortainer(selection: PortainerImportSelection): PortainerImportResult {
    if (!selection.services.length) throw new InventoryValidationError('Select at least one container to import')
    for (const { host } of selection.hosts) validateHost(host)
    for (const { service } of selection.services) validateService(service)
    return this.connection.transaction(() => {
      const { revision, storedValue } = this.readInventoryRevision()
      if (revision !== selection.expectedRevision) throw new PortainerImportConflictError('PORTAINER_PREVIEW_STALE')
      if (revision === Number.MAX_SAFE_INTEGER) throw new Error('Inventory revision cannot be incremented safely')
      const importedAt = this.now()
      this.connection.prepare(`
        INSERT INTO portainer_sources (origin, created_at, last_imported_at) VALUES (?, ?, ?)
        ON CONFLICT(origin) DO UPDATE SET last_imported_at = excluded.last_imported_at
      `).run(selection.origin, importedAt, importedAt)
      const sourceId = this.connection.prepare('SELECT id FROM portainer_sources WHERE origin = ?').pluck().get(selection.origin) as number
      const bound = this.connection.prepare(`
        SELECT 1 FROM portainer_container_bindings
        WHERE source_id = ? AND environment_id = ? AND container_id = ?
      `)
      for (const item of selection.services) {
        if (bound.get(sourceId, item.environmentId, item.containerId)) {
          throw new PortainerImportConflictError('PORTAINER_ALREADY_BOUND')
        }
      }
      const insertHost = this.connection.prepare(`
        INSERT INTO hosts (id, name, type, ip_address, operating_system, notes, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      const bindHost = this.connection.prepare(`
        INSERT INTO portainer_host_bindings (source_id, environment_id, host_id, imported_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(source_id, environment_id) DO UPDATE SET host_id = excluded.host_id, imported_at = excluded.imported_at
      `)
      for (const { environmentId, host } of selection.hosts) {
        insertHost.run(host.id, host.name, host.type, host.ipAddress, host.operatingSystem, host.notes, host.createdAt, host.updatedAt)
        bindHost.run(sourceId, environmentId, host.id, importedAt)
      }
      const newlyBoundEnvironments = new Set(selection.hosts.map(({ environmentId }) => environmentId))
      for (const environmentId of new Set(selection.services.map((item) => item.environmentId))) {
        if (newlyBoundEnvironments.has(environmentId)) continue
        const targetHosts = [...new Set(selection.services.filter((item) => item.environmentId === environmentId).map((item) => item.service.hostId))]
        if (targetHosts.length === 1 && targetHosts[0]) bindHost.run(sourceId, environmentId, targetHosts[0], importedAt)
      }
      const hostExists = this.connection.prepare('SELECT 1 FROM hosts WHERE id = ?')
      const bindContainer = this.connection.prepare(`
        INSERT INTO portainer_container_bindings (source_id, environment_id, container_id, service_id, imported_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      for (const { environmentId, containerId, service } of selection.services) {
        if (!service.hostId || !hostExists.get(service.hostId)) throw new InventoryValidationError('Selected target host does not exist')
        this.insertService(service)
        this.replaceServiceChildren(service)
        bindContainer.run(sourceId, environmentId, containerId, service.id, importedAt)
      }
      const nextRevision = revision + 1
      const updated = this.connection.prepare(`
        UPDATE application_metadata SET value = ? WHERE key = 'inventory_revision' AND value = ?
      `).run(String(nextRevision), storedValue)
      if (updated.changes !== 1) throw new PortainerImportConflictError('PORTAINER_PREVIEW_STALE')
      return { inventoryRevision: nextRevision, hostIds: selection.hosts.map(({ host }) => host.id), serviceIds: selection.services.map(({ service }) => service.id) }
    })()
  }

  replaceInventory(
    hosts: NewInventoryHost[],
    services: NewInventoryService[],
    expectedRevision: number,
  ): number {
    return this.connection.transaction(() => {
      const { revision, storedValue } = this.readInventoryRevision()
      if (revision !== expectedRevision) throw new RestoreConflictError('RESTORE_PREVIEW_STALE')
      if (revision === Number.MAX_SAFE_INTEGER) throw new Error('Inventory revision cannot be incremented safely')

      this.connection.prepare('DELETE FROM portainer_sources').run()
      this.connection.prepare('DELETE FROM service_dependencies').run()
      this.connection.prepare('DELETE FROM service_ports').run()
      this.connection.prepare('DELETE FROM service_paths').run()
      this.connection.prepare('DELETE FROM services').run()
      this.connection.prepare('DELETE FROM hosts').run()

      const insertHost = this.connection.prepare(`
        INSERT INTO hosts (
          id, name, type, ip_address, operating_system, notes, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `)
      for (const host of hosts) {
        insertHost.run(host.id, host.name, host.type, host.ipAddress, host.operatingSystem,
          host.notes, host.createdAt, host.updatedAt)
      }
      for (const service of services) this.insertService(service)
      for (const service of services) this.replaceServiceChildren(service)

      const nextRevision = revision + 1
      const updated = this.connection.prepare(`
        UPDATE application_metadata SET value = ?
        WHERE key = 'inventory_revision' AND value = ?
      `).run(String(nextRevision), storedValue)
      if (updated.changes !== 1) throw new RestoreConflictError('RESTORE_PREVIEW_STALE')
      return nextRevision
    })()
  }

  private readInventoryRevision(): { revision: number; storedValue: string } {
    const value = this.connection
      .prepare("SELECT value FROM application_metadata WHERE key = 'inventory_revision'")
      .pluck()
      .get()
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new Error('Inventory revision metadata is missing or invalid')
    }
    const revision = Number(value)
    if (!Number.isFinite(revision) || !Number.isSafeInteger(revision) || revision < 0) {
      throw new Error('Inventory revision metadata is missing or invalid')
    }
    return { revision, storedValue: value }
  }

  listHosts(): InventoryHost[] {
    return (this.connection.prepare('SELECT * FROM hosts ORDER BY name COLLATE NOCASE, id').all() as HostRow[]).map(mapHost)
  }

  getHost(id: string): InventoryHost | undefined {
    const row = this.connection.prepare('SELECT * FROM hosts WHERE id = ?').get(id) as HostRow | undefined
    return row && mapHost(row)
  }

  createHost(host: NewInventoryHost): InventoryHost {
    validateHost(host)
    return this.mutate(() => {
      this.connection.prepare(`
        INSERT INTO hosts (
          id, name, type, ip_address, operating_system, notes, revision, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        host.id,
        host.name,
        host.type,
        host.ipAddress,
        host.operatingSystem,
        host.notes,
        host.createdAt,
        host.updatedAt,
      )
      return this.requireHost(host.id)
    })
  }

  updateHost(host: Omit<InventoryHost, 'revision'>, expectedRevision: number): InventoryHost {
    validateHost(host)
    validateRevision(expectedRevision)
    return this.mutate(() => {
      const result = this.connection.prepare(`
        UPDATE hosts SET
          name = ?, type = ?, ip_address = ?, operating_system = ?, notes = ?,
          revision = revision + 1, updated_at = ?
        WHERE id = ? AND revision = ?
      `).run(
        host.name,
        host.type,
        host.ipAddress,
        host.operatingSystem,
        host.notes,
        host.updatedAt,
        host.id,
        expectedRevision,
      )
      this.assertUpdated(result.changes, 'host', host.id, expectedRevision)
      return this.requireHost(host.id)
    })
  }

  deleteHost(id: string, expectedRevision: number): void {
    validateId(id)
    validateRevision(expectedRevision)
    this.mutate(() => {
      const result = this.connection
        .prepare('DELETE FROM hosts WHERE id = ? AND revision = ?')
        .run(id, expectedRevision)
      this.assertUpdated(result.changes, 'host', id, expectedRevision)
    })
  }

  listServices(): InventoryService[] {
    const rows = this.connection
      .prepare('SELECT * FROM services ORDER BY name COLLATE NOCASE, id')
      .all() as ServiceRow[]
    return rows.map((row) => this.hydrateService(row))
  }

  getService(id: string): InventoryService | undefined {
    const row = this.connection.prepare('SELECT * FROM services WHERE id = ?').get(id) as
      | ServiceRow
      | undefined
    return row && this.hydrateService(row)
  }

  createService(service: NewInventoryService): InventoryService {
    validateService(service)
    return this.mutate(() => {
      this.insertService(service)
      this.replaceServiceChildren(service)
      return this.requireService(service.id)
    })
  }

  updateService(
    service: Omit<InventoryService, 'revision'>,
    expectedRevision: number,
  ): InventoryService {
    validateService(service)
    validateRevision(expectedRevision)
    return this.mutate(() => {
      const result = this.connection.prepare(`
        UPDATE services SET
          name = ?, container_name = ?, docker_image = ?, description = ?, application_url = ?,
          status = ?, host_id = ?, internal_url = ?, network = ?, exposure = ?, notes = ?,
          revision = revision + 1, updated_at = ?
        WHERE id = ? AND revision = ?
      `).run(
        service.name,
        service.containerName,
        service.dockerImage,
        service.description,
        service.applicationUrl,
        service.status,
        service.hostId ?? null,
        service.internalUrl,
        service.network,
        service.exposure,
        service.notes,
        service.updatedAt,
        service.id,
        expectedRevision,
      )
      this.assertUpdated(result.changes, 'service', service.id, expectedRevision)
      this.replaceServiceChildren(service)
      return this.requireService(service.id)
    })
  }

  deleteService(id: string, expectedRevision: number): void {
    validateId(id)
    validateRevision(expectedRevision)
    this.mutate(() => {
      const dependentIds = this.connection
        .prepare('SELECT service_id FROM service_dependencies WHERE dependency_id = ?')
        .pluck()
        .all(id) as string[]
      const result = this.connection
        .prepare('DELETE FROM services WHERE id = ? AND revision = ?')
        .run(id, expectedRevision)
      this.assertUpdated(result.changes, 'service', id, expectedRevision)
      const touchDependent = this.connection.prepare(`
        UPDATE services SET revision = revision + 1, updated_at = ? WHERE id = ?
      `)
      for (const dependentId of dependentIds) touchDependent.run(this.now(), dependentId)
    })
  }

  private mutate<T>(operation: () => T): T {
    return this.connection.transaction(() => {
      const { revision: currentRevision, storedValue } = this.readInventoryRevision()
      if (currentRevision === Number.MAX_SAFE_INTEGER) {
        throw new Error('Inventory revision cannot be incremented safely')
      }
      const result = operation()
      const revisionUpdate = this.connection.prepare(`
        UPDATE application_metadata
        SET value = ?
        WHERE key = 'inventory_revision' AND value = ?
      `).run(String(currentRevision + 1), storedValue)
      if (revisionUpdate.changes !== 1) {
        throw new Error('Inventory revision changed during the transaction')
      }
      return result
    })()
  }

  private insertService(service: NewInventoryService): void {
    this.connection.prepare(`
      INSERT INTO services (
        id, name, container_name, docker_image, description, application_url, status, host_id,
        internal_url, network, exposure, notes, revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      service.id,
      service.name,
      service.containerName,
      service.dockerImage,
      service.description,
      service.applicationUrl,
      service.status,
      service.hostId ?? null,
      service.internalUrl,
      service.network,
      service.exposure,
      service.notes,
      service.createdAt,
      service.updatedAt,
    )
  }

  private replaceServiceChildren(service: NewInventoryService | Omit<InventoryService, 'revision'>): void {
    this.connection.prepare('DELETE FROM service_dependencies WHERE service_id = ?').run(service.id)
    this.connection.prepare('DELETE FROM service_ports WHERE service_id = ?').run(service.id)
    this.connection.prepare('DELETE FROM service_paths WHERE service_id = ?').run(service.id)

    const insertPort = this.connection.prepare(`
      INSERT INTO service_ports (
        id, service_id, position, host_port, container_port, protocol, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    service.ports.forEach((port, position) => {
      insertPort.run(
        port.id,
        service.id,
        position,
        port.hostPort ?? null,
        port.containerPort ?? null,
        port.protocol,
        port.description,
      )
    })

    const insertPath = this.connection.prepare(`
      INSERT INTO service_paths (
        id, service_id, position, host_path, container_path, purpose, read_only
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    service.paths.forEach((path, position) => {
      insertPath.run(
        path.id,
        service.id,
        position,
        path.hostPath,
        path.containerPath,
        path.purpose,
        path.readOnly ? 1 : 0,
      )
    })

    const insertDependency = this.connection.prepare(`
      INSERT INTO service_dependencies (service_id, dependency_id, position)
      VALUES (?, ?, ?)
    `)
    service.dependencyIds.forEach((dependencyId, position) => {
      insertDependency.run(service.id, dependencyId, position)
    })
  }

  private hydrateService(row: ServiceRow): InventoryService {
    const ports = this.connection.prepare(`
      SELECT id, host_port, container_port, protocol, description
      FROM service_ports WHERE service_id = ? ORDER BY position
    `).all(row.id) as Array<{
      id: string
      host_port: number | null
      container_port: number | null
      protocol: InventoryPort['protocol']
      description: string
    }>
    const paths = this.connection.prepare(`
      SELECT id, host_path, container_path, purpose, read_only
      FROM service_paths WHERE service_id = ? ORDER BY position
    `).all(row.id) as Array<{
      id: string
      host_path: string
      container_path: string
      purpose: string
      read_only: 0 | 1
    }>
    const dependencyIds = this.connection.prepare(`
      SELECT dependency_id FROM service_dependencies WHERE service_id = ? ORDER BY position
    `).pluck().all(row.id) as string[]
    return {
      id: row.id,
      name: row.name,
      containerName: row.container_name,
      dockerImage: row.docker_image,
      description: row.description,
      applicationUrl: row.application_url,
      status: row.status,
      ...(row.host_id ? { hostId: row.host_id } : {}),
      internalUrl: row.internal_url,
      ports: ports.map((port) => ({
        id: port.id,
        ...(port.host_port === null ? {} : { hostPort: port.host_port }),
        ...(port.container_port === null ? {} : { containerPort: port.container_port }),
        protocol: port.protocol,
        description: port.description,
      })),
      paths: paths.map(mapPath),
      network: row.network,
      exposure: row.exposure,
      dependencyIds,
      notes: row.notes,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private requireHost(id: string): InventoryHost {
    const host = this.getHost(id)
    if (!host) throw new InventoryNotFoundError(`Host ${id} does not exist`)
    return host
  }

  private requireService(id: string): InventoryService {
    const service = this.getService(id)
    if (!service) throw new InventoryNotFoundError(`Service ${id} does not exist`)
    return service
  }

  private assertUpdated(
    changes: number,
    kind: 'host' | 'service',
    id: string,
    expectedRevision: number,
  ): void {
    if (changes === 1) return
    const exists = this.connection.prepare(`SELECT 1 FROM ${kind}s WHERE id = ?`).get(id)
    if (!exists) throw new InventoryNotFoundError(`${capitalize(kind)} ${id} does not exist`)
    throw new InventoryConflictError(
      `${capitalize(kind)} ${id} is not at revision ${expectedRevision}`,
    )
  }
}

function mapHost(row: HostRow): InventoryHost {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    ipAddress: row.ip_address,
    operatingSystem: row.operating_system,
    notes: row.notes,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPath(row: {
  id: string
  host_path: string
  container_path: string
  purpose: string
  read_only: 0 | 1
}): InventoryPath {
  return {
    id: row.id,
    hostPath: row.host_path,
    containerPath: row.container_path,
    purpose: row.purpose,
    readOnly: row.read_only === 1,
  }
}

function validateHost(host: NewInventoryHost | Omit<InventoryHost, 'revision'>): void {
  validateId(host.id)
  validateRequiredName(host.name, 'Host')
  validateTimestamp(host.createdAt, 'createdAt')
  validateTimestamp(host.updatedAt, 'updatedAt')
  if (!hostTypes.includes(host.type)) throw new InventoryValidationError('Invalid host type')
}

function validateService(
  service: NewInventoryService | Omit<InventoryService, 'revision'>,
): void {
  validateId(service.id)
  validateRequiredName(service.name, 'Service')
  validateTimestamp(service.createdAt, 'createdAt')
  validateTimestamp(service.updatedAt, 'updatedAt')
  if (!serviceStatuses.includes(service.status)) {
    throw new InventoryValidationError('Invalid service status')
  }
  if (!exposures.includes(service.exposure)) {
    throw new InventoryValidationError('Invalid service exposure')
  }
  if (service.hostId !== undefined) validateId(service.hostId)
  if (new Set(service.dependencyIds).size !== service.dependencyIds.length) {
    throw new InventoryValidationError('Service dependencies must be unique')
  }
  if (service.dependencyIds.includes(service.id)) {
    throw new InventoryValidationError('A service cannot depend on itself')
  }
  const portIds = new Set<string>()
  for (const port of service.ports) {
    validateId(port.id)
    if (portIds.has(port.id)) throw new InventoryValidationError('Service port IDs must be unique')
    portIds.add(port.id)
    if (!portProtocols.includes(port.protocol)) {
      throw new InventoryValidationError('Invalid port protocol')
    }
    validatePortNumber(port.hostPort, 'hostPort')
    validatePortNumber(port.containerPort, 'containerPort')
    if (port.hostPort === undefined && port.containerPort === undefined) {
      throw new InventoryValidationError('A service port must define at least one port number')
    }
  }
  const pathIds = new Set<string>()
  for (const path of service.paths) {
    validateId(path.id)
    if (pathIds.has(path.id)) throw new InventoryValidationError('Service path IDs must be unique')
    pathIds.add(path.id)
    if (!path.hostPath.trim() && !path.containerPath.trim() && !path.purpose.trim()) {
      throw new InventoryValidationError('A service path cannot be blank')
    }
  }
}

function validateId(id: string): void {
  if (!id.trim()) throw new InventoryValidationError('ID must not be blank')
}

function validateRequiredName(name: string, kind: string): void {
  if (!name.trim()) throw new InventoryValidationError(`${kind} name must not be blank`)
}

function validateTimestamp(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new InventoryValidationError(`${field} must be an ISO timestamp`)
  }
}

function validateRevision(revision: number): void {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new InventoryValidationError('Expected revision must be a positive integer')
  }
}

function validatePortNumber(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 65_535)) {
    throw new InventoryValidationError(`${field} must be an integer between 1 and 65535`)
  }
}

function capitalize(value: string): string {
  return value[0].toUpperCase() + value.slice(1)
}
