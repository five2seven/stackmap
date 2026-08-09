// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = path.resolve(import.meta.dirname, '..')

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')
      ? [fullPath]
      : []
  })
}

describe('IndexedDB retirement boundary', () => {
  it('has no Dexie dependency or application IndexedDB access', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'))
    expect(packageJson.dependencies?.dexie).toBeUndefined()
    expect(packageJson.devDependencies?.dexie).toBeUndefined()
    expect(packageJson.devDependencies?.['fake-indexeddb']).toBeUndefined()

    const applicationSources = [
      ...sourceFiles(path.join(repositoryRoot, 'src')),
      ...sourceFiles(path.join(repositoryRoot, 'server')),
    ]
    for (const filename of applicationSources) {
      const source = fs.readFileSync(filename, 'utf8')
      expect(source, filename).not.toMatch(/\bindexedDB\b|\bDexie\b|from ['"]dexie['"]|legacy-migration/)
    }
  })
})
