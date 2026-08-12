import type { Host, Service } from '../domain/types'

export interface PortainerEnvironment { id: number; name: string; containerEngine: string; publicUrl: string }
export interface PortainerHostCandidate extends Host { environmentId: number; existingHostMatches: string[] }
export interface PortainerServiceCandidate extends Service {
  environmentId: number
  containerId: string
  sourceState: string
  networkOptions: string[]
  warnings: Array<{ code: string; message: string }>
  conflicts: Array<{ code: string; message: string; blocking: boolean }>
}
export interface PortainerPreview {
  previewToken: string
  expectedInventoryRevision: number
  hosts: PortainerHostCandidate[]
  services: PortainerServiceCandidate[]
  existingHosts: Array<Pick<Host, 'id' | 'name' | 'ipAddress'>>
}

export class PortainerImportError extends Error {
  constructor(message: string, public readonly code: string) { super(message) }
}

export class PortainerImportClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  status() { return this.request<{ enabled: boolean }>('/api/v1/portainer/status') }
  connect(apiToken: string) { return this.request<{ sessionToken: string; environments: PortainerEnvironment[] }>('/api/v1/portainer/sessions', { method: 'POST', body: JSON.stringify({ apiToken }) }) }
  preview(sessionToken: string, environmentIds: number[]) { return this.request<PortainerPreview>('/api/v1/portainer/previews', { method: 'POST', body: JSON.stringify({ sessionToken, environmentIds }) }) }
  cancelSession(token: string) { return this.request<null>(`/api/v1/portainer/sessions/${encodeURIComponent(token)}`, { method: 'DELETE' }) }
  cancelPreview(token: string) { return this.request<null>(`/api/v1/portainer/previews/${encodeURIComponent(token)}`, { method: 'DELETE' }) }
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response
    try { response = await this.fetcher.call(globalThis, path, { ...init, headers: init?.body ? { 'content-type': 'application/json' } : undefined }) }
    catch { throw new PortainerImportError('StackMap could not reach the server.', 'NETWORK_ERROR') }
    const payload = await response.json().catch(() => undefined) as { data?: T; error?: { code?: string; message?: string } } | undefined
    if (!response.ok || payload?.data === undefined) throw new PortainerImportError(payload?.error?.message ?? 'Portainer discovery failed.', payload?.error?.code ?? 'REQUEST_FAILED')
    return payload.data
  }
}

export const portainerImportClient = new PortainerImportClient()
