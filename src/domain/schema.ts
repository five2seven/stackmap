import {
  EXPOSURES,
  HOST_TYPES,
  PORT_PROTOCOLS,
  SERVICE_STATUSES,
  type Host,
  type Service,
  type StackMapExport,
} from './types'

export const CURRENT_SCHEMA_VERSION = 2

const isString = (value: unknown): value is string => typeof value === 'string'
const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value.trim().length > 0
const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || isString(value)
const isIsoTimestamp = (value: unknown): value is string =>
  isString(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString() === value

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).every((key) => keys.includes(key))
}

function isServiceShape(value: unknown, schemaVersion: 1 | 2): boolean {
  if (!value || typeof value !== 'object') return false
  const service = value as Record<string, unknown>
  const keys = [
    'id',
    'name',
    ...(schemaVersion === 2
      ? ['containerName', 'dockerImage', 'description', 'applicationUrl']
      : []),
    'status',
    'hostId',
    'internalUrl',
    'ports',
    'configPath',
    'dataPath',
    'network',
    'exposure',
    'dependencyIds',
    'notes',
    'createdAt',
    'updatedAt',
  ]

  return (
    hasExactKeys(service, keys) &&
    isNonEmptyString(service.id) &&
    isNonEmptyString(service.name) &&
    (schemaVersion === 1 ||
      (isString(service.containerName) &&
        isString(service.dockerImage) &&
        isString(service.description) &&
        isString(service.applicationUrl))) &&
    SERVICE_STATUSES.includes(service.status as Service['status']) &&
    isOptionalString(service.hostId) &&
    isString(service.internalUrl) &&
    Array.isArray(service.ports) &&
    service.ports.every((port) => {
      if (!port || typeof port !== 'object') return false
      const item = port as Record<string, unknown>
      return (
        hasExactKeys(item, ['hostPort', 'containerPort', 'protocol', 'description']) &&
        (item.hostPort === undefined ||
          (Number.isInteger(item.hostPort) && Number(item.hostPort) > 0 && Number(item.hostPort) <= 65535)) &&
        (item.containerPort === undefined ||
          (Number.isInteger(item.containerPort) &&
            Number(item.containerPort) > 0 &&
            Number(item.containerPort) <= 65535)) &&
        (item.hostPort !== undefined || item.containerPort !== undefined) &&
        PORT_PROTOCOLS.includes(item.protocol as Service['ports'][number]['protocol']) &&
        isString(item.description)
      )
    }) &&
    isString(service.configPath) &&
    isString(service.dataPath) &&
    isString(service.network) &&
    EXPOSURES.includes(service.exposure as Service['exposure']) &&
    Array.isArray(service.dependencyIds) &&
    service.dependencyIds.every(isString) &&
    new Set(service.dependencyIds).size === service.dependencyIds.length &&
    !service.dependencyIds.includes(service.id) &&
    isString(service.notes) &&
    isIsoTimestamp(service.createdAt) &&
    isIsoTimestamp(service.updatedAt)
  )
}

export function isService(value: unknown): value is Service {
  return isServiceShape(value, 2)
}

export function isHost(value: unknown): value is Host {
  if (!value || typeof value !== 'object') return false
  const host = value as Record<string, unknown>
  return (
    hasExactKeys(host, [
      'id',
      'name',
      'type',
      'ipAddress',
      'operatingSystem',
      'notes',
      'createdAt',
      'updatedAt',
    ]) &&
    isNonEmptyString(host.id) &&
    isNonEmptyString(host.name) &&
    HOST_TYPES.includes(host.type as Host['type']) &&
    isString(host.ipAddress) &&
    isString(host.operatingSystem) &&
    isString(host.notes) &&
    isIsoTimestamp(host.createdAt) &&
    isIsoTimestamp(host.updatedAt)
  )
}

export function validateImport(value: unknown): StackMapExport {
  if (!value || typeof value !== 'object') {
    throw new Error('The selected file does not contain a StackMap export.')
  }

  const data = value as Record<string, unknown>
  if (data.schemaVersion !== 1 && data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version. Expected version 1 or ${CURRENT_SCHEMA_VERSION}.`,
    )
  }
  if (!isString(data.exportedAt) || Number.isNaN(Date.parse(data.exportedAt))) {
    throw new Error('The export timestamp is missing or invalid.')
  }
  const schemaVersion = data.schemaVersion as 1 | 2
  if (
    !Array.isArray(data.services) ||
    !data.services.every((service) => isServiceShape(service, schemaVersion))
  ) {
    throw new Error('One or more service records are invalid.')
  }
  if (!Array.isArray(data.hosts) || !data.hosts.every(isHost)) {
    throw new Error('One or more host records are invalid.')
  }

  const hostIds = new Set(data.hosts.map((host) => host.id))
  const serviceIds = new Set(data.services.map((service) => service.id))
  if (hostIds.size !== data.hosts.length || serviceIds.size !== data.services.length) {
    throw new Error('The import contains duplicate record IDs.')
  }
  if (data.services.some((service) => service.hostId && !hostIds.has(service.hostId))) {
    throw new Error('A service references a host that is not included in the import.')
  }
  if (
    data.services.some((service) =>
      service.dependencyIds.some((id: string) => !serviceIds.has(id)),
    )
  ) {
    throw new Error('A service dependency is not included in the import.')
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: data.exportedAt,
    services: data.services.map((service) => {
      const current = service as unknown as Service
      if (schemaVersion === 2) return { ...current }
      return {
        ...current,
        containerName: '',
        dockerImage: '',
        description: '',
        applicationUrl: '',
      }
    }),
    hosts: data.hosts.map((host) => ({ ...host })),
  }
}
