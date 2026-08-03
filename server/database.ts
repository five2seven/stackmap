import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  apply: (connection: Database.Database) => void
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'bootstrap infrastructure metadata',
    apply(connection: Database.Database) {
      connection.exec(`
        CREATE TABLE application_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) STRICT;
      `)
      const insert = connection.prepare(
        'INSERT INTO application_metadata (key, value) VALUES (?, ?)',
      )
      insert.run('installation_id', randomUUID())
      insert.run('created_at', new Date().toISOString())
    },
  },
] as const

export interface StackMapDatabase {
  connection: Database.Database
  close: () => void
  installationId: () => string
  schemaVersion: () => number
}

export function openDatabase(filename: string): StackMapDatabase {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true })
  const connection = new Database(filename)

  try {
    connection.pragma('journal_mode = WAL')
    connection.pragma('foreign_keys = ON')
    connection.pragma('busy_timeout = 5000')
    runMigrations(connection)
  } catch (error) {
    connection.close()
    throw error
  }

  return {
    connection,
    close: () => connection.close(),
    installationId: () =>
      connection
        .prepare("SELECT value FROM application_metadata WHERE key = 'installation_id'")
        .pluck()
        .get() as string,
    schemaVersion: () =>
      (connection.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get() as number) ?? 0,
  }
}

export function runMigrations(
  connection: Database.Database,
  pendingMigrations: readonly Migration[] = migrations,
): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `)
  const applied = new Set(
    connection.prepare('SELECT version FROM schema_migrations').pluck().all() as number[],
  )
  const knownVersions = new Set(pendingMigrations.map((migration) => migration.version))
  const unknownVersions = [...applied].filter((version) => !knownVersions.has(version))
  if (unknownVersions.length > 0) {
    throw new Error(
      `Database contains unsupported migration version(s): ${unknownVersions.join(', ')}`,
    )
  }

  for (const migration of pendingMigrations) {
    if (applied.has(migration.version)) continue
    connection.transaction(() => {
      migration.apply(connection)
      connection
        .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, new Date().toISOString())
    })()
  }
}
