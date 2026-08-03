// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { openDatabase, runMigrations } from './database.js'

const temporaryDirectories: string[] = []
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('openDatabase', () => {
  it('bootstraps only infrastructure tables with required pragmas', () => {
    const database = openDatabase(':memory:')
    const tables = database.connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all()
    expect(tables).toEqual(['application_metadata', 'schema_migrations'])
    expect(database.connection.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(database.schemaVersion()).toBe(1)
    expect(database.installationId()).toMatch(/^[0-9a-f-]{36}$/)
    database.close()
  })

  it('preserves bootstrap metadata when reopened', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackmap-db-'))
    temporaryDirectories.push(directory)
    const filename = path.join(directory, 'stackmap.db')
    const first = openDatabase(filename)
    const installationId = first.installationId()
    expect(first.connection.pragma('journal_mode', { simple: true })).toBe('wal')
    first.close()
    const second = openDatabase(filename)
    expect(second.installationId()).toBe(installationId)
    second.close()
  })

  it('rolls back a failed migration and does not record it', () => {
    const connection = new Database(':memory:')
    expect(() =>
      runMigrations(connection, [
        {
          version: 99,
          name: 'deliberate failure',
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

  it('fails closed when the database is newer than the migration set', () => {
    const connection = new Database(':memory:')
    connection.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (2, 'future migration', '2026-08-03T00:00:00.000Z');
    `)
    expect(() => runMigrations(connection, [])).toThrow(/unsupported migration version.*2/)
    connection.close()
  })
})
