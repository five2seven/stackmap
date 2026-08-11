import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  const runtime = demo ? './src/runtime/demoRuntime.ts' : './src/runtime/productionRuntime.ts'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@stackmap/runtime': fileURLToPath(new URL(runtime, import.meta.url)),
      },
    },
    publicDir: demo ? 'public-demo' : 'public',
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
    },
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8080',
        '/health': 'http://127.0.0.1:8080',
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      exclude: [...configDefaults.exclude, 'e2e/**', 'dist-server/**'],
    },
  }
})
