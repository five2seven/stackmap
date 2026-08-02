import { describe, expect, it } from 'vitest'
import { derivePortMap, UNASSIGNED_HOST_FILTER } from './portMap'
import { createService } from './serviceUtils'
import type { Host, Service, ServicePort } from './types'

const timestamp = '2026-08-02T12:00:00.000Z'
const hosts: Host[] = [
  { id: 'alpha', name: 'Alpha host', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
  { id: 'beta', name: 'Beta host', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
]

function service(id: string, hostId: string | undefined, ports: ServicePort[], details: Partial<Service> = {}): Service {
  return { ...createService(id), id, name: id, hostId, ports, ...details }
}

describe('derived Port Map', () => {
  it('groups by host, keeps multiple mappings, and places unassigned services last', () => {
    const groups = derivePortMap([
      service('Multi', 'alpha', [
        { hostPort: 9000, containerPort: 90, protocol: 'tcp', description: '' },
        { hostPort: 8000, containerPort: 80, protocol: 'tcp', description: '' },
      ]),
      service('Loose', undefined, [{ hostPort: 7000, protocol: 'udp', description: '' }]),
    ], hosts)

    expect(groups.map((group) => group.name)).toEqual(['Alpha host', 'Unassigned host'])
    expect(groups[0].assignments.map((assignment) => assignment.hostPort)).toEqual([8000, 9000])
    expect(groups[1].id).toBe(UNASSIGNED_HOST_FILTER)
  })

  it('sorts valid host ports numerically, incomplete ports last, then by service name', () => {
    const assignments = derivePortMap([
      service('Zulu', 'alpha', [{ containerPort: 1, protocol: 'tcp', description: '' }]),
      service('Beta', 'alpha', [{ hostPort: 100, protocol: 'tcp', description: '' }]),
      service('Alpha', 'alpha', [{ hostPort: 100, containerPort: 2, protocol: 'tcp', description: '' }]),
      service('Charlie', 'alpha', [{ hostPort: 20, containerPort: 3, protocol: 'tcp', description: '' }]),
    ], hosts)[0].assignments
    expect(assignments.map((assignment) => assignment.serviceName)).toEqual(['Charlie', 'Alpha', 'Beta', 'Zulu'])
  })

  it('records same-host conflict relationships using current protocol semantics', () => {
    const assignments = derivePortMap([
      service('TCP', 'alpha', [{ hostPort: 80, protocol: 'tcp', description: '' }]),
      service('Both', 'alpha', [{ hostPort: 80, protocol: 'both', description: '' }]),
      service('UDP', 'alpha', [{ hostPort: 81, protocol: 'udp', description: '' }]),
      service('Unknown one', 'alpha', [{ hostPort: 82, protocol: 'unknown', description: '' }]),
      service('Unknown two', 'alpha', [{ hostPort: 82, protocol: 'unknown', description: '' }]),
      service('Other host', 'beta', [{ hostPort: 80, protocol: 'tcp', description: '' }]),
    ], hosts).flatMap((group) => group.assignments)

    expect(assignments.find((item) => item.serviceName === 'TCP')).toMatchObject({ conflict: true, conflictingServiceNames: ['Both'] })
    expect(assignments.find((item) => item.serviceName === 'UDP')?.conflict).toBe(false)
    expect(assignments.find((item) => item.serviceName === 'Unknown one')?.conflict).toBe(true)
    expect(assignments.find((item) => item.serviceName === 'Other host')?.conflict).toBe(false)
  })

  it('keeps same-service conflicts while listing each different service only once', () => {
    const assignments = derivePortMap([
      service('Primary', 'alpha', [
        { hostPort: 8080, protocol: 'tcp', description: '' },
        { hostPort: 8080, protocol: 'both', description: '' },
      ]),
      service('Other', 'alpha', [
        { hostPort: 8080, protocol: 'tcp', description: '' },
        { hostPort: 8080, protocol: 'both', description: '' },
      ]),
    ], hosts)[0].assignments

    const primaryAssignments = assignments.filter((assignment) => assignment.serviceName === 'Primary')
    expect(primaryAssignments.every((assignment) => assignment.conflict)).toBe(true)
    expect(primaryAssignments.map((assignment) => assignment.conflictingServiceNames)).toEqual([
      ['Other'],
      ['Other'],
    ])
    expect(assignments.find((assignment) => assignment.serviceName === 'Other')?.conflictingServiceNames).toEqual(['Primary'])
  })

  it.each([
    ['service name', 'media', 'Media'],
    ['host name', 'alpha host', 'Media'],
    ['host port', '8080', 'Media'],
    ['container port', '3000', 'Media'],
    ['protocol', 'tcp', 'Media'],
    ['container name', 'media-app', 'Media'],
    ['Docker image', 'example/media', 'Media'],
  ])('searches by %s', (_field, query, expected) => {
    const result = derivePortMap([
      service('Media', 'alpha', [{ hostPort: 8080, containerPort: 3000, protocol: 'tcp', description: '' }], {
        containerName: 'media-app', dockerImage: 'example/media:1',
      }),
      service('Other', 'beta', [{ hostPort: 9000, containerPort: 9000, protocol: 'udp', description: '' }]),
    ], hosts, { query })
    expect(result.flatMap((group) => group.assignments).map((item) => item.serviceName)).toEqual([expected])
  })

  it('filters assigned and unassigned host groups', () => {
    const services = [
      service('Assigned', 'alpha', [{ hostPort: 1, protocol: 'tcp', description: '' }]),
      service('Loose', undefined, [{ hostPort: 2, protocol: 'tcp', description: '' }]),
    ]
    expect(derivePortMap(services, hosts, { hostFilter: 'alpha' }).map((group) => group.name)).toEqual(['Alpha host'])
    expect(derivePortMap(services, hosts, { hostFilter: UNASSIGNED_HOST_FILTER }).map((group) => group.name)).toEqual(['Unassigned host'])
  })
})
