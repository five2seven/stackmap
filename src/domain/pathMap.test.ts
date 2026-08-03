import { describe, expect, it } from 'vitest'
import { BLANK_HOST_PATH_GROUP, derivePathMap, UNASSIGNED_PATH_HOST_FILTER } from './pathMap'
import { createService } from './serviceUtils'
import type { Host, PathMapping, Service } from './types'

const timestamp = '2026-08-02T12:00:00.000Z'
const hosts: Host[] = [
  { id: 'alpha', name: 'Alpha host', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
  { id: 'beta', name: 'Beta host', type: 'nas', ipAddress: '', operatingSystem: '', notes: '', createdAt: timestamp, updatedAt: timestamp },
]

function path(id: string, hostPath: string, containerPath: string, purpose = '', readOnly = false): PathMapping {
  return { id, hostPath, containerPath, purpose, readOnly }
}

function service(id: string, hostId: string | undefined, paths: PathMapping[], details: Partial<Service> = {}): Service {
  return { ...createService(id), id, name: id, hostId, paths, ...details }
}

function assignments(result: ReturnType<typeof derivePathMap>) {
  return result.flatMap((hostGroup) => hostGroup.pathGroups.flatMap((pathGroup) => pathGroup.assignments))
}

describe('derived Path Map', () => {
  it('groups by host and normalized host path while preserving mappings and stored values', () => {
    const result = derivePathMap([
      service('One', 'alpha', [path('1', ' /srv/Data ', '/data'), path('2', '/srv/data', '/other')]),
      service('Loose', undefined, [path('3', '/loose', '/data')]),
    ], hosts)

    expect(result.map((group) => group.name)).toEqual(['Alpha host', 'Unassigned host'])
    expect(result[0].pathGroups).toHaveLength(1)
    expect(result[0].pathGroups[0].assignments.map((item) => item.hostPath)).toEqual([' /srv/Data ', '/srv/data'])
    expect(result[1].id).toBe(UNASSIGNED_PATH_HOST_FILTER)
  })

  it('detects cross-service sharing case-insensitively only on the same assigned host', () => {
    const result = assignments(derivePathMap([
      service('Alpha', 'alpha', [path('a1', '/srv/Data', '/one'), path('a2', '/SRV/DATA ', '/two')]),
      service('Beta', 'alpha', [path('b', ' /srv/data', '/three')]),
      service('Gamma', 'beta', [path('g', '/srv/data', '/four')]),
      service('Loose one', undefined, [path('l1', '/srv/data', '/five')]),
      service('Loose two', undefined, [path('l2', '/srv/data', '/six')]),
    ], hosts))

    expect(result.filter((item) => item.serviceName === 'Alpha').map((item) => item.otherServiceNames)).toEqual([['Beta'], ['Beta']])
    expect(result.find((item) => item.serviceName === 'Beta')).toMatchObject({ sharedHostPath: true, otherServiceNames: ['Alpha'] })
    expect(result.find((item) => item.serviceName === 'Gamma')?.sharedHostPath).toBe(false)
    expect(result.filter((item) => item.serviceName.startsWith('Loose')).every((item) => !item.sharedHostPath)).toBe(true)
  })

  it('deduplicates multiple mappings and names from other services', () => {
    const result = assignments(derivePathMap([
      service('Primary', 'alpha', [path('p', '/shared', '/p')]),
      service('Other', 'alpha', [path('o1', '/shared', '/o1'), path('o2', '/shared', '/o2')]),
      service('Other', 'alpha', [path('o3', '/shared', '/o3')], { id: 'other-2' }),
    ], hosts))
    expect(result.find((item) => item.serviceName === 'Primary')?.otherServiceNames).toEqual(['Other'])
  })

  it('groups blank host paths last and marks incomplete/read-only/path styles', () => {
    const result = derivePathMap([
      service('Mapped', 'alpha', [
        path('z', '/zeta', '/z', '', true),
        path('a', '/Alpha', 'relative', 'Data'),
        path('blank', '  ', '', ''),
      ]),
    ], hosts)
    expect(result[0].pathGroups.map((group) => group.id)).toEqual(['/alpha', '/zeta', BLANK_HOST_PATH_GROUP])
    const values = assignments(result)
    expect(values.find((item) => item.pathMappingId === 'z')).toMatchObject({ readOnly: true, hostPathStyle: 'absolute', containerPathStyle: 'absolute' })
    expect(values.find((item) => item.pathMappingId === 'a')?.containerPathStyle).toBe('relative')
    expect(values.find((item) => item.pathMappingId === 'blank')).toMatchObject({ incomplete: true, hostPathStyle: undefined, containerPathStyle: undefined })
  })

  it('sorts within path groups by service then container path with a stable fallback', () => {
    const group = derivePathMap([
      service('Zulu', 'alpha', [path('z', '/shared', '/a')]),
      service('alpha', 'alpha', [path('2', '/shared', '/z'), path('1', '/shared', '/A')]),
    ], hosts)[0].pathGroups[0]
    expect(group.assignments.map((item) => item.pathMappingId)).toEqual(['1', '2', 'z'])
  })

  it.each([
    ['host path', '/srv/media', 'Read only'],
    ['container path', '/config', 'Writable'],
    ['purpose', 'backups', 'Writable'],
    ['host', 'alpha host', 'Read only'],
    ['read-only text', 'read-only', 'Read only'],
    ['writable text', 'writable', 'Writable'],
    ['service name', 'read only', 'Read only'],
    ['container name', 'write-container', 'Writable'],
    ['Docker image', 'example/write', 'Writable'],
  ])('searches by %s', (_field, query, expected) => {
    const result = assignments(derivePathMap([
      service('Read only', 'alpha', [path('r', '/srv/media', '/data', 'Media', true)]),
      service('Writable', 'beta', [path('w', '/srv/write', '/config', 'Backups')], { containerName: 'write-container', dockerImage: 'example/write:1' }),
    ], hosts, { query }))
    expect(result.map((item) => item.serviceName)).toEqual([expected])
  })

  it('filters assigned and unassigned host groups without mutating input', () => {
    const source = [
      service('Assigned', 'alpha', [path('a', '/a', '/a')]),
      service('Loose', undefined, [path('l', '/l', '/l')]),
    ]
    expect(derivePathMap(source, hosts, { hostFilter: 'alpha' }).map((group) => group.name)).toEqual(['Alpha host'])
    expect(derivePathMap(source, hosts, { hostFilter: UNASSIGNED_PATH_HOST_FILTER }).map((group) => group.name)).toEqual(['Unassigned host'])
    expect(source[0].paths[0].hostPath).toBe('/a')
  })
})
