import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { openDatabase } from './database.js'

const config = loadConfig()
const database = openDatabase(config.databasePath)
const app = await buildApp({ database, staticRoot: config.staticRoot, logger: true })

let shuttingDown = false
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'graceful shutdown started')
  await app.close()
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  await app.close()
  process.exitCode = 1
}
