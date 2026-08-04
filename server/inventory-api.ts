import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { exposures, hostTypes, portProtocols, serviceStatuses, type NewInventoryHost, type NewInventoryService } from './inventory.js'
import {
  InventoryConflictError,
  InventoryNotFoundError,
  InventoryValidationError,
  SqliteInventoryRepository,
} from './repository.js'

export class ApiRequestValidationError extends Error {}

type ErrorEnvelope = {
  error: { code: string; message: string; requestId: string }
}

export function registerInventoryApi(
  app: FastifyInstance,
  repository: SqliteInventoryRepository,
): void {
  const meta = () => ({ inventoryRevision: repository.inventoryRevision() })

  app.get('/api/v1/hosts', async () => ({ data: repository.listHosts(), meta: meta() }))
  app.get('/api/v1/hosts/:id', async (request) => {
    const id = parseIdParameter(request.params)
    const host = repository.getHost(id)
    if (!host) throw new InventoryNotFoundError('Host not found')
    return { data: host, meta: meta() }
  })
  app.post('/api/v1/hosts', async (request, reply) => {
    const host = parseHost(request.body)
    return reply.code(201).send({ data: repository.createHost(host), meta: meta() })
  })
  app.put('/api/v1/hosts/:id', async (request) => {
    const id = parseIdParameter(request.params)
    const body = parseUpdateRequest(request.body, 'host', parseHost)
    requireMatchingId(id, body.record.id)
    return {
      data: repository.updateHost(body.record, body.expectedRevision),
      meta: meta(),
    }
  })
  app.delete('/api/v1/hosts/:id', async (request) => {
    const id = parseIdParameter(request.params)
    const { expectedRevision } = parseDeleteRequest(request.body)
    repository.deleteHost(id, expectedRevision)
    return { data: null, meta: meta() }
  })

  app.get('/api/v1/services', async () => ({ data: repository.listServices(), meta: meta() }))
  app.get('/api/v1/services/:id', async (request) => {
    const id = parseIdParameter(request.params)
    const service = repository.getService(id)
    if (!service) throw new InventoryNotFoundError('Service not found')
    return { data: service, meta: meta() }
  })
  app.post('/api/v1/services', async (request, reply) => {
    const service = parseService(request.body)
    return reply.code(201).send({ data: repository.createService(service), meta: meta() })
  })
  app.put('/api/v1/services/:id', async (request) => {
    const id = parseIdParameter(request.params)
    const body = parseUpdateRequest(request.body, 'service', parseService)
    requireMatchingId(id, body.record.id)
    return {
      data: repository.updateService(body.record, body.expectedRevision),
      meta: meta(),
    }
  })
  app.delete('/api/v1/services/:id', async (request) => {
    const id = parseIdParameter(request.params)
    const { expectedRevision } = parseDeleteRequest(request.body)
    repository.deleteService(id, expectedRevision)
    return { data: null, meta: meta() }
  })
}

export function sendApiError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof ApiRequestValidationError || error instanceof InventoryValidationError) {
    return reply.code(400).send(envelope('VALIDATION_ERROR', 'The request is invalid.', request.id))
  }
  if (isRecord(error) && error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return reply.code(400).send(envelope('VALIDATION_ERROR', 'The request is invalid.', request.id))
  }
  if (error instanceof InventoryNotFoundError) {
    return reply.code(404).send(envelope('NOT_FOUND', 'The requested record was not found.', request.id))
  }
  if (error instanceof InventoryConflictError) {
    return reply.code(409).send(envelope('REVISION_CONFLICT', 'The record has changed.', request.id))
  }
  const code = sqliteCode(error)
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || code === 'SQLITE_CONSTRAINT_TRIGGER') {
    return reply.code(409).send(
      envelope('INVALID_REFERENCE', 'The request contains an invalid or protected reference.', request.id),
    )
  }
  if (code?.startsWith('SQLITE_CONSTRAINT')) {
    return reply.code(409).send(envelope('RECORD_CONFLICT', 'The record conflicts with existing data.', request.id))
  }
  const statusCode = statusFromUnknown(error)
  if (statusCode >= 400 && statusCode < 500) {
    return reply.code(statusCode).send(envelope('VALIDATION_ERROR', 'The request is invalid.', request.id))
  }
  request.log.error({ err: error }, 'unexpected API request failure')
  return reply.code(500).send(envelope('INTERNAL_ERROR', 'The request could not be completed.', request.id))
}

function envelope(code: string, message: string, requestId: string): ErrorEnvelope {
  return { error: { code, message, requestId } }
}

function sqliteCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function statusFromUnknown(error: unknown): number {
  if (!isRecord(error)) return 500
  return typeof error.statusCode === 'number' ? error.statusCode : 500
}

function parseIdParameter(value: unknown): string {
  const params = exactObject(value, ['id'])
  return nonBlankString(params.id)
}

function parseDeleteRequest(value: unknown): { expectedRevision: number } {
  const body = exactObject(value, ['expectedRevision'])
  return { expectedRevision: positiveInteger(body.expectedRevision) }
}

function parseUpdateRequest<T>(
  value: unknown,
  recordKey: 'host' | 'service',
  parseRecord: (value: unknown) => T,
): { expectedRevision: number; record: T } {
  const body = exactObject(value, ['expectedRevision', recordKey])
  return {
    expectedRevision: positiveInteger(body.expectedRevision),
    record: parseRecord(body[recordKey]),
  }
}

function parseHost(value: unknown): NewInventoryHost {
  const host = exactObject(value, [
    'id', 'name', 'type', 'ipAddress', 'operatingSystem', 'notes', 'createdAt', 'updatedAt',
  ])
  return {
    id: nonBlankString(host.id),
    name: nonBlankString(host.name),
    type: enumValue(host.type, hostTypes),
    ipAddress: stringValue(host.ipAddress),
    operatingSystem: stringValue(host.operatingSystem),
    notes: stringValue(host.notes),
    createdAt: isoTimestamp(host.createdAt),
    updatedAt: isoTimestamp(host.updatedAt),
  }
}

function parseService(value: unknown): NewInventoryService {
  const service = exactObject(value, [
    'id', 'name', 'containerName', 'dockerImage', 'description', 'applicationUrl', 'status',
    'hostId', 'internalUrl', 'ports', 'paths', 'network', 'exposure', 'dependencyIds', 'notes',
    'createdAt', 'updatedAt',
  ], ['hostId'])
  return {
    id: nonBlankString(service.id),
    name: nonBlankString(service.name),
    containerName: stringValue(service.containerName),
    dockerImage: stringValue(service.dockerImage),
    description: stringValue(service.description),
    applicationUrl: stringValue(service.applicationUrl),
    status: enumValue(service.status, serviceStatuses),
    ...(service.hostId === undefined ? {} : { hostId: nonBlankString(service.hostId) }),
    internalUrl: stringValue(service.internalUrl),
    ports: arrayValue(service.ports).map(parsePort),
    paths: arrayValue(service.paths).map(parsePath),
    network: stringValue(service.network),
    exposure: enumValue(service.exposure, exposures),
    dependencyIds: arrayValue(service.dependencyIds).map(nonBlankString),
    notes: stringValue(service.notes),
    createdAt: isoTimestamp(service.createdAt),
    updatedAt: isoTimestamp(service.updatedAt),
  }
}

function parsePort(value: unknown): NewInventoryService['ports'][number] {
  const port = exactObject(
    value,
    ['id', 'hostPort', 'containerPort', 'protocol', 'description'],
    ['hostPort', 'containerPort'],
  )
  const result = {
    id: nonBlankString(port.id),
    ...(port.hostPort === undefined ? {} : { hostPort: portNumber(port.hostPort) }),
    ...(port.containerPort === undefined ? {} : { containerPort: portNumber(port.containerPort) }),
    protocol: enumValue(port.protocol, portProtocols),
    description: stringValue(port.description),
  }
  if (result.hostPort === undefined && result.containerPort === undefined) invalid()
  return result
}

function parsePath(value: unknown): NewInventoryService['paths'][number] {
  const path = exactObject(value, ['id', 'hostPath', 'containerPath', 'purpose', 'readOnly'])
  const result = {
    id: nonBlankString(path.id),
    hostPath: stringValue(path.hostPath),
    containerPath: stringValue(path.containerPath),
    purpose: stringValue(path.purpose),
    readOnly: booleanValue(path.readOnly),
  }
  if (!result.hostPath.trim() && !result.containerPath.trim() && !result.purpose.trim()) invalid()
  return result
}

function exactObject(
  value: unknown,
  allowedKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> {
  if (!isRecord(value)) invalid()
  const keys = Object.keys(value)
  if (keys.some((key) => !allowedKeys.includes(key))) invalid()
  if (allowedKeys.some((key) => !optionalKeys.includes(key) && !Object.hasOwn(value, key))) invalid()
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') invalid()
  return value
}

function nonBlankString(value: unknown): string {
  const result = stringValue(value)
  if (!result.trim()) invalid()
  return result
}

function booleanValue(value: unknown): boolean {
  if (typeof value !== 'boolean') invalid()
  return value
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid()
  return value
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) invalid()
  return value
}

function portNumber(value: unknown): number {
  const result = positiveInteger(value)
  if (result > 65_535) invalid()
  return result
}

function isoTimestamp(value: unknown): string {
  const result = stringValue(value)
  if (Number.isNaN(Date.parse(result)) || new Date(result).toISOString() !== result) invalid()
  return result
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  const result = stringValue(value)
  if (!allowed.includes(result)) invalid()
  return result as T[number]
}

function requireMatchingId(pathId: string, bodyId: string): void {
  if (pathId !== bodyId) invalid()
}

function invalid(): never {
  throw new ApiRequestValidationError('Invalid API request')
}
