import { describe, expect, it } from 'vitest'
import { createService } from '../domain/serviceUtils'
import { createExport, parseImport } from './backup'

describe('JSON import and export', () => {
  it('creates the documented export shape', () => {
    const data = { services: [createService('Jellyfin')], hosts: [] }
    const exported = createExport(data, '2026-07-28T12:00:00.000Z')

    expect(exported).toEqual({
      schemaVersion: 1,
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
