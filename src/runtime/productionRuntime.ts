import type { AppProps } from '../App'
import { repository } from '../data/httpRepository'
import { serverBackupClient } from '../data/serverBackup'
import { PortainerImportPanel } from '../components/PortainerImportPanel'

export const appProps: AppProps = {
  repository,
  backupClient: serverBackupClient,
  mode: 'production',
  DiscoveryPanel: PortainerImportPanel,
}
