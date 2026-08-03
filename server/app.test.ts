// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { openDatabase } from './database.js'

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

async function fixture() {
  const staticRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stackmap-static-'))
  temporaryDirectories.push(staticRoot)
  fs.writeFileSync(path.join(staticRoot, 'index.html'), '<h1>StackMap shell</h1>')
  fs.mkdirSync(path.join(staticRoot, 'assets'))
  fs.writeFileSync(path.join(staticRoot, 'assets', 'asset.txt'), 'asset')
  const app = await buildApp({ database: openDatabase(':memory:'), staticRoot })
  await app.ready()
  return app
}

describe('server application', () => {
  it('reports health and non-inventory metadata', async () => {
    const app = await fixture()
    expect((await app.inject('/health')).json()).toEqual({ status: 'ok' })
    expect((await app.inject('/api/v1/meta')).json()).toMatchObject({
      application: 'stackmap',
      datastoreAuthority: 'indexeddb',
      schemaVersion: 1,
    })
    await app.close()
  })

  it('serves built assets and falls back to the SPA without masking API misses', async () => {
    const app = await fixture()
    const asset = await app.inject('/assets/asset.txt')
    const fallback = await app.inject('/hosts/example')
    expect(asset.body).toBe('asset')
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(fallback.body).toContain('StackMap shell')
    expect(fallback.headers['cache-control']).toBe('no-store')
    expect(fallback.headers['x-content-type-options']).toBe('nosniff')
    expect((await app.inject('/api/v1/missing')).statusCode).toBe(404)
    await app.close()
  })

  it('closes the database during graceful application shutdown', async () => {
    const database = openDatabase(':memory:')
    const app = await buildApp({ database, staticRoot: 'missing' })
    await app.close()
    expect(() => database.connection.prepare('SELECT 1')).toThrow(/not open|closed/)
  })
})
