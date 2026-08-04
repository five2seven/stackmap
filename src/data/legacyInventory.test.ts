import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createService } from '../domain/serviceUtils'
import { DexieStackMapRepository, StackMapDatabase } from './database'
import { IndexedDbLegacyInventoryReader } from './legacyInventory'

const names: string[] = []
afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe('IndexedDbLegacyInventoryReader', () => {
  it('does not create a database during fresh-install detection', async () => {
    const name = `missing-${crypto.randomUUID()}`
    names.push(name)
    const reader = new IndexedDbLegacyInventoryReader(name)
    expect(await reader.detect()).toBe(false)
    expect(await Dexie.exists(name)).toBe(false)
  })

  it('detects and exports legacy records without modifying them', async () => {
    const name = `legacy-${crypto.randomUUID()}`
    names.push(name)
    const database = new StackMapDatabase(name)
    const repository = new DexieStackMapRepository(database)
    const service = createService('Legacy service')
    await repository.putService(service)
    const before = await database.services.toArray()
    const reader = new IndexedDbLegacyInventoryReader(name)
    expect(await reader.detect()).toBe(true)
    expect((await reader.read()).services).toEqual(before)
    expect(await database.services.toArray()).toEqual(before)
    database.close()
  })
})
