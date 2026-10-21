import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const relayUrl = process.argv[2] ?? 'ws://localhost:8787/live'
const origin = process.argv[3] ?? (relayUrl.startsWith('wss:') ? 'https://blocking.duongtruongdp.net' : 'http://localhost')
const root = dirname(fileURLToPath(import.meta.url))
const entry = join(root, 'live-review-transport-harness.ts')
const outputDir = mkdtempSync(join(tmpdir(), 'nd-live-review-transport-'))

function endpoint(value) {
  const url = new URL(value)
  return `${url.protocol}//${url.host}${url.pathname}`
}

console.log(`[transport-harness] connecting ${endpoint(relayUrl)} origin=${origin}`)
try {
  await build({
    configFile: false,
    logLevel: 'error',
    ssr: { noExternal: ['ws'] },
    build: {
      ssr: entry,
      outDir: outputDir,
      emptyOutDir: true,
      rollupOptions: {
        input: entry,
        output: { entryFileNames: 'harness.mjs', format: 'es', inlineDynamicImports: true },
      },
    },
  })
  const harness = await import(pathToFileURL(join(outputDir, 'harness.mjs')).href)
  await harness.runLiveReviewTransportHarness(relayUrl, origin)
} finally {
  rmSync(outputDir, { recursive: true, force: true })
}
