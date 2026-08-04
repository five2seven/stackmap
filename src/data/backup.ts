import { CURRENT_SCHEMA_VERSION, validateImport } from '../domain/schema'
import type { StackMapData, StackMapExport } from '../domain/types'

export function createExport(data: StackMapData, exportedAt = new Date().toISOString()): StackMapExport {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt,
    services: data.services.map((service) => ({
      ...service,
      ports: service.ports.map((port) => {
        const exportedPort = { ...port }
        delete exportedPort.id
        return exportedPort
      }),
    })),
    hosts: data.hosts,
  }
}

export function serializeExport(data: StackMapData) {
  return JSON.stringify(createExport(data), null, 2)
}

export function parseImport(text: string): StackMapExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('The selected file is not valid JSON.')
  }
  return validateImport(parsed)
}
