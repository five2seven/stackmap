import { describe, expect, it } from 'vitest'
import { migrateLegacyPaths, normalizePaths } from './pathMappings'

describe('path mappings', () => {
  it('migrates zero, one, and multiple legacy paths with stable unique IDs', () => {
    expect(migrateLegacyPaths('service', {})).toEqual([])
    const one = migrateLegacyPaths('service', { configPath: '/config' })
    expect(one).toEqual([{ id: 'service-configuration-path', hostPath: '/config', containerPath: '', purpose: 'Configuration', readOnly: false }])
    const both = migrateLegacyPaths('service', { configPath: '/config', dataPath: '/data' })
    expect(new Set(both.map((path) => path.id)).size).toBe(2)
    expect(migrateLegacyPaths('service', { configPath: '/config', dataPath: '/data' })).toEqual(both)
  })

  it('trims mappings and removes completely blank rows', () => {
    expect(normalizePaths([
      { id: 'blank', hostPath: ' ', containerPath: '', purpose: '', readOnly: true },
      { id: 'kept', hostPath: ' /host ', containerPath: ' /container ', purpose: ' Data ', readOnly: true },
    ])).toEqual([{ id: 'kept', hostPath: '/host', containerPath: '/container', purpose: 'Data', readOnly: true }])
  })
})
