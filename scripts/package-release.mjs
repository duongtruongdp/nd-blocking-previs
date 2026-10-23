import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const shellScript = fileURLToPath(new URL('./package-macos-release.sh', import.meta.url))
execFileSync('bash', [shellScript], { stdio: 'inherit' })
