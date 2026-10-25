import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { normalizeBasePath } from './src/platform/basePath.ts'

const appRoot = fileURLToPath(new URL('.', import.meta.url))
const packageVersion = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

function bundledBuildIdentity(): { id: string; timestamp: string; version: string; commit: string } {
  const timestamp = new Date().toISOString()
  let commit = 'unknown'
  try {
    commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim() || commit
  } catch {
    // A source archive may not include the Git metadata. The timestamp still
    // identifies the exact generated frontend bundle.
  }
  return { id: `ndbp-${commit}-${timestamp}`, timestamp, version: packageVersion, commit }
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, appRoot, '')
    const identity = bundledBuildIdentity()
  console.info(`[ND Blocking & Previs] frontend build ${identity.id} version=${identity.version}`)
    return {
      root: appRoot,
    base: normalizeBasePath(env.VITE_BASE_PATH),
    plugins: [react()],
    define: {
      __NDBP_BUILD_ID__: JSON.stringify(identity.id),
      __NDBP_BUILD_TIMESTAMP__: JSON.stringify(identity.timestamp),
      __NDBP_BUILD_VERSION__: JSON.stringify(identity.version),
      __NDBP_BUILD_COMMIT__: JSON.stringify(identity.commit),
    },
    publicDir: false,
    server: { port: 5174, strictPort: true },
    build: {
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      sourcemap: mode === 'staging',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          app: fileURLToPath(new URL('./index.html', import.meta.url)),
          phoneCamera: fileURLToPath(new URL('./phone-camera/index.html', import.meta.url)),
        },
      },
    },
  }
})
