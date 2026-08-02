import { getPathWarnings, isAbsolutePath, type PathStyle } from './serviceUtils'
import type { Host, Service } from './types'

export const UNASSIGNED_PATH_HOST_FILTER = 'unassigned'
export const BLANK_HOST_PATH_GROUP = 'blank-host-path'

export interface PathAssignment {
  id: string
  serviceId: string
  serviceName: string
  serviceStatus: Service['status']
  containerName: string
  dockerImage: string
  hostId?: string
  hostName: string
  pathMappingId: string
  hostPath: string
  containerPath: string
  purpose: string
  readOnly: boolean
  incomplete: boolean
  incompletePair: boolean
  hostPathStyle?: PathStyle
  containerPathStyle?: PathStyle
  sharedHostPath: boolean
  otherServiceNames: string[]
  mixedHostPaths: boolean
  mixedContainerPaths: boolean
  missingConfiguration: boolean
}

export interface PathGroup {
  id: string
  name: string
  assignments: PathAssignment[]
}

export interface PathHostGroup {
  id: string
  name: string
  pathGroups: PathGroup[]
}

interface PathMapOptions {
  query?: string
  hostFilter?: string
}

function pathStyle(path: string): PathStyle | undefined {
  return path.trim() ? (isAbsolutePath(path) ? 'absolute' : 'relative') : undefined
}

function normalizedHostPath(path: string) {
  return path.trim().toLowerCase()
}

export function derivePathMap(
  services: Service[],
  hosts: Host[],
  { query = '', hostFilter = 'all' }: PathMapOptions = {},
): PathHostGroup[] {
  const hostNames = new Map(hosts.map((host) => [host.id, host.name]))
  const assignments: PathAssignment[] = services.flatMap((service) => {
    const warnings = getPathWarnings(service.paths)
    return service.paths.map((path) => ({
      id: `${service.id}:${path.id}`,
      serviceId: service.id,
      serviceName: service.name,
      serviceStatus: service.status,
      containerName: service.containerName,
      dockerImage: service.dockerImage,
      hostId: service.hostId,
      hostName: service.hostId ? (hostNames.get(service.hostId) ?? 'Unknown host') : 'Unassigned host',
      pathMappingId: path.id,
      hostPath: path.hostPath,
      containerPath: path.containerPath,
      purpose: path.purpose,
      readOnly: path.readOnly,
      incomplete: !path.hostPath.trim() || !path.containerPath.trim(),
      incompletePair: warnings.incompleteMappingIds.includes(path.id),
      hostPathStyle: pathStyle(path.hostPath),
      containerPathStyle: pathStyle(path.containerPath),
      sharedHostPath: false,
      otherServiceNames: [],
      mixedHostPaths: warnings.mixedHostPaths,
      mixedContainerPaths: warnings.mixedContainerPaths,
      missingConfiguration: warnings.missingConfiguration,
    }))
  })

  const sharedAssignments = new Map<string, PathAssignment[]>()
  assignments.forEach((assignment) => {
    const normalizedPath = normalizedHostPath(assignment.hostPath)
    if (!assignment.hostId || !normalizedPath) return
    const key = `${assignment.hostId}\u0000${normalizedPath}`
    sharedAssignments.set(key, [...(sharedAssignments.get(key) ?? []), assignment])
  })
  sharedAssignments.forEach((matching) => {
    matching.forEach((assignment) => {
      const otherNames = matching
        .filter((candidate) => candidate.serviceId !== assignment.serviceId)
        .map((candidate) => candidate.serviceName)
      assignment.otherServiceNames = [...new Set(otherNames)].sort((left, right) => left.localeCompare(right))
      assignment.sharedHostPath = assignment.otherServiceNames.length > 0
    })
  })

  const normalizedQuery = query.trim().toLowerCase()
  const visible = assignments.filter((assignment) => {
    const matchesHost =
      hostFilter === 'all' ||
      (hostFilter === UNASSIGNED_PATH_HOST_FILTER
        ? !assignment.hostId
        : assignment.hostId === hostFilter)
    const searchable = [
      assignment.serviceName,
      assignment.containerName,
      assignment.dockerImage,
      assignment.hostName,
      assignment.hostPath,
      assignment.containerPath,
      assignment.purpose,
      assignment.readOnly ? 'read-only' : 'writable',
    ].join(' ').toLowerCase()
    return matchesHost && (!normalizedQuery || searchable.includes(normalizedQuery))
  })

  const hostGroups = new Map<string, PathHostGroup>()
  visible.forEach((assignment) => {
    const hostId = assignment.hostId ?? UNASSIGNED_PATH_HOST_FILTER
    const hostGroup = hostGroups.get(hostId) ?? {
      id: hostId,
      name: assignment.hostName,
      pathGroups: [],
    }
    let pathGroup = hostGroup.pathGroups.find(
      (group) => group.id === (normalizedHostPath(assignment.hostPath) || BLANK_HOST_PATH_GROUP),
    )
    if (!pathGroup) {
      pathGroup = {
        id: normalizedHostPath(assignment.hostPath) || BLANK_HOST_PATH_GROUP,
        name: assignment.hostPath.trim() || 'Host path missing',
        assignments: [],
      }
      hostGroup.pathGroups.push(pathGroup)
    }
    pathGroup.assignments.push(assignment)
    hostGroups.set(hostId, hostGroup)
  })

  return [...hostGroups.values()]
    .map((hostGroup) => ({
      ...hostGroup,
      pathGroups: hostGroup.pathGroups
        .map((group) => ({
          ...group,
          assignments: group.assignments.sort(
            (left, right) =>
              left.serviceName.localeCompare(right.serviceName, undefined, { sensitivity: 'base' }) ||
              left.containerPath.localeCompare(right.containerPath, undefined, { sensitivity: 'base' }) ||
              left.id.localeCompare(right.id),
          ),
        }))
        .sort((left, right) => {
          if (left.id === BLANK_HOST_PATH_GROUP) return 1
          if (right.id === BLANK_HOST_PATH_GROUP) return -1
          return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
        }),
    }))
    .sort((left, right) => {
      if (left.id === UNASSIGNED_PATH_HOST_FILTER) return 1
      if (right.id === UNASSIGNED_PATH_HOST_FILTER) return -1
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    })
}
