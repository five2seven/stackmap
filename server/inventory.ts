export const serviceStatuses = ['active', 'planned', 'paused', 'retired'] as const
export const exposures = ['local', 'vpn', 'reverse-proxy', 'public', 'unknown'] as const
export const hostTypes = [
  'physical',
  'virtual-machine',
  'container-host',
  'nas',
  'other',
  'unknown',
] as const
export const portProtocols = ['tcp', 'udp', 'both', 'unknown'] as const

export type ServiceStatus = (typeof serviceStatuses)[number]
export type Exposure = (typeof exposures)[number]
export type HostType = (typeof hostTypes)[number]
export type PortProtocol = (typeof portProtocols)[number]

export interface InventoryHost {
  id: string
  name: string
  type: HostType
  ipAddress: string
  operatingSystem: string
  notes: string
  revision: number
  createdAt: string
  updatedAt: string
}

export interface InventoryPort {
  id: string
  hostPort?: number
  containerPort?: number
  protocol: PortProtocol
  description: string
}

export interface InventoryPath {
  id: string
  hostPath: string
  containerPath: string
  purpose: string
  readOnly: boolean
}

export interface InventoryService {
  id: string
  name: string
  containerName: string
  dockerImage: string
  description: string
  applicationUrl: string
  status: ServiceStatus
  hostId?: string
  internalUrl: string
  ports: InventoryPort[]
  paths: InventoryPath[]
  network: string
  exposure: Exposure
  dependencyIds: string[]
  notes: string
  revision: number
  createdAt: string
  updatedAt: string
}

export type NewInventoryHost = Omit<InventoryHost, 'revision'>
export type NewInventoryService = Omit<InventoryService, 'revision'>
