import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const v2Root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: v2Root,
  plugins: [react()],
  publicDir: false,
  server: { port: 5174, strictPort: true },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)) },
})
