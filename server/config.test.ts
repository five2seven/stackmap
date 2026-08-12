// @vitest-environment node
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('uses the production database default', () => {
    expect(loadConfig({ NODE_ENV: 'production' }, 'C:\\workspace').databasePath).toBe(
      '/config/stackmap.db',
    )
  })

  it('uses a repository-local development database and accepts overrides', () => {
    expect(loadConfig({}, 'C:\\workspace').databasePath).toBe(
      path.join('C:\\workspace', '.data', 'stackmap.db'),
    )
    expect(loadConfig({ STACKMAP_DB_PATH: ':memory:', PORT: '9000' }).port).toBe(9000)
  })

  it('rejects invalid ports', () => {
    expect(() => loadConfig({ PORT: 'nope' })).toThrow(/PORT/)
  })

  it('disables Portainer import when unset and accepts only safe HTTPS configuration', () => {
    expect(loadConfig({}).portainerUrl).toBeUndefined()
    expect(loadConfig({ STACKMAP_PORTAINER_URL: 'https://portainer.example/' }).portainerUrl).toBe('https://portainer.example')
    expect(() => loadConfig({ STACKMAP_PORTAINER_URL: 'http://portainer.example' })).toThrow(/HTTPS/)
    expect(() => loadConfig({ STACKMAP_PORTAINER_URL: 'https://user:secret@portainer.example' })).toThrow(/credentials/)
    expect(() => loadConfig({ STACKMAP_PORTAINER_URL: 'not a URL' })).toThrow(/valid HTTPS URL/)
  })
})
