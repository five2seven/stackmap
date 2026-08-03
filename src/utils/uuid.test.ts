import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUuid } from './uuid'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createUuid', () => {
  it('uses the native randomUUID implementation when available', () => {
    const nativeUuid = '123e4567-e89b-42d3-a456-426614174000'
    const randomUUID = vi.fn(() => nativeUuid)
    vi.stubGlobal('crypto', { randomUUID })

    expect(createUuid()).toBe(nativeUuid)
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('uses random bytes and sets the UUID version and variant bits', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xff)
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    const uuid = createUuid()
    expect(uuid).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(uuid).toMatch(UUID_V4_PATTERN)
    expect(uuid[14]).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(uuid[19])
  })

  it('creates distinct UUID v4 identifiers without Web Crypto', () => {
    vi.stubGlobal('crypto', undefined)

    const ids = Array.from({ length: 20 }, () => createUuid())
    expect(new Set(ids).size).toBe(ids.length)
    ids.forEach((id) => expect(id).toMatch(UUID_V4_PATTERN))
  })
})
