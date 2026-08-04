export interface RestoreSummary {
  backupVersion: number
  exportedAt: string
  sourceInstallationId: string
  sourceInventoryRevision: number
  hostCount: number
  serviceCount: number
  portCount: number
  pathCount: number
  dependencyCount: number
}

export interface RestorePreview {
  summary: RestoreSummary
  expectedInventoryRevision: number
  previewToken: string
}

export class ServerBackupError extends Error {
  constructor(message: string, public readonly code: string) { super(message) }
}

export interface ServerBackupClient {
  download(): Promise<Blob>
  preview(backup: unknown): Promise<RestorePreview>
  confirm(previewToken: string, expectedInventoryRevision: number): Promise<{ summary: RestoreSummary; inventoryRevision: number }>
}

export class SameOriginServerBackupClient implements ServerBackupClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async download(): Promise<Blob> {
    const response = await this.fetcher.call(globalThis, '/api/v1/backup')
    if (!response.ok) throw new ServerBackupError('The server backup could not be downloaded.', 'BACKUP_DOWNLOAD_FAILED')
    return response.blob()
  }

  async preview(backup: unknown): Promise<RestorePreview> {
    return this.request('/api/v1/restore/preview', backup)
  }

  async confirm(previewToken: string, expectedInventoryRevision: number) {
    return this.request<{ summary: RestoreSummary; inventoryRevision: number }>(
      '/api/v1/restore/confirm', { previewToken, expectedInventoryRevision },
    )
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher.call(globalThis, path, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
    } catch {
      throw new ServerBackupError('StackMap could not reach the server.', 'NETWORK_ERROR')
    }
    const payload = await response.json().catch(() => undefined) as
      | { data?: T; error?: { code?: string; message?: string } }
      | undefined
    if (!response.ok || !payload?.data) {
      throw new ServerBackupError(payload?.error?.message ?? 'The server could not complete the restore request.', payload?.error?.code ?? 'REQUEST_FAILED')
    }
    return payload.data
  }
}

export const serverBackupClient = new SameOriginServerBackupClient()
