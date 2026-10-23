import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createCameraDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { CameraPreviewOverlay } from '../components/V2Stage'

describe('floating Camera Preview DOM', () => {
  it('renders the image/guide shell and close control without camera metadata', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1.6, 4], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    const markup = renderToStaticMarkup(createElement(CameraPreviewOverlay, { displayCamera: camera, displayActors: [], imageAspect: 16 / 9, masterPreview: null, masterImageUrls: {}, activeMasterImageClipId: null, readOnly: false, onOpenCameraView: vi.fn(), onCameraPreviewChange: vi.fn() }))

    expect(markup).toContain('class="v2-camera-preview-ui"')
    expect(markup).toContain('class="v2-camera-preview-close"')
    expect(markup).toContain('aria-label="Close Camera Preview"')
    expect(markup).not.toContain('Camera 01')
    expect(markup).not.toContain('24mm')
    expect(markup).not.toContain('v2-camera-preview-label')
  })

  it('keeps Camera View metadata formatting separate from the floating preview', async () => {
    const { fullCameraInfoLines } = await import('../runtime/cameraOverlayLayout')
    expect(fullCameraInfoLines(24, 'ALEXA 35', 'Open Gate 4.6K')).toEqual(['24mm · ALEXA 35', 'Open Gate 4.6K'])
  })
})
