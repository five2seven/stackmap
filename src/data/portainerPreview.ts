import type { Service } from '../domain/types'
import { portProtocolsOverlap } from '../domain/serviceUtils'
import type { PortainerPreview, PortainerServiceCandidate } from './portainerImport'

const DYNAMIC_CONFLICT_CODES = new Set([
  'CONTAINER_NAME_DUPLICATE',
  'HOST_PORT_CONFLICT',
  'DISCOVERED_CONTAINER_NAME_DUPLICATE',
  'DISCOVERED_HOST_PORT_CONFLICT',
])

export function recomputePreviewConflicts(
  preview: PortainerPreview,
  inventoryServices: Service[],
  selectedServiceIds: string[],
): PortainerPreview {
  const selected = new Set(selectedServiceIds)
  const services = preview.services.map((service) => ({
    ...service,
    conflicts: service.conflicts.filter(({ code }) => !DYNAMIC_CONFLICT_CODES.has(code) && !(code === 'NETWORK_SELECTION_REQUIRED' && service.network)),
  }))

  for (const service of services) addInventoryConflicts(service, inventoryServices)
  services.forEach((service, index) => {
    if (!selected.has(service.id)) return
    for (const candidate of services.slice(index + 1)) {
      if (!selected.has(candidate.id) || candidate.hostId !== service.hostId) continue
      if (candidate.containerName.trim().toLowerCase() === service.containerName.trim().toLowerCase()) {
        service.conflicts.push({ code: 'DISCOVERED_CONTAINER_NAME_DUPLICATE', message: `Also selected as ${candidate.name}.`, blocking: false })
        candidate.conflicts.push({ code: 'DISCOVERED_CONTAINER_NAME_DUPLICATE', message: `Also selected as ${service.name}.`, blocking: false })
      }
      for (const port of service.ports) for (const candidatePort of candidate.ports) {
        if (port.hostPort !== undefined && port.hostPort === candidatePort.hostPort && portProtocolsOverlap(port.protocol, candidatePort.protocol)) {
          service.conflicts.push({ code: 'DISCOVERED_HOST_PORT_CONFLICT', message: `${port.hostPort}/${port.protocol} overlaps ${candidate.name}.`, blocking: false })
          candidate.conflicts.push({ code: 'DISCOVERED_HOST_PORT_CONFLICT', message: `${candidatePort.hostPort}/${candidatePort.protocol} overlaps ${service.name}.`, blocking: false })
        }
      }
    }
  })
  return { ...preview, services }
}

function addInventoryConflicts(candidate: PortainerServiceCandidate, inventoryServices: Service[]) {
  const sameHost = inventoryServices.filter(({ hostId }) => hostId === candidate.hostId)
  const duplicateNames = sameHost.filter((service) =>
    service.status !== 'retired' && service.containerName.trim() &&
    service.containerName.trim().toLowerCase() === candidate.containerName.trim().toLowerCase(),
  )
  if (duplicateNames.length) {
    candidate.conflicts.push({
      code: 'CONTAINER_NAME_DUPLICATE',
      message: `Container name matches ${duplicateNames.map(({ name }) => name).join(', ')} on the selected host.`,
      blocking: false,
    })
  }
  for (const port of candidate.ports) for (const existing of sameHost) for (const existingPort of existing.ports) {
    if (port.hostPort !== undefined && port.hostPort === existingPort.hostPort && portProtocolsOverlap(port.protocol, existingPort.protocol)) {
      candidate.conflicts.push({ code: 'HOST_PORT_CONFLICT', message: `${port.hostPort}/${port.protocol} overlaps ${existing.name} on the selected host.`, blocking: false })
    }
  }
}
