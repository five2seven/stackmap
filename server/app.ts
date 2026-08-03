import fs from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import type { StackMapDatabase } from './database.js'
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
        datastoreAuthority: 'indexeddb',
      })
    } catch {
      return reply.code(503).send({
        status: 'unavailable',
        applicationVersion,
        databaseSchemaVersion: null,
        datastoreAuthority: 'indexeddb',
      })
    }
  })
  app.get('/api/v1/meta', async () => ({
    application: 'stackmap',
    datastoreAuthority: 'indexeddb',
    installationId: options.database.installationId(),
    schemaVersion: options.database.schemaVersion(),
  }))

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

  app.setErrorHandler(async (error, request, reply) => {
    if (isApiRequest(request.url)) {
      request.log.error({ err: error }, 'unexpected API request failure')
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The request could not be completed.',
          requestId: request.id,
        },
      })
    }
    return reply.send(error)
  })

  app.addHook('onClose', async () => options.database.checkpointAndClose())
  return app
}
