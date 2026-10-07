import { APP_REPOSITORY } from '../core/appMetadata'

export const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${APP_REPOSITORY}/releases/latest`
export const UPDATE_DOWNLOAD_URLS = {
  macos: `https://github.com/${APP_REPOSITORY}/releases/latest/download/ND-Blocking-Previs-macOS.zip`,
  windows: `https://github.com/${APP_REPOSITORY}/releases/latest/download/ND-Blocking-Previs-Windows.zip`,
} as const

export const UPDATE_ASSET_NAMES = {
  macos: 'ND-Blocking-Previs-macOS.zip',
  windows: 'ND-Blocking-Previs-Windows.zip',
} as const

export type UpdatePlatform = keyof typeof UPDATE_DOWNLOAD_URLS

export type PublishedRelease = {
  version: string
  name: string
  notes: string
  assetNames: readonly string[]
}

export type UpdateCheckResult = {
  currentVersion: string
  latestVersion: string
  release: PublishedRelease
  updateAvailable: boolean
}

export function normalizeVersion(value: string): string | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim())
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : null
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left)
  const b = normalizeVersion(right)
  if (!a || !b) throw new Error('Versions must use semantic versioning.')
  const leftParts = a.split('.').map(Number)
  const rightParts = b.split('.').map(Number)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1
  }
  return 0
}

export function platformForUserAgent(userAgent: string): UpdatePlatform | null {
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos'
  if (/Windows/i.test(userAgent)) return 'windows'
  return null
}

export function directDownloadUrl(platform: UpdatePlatform): string {
  return UPDATE_DOWNLOAD_URLS[platform]
}

export function releaseHasAsset(release: PublishedRelease, platform: UpdatePlatform): boolean {
  return release.assetNames.includes(UPDATE_ASSET_NAMES[platform])
}

export function parsePublishedRelease(payload: unknown): PublishedRelease | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (record.draft === true || record.prerelease === true || typeof record.tag_name !== 'string') return null
  const version = normalizeVersion(record.tag_name)
  if (!version) return null
  const assets = Array.isArray(record.assets) ? record.assets : []
  const assetNames = assets.flatMap((asset) => {
    if (!asset || typeof asset !== 'object' || typeof (asset as Record<string, unknown>).name !== 'string') return []
    return [(asset as Record<string, string>).name]
  })
  return {
    version,
    name: typeof record.name === 'string' && record.name.trim() ? record.name : `ND Blocking & Previs ${version}`,
    notes: typeof record.body === 'string' ? record.body.replace(/<[^>]*>/g, '').trim() : '',
    assetNames,
  }
}

export async function checkLatestRelease(currentVersion: string, fetcher: typeof fetch = fetch): Promise<UpdateCheckResult> {
  const normalizedCurrent = normalizeVersion(currentVersion)
  if (!normalizedCurrent) throw new Error('The current app version is invalid.')
  const response = await fetcher(GITHUB_LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`Release check failed with status ${response.status}.`)
  const release = parsePublishedRelease(await response.json())
  if (!release) throw new Error('The latest published release is not valid.')
  return {
    currentVersion: normalizedCurrent,
    latestVersion: release.version,
    release,
    updateAvailable: compareVersions(release.version, normalizedCurrent) > 0,
  }
}
