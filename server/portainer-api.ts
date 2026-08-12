import type { FastifyInstance } from 'fastify'
import { PortainerError, PortainerPreviewService } from './portainer.js'

export function registerPortainerApi(app: FastifyInstance, service?: PortainerPreviewService) {
  app.get('/api/v1/portainer/status', async () => ({ data: { enabled: Boolean(service) } }))
  if (!service) return
  app.post('/api/v1/portainer/sessions', async (request) => {
    const body = exact(request.body, ['apiToken'])
    if (typeof body.apiToken !== 'string' || !body.apiToken.trim()) throw new PortainerError('PORTAINER_TOKEN_REQUIRED', 'Enter a Portainer API token.')
    return { data: await service.connect(body.apiToken) }
  })
  app.post('/api/v1/portainer/previews', async (request) => {
    const body = exact(request.body, ['sessionToken', 'environmentIds'])
    if (typeof body.sessionToken !== 'string' || !Array.isArray(body.environmentIds)) throw new PortainerError('PORTAINER_SELECTION_INVALID', 'The preview request is invalid.')
    return { data: await service.preview(body.sessionToken, body.environmentIds as number[]) }
  })
  app.delete('/api/v1/portainer/sessions/:token', async (request) => { service.cancelSession((request.params as { token: string }).token); return { data: null } })
  app.delete('/api/v1/portainer/previews/:token', async (request) => { service.cancelPreview((request.params as { token: string }).token); return { data: null } })
  app.addHook('onClose', async () => service.clear())
}

function exact(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PortainerError('PORTAINER_REQUEST_INVALID', 'The Portainer request is invalid.')
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))) throw new PortainerError('PORTAINER_REQUEST_INVALID', 'The Portainer request is invalid.')
  return record
}

export function portainerApiError(error: unknown) {
  if (!(error instanceof PortainerError)) return undefined
  const status = error.code === 'PORTAINER_AUTH_FAILED' ? 401 : error.code === 'PORTAINER_CAPACITY' ? 503 : error.code.includes('INVALID') || error.code.includes('REQUIRED') ? 400 : 502
  return { status, code: error.code, message: error.message }
}
