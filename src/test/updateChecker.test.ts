import { describe, expect, it } from 'vitest'
import { compareVersions, directDownloadUrl, normalizeVersion, openUpdateDownload, parsePublishedRelease, platformForUserAgent, checkLatestRelease, releaseHasAsset } from '../platform/updateChecker'

describe('Beta update checker', () => {
  it('normalizes and compares semantic versions', () => {
    expect(normalizeVersion('v0.2.0')).toBe('0.2.0')
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1)
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1)
    expect(compareVersions('0.1.2', '0.1.3')).toBe(-1)
    expect(compareVersions('0.1.3', '0.1.3')).toBe(0)
  })

  it('accepts published release metadata and ignores drafts or pre-releases', () => {
    expect(parsePublishedRelease({ tag_name: 'v0.2.0', name: 'v0.2.0 — Beta', body: '<p>Notes</p>', assets: [{ name: 'ND-Blocking-Previs-macOS.zip' }] })).toMatchObject({ version: '0.2.0', notes: 'Notes' })
    expect(parsePublishedRelease({ tag_name: 'v0.2.0', draft: true })).toBeNull()
    expect(parsePublishedRelease({ tag_name: 'v0.2.0', prerelease: true })).toBeNull()
    expect(parsePublishedRelease({ tag_name: 'latest' })).toBeNull()
  })

  it('checks for updates without lexicographic version errors', async () => {
    const result = await checkLatestRelease('0.9.0', async () => ({ ok: true, status: 200, json: async () => ({ tag_name: 'v0.10.0', assets: [] }) }) as Response)
    expect(result.updateAvailable).toBe(true)
    expect(result.latestVersion).toBe('0.10.0')
  })

  it('maps supported platforms to fixed direct-download assets', () => {
    expect(platformForUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe('macos')
    expect(platformForUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows')
    expect(platformForUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBeNull()
    expect(directDownloadUrl('macos')).toContain('ND-Blocking-Previs-macOS.zip')
    expect(directDownloadUrl('windows')).toContain('ND-Blocking-Previs-Windows.zip')
    const release = parsePublishedRelease({ tag_name: 'v0.2.0', assets: [{ name: 'ND-Blocking-Previs-macOS.zip' }] })!
    expect(releaseHasAsset(release, 'macos')).toBe(true)
    expect(releaseHasAsset(release, 'windows')).toBe(false)
  })

  it('opens the exact fixed update asset once', async () => {
    const opened: string[] = []
    await openUpdateDownload(async (url) => { opened.push(url) }, 'macos')
    expect(opened).toEqual(['https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip'])
  })

  it('propagates opener failures for the UI to report', async () => {
    await expect(openUpdateDownload(async () => { throw new Error('blocked') }, 'macos')).rejects.toThrow('blocked')
  })
})
