import { describe, expect, it } from 'vitest'
import type { Service } from '../domain/types'
import type { PortainerPreview, PortainerServiceCandidate } from './portainerImport'
import { recomputePreviewConflicts } from './portainerPreview'

const timestamp = '2026-08-12T00:00:00.000Z'
const candidate = (overrides: Partial<PortainerServiceCandidate> = {}): PortainerServiceCandidate => ({
  environmentId: 1, containerId: 'container', sourceState: 'running', networkOptions: ['default'],
  warnings: [], conflicts: [], alreadyBound: false, id: 'candidate', name: 'Web', containerName: 'web', dockerImage: 'web:1',
  description: '', applicationUrl: '', status: 'active', hostId: 'new-host', internalUrl: '',
  ports: [{ id: 'candidate-port', hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }],
  paths: [], network: 'default', exposure: 'unknown', dependencyIds: [], notes: '',
  createdAt: timestamp, updatedAt: timestamp, ...overrides,
})
const existing = (hostId: string, overrides: Partial<Service> = {}): Service => ({
  id: `existing-${hostId}`, name: `Existing ${hostId}`, containerName: 'web', dockerImage: '', description: '',
  applicationUrl: '', status: 'active', hostId, internalUrl: '',
  ports: [{ id: `port-${hostId}`, hostPort: 8080, containerPort: 80, protocol: 'tcp', description: '' }],
  paths: [], network: '', exposure: 'unknown', dependencyIds: [], notes: '', createdAt: timestamp, updatedAt: timestamp,
  ...overrides,
})
const preview = (service = candidate()): PortainerPreview => ({
  previewToken: 'preview', expectedInventoryRevision: 1, hosts: [], services: [service], existingHosts: [],
})

describe('Portainer preview conflict recomputation', () => {
  it('does not report existing inventory conflicts for a proposed new host', () => {
    const result = recomputePreviewConflicts(preview(), [existing('existing-host')], ['candidate'])
    expect(result.services[0].conflicts).toEqual([])
  })

  it('reports container-name and port conflicts only on the selected existing host', () => {
    const result = recomputePreviewConflicts(preview(candidate({ hostId: 'existing-host' })), [
      existing('existing-host'), existing('other-host'),
    ], ['candidate'])
    expect(result.services[0].conflicts.map(({ code }) => code)).toEqual([
      'CONTAINER_NAME_DUPLICATE', 'HOST_PORT_CONFLICT',
    ])
    expect(result.services[0].conflicts.every(({ message }) => !message.includes('other-host'))).toBe(true)
  })

  it('removes old-host conflicts after the target host changes', () => {
    const inventory = [existing('host-one')]
    const onHostOne = recomputePreviewConflicts(preview(candidate({ hostId: 'host-one' })), inventory, ['candidate'])
    expect(onHostOne.services[0].conflicts).not.toEqual([])
    const onHostTwo = recomputePreviewConflicts({ ...onHostOne, services: [{ ...onHostOne.services[0], hostId: 'host-two' }] }, inventory, ['candidate'])
    expect(onHostTwo.services[0].conflicts).toEqual([])
  })

  it('uses current host-scoped semantics for conflicts between selected candidates', () => {
    const first = candidate({ id: 'first', containerId: 'first' })
    const second = candidate({ id: 'second', containerId: 'second', hostId: 'other-new-host' })
    const differentHosts = recomputePreviewConflicts({ ...preview(first), services: [first, second] }, [], ['first', 'second'])
    expect(differentHosts.services.every(({ conflicts }) => conflicts.length === 0)).toBe(true)
    const sameHost = recomputePreviewConflicts({ ...differentHosts, services: differentHosts.services.map((service) => ({ ...service, hostId: 'one-host' })) }, [], ['first', 'second'])
    expect(sameHost.services.every(({ conflicts }) => conflicts.some(({ code }) => code === 'DISCOVERED_CONTAINER_NAME_DUPLICATE'))).toBe(true)
    expect(sameHost.services.every(({ conflicts }) => conflicts.some(({ code }) => code === 'DISCOVERED_HOST_PORT_CONFLICT'))).toBe(true)
  })
})
