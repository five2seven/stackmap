import { describe, expect, it } from 'vitest'
import { createService } from '../domain/serviceUtils'
import { createExport, parseImport } from './backup'

describe('JSON import and export', () => {
  it('creates the documented export shape', () => {
    const data = { services: [createService('Jellyfin')], hosts: [] }
    const exported = createExport(data, '2026-07-28T12:00:00.000Z')

    expect(exported).toEqual({
      schemaVersion: 3,
      exportedAt: '2026-07-28T12:00:00.000Z',
      services: data.services,
      hosts: [],
    })
  })

  it('accepts a valid import', () => {
    const exported = createExport(
      { services: [createService('Jellyfin')], hosts: [] },
      '2026-07-28T12:00:00.000Z',
    )
    expect(parseImport(JSON.stringify(exported))).toEqual(exported)
  })

  it('migrates a version 1 backup without mutating it', () => {
    const current = createService('Legacy service')
    const legacyService: Record<string, unknown> = { ...current }
    delete legacyService.containerName
    delete legacyService.dockerImage
    delete legacyService.description
    delete legacyService.applicationUrl
    delete legacyService.paths
    legacyService.configPath = '/legacy/config'
    legacyService.dataPath = '/legacy/data'
    const legacy = {
      schemaVersion: 1,
      exportedAt: '2026-07-28T12:00:00.000Z',
      services: [legacyService],
      hosts: [],
    }

    const imported = parseImport(JSON.stringify(legacy))
    expect(imported.schemaVersion).toBe(3)
    expect(imported.services[0]).toMatchObject({
      id: current.id,
      containerName: '', dockerImage: '', description: '', applicationUrl: '',
      paths: [
        { id: `${current.id}-configuration-path`, hostPath: '/legacy/config', containerPath: '', purpose: 'Configuration', readOnly: false },
        { id: `${current.id}-data-path`, hostPath: '/legacy/data', containerPath: '', purpose: 'Data', readOnly: false },
      ],
    })
    expect(imported.services[0]).not.toHaveProperty('configPath')
    expect(imported.services[0]).not.toHaveProperty('dataPath')
    expect(legacy.services[0]).not.toHaveProperty('containerName')
  })

  it('migrates a version 2 backup to paths without mutating the uploaded object', () => {
    const current = createService('Schema two')
    const legacyService: Record<string, unknown> = { ...current, configPath: '/config', dataPath: '' }
    delete legacyService.paths
    const legacy = { schemaVersion: 2, exportedAt: '2026-07-28T12:00:00.000Z', services: [legacyService], hosts: [] }
    const imported = parseImport(JSON.stringify(legacy))
    expect(imported.schemaVersion).toBe(3)
    expect(imported.services[0].paths).toEqual([
      { id: `${current.id}-configuration-path`, hostPath: '/config', containerPath: '', purpose: 'Configuration', readOnly: false },
    ])
    expect(legacy.services[0]).toHaveProperty('configPath')
    expect(legacy.services[0]).not.toHaveProperty('paths')
  })

  it('preserves identity fields in a current-version round trip', () => {
    const service = {
      ...createService('Current service'),
      containerName: 'current',
      dockerImage: 'example/current:1',
      description: 'Current description',
      applicationUrl: 'https://current.example.test',
      paths: [{ id: 'config', hostPath: '/srv/config', containerPath: '/config', purpose: 'Configuration', readOnly: true }],
    }
    const exported = createExport({ services: [service], hosts: [] }, '2026-07-28T12:00:00.000Z')
    expect(parseImport(JSON.stringify(exported)).services[0]).toEqual(service)
  })

  it.each(['containerName', 'dockerImage', 'description', 'applicationUrl'] as const)(
    'rejects a non-string %s in the current schema',
    (field) => {
      const service = { ...createService('Invalid field'), [field]: 42 }
      expect(() =>
        parseImport(
          JSON.stringify(createExport({ services: [service as never], hosts: [] })),
        ),
      ).toThrow('One or more service records are invalid.')
    },
  )

  it('rejects malformed and duplicate current path mappings', () => {
    const malformed = { ...createService('Malformed'), paths: [{ id: 'path' }] }
    expect(() => parseImport(JSON.stringify(createExport({ services: [malformed as never], hosts: [] })))).toThrow('malformed path mappings')

    const path = { id: 'same', hostPath: '/host', containerPath: '/container', purpose: 'Data', readOnly: false }
    const duplicate = { ...createService('Duplicate paths'), paths: [path, { ...path }] }
    expect(() => parseImport(JSON.stringify(createExport({ services: [duplicate], hosts: [] })))).toThrow('duplicate path-mapping IDs')
  })

  it('preserves host and dependency reference validation', () => {
    const orphanedHost = { ...createService('Orphaned host'), hostId: 'missing-host' }
    expect(() =>
      parseImport(JSON.stringify(createExport({ services: [orphanedHost], hosts: [] }))),
    ).toThrow('references a host')

    const orphanedDependency = {
      ...createService('Orphaned dependency'),
      dependencyIds: ['missing-service'],
    }
    expect(() =>
      parseImport(JSON.stringify(createExport({ services: [orphanedDependency], hosts: [] }))),
    ).toThrow('dependency is not included')
  })

  it.each([
    ['malformed JSON', '{'],
    [
      'an incompatible schema',
      JSON.stringify({ schemaVersion: 99, exportedAt: new Date().toISOString(), services: [], hosts: [] }),
    ],
    [
      'invalid service data',
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        services: [{ id: 'broken' }],
        hosts: [],
      }),
    ],
    [
      'invalid timestamps',
      JSON.stringify({
        ...createExport(
          { services: [{ ...createService('Bad time'), updatedAt: 'not-a-date' }], hosts: [] },
          '2026-07-28T12:00:00.000Z',
        ),
      }),
    ],
    [
      'a self dependency',
      (() => {
        const service = createService('Self reference')
        return JSON.stringify(
          createExport(
            { services: [{ ...service, dependencyIds: [service.id] }], hosts: [] },
            '2026-07-28T12:00:00.000Z',
          ),
        )
      })(),
    ],
    [
      'duplicate dependency IDs',
      (() => {
        const dependency = createService('Database')
        const service = { ...createService('App'), dependencyIds: [dependency.id, dependency.id] }
        return JSON.stringify(
          createExport(
            { services: [dependency, service], hosts: [] },
            '2026-07-28T12:00:00.000Z',
          ),
        )
      })(),
    ],
  ])('rejects %s', (_label, input) => {
    expect(() => parseImport(input)).toThrow()
  })
})
