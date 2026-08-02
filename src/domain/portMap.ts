import { portProtocolsOverlap } from './serviceUtils'
import type { Host, Service, ServicePort } from './types'

export const UNASSIGNED_HOST_FILTER = 'unassigned'

export interface PortAssignment {
  id: string
  serviceId: string
  serviceName: string
  serviceStatus: Service['status']
  containerName: string
  dockerImage: string
  hostId?: string
  hostName: string
  hostPort?: number
  containerPort?: number
  protocol: ServicePort['protocol']
  conflict: boolean
  conflictingServiceNames: string[]
  incomplete: boolean
}

export interface PortHostGroup {
  id: string
  name: string
  assignments: PortAssignment[]
}

interface PortMapOptions {
  query?: string
  hostFilter?: string
}

export function derivePortMap(
  services: Service[],
  hosts: Host[],
  { query = '', hostFilter = 'all' }: PortMapOptions = {},
): PortHostGroup[] {
  const hostNames = new Map(hosts.map((host) => [host.id, host.name]))
  const assignments: PortAssignment[] = services.flatMap((service) =>
    service.ports.map((port, portIndex) => ({
      id: `${service.id}:${portIndex}`,
      serviceId: service.id,
      serviceName: service.name,
      serviceStatus: service.status,
      containerName: service.containerName,
      dockerImage: service.dockerImage,
      hostId: service.hostId,
      hostName: service.hostId ? (hostNames.get(service.hostId) ?? 'Unknown host') : 'Unassigned host',
      hostPort: port.hostPort,
      containerPort: port.containerPort,
      protocol: port.protocol,
      conflict: false,
      conflictingServiceNames: [],
      incomplete:
        !service.hostId ||
        port.hostPort === undefined ||
        port.containerPort === undefined ||
        port.protocol === 'unknown',
    })),
  )

  assignments.forEach((assignment, index) => {
    assignments.slice(index + 1).forEach((candidate) => {
      if (
        assignment.hostId &&
        assignment.hostId === candidate.hostId &&
        assignment.hostPort !== undefined &&
        assignment.hostPort === candidate.hostPort &&
        portProtocolsOverlap(assignment.protocol, candidate.protocol)
      ) {
        assignment.conflict = true
        candidate.conflict = true
        if (
          assignment.serviceId !== candidate.serviceId &&
          !assignment.conflictingServiceNames.includes(candidate.serviceName)
        ) {
          assignment.conflictingServiceNames.push(candidate.serviceName)
        }
        if (
          candidate.serviceId !== assignment.serviceId &&
          !candidate.conflictingServiceNames.includes(assignment.serviceName)
        ) {
          candidate.conflictingServiceNames.push(assignment.serviceName)
        }
      }
    })
  })

  const normalizedQuery = query.trim().toLowerCase()
  const visible = assignments.filter((assignment) => {
    const matchesHost =
      hostFilter === 'all' ||
      (hostFilter === UNASSIGNED_HOST_FILTER
        ? !assignment.hostId
        : assignment.hostId === hostFilter)
    const searchable = [
      assignment.serviceName,
      assignment.containerName,
      assignment.dockerImage,
      assignment.hostName,
      assignment.hostPort?.toString(),
      assignment.containerPort?.toString(),
      assignment.protocol,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesHost && (!normalizedQuery || searchable.includes(normalizedQuery))
  })

  const groups = new Map<string, PortHostGroup>()
  visible.forEach((assignment) => {
    const id = assignment.hostId ?? UNASSIGNED_HOST_FILTER
    const group = groups.get(id) ?? { id, name: assignment.hostName, assignments: [] }
    group.assignments.push(assignment)
    groups.set(id, group)
  })

  return [...groups.values()]
    .map((group) => ({
      ...group,
      assignments: group.assignments.sort(
        (left, right) =>
          (left.hostPort ?? Number.POSITIVE_INFINITY) -
            (right.hostPort ?? Number.POSITIVE_INFINITY) ||
          left.serviceName.localeCompare(right.serviceName) ||
          left.id.localeCompare(right.id),
      ),
    }))
    .sort((left, right) => {
      if (left.id === UNASSIGNED_HOST_FILTER) return 1
      if (right.id === UNASSIGNED_HOST_FILTER) return -1
      return left.name.localeCompare(right.name)
    })
}
