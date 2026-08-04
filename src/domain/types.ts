export const SERVICE_STATUSES = ['active', 'planned', 'paused', 'retired'] as const
export const EXPOSURES = ['local', 'vpn', 'reverse-proxy', 'public', 'unknown'] as const
export const HOST_TYPES = [
  'physical',
  'virtual-machine',
  'container-host',
  'nas',
  'other',
  'unknown',
] as const
export const PORT_PROTOCOLS = ['tcp', 'udp', 'both', 'unknown'] as const

export type ServiceStatus = (typeof SERVICE_STATUSES)[number]
export type Exposure = (typeof EXPOSURES)[number]
export type HostType = (typeof HOST_TYPES)[number]
export type PortProtocol = (typeof PORT_PROTOCOLS)[number]

export interface ServicePort {
  id?: string
  hostPort?: number
  containerPort?: number
  protocol: PortProtocol
  description: string
}

export interface PathMapping {
  id: string
  hostPath: string
  containerPath: string
  purpose: string
  readOnly: boolean
}

export interface Service {
  id: string
  name: string
  containerName: string
  dockerImage: string
  description: string
  applicationUrl: string
  status: ServiceStatus
  hostId?: string
  internalUrl: string
  ports: ServicePort[]
  paths: PathMapping[]
  network: string
  exposure: Exposure
  dependencyIds: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Host {
  id: string
  name: string
  type: HostType
  ipAddress: string
  operatingSystem: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface StackMapData {
  services: Service[]
  hosts: Host[]
}

export interface StackMapExport extends StackMapData {
  schemaVersion: number
  exportedAt: string
}

export interface ServiceFilters {
  query: string
  status: ServiceStatus | 'all'
  hostId: string | 'all'
  network: string | 'all'
  exposure: Exposure | 'all'
}
