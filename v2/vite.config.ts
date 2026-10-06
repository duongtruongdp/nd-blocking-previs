import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { normalizeBasePath } from './src/platform/basePath.ts'

const v2Root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, v2Root, '')
  return {
    root: v2Root,
    base: normalizeBasePath(env.VITE_BASE_PATH),
    plugins: [react()],
    publicDir: false,
    server: { port: 5174, strictPort: true },
    build: {
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      sourcemap: mode === 'staging',
      emptyOutDir: true,
    },
  }
})
