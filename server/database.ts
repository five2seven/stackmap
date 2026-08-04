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

const inventorySchemaSql = `
  CREATE TABLE hosts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('physical', 'virtual-machine', 'container-host', 'nas', 'other', 'unknown')),
    ip_address TEXT NOT NULL,
    operating_system TEXT NOT NULL,
    notes TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    container_name TEXT NOT NULL,
    docker_image TEXT NOT NULL,
    description TEXT NOT NULL,
    application_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'planned', 'paused', 'retired')),
    host_id TEXT REFERENCES hosts(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    internal_url TEXT NOT NULL,
    network TEXT NOT NULL,
    exposure TEXT NOT NULL CHECK (exposure IN ('local', 'vpn', 'reverse-proxy', 'public', 'unknown')),
    notes TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE service_ports (
    id TEXT NOT NULL,
    service_id TEXT NOT NULL REFERENCES services(id) ON UPDATE CASCADE ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    host_port INTEGER CHECK (host_port BETWEEN 1 AND 65535),
    container_port INTEGER CHECK (container_port BETWEEN 1 AND 65535),
    protocol TEXT NOT NULL CHECK (protocol IN ('tcp', 'udp', 'both', 'unknown')),
    description TEXT NOT NULL,
    CHECK (host_port IS NOT NULL OR container_port IS NOT NULL),
    PRIMARY KEY (service_id, id),
    UNIQUE (service_id, position)
  ) STRICT;

  CREATE TABLE service_paths (
    id TEXT NOT NULL,
    service_id TEXT NOT NULL REFERENCES services(id) ON UPDATE CASCADE ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    host_path TEXT NOT NULL,
    container_path TEXT NOT NULL,
    purpose TEXT NOT NULL,
    read_only INTEGER NOT NULL CHECK (read_only IN (0, 1)),
    CHECK (length(trim(host_path)) > 0 OR length(trim(container_path)) > 0 OR length(trim(purpose)) > 0),
    PRIMARY KEY (service_id, id),
    UNIQUE (service_id, position)
  ) STRICT;

  CREATE TABLE service_dependencies (
    service_id TEXT NOT NULL REFERENCES services(id) ON UPDATE CASCADE ON DELETE CASCADE,
    dependency_id TEXT NOT NULL REFERENCES services(id) ON UPDATE CASCADE ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (service_id, dependency_id),
    UNIQUE (service_id, position),
    CHECK (service_id <> dependency_id)
  ) STRICT;

  CREATE INDEX services_host_id_idx ON services(host_id);
  CREATE INDEX service_ports_service_id_idx ON service_ports(service_id);
  CREATE INDEX service_paths_service_id_idx ON service_paths(service_id);
  CREATE INDEX service_dependencies_dependency_id_idx ON service_dependencies(dependency_id);
`
const inventoryFingerprint = `${inventorySchemaSql}
INSERT application_metadata inventory_revision 0`

const legacyMigrationReceiptSchemaSql = `
  CREATE TABLE legacy_migration_receipt (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    fingerprint TEXT NOT NULL,
    imported_at TEXT NOT NULL,
    inventory_revision INTEGER NOT NULL CHECK (inventory_revision >= 1),
    legacy_schema_version INTEGER NOT NULL CHECK (legacy_schema_version = 3)
  ) STRICT;
`

export function migrationChecksum(version: number, name: string, definition: string): string {
  return createHash('sha256').update(`${version}\0${name}\0${definition}`).digest('hex')
}

export const databaseMigrations: readonly Migration[] = [
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
  {
    version: 2,
    name: 'normalized inventory schema',
    checksum: migrationChecksum(2, 'normalized inventory schema', inventoryFingerprint),
    apply(connection: Database.Database) {
      connection.exec(inventorySchemaSql)
      connection
        .prepare('INSERT INTO application_metadata (key, value) VALUES (?, ?)')
        .run('inventory_revision', '0')
    },
  },
  {
    version: 3,
    name: 'legacy migration receipt',
    checksum: migrationChecksum(3, 'legacy migration receipt', legacyMigrationReceiptSchemaSql),
    apply(connection: Database.Database) {
      connection.exec(legacyMigrationReceiptSchemaSql)
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
  pendingMigrations: readonly Migration[] = databaseMigrations,
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
