import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJsonPath = join(repositoryRoot, 'package.json')
const packageLockPath = join(repositoryRoot, 'package-lock.json')
const tauriConfigPath = join(repositoryRoot, 'src-tauri', 'tauri.conf.json')
const cargoManifestPath = join(repositoryRoot, 'src-tauri', 'Cargo.toml')
const releaseZipPath = join(repositoryRoot, 'release', 'ND-Blocking-Previs-macOS.zip')
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const readVersions = () => {
  const packageJson = readJson(packageJsonPath)
  const packageLock = readJson(packageLockPath)
  const tauriConfig = readJson(tauriConfigPath)
  const cargo = readFileSync(cargoManifestPath, 'utf8')
  const cargoMatch = cargo.match(/^version\s*=\s*"([^"]+)"/m)
  if (!cargoMatch) throw new Error(`Could not find [package] version in ${cargoManifestPath}`)

  return {
    packageJson: packageJson.version,
    packageLock: packageLock.version,
    packageLockRoot: packageLock.packages?.['']?.version,
    tauri: tauriConfig.version,
    cargo: cargoMatch[1],
  }
}

const validateVersion = (version) => {
  if (typeof version !== 'string' || !semverPattern.test(version)) {
    throw new Error(`Invalid semantic version: ${version ?? '(missing)'}`)
  }
}

const checkVersions = () => {
  const versions = readVersions()
  for (const version of Object.values(versions)) validateVersion(version)
  const uniqueVersions = new Set(Object.values(versions))
  if (uniqueVersions.size !== 1) {
    throw new Error(`Version mismatch: ${Object.entries(versions).map(([key, value]) => `${key}=${value}`).join(', ')}`)
  }
  console.log(`Version check passed: ${versions.packageJson}`)
  return versions.packageJson
}

const setVersion = (version) => {
  validateVersion(version)
  const packageJson = readJson(packageJsonPath)
  const packageLock = readJson(packageLockPath)
  const tauriConfig = readJson(tauriConfigPath)
  const cargo = readFileSync(cargoManifestPath, 'utf8')

  packageJson.version = version
  packageLock.version = version
  if (packageLock.packages?.['']) packageLock.packages[''].version = version
  tauriConfig.version = version
  const updatedCargo = cargo.replace(/^(version\s*=\s*")[^"]+("\s*$)/m, `$1${version}$2`)
  if (updatedCargo === cargo) throw new Error(`Could not update [package] version in ${cargoManifestPath}`)

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
  writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`)
  writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`)
  writeFileSync(cargoManifestPath, updatedCargo)
  checkVersions()
  console.log(`Set application version to ${version}`)
}

const verifyRelease = () => {
  const version = checkVersions()
  if (!existsSync(releaseZipPath)) throw new Error(`Missing ${releaseZipPath}. Run npm run release:package first.`)
  const zipStats = statSync(releaseZipPath)
  if (!zipStats.isFile() || zipStats.size === 0) throw new Error(`Release ZIP is empty: ${releaseZipPath}`)

  const entries = execFileSync('unzip', ['-Z1', releaseZipPath], { encoding: 'utf8' })
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const dmgEntries = entries.filter((entry) => entry.endsWith('.dmg'))
  const expectedReadme = 'README - INSTALLATION.txt'
  if (dmgEntries.length !== 1 || !entries.includes(expectedReadme) || entries.length !== 2) {
    throw new Error(`Unexpected macOS package contents: ${entries.join(', ')}`)
  }
  console.log(`Release package verified for ${version}: ${releaseZipPath}`)
}

const [command, value] = process.argv.slice(2)
try {
  if (command === 'check') checkVersions()
  else if (command === 'set') setVersion(value)
  else if (command === 'verify-release') verifyRelease()
  else throw new Error('Usage: node scripts/version-tools.mjs <check|set VERSION|verify-release>')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
