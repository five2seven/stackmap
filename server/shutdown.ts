import type { FastifyInstance } from 'fastify'

export interface ShutdownOptions {
  app: Pick<FastifyInstance, 'close' | 'log' | 'server'>
  timeoutMs?: number
}

export function createShutdownHandler({ app, timeoutMs = 10_000 }: ShutdownOptions) {
  let shutdownPromise: Promise<void> | undefined

  return (signal: NodeJS.Signals): Promise<void> => {
    shutdownPromise ??= runShutdown(app, signal, timeoutMs)
    return shutdownPromise
  }
}

async function runShutdown(
  app: ShutdownOptions['app'],
  signal: NodeJS.Signals,
  timeoutMs: number,
): Promise<void> {
  app.log.info({ signal }, 'graceful shutdown started')
  const closePromise = app.close()
  let timedOut = false
  let timeout: NodeJS.Timeout | undefined

  await Promise.race([
    closePromise,
    new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true
        resolve()
      }, timeoutMs)
      timeout.unref()
    }),
  ])

  if (timeout) clearTimeout(timeout)
  if (timedOut) {
    app.log.warn({ timeoutMs }, 'graceful shutdown timed out; closing active connections')
    app.server.closeAllConnections()
    await closePromise
  }
  app.log.info('graceful shutdown completed')
}
