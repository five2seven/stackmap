// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  databaseMigrations,
  migrationChecksum,
  openDatabase,
  runMigrations,
} from './database.js'

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('openDatabase', () => {
  it('bootstraps the complete normalized schema with required pragmas', () => {
    const database = openDatabase(':memory:')
    const tables = database.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all()
    expect(tables).toEqual([
      'application_metadata',
      'hosts',
      'legacy_migration_receipt',
      'schema_migrations',
      'service_dependencies',
      'service_paths',
      'service_ports',
      'services',
    ])
    expect(database.connection.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(database.connection.pragma('synchronous', { simple: true })).toBe(1)
    expect(database.schemaVersion()).toBe(3)
    expect(database.installationId()).toMatch(/^[0-9a-f-]{36}$/)
    database.checkpointAndClose()
  })

  it('migrates a Task 1 database forward without replacing its metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackmap-upgrade-'))
    temporaryDirectories.push(directory)
    const filename = path.join(directory, 'stackmap.db')
    const taskOneConnection = new Database(filename)
    runMigrations(taskOneConnection, databaseMigrations.slice(0, 1))
    const installationId = taskOneConnection
      .prepare("SELECT value FROM application_metadata WHERE key = 'installation_id'")
      .pluck()
      .get()
    const createdAt = taskOneConnection
      .prepare("SELECT value FROM application_metadata WHERE key = 'created_at'")
      .pluck()
      .get()
    taskOneConnection.close()

    const upgraded = openDatabase(filename)
    expect(upgraded.schemaVersion()).toBe(3)
    expect(upgraded.installationId()).toBe(installationId)
    expect(
      upgraded.connection
        .prepare("SELECT value FROM application_metadata WHERE key = 'created_at'")
        .pluck()
        .get(),
    ).toBe(createdAt)
    expect(
      upgraded.connection
        .prepare("SELECT value FROM application_metadata WHERE key = 'inventory_revision'")
        .pluck()
        .get(),
    ).toBe('0')
    upgraded.checkpointAndClose()
  })

  it('stores the migration checksum and accepts it when reopened', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackmap-db-'))
    temporaryDirectories.push(directory)
    const filename = path.join(directory, 'stackmap.db')
    const first = openDatabase(filename)
    const installationId = first.installationId()
    const storedChecksum = first.connection
      .prepare('SELECT checksum FROM schema_migrations WHERE version = 1')
      .pluck()
      .get()
    expect(storedChecksum).toMatch(/^[0-9a-f]{64}$/)
    expect(first.connection.pragma('journal_mode', { simple: true })).toBe('wal')
    first.checkpointAndClose()
    const second = openDatabase(filename)
    expect(second.installationId()).toBe(installationId)
    expect(
      second.connection
        .prepare('SELECT checksum FROM schema_migrations WHERE version = 1')
        .pluck()
        .get(),
    ).toBe(storedChecksum)
    second.checkpointAndClose()
  })

  it('rejects a changed checksum for an applied migration', () => {
    const connection = new Database(':memory:')
    const original = {
      version: 1,
      name: 'test migration',
      checksum: migrationChecksum(1, 'test migration', 'CREATE TABLE original (id INTEGER);'),
      apply(database: Database.Database) {
        database.exec('CREATE TABLE original (id INTEGER)')
      },
    }
    runMigrations(connection, [original])
    expect(() =>
      runMigrations(connection, [
        {
          ...original,
          checksum: migrationChecksum(1, 'test migration', 'CREATE TABLE changed (id INTEGER);'),
        },
      ]),
    ).toThrow(/Checksum mismatch.*1/)
    connection.close()
  })

  it('rolls back a failed migration and does not record it', () => {
    const connection = new Database(':memory:')
    expect(() =>
      runMigrations(connection, [
        {
          version: 99,
          name: 'deliberate failure',
          checksum: migrationChecksum(99, 'deliberate failure', 'must roll back'),
          apply(database) {
            database.exec('CREATE TABLE must_roll_back (id INTEGER PRIMARY KEY)')
            throw new Error('migration failed')
          },
        },
      ]),
    ).toThrow('migration failed')
    expect(
      connection
        .prepare("SELECT name FROM sqlite_master WHERE name = 'must_roll_back'")
        .get(),
    ).toBeUndefined()
    expect(connection.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get()).toBe(0)
    connection.close()
  })

  it('rolls back the complete inventory schema if its migration fails', () => {
    const connection = new Database(':memory:')
    runMigrations(connection, databaseMigrations.slice(0, 1))
    const inventoryMigration = databaseMigrations[1]
    expect(() =>
      runMigrations(connection, [
        databaseMigrations[0],
        {
          ...inventoryMigration,
          apply(database) {
            inventoryMigration.apply(database)
            throw new Error('inventory migration failed')
          },
        },
      ]),
    ).toThrow('inventory migration failed')
    expect(
      connection.prepare("SELECT name FROM sqlite_master WHERE name = 'services'").get(),
    ).toBeUndefined()
    expect(connection.prepare('SELECT MAX(version) FROM schema_migrations').pluck().get()).toBe(1)
    expect(
      connection
        .prepare("SELECT value FROM application_metadata WHERE key = 'inventory_revision'")
        .get(),
    ).toBeUndefined()
    connection.close()
  })

  it('fails closed when the database is newer than the migration set', () => {
    const connection = new Database(':memory:')
    connection.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations (version, name, checksum, applied_at)
      VALUES (2, 'future migration', 'future', '2026-08-03T00:00:00.000Z');
    `)
    expect(() => runMigrations(connection, [])).toThrow(/unsupported migration version.*2/)
    connection.close()
  })
})
