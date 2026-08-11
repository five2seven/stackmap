import type { AppProps } from '../App'
import { createDemoRepository } from '../data/demoRepository'

export const appProps: AppProps = {
  repository: createDemoRepository(),
  mode: 'demo',
}
