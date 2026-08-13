import path from 'node:path'

export interface ServerConfig {
  databasePath: string
  host: string
  port: number
  staticRoot: string
  portainerUrl?: string
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

  const portainerUrl = parsePortainerUrl(environment.STACKMAP_PORTAINER_URL)

  return {
    databasePath:
      environment.STACKMAP_DB_PATH ??
      (production ? '/config/stackmap.db' : path.join(cwd, '.data', 'stackmap.db')),
    host: environment.HOST ?? '0.0.0.0',
    port,
    staticRoot: path.resolve(environment.STACKMAP_STATIC_ROOT ?? path.join(cwd, 'dist')),
    ...(portainerUrl ? { portainerUrl } : {}),
  }
}

function parsePortainerUrl(value: string | undefined): string | undefined {
  if (value === undefined || !value.trim()) return undefined
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('STACKMAP_PORTAINER_URL must be a valid HTTP or HTTPS URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('STACKMAP_PORTAINER_URL must be an HTTP or HTTPS URL without credentials, query, or fragment')
  }
  return parsed.toString().replace(/\/$/, '')
}
