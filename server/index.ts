import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './database.js'
import { createShutdownHandler } from './shutdown.js'
import { validatePortainerDestination } from './portainer-network-policy.js'

const config = loadConfig()
if (config.portainerUrl) await validatePortainerDestination(config.portainerUrl)
const database = openDatabase(config.databasePath)
const app = await buildApp({
  database,
  staticRoot: config.staticRoot,
  logger: true,
  portainerUrl: config.portainerUrl,
})

const shutdown = createShutdownHandler({ app })
const handleSignal = (signal: NodeJS.Signals) => {
  void shutdown(signal).catch(() => {
    app.log.error('graceful shutdown failed')
    process.exitCode = 1
  })
}

process.once('SIGINT', () => handleSignal('SIGINT'))
process.once('SIGTERM', () => handleSignal('SIGTERM'))

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  await app.close()
  process.exitCode = 1
}
