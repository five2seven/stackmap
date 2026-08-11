import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { appProps } from '@stackmap/runtime'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App {...appProps} />
  </StrictMode>,
)
