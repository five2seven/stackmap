// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createShutdownHandler } from './shutdown.js'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe('createShutdownHandler', () => {
  it('runs shutdown only once for duplicate signals', async () => {
    const close = vi.fn(async () => undefined)
    const app = {
      close,
      log: { info: vi.fn(), warn: vi.fn() },
      server: { closeAllConnections: vi.fn() },
    }
    const shutdown = createShutdownHandler({ app: app as never })
    const first = shutdown('SIGINT')
    const second = shutdown('SIGTERM')
    expect(first).toBe(second)
    await first
    expect(close).toHaveBeenCalledTimes(1)
    expect(app.log.info).toHaveBeenCalledWith('graceful shutdown completed')
  })

  it('bounds shutdown and closes active connections after the timeout', async () => {
    const pendingClose = deferred()
    const closeAllConnections = vi.fn(() => pendingClose.resolve())
    const app = {
      close: vi.fn(() => pendingClose.promise),
      log: { info: vi.fn(), warn: vi.fn() },
      server: { closeAllConnections },
    }
    const shutdown = createShutdownHandler({ app: app as never, timeoutMs: 5 })
    await shutdown('SIGTERM')
    expect(closeAllConnections).toHaveBeenCalledOnce()
    expect(app.log.warn).toHaveBeenCalledWith(
      { timeoutMs: 5 },
      'graceful shutdown timed out; closing active connections',
    )
  })
})
