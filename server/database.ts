import { createHash } from 'node:crypto'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  checksum: string
  apply: (connection: Database.Database) => void
}

const bootstrapSchemaSql = `
  CREATE TABLE application_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  ) STRICT;
`
const bootstrapFingerprint = `${bootstrapSchemaSql}
INSERT application_metadata installation_id from randomUUID
INSERT application_metadata created_at from ISO timestamp`

export function migrationChecksum(version: number, name: string, definition: string): string {
  return createHash('sha256').update(`${version}\0${name}\0${definition}`).digest('hex')
}

const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'bootstrap infrastructure metadata',
    checksum: migrationChecksum(1, 'bootstrap infrastructure metadata', bootstrapFingerprint),
    apply(connection: Database.Database) {
      connection.exec(bootstrapSchemaSql)
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
  checkpointAndClose: () => void
  installationId: () => string
  schemaVersion: () => number
}

export function openDatabase(filename: string): StackMapDatabase {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true })
  const connection = new Database(filename)

  try {
    connection.pragma('journal_mode = WAL')
    connection.pragma('synchronous = NORMAL')
    connection.pragma('foreign_keys = ON')
    connection.pragma('busy_timeout = 5000')
    runMigrations(connection)
  } catch (error) {
    connection.close()
    throw error
  }

  return {
    connection,
    checkpointAndClose: () => {
      connection.pragma('wal_checkpoint(TRUNCATE)')
      connection.close()
    },
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
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `)
  const appliedRows = connection
    .prepare('SELECT version, checksum FROM schema_migrations ORDER BY version')
    .all() as Array<{ version: number; checksum: string }>
  const applied = new Set(appliedRows.map(({ version }) => version))
  const knownVersions = new Set(pendingMigrations.map((migration) => migration.version))
  const unknownVersions = [...applied].filter((version) => !knownVersions.has(version))
  if (unknownVersions.length > 0) {
    throw new Error(
      `Database contains unsupported migration version(s): ${unknownVersions.join(', ')}`,
    )
  }
  const migrationsByVersion = new Map(
    pendingMigrations.map((migration) => [migration.version, migration]),
  )
  for (const appliedMigration of appliedRows) {
    const currentMigration = migrationsByVersion.get(appliedMigration.version)
    if (currentMigration && currentMigration.checksum !== appliedMigration.checksum) {
      throw new Error(`Checksum mismatch for migration version ${appliedMigration.version}`)
    }
  }

  for (const migration of pendingMigrations) {
    if (applied.has(migration.version)) continue
    connection.transaction(() => {
      migration.apply(connection)
      connection
        .prepare(
          'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
        )
        .run(migration.version, migration.name, migration.checksum, new Date().toISOString())
    })()
  }
}
