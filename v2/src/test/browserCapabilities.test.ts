import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectBrowserCapabilities, detectWebGLSupport, supportedWebmMimeTypes } from '../platform/browserCapabilities'
import { normalizeBasePath } from '../platform/basePath'

describe('V2 web deployment helpers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('normalizes root and subpath deployment bases', () => {
    expect(normalizeBasePath(undefined)).toBe('/')
    expect(normalizeBasePath('/')).toBe('/')
    expect(normalizeBasePath('blocking')).toBe('/blocking/')
    expect(normalizeBasePath('/blocking/')).toBe('/blocking/')
  })

  it('detects WebGL without throwing when a context is unavailable', () => {
    const canvas = { getContext: vi.fn(() => null) } as unknown as HTMLCanvasElement
    expect(detectWebGLSupport(canvas)).toEqual({ webgl: false, webgl2: false })
  })

  it('reports only browser-supported WebM formats', () => {
    class MockMediaRecorder {
      static isTypeSupported(type: string) { return type === 'video/webm;codecs=vp8' }
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    expect(supportedWebmMimeTypes()).toEqual(['video/webm;codecs=vp8'])
    expect(detectBrowserCapabilities().webm).toBe(true)
  })
})
