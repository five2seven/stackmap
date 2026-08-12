import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildApp } from '../dist-server/app.js'
import { openDatabase } from '../dist-server/database.js'

const databasePath = resolve('.data/e2e/stackmap.db')
await rm(resolve('.data/e2e'), { recursive: true, force: true })
await mkdir(resolve('.data/e2e'), { recursive: true })

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const portainerFetcher = async (url, init) => {
  if (init.method !== 'GET' || init.headers['X-API-Key'] !== 'e2e-api-token') return json({ message: 'Unauthorized' }, 403)
  if (url.endsWith('/api/endpoints')) return json([{ Id: 1, Name: 'Docker lab', ContainerEngine: 'docker', PublicURL: '' }])
  if (url.endsWith('/docker/info')) return json({ Name: 'docker-lab', OperatingSystem: 'Linux', OSType: 'linux', Architecture: 'amd64' })
  if (url.endsWith('/docker/version')) return json({ Version: '28.0.0', ApiVersion: '1.48' })
  if (url.endsWith('/docker/containers/json?all=true')) return json([
    {
      Id: 'running-container', Names: ['/Running app'], Image: 'example/running:1', State: 'running',
      Ports: [
        { PrivatePort: 80, PublicPort: 8080, Type: 'tcp', IP: '' },
        { PrivatePort: 443, PublicPort: 8443, Type: 'tcp', IP: '' },
      ],
      Mounts: [
        { Type: 'bind', Source: '/srv/running/config', Destination: '/config', RW: true },
        { Type: 'bind', Source: '/srv/running/data', Destination: '/data', RW: false },
      ],
      NetworkSettings: { Networks: { frontend: {} } },
    },
    {
      Id: 'stopped-container', Names: ['/Stopped app'], Image: 'example/stopped:1', State: 'exited',
      Ports: [], Mounts: [], NetworkSettings: { Networks: { frontend: {} } },
    },
  ])
  return json({ message: 'Not found' }, 404)
}

const database = openDatabase(databasePath)
const app = await buildApp({
  database,
  staticRoot: resolve('dist'),
  logger: true,
  portainerUrl: 'https://portainer.e2e.test',
  portainerFetcher,
})
await app.listen({ host: '127.0.0.1', port: 4173 })

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => void app.close())
}
