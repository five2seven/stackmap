import type { AppProps } from '../App'
import { repository } from '../data/httpRepository'
import { serverBackupClient } from '../data/serverBackup'

export const appProps: AppProps = {
  repository,
  backupClient: serverBackupClient,
  mode: 'production',
}
