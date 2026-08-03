import fs from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import type { StackMapDatabase } from './database.js'

export interface BuildAppOptions {
  database: StackMapDatabase
  staticRoot: string
  logger?: boolean
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
    options.database.connection.prepare('SELECT 1').get()
    return reply.send({ status: 'ok' })
  })
  app.get('/api/v1/meta', async () => ({
    application: 'stackmap',
    datastoreAuthority: 'indexeddb',
    installationId: options.database.installationId(),
    schemaVersion: options.database.schemaVersion(),
  }))

  if (fs.existsSync(path.join(options.staticRoot, 'index.html'))) {
    await app.register(fastifyStatic, { root: options.staticRoot, wildcard: false })
    app.get('/*', async (request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not Found' })
      return reply.sendFile('index.html')
    })
  }

  app.addHook('onClose', async () => options.database.close())
  return app
}
