import type { Host, Service, ServiceFilters, ServicePort } from './types'

export function missingServiceFields(service: Service): string[] {
  const missing: string[] = []
  if (!service.hostId) missing.push('host')
  if (!service.internalUrl.trim()) missing.push('internal URL')
  if (!service.ports.length) missing.push('ports')
  if (!service.configPath.trim()) missing.push('configuration path')
  if (!service.dataPath.trim()) missing.push('data path')
  if (!service.network.trim()) missing.push('network')
  if (service.exposure === 'unknown') missing.push('exposure')
  return missing
}

function protocolsOverlap(left: ServicePort['protocol'], right: ServicePort['protocol']) {
  if (left === 'unknown' || right === 'unknown') return left === right
  return left === 'both' || right === 'both' || left === right
}

export function duplicatePortServiceIds(services: Service[]): Set<string> {
  const duplicateIds = new Set<string>()
  const assignments = services.flatMap((service) =>
    service.hostId
      ? service.ports
          .filter((port) => port.hostPort !== undefined)
          .map((port, portIndex) => ({ service, port, portIndex }))
      : [],
  )

  assignments.forEach((assignment, index) => {
    assignments.slice(index + 1).forEach((candidate) => {
      if (
        assignment.service.hostId === candidate.service.hostId &&
        assignment.port.hostPort === candidate.port.hostPort &&
        protocolsOverlap(assignment.port.protocol, candidate.port.protocol) &&
        (assignment.service.id !== candidate.service.id ||
          assignment.portIndex !== candidate.portIndex)
      ) {
        duplicateIds.add(assignment.service.id)
        duplicateIds.add(candidate.service.id)
      }
    })
  })
  return duplicateIds
}

export function duplicateContainerNameServiceIds(services: Service[]): Set<string> {
  const duplicateIds = new Set<string>()
  const assignments = new Map<string, string[]>()

  services.forEach((service) => {
    const containerName = service.containerName.trim().toLowerCase()
    if (!service.hostId || !containerName || service.status === 'retired') return
    const key = `${service.hostId}\u0000${containerName}`
    assignments.set(key, [...(assignments.get(key) ?? []), service.id])
  })

  assignments.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => duplicateIds.add(id))
  })

  return duplicateIds
}

export function filterServices(
  services: Service[],
  hosts: Host[],
  filters: ServiceFilters,
): Service[] {
  const hostNames = new Map(hosts.map((host) => [host.id, host.name.toLowerCase()]))
  const query = filters.query.trim().toLowerCase()

  return services.filter((service) => {
    const searchable = [
      service.name,
      service.containerName,
      service.dockerImage,
      service.description,
      service.applicationUrl,
      service.internalUrl,
      service.configPath,
      service.dataPath,
      service.network,
      service.notes,
      service.hostId ? hostNames.get(service.hostId) : '',
      ...service.ports.flatMap((port) => [
        port.hostPort?.toString(),
        port.containerPort?.toString(),
        port.description,
      ]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return (
      (!query || searchable.includes(query)) &&
      (filters.status === 'all' || service.status === filters.status) &&
      (filters.hostId === 'all' || service.hostId === filters.hostId) &&
      (filters.network === 'all' || service.network === filters.network) &&
      (filters.exposure === 'all' || service.exposure === filters.exposure)
    )
  })
}

export function createService(name: string): Service {
  const timestamp = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    containerName: '',
    dockerImage: '',
    description: '',
    applicationUrl: '',
    status: 'active',
    internalUrl: '',
    ports: [],
    configPath: '',
    dataPath: '',
    network: '',
    exposure: 'unknown',
    dependencyIds: [],
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}
