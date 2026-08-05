// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect((await app.inject('/health')).json()).toEqual({
      status: 'ok',
      applicationVersion: '0.0.0',
      databaseSchemaVersion: 3,
      datastoreAuthority: 'sqlite',
    })
    expect((await app.inject('/api/v1/meta')).json()).toMatchObject({
      application: 'stackmap',
      datastoreAuthority: 'sqlite',
      schemaVersion: 3,
    })
    await app.close()
  })

  it('reports unavailable without leaking database errors when readiness fails', async () => {
    const database = openDatabase(':memory:')
    const prepare = vi
      .spyOn(database.connection, 'prepare')
      .mockImplementationOnce(() => {
        throw new Error('SQL failure at C:\\private\\stackmap.db')
      })
    const app = await buildApp({ database, staticRoot: 'missing' })
    const response = await app.inject('/health')
    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      status: 'unavailable',
      applicationVersion: '0.0.0',
      databaseSchemaVersion: null,
      datastoreAuthority: 'sqlite',
    })
    expect(response.body).not.toContain('private')
    prepare.mockRestore()
    await app.close()
  })

  it('serves built assets and falls back to the SPA without masking API misses', async () => {
    const app = await fixture()
    const asset = await app.inject('/assets/asset.txt')
    const fallback = await app.inject('/hosts/example')
    expect(asset.body).toBe('asset')
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect(fallback.body).toContain('StackMap shell')
    expect(fallback.body).not.toContain('indexeddb')
    expect(fallback.headers['cache-control']).toBe('no-store')
    expect(fallback.headers['x-content-type-options']).toBe('nosniff')
    const missingApi = await app.inject('/api/v1/missing')
    expect(missingApi.statusCode).toBe(404)
    expect(missingApi.json()).toEqual({
      error: {
        code: 'API_ROUTE_NOT_FOUND',
        message: 'The requested API route was not found.',
        requestId: expect.any(String),
      },
    })
    await app.close()
  })

  it('returns a safe envelope for unexpected API failures', async () => {
    const database = openDatabase(':memory:')
    database.installationId = () => {
      throw new Error('SELECT secret FROM C:\\private\\stackmap.db')
    }
    const app = await buildApp({ database, staticRoot: 'missing' })
    const response = await app.inject('/api/v1/meta')
    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The request could not be completed.',
        requestId: expect.any(String),
      },
    })
    expect(response.body).not.toMatch(/SELECT|private|stackmap\.db/)
    await app.close()
  })

  it('closes the database during graceful application shutdown', async () => {
    const database = openDatabase(':memory:')
    const pragma = vi.spyOn(database.connection, 'pragma')
    const app = await buildApp({ database, staticRoot: 'missing' })
    await app.close()
    expect(pragma).toHaveBeenCalledWith('wal_checkpoint(TRUNCATE)')
    expect(() => database.connection.prepare('SELECT 1')).toThrow(/not open|closed/)
  })
})
