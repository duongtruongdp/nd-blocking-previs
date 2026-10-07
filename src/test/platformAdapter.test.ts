import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeDecisionForUnsavedChoice, ensureExtension, platformAdapter, webPlatformAdapter } from '../platform/platformAdapter'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('platform adapter foundation', () => {
  it('selects the browser adapter outside the Tauri runtime', () => {
    expect(platformAdapter.kind).toBe('web')
    expect(webPlatformAdapter.kind).toBe('web')
  })

  it('normalizes native file extensions without duplicating them', () => {
    expect(ensureExtension('/shots/scene.ndblock', 'ndblock')).toBe('/shots/scene.ndblock')
    expect(ensureExtension('/shots/scene', 'ndblock')).toBe('/shots/scene.ndblock')
    expect(ensureExtension('/shots/SCENE.NDSCENE', '.ndscene')).toBe('/shots/SCENE.NDSCENE')
  })

  it('keeps browser export location selection non-native', async () => {
    await expect(webPlatformAdapter.chooseExportLocation('shot.webm', 'webm')).resolves.toBeNull()
  })

  it('opens external URLs in the browser adapter', async () => {
    const open = vi.fn(() => ({}) as Window)
    vi.stubGlobal('window', { open })

    await webPlatformAdapter.openExternalUrl('https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip')

    expect(open).toHaveBeenCalledWith('https://github.com/duongtruongdp/nd-blocking-previs/releases/latest/download/ND-Blocking-Previs-macOS.zip', '_blank', 'noopener,noreferrer')
  })

  it('reports when the browser blocks an external URL', async () => {
    vi.stubGlobal('window', { open: () => null })

    await expect(webPlatformAdapter.openExternalUrl('https://example.com/update.zip')).rejects.toThrow('browser blocked')
  })

  it('keeps desktop-only library features inert in the browser adapter', async () => {
    expect(webPlatformAdapter.revealProjectLabel).toBe('Show in Finder')
    expect(webPlatformAdapter.nativeExportRuntime).toBeUndefined()
    await expect(webPlatformAdapter.loadRecentProjects()).resolves.toEqual([])
    await expect(webPlatformAdapter.loadRecoveryEntries()).resolves.toEqual([])
    await expect(webPlatformAdapter.loadUpdatePreferences()).resolves.toEqual({ autoCheck: true })
    await expect(webPlatformAdapter.loadProjectThumbnail('project-test')).resolves.toBeNull()
    await expect(webPlatformAdapter.initialProjectPath()).resolves.toBeNull()
  })

  it('maps unsaved close choices to native close decisions', () => {
    expect(closeDecisionForUnsavedChoice('discard')).toBe('close')
    expect(closeDecisionForUnsavedChoice('cancel')).toBe('cancel')
    expect(closeDecisionForUnsavedChoice('save', true)).toBe('close')
    expect(closeDecisionForUnsavedChoice('save', false)).toBe('cancel')
  })
})
