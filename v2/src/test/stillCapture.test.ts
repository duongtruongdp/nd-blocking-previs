import { describe, expect, it } from 'vitest'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { activeCameraForStill, cameraStillFilename, stillDimensionsForCamera } from '../runtime/stillCapture'
import { cameraOverlayMode, compactPreviewOverlayPolicy, fullCameraInfoLines, layoutOverlayLabels, previewCameraLabel } from '../runtime/cameraOverlayLayout'

describe('V2 camera still capture planning', () => {
  const definition = CAMERA_DATABASE[0]
  const camera = createCameraDocument('camera-02', 'Camera 02', [0, 1.6, 4], [0, 0, 0], definition.id, definition.captureModes[0].id)

  it('resolves the still source from activeCameraId rather than selection', () => {
    const scene = { ...createEmptySceneDocument(), cameras: [camera], activeCameraId: camera.id }
    expect(activeCameraForStill(scene)?.id).toBe('camera-02')
    expect(activeCameraForStill({ ...scene, activeCameraId: null })).toBeNull()
  })

  it('uses authoritative delivery dimensions', () => {
    expect(stillDimensionsForCamera({ ...camera, deliveryAspectRatio: '16:9' }, 1920)).toEqual({ width: 1920, height: 1080 })
    expect(stillDimensionsForCamera({ ...camera, deliveryAspectRatio: '2.39' }, 1920).height).toBeCloseTo(804, 0)
  })

  it('sanitizes project, scene, camera, and frame in the PNG filename', () => {
    expect(cameraStillFilename('Nike TVC', 'Scene/03', 'Camera 02', 48)).toBe('Nike_TVC_Scene_03_Camera_02_F0048.png')
  })

  it('switches overlay metadata density from the camera container width', () => {
    expect(cameraOverlayMode(900)).toBe('full')
    expect(cameraOverlayMode(480)).toBe('compact')
  })

  it('keeps the small Camera Preview to a camera badge and frame lines', () => {
    expect(compactPreviewOverlayPolicy()).toEqual({ showCameraLabel: true, showDeliveryLabel: false, showGuideLabels: false })
    expect(previewCameraLabel('Camera 01', 35, 420)).toBe('Camera 01 · 35mm')
    expect(previewCameraLabel('Camera With A Very Long Name', 35, 260)).toBe('Camera With A Very Long Name')
  })

  it('formats one full Camera View info box without the Camera name', () => {
    expect(fullCameraInfoLines(35, 'ALEXA 35 Xtreme', 'Open Gate 4.6K')).toEqual(['35mm · ALEXA 35 Xtreme', 'Open Gate 4.6K'])
    expect(fullCameraInfoLines(35)).toEqual(['35mm', 'Sensor / Native'])
  })

  it('stacks frame labels away from camera status and each other', () => {
    const placements = layoutOverlayLabels([
      { id: 'delivery', text: 'DELIVERY · 16:9', rect: { x: 0, y: 0, width: 1, height: 1 } },
      { id: 'guide-16-9', text: '16:9', rect: { x: 0, y: 0, width: 1, height: 1 } },
      { id: 'guide-239', text: '2.39', rect: { x: 0, y: 0.1, width: 1, height: 0.8 } },
    ], { width: 800, height: 450, statusRect: { x: 0, y: 0, width: 250, height: 60 } })
    expect(placements).toHaveLength(3)
    expect(placements[0].side).toBe('right')
    expect(placements[1].topOffset).toBeGreaterThan(placements[0].topOffset)
    expect(placements[2].topOffset).toBeGreaterThan(0)
  })
})
