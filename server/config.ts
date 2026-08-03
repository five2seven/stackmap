import path from 'node:path'

export interface ServerConfig {
  databasePath: string
  host: string
  port: number
  staticRoot: string
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): ServerConfig {
  const production = environment.NODE_ENV === 'production'
  const port = Number(environment.PORT ?? 8080)

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535')
  }

  return {
    databasePath:
      environment.STACKMAP_DB_PATH ??
      (production ? '/config/stackmap.db' : path.join(cwd, '.data', 'stackmap.db')),
    host: environment.HOST ?? '0.0.0.0',
    port,
    staticRoot: path.resolve(environment.STACKMAP_STATIC_ROOT ?? path.join(cwd, 'dist')),
  }
}
