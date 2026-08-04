import type { FastifyInstance } from 'fastify'
import { applicationVersion } from './version.js'
import {
  BackupValidationError,
  createBackup,
  RestorePreviewCapacityError,
  RestorePreviewStore,
} from './backup.js'
import { RestoreConflictError, SqliteInventoryRepository } from './repository.js'

export function registerBackupApi(
  app: FastifyInstance,
  repository: SqliteInventoryRepository,
  installationId: () => string,
): void {
  const previews = new RestorePreviewStore(repository)

  app.get('/api/v1/backup', async (_request, reply) => {
    return reply
      .header('content-disposition', `attachment; filename="stackmap-server-backup-${new Date().toISOString().slice(0, 10)}.json"`)
      .send(createBackup(repository, installationId(), applicationVersion))
  })

  app.post('/api/v1/restore/preview', { bodyLimit: 10 * 1024 * 1024 }, async (request) => ({
    data: previews.preview(request.body),
  }))

  app.post('/api/v1/restore/confirm', async (request) => {
    const body = exact(request.body, ['previewToken', 'expectedInventoryRevision'])
    if (typeof body.previewToken !== 'string' || !body.previewToken) throw new BackupValidationError()
    if (!Number.isSafeInteger(body.expectedInventoryRevision) || Number(body.expectedInventoryRevision) < 0) {
      throw new BackupValidationError()
    }
    return { data: previews.confirm(body.previewToken, Number(body.expectedInventoryRevision)) }
  })
}

function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BackupValidationError()
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new BackupValidationError()
  }
  return record
}

export function backupApiError(error: unknown): { status: number; code: string; message: string } | undefined {
  if (error instanceof BackupValidationError) {
    return { status: 400, code: 'BACKUP_VALIDATION_ERROR', message: 'The backup is invalid or unsupported.' }
  }
  if (error instanceof RestorePreviewCapacityError) {
    return {
      status: 503,
      code: 'RESTORE_PREVIEW_CAPACITY',
      message: 'Too many restore previews are active. Try again after an existing preview expires.',
    }
  }
  if (error instanceof RestoreConflictError) {
    return {
      status: 409,
      code: error.code,
      message: error.code === 'RESTORE_PREVIEW_STALE'
        ? 'The server inventory changed after preview. Preview the backup again.'
        : 'The restore preview is invalid or expired. Preview the backup again.',
    }
  }
}
