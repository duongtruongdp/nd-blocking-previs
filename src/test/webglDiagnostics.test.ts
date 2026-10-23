import { describe, expect, it } from 'vitest'
import { formatWebGLDiagnostics, getWebGLDiagnosticsLog, recordWebGLDiagnosticEvent, webGLDiagnosticsAvailable } from '../runtime/webglDiagnostics'

describe('WebGL diagnostics', () => {
  it('keeps a bounded, identity-only event log available to the desktop diagnostics path', () => {
    if (!import.meta.env.DEV) return
    for (let index = 0; index < 250; index += 1) {
      recordWebGLDiagnosticEvent({ type: 'export-rendering', renderer: 'scene-export', exportStage: 'rendering', message: `frame=${index}` })
    }
    const events = getWebGLDiagnosticsLog()
    expect(events.length).toBeLessThanOrEqual(240)
    expect(events.at(-1)?.renderer).toBe('scene-export')
    expect(formatWebGLDiagnostics()).toContain('activeContextCount')
    expect(webGLDiagnosticsAvailable()).toBe(true)
    expect(formatWebGLDiagnostics()).not.toMatch(/\/Users\/|projectContents|imageData|filesystemPath/)
  })

  it('includes renderer lifecycle timestamps without project data', () => {
    const diagnostics = JSON.parse(formatWebGLDiagnostics()) as { snapshot: { renderers: Array<{ createdAt: string }> } }
    diagnostics.snapshot.renderers.forEach((renderer) => expect(Number.isNaN(Date.parse(renderer.createdAt))).toBe(false))
  })
})
