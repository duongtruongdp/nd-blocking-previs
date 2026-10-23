import { describe, expect, it } from 'vitest'
import { createMasterExportLifecycle } from '../export/masterExportLifecycle'

describe('Master export renderer lifecycle', () => {
  it('keeps one renderer instance while tracking transitions and released resources', () => {
    const lifecycle = createMasterExportLifecycle()
    lifecycle.rendererCreated()
    lifecycle.sceneTransition(12)
    lifecycle.sceneTransition(8)

    expect(lifecycle.stats).toEqual({ rendererInstances: 1, rendererCreations: 1, rendererDisposals: 0, sceneTransitions: 2, resourceDisposals: 20 })
  })

  it('records exactly one final disposal for the persistent renderer', () => {
    const lifecycle = createMasterExportLifecycle()
    lifecycle.rendererCreated()
    lifecycle.rendererDisposed()

    expect(lifecycle.stats.rendererInstances).toBe(0)
    expect(lifecycle.stats.rendererCreations).toBe(1)
    expect(lifecycle.stats.rendererDisposals).toBe(1)
  })
})
