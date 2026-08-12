import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('dist-demo')
const forbidden = [
  ['/api/', 'production API route'],
  ['indexedDB', 'IndexedDB access'],
  ['localStorage', 'local storage access'],
  ['sessionStorage', 'session storage access'],
  ['stackmap.db', 'SQLite database path'],
  ['better-sqlite3', 'SQLite dependency'],
  ['Portainer', 'Portainer integration'],
  ['/api/v1/portainer', 'Portainer API route'],
]

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  }))).flat()
}

const outputFiles = await files(output)
if (!outputFiles.some((file) => file.endsWith('_redirects'))) {
  throw new Error('The demo build is missing its Cloudflare Pages SPA redirect.')
}

for (const file of outputFiles) {
  if ((await stat(file)).size > 5_000_000) throw new Error(`Demo asset is unexpectedly large: ${file}`)
  if (!/\.(?:html|js|css|txt)$/.test(file) && !file.endsWith('_redirects')) continue
  const contents = await readFile(file, 'utf8')
  for (const [needle, label] of forbidden) {
    if (contents.includes(needle)) throw new Error(`Demo build contains ${label} in ${file}`)
  }
}

console.log('Demo build is static and contains no production API, SQLite, IndexedDB, or browser-storage paths.')
