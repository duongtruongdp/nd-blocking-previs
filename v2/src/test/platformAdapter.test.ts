import { describe, expect, it } from 'vitest'
import { closeDecisionForUnsavedChoice, ensureExtension, platformAdapter, webPlatformAdapter } from '../platform/platformAdapter'

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

  it('maps unsaved close choices to native close decisions', () => {
    expect(closeDecisionForUnsavedChoice('discard')).toBe('close')
    expect(closeDecisionForUnsavedChoice('cancel')).toBe('cancel')
    expect(closeDecisionForUnsavedChoice('save', true)).toBe('close')
    expect(closeDecisionForUnsavedChoice('save', false)).toBe('cancel')
  })
})
