import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createService } from '../domain/serviceUtils'
import { DexieStackMapRepository, StackMapDatabase } from './database'
import { IndexedDbLegacyInventoryReader } from './legacyInventory'

const names: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)))
})

describe('IndexedDbLegacyInventoryReader', () => {
  it('reports unsupported safe enumeration without opening a guessed database', async () => {
    const original = indexedDB.databases
    Object.defineProperty(indexedDB, 'databases', { configurable: true, value: undefined })
    const open = vi.spyOn(indexedDB, 'open')
    await expect(new IndexedDbLegacyInventoryReader().detect()).rejects.toMatchObject({
      code: 'UNSUPPORTED_ENUMERATION',
    })
    expect(open).not.toHaveBeenCalled()
    Object.defineProperty(indexedDB, 'databases', { configurable: true, value: original })
  })

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

  it('fails closed when legacy storage is not exact browser schema version 3', async () => {
    const name = `legacy-old-${crypto.randomUUID()}`
    names.push(name)
    class OldDatabase extends Dexie {
      constructor() {
        super(name)
        this.version(3).stores({ services: 'id', hosts: 'id' })
      }
    }
    const database = new OldDatabase()
    await database.table('services').put({ id: 'old-service' })
    database.close()
    const reader = new IndexedDbLegacyInventoryReader(name)
    expect(await reader.detect()).toBe(true)
    await expect(reader.read()).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' })
  })

  it('times out enumeration and allows a later retry', async () => {
    vi.useFakeTimers()
    const databases = vi.spyOn(indexedDB, 'databases')
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce([])
    const reader = new IndexedDbLegacyInventoryReader('stackmap', 100)
    const first = reader.detect()
    const firstAssertion = expect(first).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(100)
    await firstAssertion
    await expect(reader.detect()).resolves.toBe(false)
    expect(databases).toHaveBeenCalledTimes(2)
  })

  it('times out an open request and closes a database delivered by a late event', async () => {
    vi.useFakeTimers()
    vi.spyOn(indexedDB, 'databases').mockResolvedValue([{ name: 'stackmap', version: 4 }])
    const request: Partial<IDBOpenDBRequest> = {}
    vi.spyOn(indexedDB, 'open').mockReturnValue(request as IDBOpenDBRequest)
    const reader = new IndexedDbLegacyInventoryReader('stackmap', 100)
    const pending = reader.detect()
    const pendingAssertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    await pendingAssertion
    const close = vi.fn()
    Object.defineProperty(request, 'result', { value: { close } })
    request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'))
    expect(close).toHaveBeenCalledOnce()
  })

  it.each(['error', 'abort'] as const)('closes the connection after a transaction %s', async (terminal) => {
    vi.spyOn(indexedDB, 'databases').mockResolvedValue([{ name: 'stackmap', version: 4 }])
    const request: Partial<IDBOpenDBRequest> = {}
    const transaction: Partial<IDBTransaction> = {
      objectStore: vi.fn(() => ({ getAll: () => ({ result: [] }) }) as never),
    }
    const close = vi.fn()
    const database = {
      version: 4,
      close,
      objectStoreNames: { contains: () => true },
      transaction: () => transaction,
    }
    Object.defineProperty(request, 'result', { value: database })
    vi.spyOn(indexedDB, 'open').mockReturnValue(request as IDBOpenDBRequest)
    const pending = new IndexedDbLegacyInventoryReader('stackmap', 100).detect()
    const pendingAssertion = expect(pending).rejects.toMatchObject({ code: 'DETECTION_FAILED' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'))
    if (terminal === 'error') transaction.onerror?.call(transaction as IDBTransaction, new Event('error'))
    else transaction.onabort?.call(transaction as IDBTransaction, new Event('abort'))
    await pendingAssertion
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the connection after a successful transaction', async () => {
    vi.spyOn(indexedDB, 'databases').mockResolvedValue([{ name: 'stackmap', version: 4 }])
    const request: Partial<IDBOpenDBRequest> = {}
    const transaction: Partial<IDBTransaction> = {
      objectStore: vi.fn(() => ({ getAll: () => ({ result: [] }) }) as never),
    }
    const close = vi.fn()
    Object.defineProperty(request, 'result', { value: {
      version: 4, close, objectStoreNames: { contains: () => true }, transaction: () => transaction,
    } })
    vi.spyOn(indexedDB, 'open').mockReturnValue(request as IDBOpenDBRequest)
    const pending = new IndexedDbLegacyInventoryReader('stackmap', 100).detect()
    await new Promise((resolve) => setTimeout(resolve, 0))
    request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'))
    transaction.oncomplete?.call(transaction as IDBTransaction, new Event('complete'))
    await expect(pending).resolves.toBe(false)
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes the connection on transaction timeout and ignores a late completion', async () => {
    vi.useFakeTimers()
    vi.spyOn(indexedDB, 'databases').mockResolvedValue([{ name: 'stackmap', version: 4 }])
    const request: Partial<IDBOpenDBRequest> = {}
    const transaction: Partial<IDBTransaction> = {
      objectStore: vi.fn(() => ({ getAll: () => ({ result: [] }) }) as never),
    }
    const close = vi.fn()
    Object.defineProperty(request, 'result', { value: {
      version: 4, close, objectStoreNames: { contains: () => true }, transaction: () => transaction,
    } })
    vi.spyOn(indexedDB, 'open').mockReturnValue(request as IDBOpenDBRequest)
    const pending = new IndexedDbLegacyInventoryReader('stackmap', 100).detect()
    const pendingAssertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
    await vi.advanceTimersByTimeAsync(0)
    request.onsuccess?.call(request as IDBOpenDBRequest, new Event('success'))
    const lateComplete = transaction.oncomplete
    await vi.advanceTimersByTimeAsync(100)
    await pendingAssertion
    expect(close).toHaveBeenCalledOnce()
    lateComplete?.call(transaction as IDBTransaction, new Event('complete'))
    expect(close).toHaveBeenCalledOnce()
  })
})
