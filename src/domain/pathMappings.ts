import type { PathMapping } from './types'

export interface LegacyPaths {
  configPath?: string
  dataPath?: string
}

export function migrateLegacyPaths(serviceId: string, legacy: LegacyPaths): PathMapping[] {
  return [
    legacy.configPath
      ? {
          id: `${serviceId}-configuration-path`,
          hostPath: legacy.configPath,
          containerPath: '',
          purpose: 'Configuration',
          readOnly: false,
        }
      : undefined,
    legacy.dataPath
      ? {
          id: `${serviceId}-data-path`,
          hostPath: legacy.dataPath,
          containerPath: '',
          purpose: 'Data',
          readOnly: false,
        }
      : undefined,
  ].filter((path): path is PathMapping => Boolean(path))
}

export function normalizePaths(paths: PathMapping[]): PathMapping[] {
  return paths
    .map((path) => ({
      ...path,
      hostPath: path.hostPath.trim(),
      containerPath: path.containerPath.trim(),
      purpose: path.purpose.trim(),
    }))
    .filter((path) => path.hostPath || path.containerPath || path.purpose)
}
