import fs from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import type { StackMapDatabase } from './database.js'
import { registerInventoryApi, sendApiError } from './inventory-api.js'
import { SqliteInventoryRepository } from './repository.js'
import { applicationVersion } from './version.js'

export interface BuildAppOptions {
  database: StackMapDatabase
  staticRoot: string
  logger?: boolean
}

function isApiRequest(url: string): boolean {
  return url === '/api' || url.startsWith('/api/')
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false })
  app.setErrorHandler(async (error, request, reply) => {
    if (isApiRequest(request.url)) {
      return sendApiError(error, request, reply)
    }
    return reply.send(error)
  })
  const inventoryRepository = new SqliteInventoryRepository(options.database.connection)

  app.addHook('onSend', async (request, reply, payload) => {
    reply.headers({
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      'cache-control': request.url.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
    })
    return payload
  })

  app.get('/health', async (_request, reply) => {
    try {
      options.database.connection.prepare('SELECT 1').get()
      return reply.send({
        status: 'ok',
        applicationVersion,
        databaseSchemaVersion: options.database.schemaVersion(),
        datastoreAuthority: 'sqlite',
      })
    } catch {
      return reply.code(503).send({
        status: 'unavailable',
        applicationVersion,
        databaseSchemaVersion: null,
        datastoreAuthority: 'sqlite',
      })
    }
  })
  app.get('/api/v1/meta', async () => ({
    application: 'stackmap',
    datastoreAuthority: 'sqlite',
    installationId: options.database.installationId(),
    schemaVersion: options.database.schemaVersion(),
    inventoryRevision: inventoryRepository.inventoryRevision(),
  }))
  registerInventoryApi(app, inventoryRepository)

  const staticAvailable = fs.existsSync(path.join(options.staticRoot, 'index.html'))
  if (staticAvailable) {
    await app.register(fastifyStatic, { root: options.staticRoot, wildcard: false })
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (isApiRequest(request.url)) {
      return reply.code(404).send({
        error: {
          code: 'API_ROUTE_NOT_FOUND',
          message: 'The requested API route was not found.',
          requestId: request.id,
        },
      })
    }
    if (staticAvailable && request.method === 'GET') return reply.sendFile('index.html')
    return reply.code(404).send({ message: 'Route not found' })
  })

  app.addHook('onClose', async () => options.database.checkpointAndClose())
  return app
}
