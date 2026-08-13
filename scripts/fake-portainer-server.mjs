import { appendFileSync, readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:https'

const responses = new Map([
  ['/api/endpoints', [{ Id: 1, Name: 'local', Type: 1, ContainerEngine: '', URL: 'unix:///var/run/docker.sock', Status: 1 }]],
  ['/api/endpoints/1/docker/info', { Name: 'container-lab', OperatingSystem: 'Linux', OSType: 'linux', Architecture: 'amd64' }],
  ['/api/endpoints/1/docker/version', { Version: '28.0.0', ApiVersion: '1.48' }],
  ['/api/endpoints/1/docker/containers/json?all=true', [{
    Id: 'container-validation-id', Names: ['/Container validation'], Image: 'example/container-validation:1', State: 'running',
    Ports: [{ PrivatePort: 80, PublicPort: 9080, Type: 'tcp', IP: '' }, { PrivatePort: 443, PublicPort: 9443, Type: 'tcp', IP: '' }],
    Mounts: [{ Type: 'bind', Source: '/srv/container/config', Destination: '/config', RW: true }, { Type: 'bind', Source: '/srv/container/data', Destination: '/data', RW: false }],
    NetworkSettings: { Networks: { validation: {} } },
  }]],
])

const handler = (request, response) => {
  appendFileSync('/tmp/request-history.jsonl', `${JSON.stringify({
    method: request.method,
    url: request.url,
    host: request.headers.host,
    apiKeyAccepted: request.headers['x-api-key'] === 'container-api-token',
  })}\n`)
  const value = request.method === 'GET' && request.headers['x-api-key'] === 'container-api-token' ? responses.get(request.url) : undefined
  response.writeHead(value === undefined ? 404 : 200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(value ?? { message: 'Not found' }))
}

createHttpServer(handler).listen(9000, '0.0.0.0')
createServer({ cert: readFileSync(process.env.FAKE_PORTAINER_CERT), key: readFileSync(process.env.FAKE_PORTAINER_KEY) }, handler)
  .listen(9443, '0.0.0.0')
