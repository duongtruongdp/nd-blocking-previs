import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
const releaseDirectory = join(repositoryRoot, 'release')
const stagingDirectory = join(releaseDirectory, '.staging-macos')
const outputPath = join(releaseDirectory, 'ND-Blocking-Previs-macOS.zip')
const macosBundleDirectories = [
  join(repositoryRoot, 'src-tauri', 'target', 'release', 'bundle', 'macos'),
  join(repositoryRoot, 'src-tauri', 'target', 'release', 'bundle', 'dmg'),
]

if (process.platform !== 'darwin') {
  throw new Error('The macOS Beta package can only be created on macOS. No Windows package is generated here.')
}

const dmgCandidates = macosBundleDirectories.flatMap((directory) => {
  if (!existsSync(directory)) return []
  return readdirSync(directory)
    .filter((name) => name.endsWith('.dmg') && !name.startsWith('rw.'))
    .map((name) => ({ name, path: join(directory, name), modifiedAt: statSync(join(directory, name)).mtimeMs }))
})
  .sort((left, right) => right.modifiedAt - left.modifiedAt)

const dmg = dmgCandidates[0]
if (!dmg) throw new Error(`No macOS DMG was found in ${macosBundleDirectories.join(' or ')}. Run npm run desktop:build first.`)

rmSync(stagingDirectory, { recursive: true, force: true })
mkdirSync(stagingDirectory, { recursive: true })
mkdirSync(releaseDirectory, { recursive: true })
rmSync(outputPath, { force: true })

cpSync(dmg.path, join(stagingDirectory, basename(dmg.path)))
writeFileSync(join(stagingDirectory, 'README - INSTALLATION.txt'), `ND Blocking & Previs — Beta
macOS Installation

1. Open ${basename(dmg.path)}
2. Drag ND Blocking & Previs to Applications
3. Open the app

If macOS prevents the app from opening:
Open System Settings → Privacy & Security → Security,
then click Open Anyway and confirm Open.

You normally only need to do this once.

Developed by Dương Trương (Andy)
https://duongtruongdp.net
ndtruong.contact@gmail.com
`)

execFileSync('zip', ['-q', '-r', outputPath, '.'], { cwd: stagingDirectory, stdio: 'inherit' })
const outputStats = statSync(outputPath)
if (!outputStats.isFile() || outputStats.size === 0) throw new Error(`Release ZIP was not created correctly: ${outputPath}`)
rmSync(stagingDirectory, { recursive: true, force: true })

console.log(`Packaged ${packageJson.name} ${packageJson.version}: ${outputPath}`)
