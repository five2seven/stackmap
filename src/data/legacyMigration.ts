import { createExport } from './backup'
import type { StackMapData, StackMapExport } from '../domain/types'

export interface LegacyMigrationSummary {
  legacySchemaVersion: number
  legacyExportedAt: string
  hostCount: number
  serviceCount: number
  portCount: number
  pathCount: number
  dependencyCount: number
}
export interface LegacyMigrationPreview {
  summary: LegacyMigrationSummary
  expectedInventoryRevision: number
  previewToken: string
}
export type LegacyMigrationStatus = { status: 'matched' | 'changed' | 'missing' }

export class LegacyMigrationError extends Error {
  constructor(message: string, public readonly code: string) { super(message) }
}

export function legacyMigrationDataset(data: StackMapData): StackMapExport {
  const timestamps = [...data.hosts, ...data.services].flatMap((record) => [record.createdAt, record.updatedAt])
  const exportedAt = timestamps.sort().at(-1) ?? '1970-01-01T00:00:00.000Z'
  return createExport(data, exportedAt)
}

export interface LegacyMigrationClient {
  status(data: StackMapExport): Promise<LegacyMigrationStatus>
  preview(data: StackMapExport): Promise<LegacyMigrationPreview>
  confirm(previewToken: string, expectedRevision: number, data: StackMapExport): Promise<{ summary: LegacyMigrationSummary; inventoryRevision: number }>
}

export class SameOriginLegacyMigrationClient implements LegacyMigrationClient {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  status(data: StackMapExport) { return this.request<LegacyMigrationStatus>('/api/v1/legacy-migration/status', data) }
  preview(data: StackMapExport) { return this.request<LegacyMigrationPreview>('/api/v1/legacy-migration/preview', data) }
  confirm(previewToken: string, expectedInventoryRevision: number, legacyData: StackMapExport) {
    return this.request<{ summary: LegacyMigrationSummary; inventoryRevision: number }>(
      '/api/v1/legacy-migration/confirm', { previewToken, expectedInventoryRevision, acknowledged: true, legacyData },
    )
  }
  private async request<T>(path: string, body: unknown): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher.call(globalThis, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    } catch { throw new LegacyMigrationError('StackMap could not reach the server. Retry the migration safety check.', 'NETWORK_ERROR') }
    const payload = await response.json().catch(() => undefined) as { data?: T; error?: { code?: string; message?: string } } | undefined
    if (!response.ok || !payload?.data) throw new LegacyMigrationError(payload?.error?.message ?? 'The server could not complete the migration request.', payload?.error?.code ?? 'REQUEST_FAILED')
    return payload.data
  }
}

export const legacyMigrationClient = new SameOriginLegacyMigrationClient()
