import type { FastifyInstance } from 'fastify'
import {
  LegacyMigrationPreviewCapacityError, LegacyMigrationPreviewError,
  LegacyMigrationPreviewStore, LegacyMigrationValidationError,
} from './legacy-migration.js'
import { LegacyMigrationConflictError, SqliteInventoryRepository } from './repository.js'

export function registerLegacyMigrationApi(app: FastifyInstance, repository: SqliteInventoryRepository): void {
  const previews = new LegacyMigrationPreviewStore(repository)
  app.post('/api/v1/legacy-migration/status', { bodyLimit: 10 * 1024 * 1024 }, async (request) => ({ data: previews.status(request.body) }))
  app.post('/api/v1/legacy-migration/preview', { bodyLimit: 10 * 1024 * 1024 }, async (request) => ({ data: previews.preview(request.body) }))
  app.post('/api/v1/legacy-migration/confirm', { bodyLimit: 10 * 1024 * 1024 }, async (request) => {
    const body = exact(request.body, ['previewToken', 'expectedInventoryRevision', 'acknowledged', 'legacyData'])
    if (typeof body.previewToken !== 'string' || !body.previewToken || body.acknowledged !== true ||
      !Number.isSafeInteger(body.expectedInventoryRevision) || Number(body.expectedInventoryRevision) < 0) {
      throw new LegacyMigrationValidationError()
    }
    return { data: previews.confirm(body.previewToken, Number(body.expectedInventoryRevision), body.legacyData) }
  })
}

function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LegacyMigrationValidationError()
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))) throw new LegacyMigrationValidationError()
  return record
}

export function legacyMigrationApiError(error: unknown): { status: number; code: string; message: string } | undefined {
  if (error instanceof LegacyMigrationValidationError) return { status: 400, code: 'LEGACY_MIGRATION_VALIDATION_ERROR', message: 'The legacy browser inventory is invalid or unsupported.' }
  if (error instanceof LegacyMigrationPreviewCapacityError) return { status: 503, code: 'LEGACY_MIGRATION_PREVIEW_CAPACITY', message: 'Too many migration previews are active. Try again after an existing preview expires.' }
  if (error instanceof LegacyMigrationPreviewError) return { status: 409, code: error.code, message: error.code === 'LEGACY_MIGRATION_PREVIEW_STALE' ? 'The migration source or target changed after preview. Preview again.' : 'The migration preview is invalid or expired. Preview again.' }
  if (error instanceof LegacyMigrationConflictError) return { status: 409, code: error.code, message: error.code === 'LEGACY_MIGRATION_TARGET_NOT_EMPTY' ? 'Legacy migration requires an empty server inventory. Back up and intentionally handle existing server inventory through a separate approved workflow.' : 'The server inventory changed after preview. Preview again.' }
}
