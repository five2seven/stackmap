import { mkdir, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const databasePath = resolve('.data/e2e/stackmap.db')
await rm(resolve('.data/e2e'), { recursive: true, force: true })
await mkdir(resolve('.data/e2e'), { recursive: true })

const child = spawn(process.execPath, ['dist-server/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '4173',
    STACKMAP_DB_PATH: databasePath,
    STACKMAP_STATIC_ROOT: resolve('dist'),
  },
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}
child.on('exit', (code) => process.exit(code ?? 0))
