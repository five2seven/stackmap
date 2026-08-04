import { validateImport } from '../domain/schema'
import type { StackMapData } from '../domain/types'

export interface LegacyInventoryReader {
  detect(): Promise<boolean>
  read(): Promise<StackMapData>
}

export class LegacyInventoryError extends Error {
  constructor(message: string, readonly code: 'UNSUPPORTED_ENUMERATION' | 'UNSUPPORTED_SCHEMA' | 'DETECTION_FAILED' | 'TIMEOUT') {
    super(message)
    this.name = 'LegacyInventoryError'
  }
}

type LegacySnapshot = { version: number; services: unknown[]; hosts: unknown[] }

export class IndexedDbLegacyInventoryReader implements LegacyInventoryReader {
  constructor(
    private readonly databaseName = 'stackmap',
    private readonly timeoutMs = 10_000,
  ) {}

  async detect(): Promise<boolean> {
    const snapshot = await this.snapshot()
    return snapshot.services.length > 0 || snapshot.hosts.length > 0
  }

  async read(): Promise<StackMapData> {
    const snapshot = await this.snapshot()
    // Dexie encodes version 4 as IndexedDB version 40; hand-created compatibility
    // databases used by older deployments may expose the literal version 4.
    if (snapshot.version !== 4 && snapshot.version !== 40) throw new LegacyInventoryError(
      'Only exact legacy browser schema version 3 can be migrated.',
      'UNSUPPORTED_SCHEMA',
    )
    const normalized = validateImport({
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      services: snapshot.services,
      hosts: snapshot.hosts,
    })
    return { services: normalized.services, hosts: normalized.hosts }
  }

  private async snapshot(): Promise<LegacySnapshot> {
    if (!(await databaseExists(this.databaseName, this.timeoutMs))) return { version: 0, services: [], hosts: [] }
    return new Promise((resolve, reject) => {
      let settled = false
      let database: IDBDatabase | undefined
      let transaction: IDBTransaction | undefined
      const request = indexedDB.open(this.databaseName)
      const finish = (error?: Error, snapshot?: LegacySnapshot) => {
        if (settled) return
        settled = true
        globalThis.clearTimeout(timeout)
        if (transaction) transaction.onerror = transaction.onabort = transaction.oncomplete = null
        database?.close()
        if (error) reject(error)
        else resolve(snapshot as LegacySnapshot)
      }
      const timeout = globalThis.setTimeout(() => finish(new LegacyInventoryError(
        'Checking legacy browser data took too long. Retry the safety check.',
        'TIMEOUT',
      )), this.timeoutMs)
      request.onerror = () => finish(new LegacyInventoryError('Legacy browser data could not be read.', 'DETECTION_FAILED'))
      request.onblocked = () => finish(new LegacyInventoryError('Legacy browser data is currently unavailable.', 'DETECTION_FAILED'))
      request.onsuccess = () => {
        if (settled) {
          request.result.close()
          return
        }
        const openedDatabase = request.result
        database = openedDatabase
        const names = openedDatabase.objectStoreNames
        if (!names.contains('services') || !names.contains('hosts')) {
          finish(undefined, { version: openedDatabase.version, services: [], hosts: [] })
          return
        }
        try {
          transaction = openedDatabase.transaction(['services', 'hosts'], 'readonly')
        } catch {
          finish(new LegacyInventoryError('Legacy browser data could not be read.', 'DETECTION_FAILED'))
          return
        }
        const servicesRequest = transaction.objectStore('services').getAll()
        const hostsRequest = transaction.objectStore('hosts').getAll()
        transaction.onerror = () => finish(new LegacyInventoryError('Legacy browser data could not be read.', 'DETECTION_FAILED'))
        transaction.onabort = () => finish(new LegacyInventoryError('Legacy browser data could not be read.', 'DETECTION_FAILED'))
        transaction.oncomplete = () => {
          finish(undefined, {
            version: openedDatabase.version,
            services: servicesRequest.result,
            hosts: hostsRequest.result,
          })
        }
      }
    })
  }
}

async function databaseExists(name: string, timeoutMs: number): Promise<boolean> {
  if (typeof indexedDB.databases !== 'function') {
    throw new LegacyInventoryError(
      'This browser cannot safely enumerate legacy browser databases.',
      'UNSUPPORTED_ENUMERATION',
    )
  }
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const databases = await Promise.race([
      indexedDB.databases(),
      new Promise<never>((_resolve, reject) => {
        timeout = globalThis.setTimeout(() => reject(new LegacyInventoryError(
          'Checking legacy browser data took too long. Retry the safety check.',
          'TIMEOUT',
        )), timeoutMs)
      }),
    ])
    return databases.some((database) => database.name === name)
  } catch (error) {
    if (error instanceof LegacyInventoryError) throw error
    throw new LegacyInventoryError('Legacy browser data could not be checked safely.', 'DETECTION_FAILED')
  } finally {
    if (timeout !== undefined) globalThis.clearTimeout(timeout)
  }
}

export const legacyInventoryReader = new IndexedDbLegacyInventoryReader()
