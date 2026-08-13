import { randomBytes, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import type { InventoryHost, InventoryPort, InventoryService } from './inventory.js'
import { portProtocolsOverlap } from './portainer-conflicts.js'
import { InventoryValidationError, PortainerImportConflictError, type InventorySnapshot, type PortainerBindingSnapshot, type SqliteInventoryRepository } from './repository.js'
import { createPortainerNetworkFetcher } from './portainer-network-policy.js'

const REQUEST_TIMEOUT_MS = 10_000
const SESSION_TTL_MS = 5 * 60 * 1000
const CAPACITY = 8
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024
const MAX_ENVIRONMENTS = 100
const MAX_CONTAINERS = 5_000
const MAX_SELECTED_ENVIRONMENTS = 10
const DOCKER_ENVIRONMENT_TYPES = new Set([1, 2, 4])
const LOCAL_DOCKER_ENVIRONMENT_TYPE = 1

export type PortainerFetcher = (input: string, init: RequestInit) => Promise<Response>

export interface PortainerEnvironment {
  id: number
  name: string
  containerEngine: string
  publicUrl: string
}

type PortainerEndpoint = PortainerEnvironment & { type?: number }

type DockerInfo = { name: string; operatingSystem: string; osType: string; architecture: string }
type DockerVersion = { version: string; apiVersion: string }
type DockerPort = { privatePort: number; publicPort?: number; type: string; ip: string }
type DockerMount = { type: string; source: string; destination: string; readWrite: boolean }
type DockerContainer = {
  id: string
  names: string[]
  image: string
  state: string
  ports: DockerPort[]
  mounts: DockerMount[]
  networks: string[]
}

export interface PreviewWarning { code: string; message: string }
export interface PreviewConflict { code: string; message: string; blocking: boolean }
export interface PortainerHostCandidate extends Omit<InventoryHost, 'revision'> {
  environmentId: number
  existingHostMatches: string[]
}
export interface PortainerServiceCandidate extends Omit<InventoryService, 'revision'> {
  environmentId: number
  containerId: string
  sourceState: string
  networkOptions: string[]
  warnings: PreviewWarning[]
  conflicts: PreviewConflict[]
  alreadyBound: boolean
}
export interface PortainerPreview {
  previewToken: string
  expectedInventoryRevision: number
  hosts: PortainerHostCandidate[]
  services: PortainerServiceCandidate[]
  existingHosts: Array<Pick<InventoryHost, 'id' | 'name' | 'ipAddress'>>
}

type Session = {
  apiToken: string
  environments: PortainerEnvironment[]
  expiresAt: number
  expiryTimer?: ReturnType<typeof setTimeout>
}
type StoredPreview = { expiresAt: number; sessionToken: string; preview: PortainerPreview }

export class PortainerError extends Error {
  constructor(public readonly code: string, message: string) { super(message) }
}

export class PortainerClient {
  private readonly fetcher: PortainerFetcher

  constructor(
    private readonly baseUrl: string,
    fetcher?: PortainerFetcher,
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    this.fetcher = fetcher ?? createPortainerNetworkFetcher(baseUrl)
  }

  environments(apiToken: string): Promise<PortainerEndpoint[]> {
    return this.get('/api/endpoints', apiToken, projectEnvironments)
  }

  info(environmentId: number, apiToken: string): Promise<DockerInfo> {
    return this.get(`/api/endpoints/${environmentId}/docker/info`, apiToken, projectInfo)
  }

  version(environmentId: number, apiToken: string): Promise<DockerVersion> {
    return this.get(`/api/endpoints/${environmentId}/docker/version`, apiToken, projectVersion)
  }

  containers(environmentId: number, apiToken: string): Promise<DockerContainer[]> {
    return this.get(`/api/endpoints/${environmentId}/docker/containers/json?all=true`, apiToken, projectContainers)
  }

  private async get<T>(path: string, apiToken: string, project: (value: unknown) => T): Promise<T> {
    if (!apiToken.trim()) throw new PortainerError('PORTAINER_TOKEN_REQUIRED', 'Enter a Portainer API token.')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: 'GET', redirect: 'error', signal: controller.signal,
        headers: { accept: 'application/json', 'X-API-Key': apiToken },
      })
    } catch {
      throw new PortainerError('PORTAINER_UNREACHABLE', 'StackMap could not reach Portainer securely.')
    } finally {
      clearTimeout(timeout)
    }
    if (response.status === 401 || response.status === 403) {
      throw new PortainerError('PORTAINER_AUTH_FAILED', 'Portainer rejected the API token.')
    }
    if (!response.ok) throw new PortainerError('PORTAINER_UPSTREAM_ERROR', 'Portainer could not complete discovery.')
    if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
      throw new PortainerError('PORTAINER_INVALID_RESPONSE', 'Portainer returned an invalid response.')
    }
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > MAX_RESPONSE_BYTES) throw new PortainerError('PORTAINER_RESPONSE_TOO_LARGE', 'Portainer returned too much data.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new PortainerError('PORTAINER_RESPONSE_TOO_LARGE', 'Portainer returned too much data.')
    let value: unknown
    try { value = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new PortainerError('PORTAINER_INVALID_RESPONSE', 'Portainer returned an invalid response.') }
    try { return project(value) } catch (error) {
      if (error instanceof PortainerError) throw error
      throw new PortainerError('PORTAINER_INVALID_RESPONSE', 'Portainer returned an invalid response.')
    }
  }
}

export class PortainerPreviewService {
  private readonly sessions = new Map<string, Session>()
  private readonly previews = new Map<string, StoredPreview>()
  constructor(
    private readonly client: PortainerClient,
    private readonly snapshot: () => InventorySnapshot,
    private readonly now: () => number = Date.now,
    private readonly sessionTtlMs = SESSION_TTL_MS,
    private readonly sourceOrigin = '',
    private readonly repository?: SqliteInventoryRepository,
  ) {}

  async connect(apiToken: string) {
    this.cleanup()
    if (this.sessions.size >= CAPACITY) throw new PortainerError('PORTAINER_CAPACITY', 'Too many Portainer previews are active.')
    const environments = (await this.client.environments(apiToken))
      .filter(isDockerCompatibleEnvironment)
      .map(({ id, name, containerEngine, publicUrl }) => ({ id, name, containerEngine, publicUrl }))
    const sessionToken = opaqueToken()
    const session: Session = { apiToken, environments, expiresAt: this.now() + this.sessionTtlMs }
    this.sessions.set(sessionToken, session)
    this.scheduleExpiry(sessionToken, session)
    return { sessionToken, environments }
  }

  async preview(sessionToken: string, environmentIds: number[]): Promise<PortainerPreview> {
    this.cleanup()
    const session = this.sessions.get(sessionToken)
    if (!session) throw new PortainerError('PORTAINER_SESSION_INVALID', 'The Portainer session expired. Enter the token again.')
    if (!environmentIds.length || environmentIds.length > MAX_SELECTED_ENVIRONMENTS || new Set(environmentIds).size !== environmentIds.length) {
      throw new PortainerError('PORTAINER_SELECTION_INVALID', 'Select at least one environment.')
    }
    const allowed = new Map(session.environments.map((item) => [item.id, item]))
    if (environmentIds.some((id) => !Number.isSafeInteger(id) || !allowed.has(id))) {
      throw new PortainerError('PORTAINER_SELECTION_INVALID', 'The environment selection is invalid.')
    }
    const inventory = this.snapshot()
    const bindings = this.repository?.portainerBindings(this.sourceOrigin) ?? { environments: [], containers: [] }
    let discovered: Array<{ host: PortainerHostCandidate; services: PortainerServiceCandidate[] }>
    try {
      discovered = await Promise.all(environmentIds.map(async (environmentId) => {
      const environment = allowed.get(environmentId)!
      const [info, version, containers] = await Promise.all([
        this.client.info(environmentId, session.apiToken),
        this.client.version(environmentId, session.apiToken),
        this.client.containers(environmentId, session.apiToken),
      ])
      return mapEnvironment(environment, info, version, containers, inventory, bindings)
      }))
    } catch (error) {
      if (error instanceof PortainerError && error.code === 'PORTAINER_AUTH_FAILED') this.cancelSession(sessionToken)
      throw error
    }
    if (this.sessions.get(sessionToken) !== session) {
      throw new PortainerError('PORTAINER_SESSION_INVALID', 'The Portainer session expired. Enter the token again.')
    }
    const hosts = discovered.map((item) => item.host)
    const services = discovered.flatMap((item) => item.services)
    if (services.length > MAX_CONTAINERS) throw new PortainerError('PORTAINER_RESPONSE_TOO_LARGE', 'Portainer returned too many containers for one preview.')
    addSelectionConflicts(services)
    for (const [token, stored] of this.previews) if (stored.sessionToken === sessionToken) this.previews.delete(token)
    const previewToken = opaqueToken()
    const result = {
      previewToken, expectedInventoryRevision: inventory.revision, hosts, services,
      existingHosts: inventory.hosts.map(({ id, name, ipAddress }) => ({ id, name, ipAddress })),
    }
    this.previews.set(previewToken, { sessionToken, expiresAt: this.now() + SESSION_TTL_MS, preview: structuredClone(result) })
    session.expiresAt = this.now() + this.sessionTtlMs
    this.scheduleExpiry(sessionToken, session)
    return result
  }

  confirm(previewToken: string, expectedRevision: number, selected: unknown) {
    this.cleanup()
    const stored = this.previews.get(previewToken)
    if (!stored || stored.preview.expectedInventoryRevision !== expectedRevision || !this.repository || !this.sourceOrigin) {
      throw new PortainerError('PORTAINER_PREVIEW_INVALID', 'The Portainer preview is invalid or expired. Discover again.')
    }
    const services = validateConfirmationSelection(selected, stored.preview)
    const selectedHostIds = new Set(services.map(({ hostId }) => hostId))
    const hosts = stored.preview.hosts.filter(({ id }) => selectedHostIds.has(id)).map((candidate) => ({
      environmentId: candidate.environmentId,
      host: { id: candidate.id, name: candidate.name, type: candidate.type, ipAddress: candidate.ipAddress, operatingSystem: candidate.operatingSystem, notes: candidate.notes, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt },
    }))
    try {
      const result = this.repository.importPortainer({
        origin: this.sourceOrigin, expectedRevision, hosts,
        services: services.map((candidate) => ({
          environmentId: candidate.environmentId, containerId: candidate.containerId,
          service: { id: candidate.id, name: candidate.name, containerName: candidate.containerName, dockerImage: candidate.dockerImage, description: candidate.description, applicationUrl: candidate.applicationUrl, status: candidate.status, hostId: candidate.hostId, internalUrl: candidate.internalUrl, ports: candidate.ports, paths: candidate.paths, network: candidate.network, exposure: candidate.exposure, dependencyIds: candidate.dependencyIds, notes: candidate.notes, createdAt: candidate.createdAt, updatedAt: candidate.updatedAt },
        })),
      })
      this.cancelSession(stored.sessionToken)
      return result
    } catch (error) {
      if (error instanceof PortainerImportConflictError) {
        this.cancelSession(stored.sessionToken)
        throw new PortainerError(error.code, error.code === 'PORTAINER_PREVIEW_STALE' ? 'The inventory changed after preview. Discover again.' : 'A selected container was already imported. Discover again.')
      }
      if (error instanceof InventoryValidationError) throw new PortainerError('PORTAINER_CONFIRMATION_INVALID', error.message)
      throw error
    }
  }

  cancelSession(token: string) {
    const session = this.sessions.get(token)
    if (session?.expiryTimer !== undefined) clearTimeout(session.expiryTimer)
    if (session) session.apiToken = ''
    this.sessions.delete(token)
    for (const [previewToken, preview] of this.previews) if (preview.sessionToken === token) this.previews.delete(previewToken)
  }
  cancelPreview(token: string) {
    const preview = this.previews.get(token)
    if (preview) this.cancelSession(preview.sessionToken)
    this.previews.delete(token)
  }
  clear() {
    for (const token of [...this.sessions.keys()]) this.cancelSession(token)
    this.previews.clear()
  }
  private cleanup() {
    const now = this.now()
    for (const [token, session] of this.sessions) if (session.expiresAt <= now) this.cancelSession(token)
    for (const [token, preview] of this.previews) if (preview.expiresAt <= now) this.previews.delete(token)
  }
  private scheduleExpiry(token: string, session: Session) {
    if (session.expiryTimer !== undefined) clearTimeout(session.expiryTimer)
    const delay = Math.max(0, session.expiresAt - this.now())
    session.expiryTimer = setTimeout(() => {
      const current = this.sessions.get(token)
      if (current !== session) return
      if (current.expiresAt > this.now()) {
        this.scheduleExpiry(token, current)
        return
      }
      this.cancelSession(token)
    }, delay)
    if (typeof session.expiryTimer === 'object' && 'unref' in session.expiryTimer) {
      session.expiryTimer.unref()
    }
  }
}

function validateConfirmationSelection(value: unknown, preview: PortainerPreview): PortainerServiceCandidate[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CONTAINERS) {
    throw new PortainerError('PORTAINER_CONFIRMATION_INVALID', 'Select at least one container to import.')
  }
  const originals = new Map(preview.services.map((service) => [service.id, service]))
  const selectedIds = new Set<string>()
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw confirmationInvalid()
    const candidate = item as PortainerServiceCandidate
    const original = typeof candidate.id === 'string' ? originals.get(candidate.id) : undefined
    if (!original || selectedIds.has(candidate.id) || original.alreadyBound) throw confirmationInvalid()
    if (Object.keys(candidate).sort().join('\0') !== Object.keys(original).sort().join('\0')) throw confirmationInvalid()
    selectedIds.add(candidate.id)
    const immutableKeys: Array<keyof PortainerServiceCandidate> = [
      'environmentId', 'containerId', 'sourceState', 'networkOptions', 'id', 'name', 'containerName',
      'dockerImage', 'description', 'applicationUrl', 'internalUrl', 'exposure', 'dependencyIds', 'notes',
      'createdAt', 'updatedAt', 'warnings', 'alreadyBound',
    ]
    if (immutableKeys.some((key) => JSON.stringify(candidate[key]) !== JSON.stringify(original[key]))) throw confirmationInvalid()
    if (!['active', 'planned', 'paused', 'retired'].includes(candidate.status)) throw confirmationInvalid()
    const proposedHost = preview.hosts.find(({ environmentId }) => environmentId === original.environmentId)?.id
    const allowedHosts = new Set([proposedHost, ...preview.existingHosts.map(({ id }) => id)])
    if (!candidate.hostId || !allowedHosts.has(candidate.hostId)) throw confirmationInvalid()
    if (candidate.networkOptions.length > 1 && !candidate.network) throw new PortainerError('PORTAINER_CONFIRMATION_INVALID', 'Select one network for every selected container.')
    if (candidate.network && !candidate.networkOptions.includes(candidate.network)) throw confirmationInvalid()
    if (!isExactSubset(candidate.ports, original.ports) || !isExactSubset(candidate.paths, original.paths)) throw confirmationInvalid()
    return structuredClone(candidate)
  })
}

function isExactSubset<T extends { id: string }>(selected: unknown, original: T[]): selected is T[] {
  if (!Array.isArray(selected) || selected.some((item) => !item || typeof item !== 'object' || Array.isArray(item) || typeof (item as { id?: unknown }).id !== 'string')) return false
  const typed = selected as T[]
  if (new Set(typed.map(({ id }) => id)).size !== typed.length) return false
  const originals = new Map(original.map((item) => [item.id, item]))
  return typed.every((item) => JSON.stringify(item) === JSON.stringify(originals.get(item.id)))
}

function confirmationInvalid() {
  return new PortainerError('PORTAINER_CONFIRMATION_INVALID', 'The Portainer confirmation does not match the reviewed preview.')
}

function projectEnvironments(value: unknown): PortainerEndpoint[] {
  if (!Array.isArray(value) || value.length > MAX_ENVIRONMENTS) invalid()
  return value.map((item) => {
    const record = object(item)
    return {
      id: integer(record.Id),
      name: nonBlank(record.Name),
      ...(record.Type === undefined ? {} : { type: integer(record.Type) }),
      containerEngine: string(record.ContainerEngine),
      publicUrl: record.PublicURL === undefined ? '' : string(record.PublicURL),
    }
  })
}
function isDockerCompatibleEnvironment(environment: PortainerEndpoint): boolean {
  const containerEngine = environment.containerEngine.trim().toLowerCase()
  if (environment.type !== undefined && !DOCKER_ENVIRONMENT_TYPES.has(environment.type)) return false
  return containerEngine === 'docker' || (containerEngine === '' && environment.type === LOCAL_DOCKER_ENVIRONMENT_TYPE)
}
function projectInfo(value: unknown): DockerInfo {
  const record = object(value)
  return { name: string(record.Name), operatingSystem: string(record.OperatingSystem), osType: string(record.OSType), architecture: string(record.Architecture) }
}
function projectVersion(value: unknown): DockerVersion {
  const record = object(value)
  return { version: string(record.Version), apiVersion: string(record.ApiVersion) }
}
function projectContainers(value: unknown): DockerContainer[] {
  if (!Array.isArray(value) || value.length > MAX_CONTAINERS) invalid()
  return value.map((item) => {
    const record = object(item)
    const networkSettings = object(record.NetworkSettings)
    const networks = object(networkSettings.Networks)
    return {
      id: nonBlank(record.Id), names: strings(record.Names), image: string(record.Image), state: string(record.State),
      ports: array(record.Ports).map((port) => { const p = object(port); return { privatePort: portNumber(p.PrivatePort), ...(p.PublicPort === undefined ? {} : { publicPort: portNumber(p.PublicPort) }), type: string(p.Type), ip: string(p.IP) } }),
      mounts: array(record.Mounts).map((mount) => { const m = object(mount); return { type: string(m.Type), source: string(m.Source), destination: string(m.Destination), readWrite: boolean(m.RW) } }),
      networks: Object.keys(networks).sort((a, b) => a.localeCompare(b)),
    }
  })
}

function mapEnvironment(environment: PortainerEnvironment, info: DockerInfo, version: DockerVersion, containers: DockerContainer[], inventory: InventorySnapshot, bindings: PortainerBindingSnapshot) {
  const timestamp = new Date().toISOString()
  const literalIp = parseLiteralIp(environment.publicUrl)
  const hostId = randomUUID()
  const hostName = environment.name.trim() || info.name.trim() || `Environment ${environment.id}`
  const existingHostMatches = [...new Set([
    ...inventory.hosts.filter((host) => host.name.trim().toLowerCase() === hostName.toLowerCase() || Boolean(literalIp && host.ipAddress === literalIp)).map((host) => host.id),
    ...bindings.environments.filter((item) => item.environmentId === environment.id && item.hostId).map((item) => item.hostId!),
  ])]
  const host: PortainerHostCandidate = {
    environmentId: environment.id, id: hostId, name: hostName, type: 'container-host', ipAddress: literalIp,
    operatingSystem: [info.operatingSystem, info.osType, info.architecture].filter(Boolean).join(' · '), notes: '',
    createdAt: timestamp, updatedAt: timestamp, existingHostMatches,
  }
  const services = containers.map((container) => mapContainer(environment.id, hostId, container, inventory, version, timestamp, bindings))
    .sort((a, b) => a.name.localeCompare(b.name) || a.containerId.localeCompare(b.containerId))
  return { host, services }
}

function mapContainer(environmentId: number, hostId: string, container: DockerContainer, inventory: InventorySnapshot, version: DockerVersion, timestamp: string, bindings: PortainerBindingSnapshot): PortainerServiceCandidate {
  const warnings: PreviewWarning[] = []
  const name = (container.names[0] ?? container.id.slice(0, 12)).replace(/^\//, '')
  const ports = uniquePorts(container.ports, warnings)
  const paths = container.mounts.filter((mount) => {
    if (mount.type === 'bind') return true
    warnings.push({ code: 'VOLUME_SKIPPED', message: `Skipped ${mount.type || 'unknown'} volume at ${mount.destination || 'unknown destination'}.` })
    return false
  }).map((mount) => ({ id: randomUUID(), hostPath: mount.source, containerPath: mount.destination, purpose: '', readOnly: !mount.readWrite }))
  const networkOptions = container.networks
  const conflicts: PreviewConflict[] = []
  if (networkOptions.length > 1) conflicts.push({ code: 'NETWORK_SELECTION_REQUIRED', message: 'Select one Docker network before Phase 2 confirmation.', blocking: true })
  const alreadyBound = bindings.containers.some((item) => item.environmentId === environmentId && item.containerId === container.id)
  const service: PortainerServiceCandidate = {
    environmentId, containerId: container.id, sourceState: container.state, networkOptions,
    id: randomUUID(), name, containerName: name, dockerImage: container.image, description: '', applicationUrl: '',
    status: ['running', 'restarting'].includes(container.state.toLowerCase()) ? 'active' : 'paused', hostId,
    internalUrl: '', ports, paths, network: networkOptions.length === 1 ? networkOptions[0] : '',
    exposure: isLoopbackOnly(container.ports) ? 'local' : 'unknown', dependencyIds: [], notes: '',
    createdAt: timestamp, updatedAt: timestamp, warnings, conflicts, alreadyBound,
  }
  if (alreadyBound) conflicts.push({ code: 'ALREADY_BOUND', message: 'This container was imported previously and is skipped by default.', blocking: true })
  if (!version.version || !version.apiVersion) warnings.push({ code: 'VERSION_INCOMPLETE', message: 'Docker version information was incomplete.' })
  const duplicates = inventory.services.filter((existing) => existing.hostId === hostId && existing.containerName.trim().toLowerCase() === name.toLowerCase())
  if (duplicates.length) conflicts.push({ code: 'CONTAINER_NAME_DUPLICATE', message: `Container name matches ${duplicates.map((item) => item.name).join(', ')}; verify the target host.`, blocking: false })
  for (const port of ports) for (const existing of inventory.services) for (const existingPort of existing.ports) {
    if (existing.hostId === hostId && port.hostPort !== undefined && port.hostPort === existingPort.hostPort && portProtocolsOverlap(port.protocol, existingPort.protocol)) {
      conflicts.push({ code: 'HOST_PORT_CONFLICT', message: `${port.hostPort}/${port.protocol} overlaps ${existing.name}.`, blocking: false })
    }
  }
  return service
}

function uniquePorts(ports: DockerPort[], warnings: PreviewWarning[]): InventoryPort[] {
  const seen = new Set<string>()
  const result: InventoryPort[] = []
  for (const port of ports) {
    const protocol = port.type === 'tcp' || port.type === 'udp' ? port.type : 'unknown'
    if (protocol === 'unknown') warnings.push({ code: 'PROTOCOL_UNSUPPORTED', message: `Mapped unsupported protocol ${port.type || 'blank'} to unknown.` })
    const key = `${port.publicPort ?? ''}:${port.privatePort}:${protocol}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ id: randomUUID(), ...(port.publicPort === undefined ? {} : { hostPort: port.publicPort }), containerPort: port.privatePort, protocol, description: '' })
  }
  return result
}

function addSelectionConflicts(services: PortainerServiceCandidate[]) {
  services.forEach((service, index) => services.slice(index + 1).forEach((candidate) => {
    if (service.hostId === candidate.hostId && service.containerName.toLowerCase() === candidate.containerName.toLowerCase()) {
      const conflict = { code: 'DISCOVERED_CONTAINER_NAME_DUPLICATE', message: `Also discovered as ${candidate.name}.`, blocking: false }
      service.conflicts.push(conflict); candidate.conflicts.push({ ...conflict, message: `Also discovered as ${service.name}.` })
    }
    for (const port of service.ports) for (const candidatePort of candidate.ports) if (service.hostId === candidate.hostId && port.hostPort !== undefined && port.hostPort === candidatePort.hostPort && portProtocolsOverlap(port.protocol, candidatePort.protocol)) {
      service.conflicts.push({ code: 'DISCOVERED_HOST_PORT_CONFLICT', message: `${port.hostPort}/${port.protocol} overlaps ${candidate.name}.`, blocking: false })
      candidate.conflicts.push({ code: 'DISCOVERED_HOST_PORT_CONFLICT', message: `${candidatePort.hostPort}/${candidatePort.protocol} overlaps ${service.name}.`, blocking: false })
    }
  }))
}

function isLoopbackOnly(ports: DockerPort[]) { const published = ports.filter((port) => port.publicPort !== undefined); return published.length > 0 && published.every((port) => ['127.0.0.1', '::1'].includes(port.ip)) }
function parseLiteralIp(value: string) { if (!value) return ''; try { const parsed = new URL(value.includes('://') ? value : `https://${value}`); const host = parsed.hostname.replace(/^\[|\]$/g, ''); return isIP(host) ? host : '' } catch { return '' } }
function opaqueToken() { return randomBytes(32).toString('base64url') }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(); return value as Record<string, unknown> }
function array(value: unknown): unknown[] { if (!Array.isArray(value)) invalid(); return value }
function string(value: unknown): string { if (typeof value !== 'string' || value.length > 4096) invalid(); return value }
function nonBlank(value: unknown): string { const result = string(value); if (!result.trim()) invalid(); return result }
function strings(value: unknown): string[] { return array(value).map(string) }
function integer(value: unknown): number { if (!Number.isSafeInteger(value) || Number(value) < 1) invalid(); return Number(value) }
function portNumber(value: unknown): number { const result = integer(value); if (result > 65535) invalid(); return result }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') invalid(); return value }
function invalid(): never { throw new PortainerError('PORTAINER_INVALID_RESPONSE', 'Portainer returned an invalid response.') }
