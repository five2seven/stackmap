import { validateImport } from '../domain/schema'
import type { StackMapData } from '../domain/types'

export interface LegacyInventoryReader {
  detect(): Promise<boolean>
  read(): Promise<StackMapData>
}

type LegacySnapshot = { version: number; services: unknown[]; hosts: unknown[] }

export class IndexedDbLegacyInventoryReader implements LegacyInventoryReader {
  constructor(private readonly databaseName = 'stackmap') {}

  async detect(): Promise<boolean> {
    const snapshot = await this.snapshot()
    return snapshot.services.length > 0 || snapshot.hosts.length > 0
  }

  async read(): Promise<StackMapData> {
    const snapshot = await this.snapshot()
    const schemaVersion = snapshot.version >= 4 ? 3 : snapshot.version >= 3 ? 2 : 1
    const normalized = validateImport({
      schemaVersion,
      exportedAt: new Date().toISOString(),
      services: snapshot.services,
      hosts: snapshot.hosts,
    })
    return { services: normalized.services, hosts: normalized.hosts }
  }

  private async snapshot(): Promise<LegacySnapshot> {
    if (!(await databaseExists(this.databaseName))) return { version: 0, services: [], hosts: [] }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName)
      request.onerror = () => reject(new Error('Legacy browser data could not be read.'))
      request.onblocked = () => reject(new Error('Legacy browser data is currently unavailable.'))
      request.onsuccess = () => {
        const database = request.result
        const names = database.objectStoreNames
        if (!names.contains('services') || !names.contains('hosts')) {
          database.close()
          resolve({ version: database.version, services: [], hosts: [] })
          return
        }
        const transaction = database.transaction(['services', 'hosts'], 'readonly')
        const servicesRequest = transaction.objectStore('services').getAll()
        const hostsRequest = transaction.objectStore('hosts').getAll()
        transaction.onerror = () => reject(new Error('Legacy browser data could not be read.'))
        transaction.oncomplete = () => {
          const snapshot = {
            version: database.version,
            services: servicesRequest.result,
            hosts: hostsRequest.result,
          }
          database.close()
          resolve(snapshot)
        }
      }
    })
  }
}

async function databaseExists(name: string): Promise<boolean> {
  if (typeof indexedDB.databases === 'function') {
    return (await indexedDB.databases()).some((database) => database.name === name)
  }
  throw new Error('This browser cannot safely detect legacy data without opening it.')
}

export const legacyInventoryReader = new IndexedDbLegacyInventoryReader()
