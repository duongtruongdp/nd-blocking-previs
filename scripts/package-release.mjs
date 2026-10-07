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

const dmgName = basename(dmg.path)
cpSync(dmg.path, join(stagingDirectory, dmgName))
writeFileSync(join(stagingDirectory, 'README - INSTALLATION.txt'), `------------------------------------------------------------
ND BLOCKING & PREVIS — BETA
macOS Installation Guide
------------------------------------------------------------

Version: ${packageJson.version}
Platform: macOS Apple Silicon / arm64

WHAT'S INCLUDED

- ${dmgName}
- README - INSTALLATION.txt

INSTALL

1. Open the DMG.
2. Drag ND Blocking & Previs into Applications.
3. Eject the DMG.
4. Open ND Blocking & Previs from Applications.

IF MACOS BLOCKS THE APP

Option 1 — Recommended

1. Try opening the app once.
2. Open System Settings → Privacy & Security.
3. Scroll to Security.
4. Click Open Anyway and confirm Open.

Option 2 — Terminal fallback

If Open Anyway is not available:

1. Make sure the app is in Applications.
2. Open Terminal.
3. Run:

xattr -dr com.apple.quarantine "/Applications/ND Blocking & Previs.app"

4. Press Return.
5. Open the app again.

This command removes the quarantine attribute only from:
/Applications/ND Blocking & Previs.app

It does not disable Gatekeeper or global macOS security settings.

WEB VERSION

https://blocking.duongtruongdp.net/

DEVELOPER

Dương Trương (Andy)
https://duongtruongdp.net
ndtruong.contact@gmail.com

------------------------------------------------------------
`)

execFileSync('zip', ['-q', '-r', outputPath, '.'], { cwd: stagingDirectory, stdio: 'inherit' })
const outputStats = statSync(outputPath)
if (!outputStats.isFile() || outputStats.size === 0) throw new Error(`Release ZIP was not created correctly: ${outputPath}`)
rmSync(stagingDirectory, { recursive: true, force: true })

console.log(`Packaged ${packageJson.name} ${packageJson.version}: ${outputPath}`)
