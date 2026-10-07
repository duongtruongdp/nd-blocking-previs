import { describe, expect, it } from 'vitest'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { FRAME_GUIDE_PRESETS, createFrameGuide } from '../core/frameGuides'
import { createCameraDocument } from '../core/sceneDocument'
import { cameraDisplayAspect, cameraProjectionForDocument } from '../runtime/cameraMath'
import { deliveryAspectValue, fitAspectInsideSource, insetFrameGuideRect } from '../runtime/frameGuideMath'

describe('V2.7B frame guides', () => {
  it('provides the required cinema, social, and custom-ready presets', () => {
    const names = FRAME_GUIDE_PRESETS.map((preset) => preset.name)
    expect(names).toEqual(expect.arrayContaining(['16:9', '1.85:1', '2.00:1', '2.39:1', '2.40:1', '4:3', '3:2', '1:1', '4:5', '9:16']))
  })

  it('fits a centered guide rectangle inside the displayed source image', () => {
    const widescreen = fitAspectInsideSource(16 / 9, 2.39)
    expect(widescreen).toEqual({ x: 0, y: expect.closeTo((1 - (16 / 9) / 2.39) / 2, 8), width: 1, height: expect.closeTo((16 / 9) / 2.39, 8) })

    const portrait = fitAspectInsideSource(16 / 9, 9 / 16)
    expect(portrait.x).toBeCloseTo((1 - (9 / 16) / (16 / 9)) / 2, 8)
    expect(portrait.y).toBe(0)
    expect(portrait.height).toBe(1)
  })

  it('applies an optional safe margin without changing the guide aspect', () => {
    const source = fitAspectInsideSource(16 / 9, 2.39)
    const inset = insetFrameGuideRect(source, 10)
    expect(inset.width / inset.height).toBeCloseTo(source.width / source.height, 8)
    expect(inset.x).toBeGreaterThan(source.x)
    expect(inset.y).toBeGreaterThan(source.y)
  })

  it('uses the desqueezed display aspect for anamorphic guides', () => {
    const definition = CAMERA_DATABASE[0]
    const mode = definition.captureModes[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, mode.id)
    const anamorphic = { ...camera, lensType: 'Anamorphic' as const, anamorphicSqueeze: 2 as const }
    const sourceAspect = cameraDisplayAspect(anamorphic)
    const guide = fitAspectInsideSource(sourceAspect, 2.39)
    const physicalGuide = fitAspectInsideSource(mode.activeWidthMm / mode.activeHeightMm, 2.39)
    expect(sourceAspect).toBeCloseTo((mode.activeWidthMm / mode.activeHeightMm) * 2, 8)
    expect(guide.width).toBeCloseTo(2.39 / sourceAspect, 8)
    expect(guide.height).toBe(1)
    expect(guide.width).not.toBeCloseTo(physicalGuide.width, 5)
  })

  it('does not affect physical camera projection or delivery crop math', () => {
    const definition = CAMERA_DATABASE[0]
    const mode = definition.captureModes[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, mode.id)
    const withGuides = { ...camera, frameGuides: [createFrameGuide('guide-01', '2.39:1', 2.39)] }
    const recolored = { ...withGuides, frameGuides: [{ ...withGuides.frameGuides[0], color: '#FF4D8D' }] }
    expect(cameraProjectionForDocument(withGuides)).toEqual(cameraProjectionForDocument(camera))
    expect(cameraProjectionForDocument(recolored)).toEqual(cameraProjectionForDocument(camera))
    expect(withGuides.deliveryAspectRatio).toBe(camera.deliveryAspectRatio)
  })

  it('uses one identical aspect-fit rectangle for Delivery and matching guides', () => {
    ;[3 / 2, 8 / 3].forEach((sourceAspect) => {
      const deliveryAspect = deliveryAspectValue('16:9', sourceAspect)
      const deliveryRect = fitAspectInsideSource(sourceAspect, deliveryAspect)
      const guideRect = fitAspectInsideSource(sourceAspect, 16 / 9)
      expect(deliveryRect).toEqual(guideRect)
    })
    expect(deliveryAspectValue('2.39', 3 / 2)).toBe(2.39)
    expect(deliveryAspectValue('sensor', 8 / 3)).toBe(8 / 3)
  })

  it('appends multiple independent guides with unique IDs and preserves the others on delete', () => {
    const first = createFrameGuide('frame-guide-1', '16:9', 16 / 9)
    const second = createFrameGuide('frame-guide-2', '2.39:1', 2.39)
    const third = createFrameGuide('frame-guide-3', '9:16', 9 / 16)
    const guides = [first, second, third]
    expect(guides).toHaveLength(3)
    expect(new Set(guides.map((guide) => guide.id)).size).toBe(3)
    const afterDelete = guides.filter((guide) => guide.id !== second.id)
    expect(afterDelete).toHaveLength(2)
    expect(afterDelete.map((guide) => guide.id)).toEqual([first.id, third.id])
  })

  it('keeps custom colors and styles independent between guides', () => {
    const red = createFrameGuide('guide-red', 'Red', 16 / 9, { color: '#FF0000', lineStyle: 'solid' })
    const cyan = createFrameGuide('guide-cyan', 'Cyan', 2.39, { color: '#00C8FF', lineStyle: 'dashed' })
    const editedRed = { ...red, color: '#FF4D8D' }
    expect(editedRed.color).toBe('#FF4D8D')
    expect(editedRed.lineStyle).toBe('solid')
    expect(cyan).toMatchObject({ color: '#00C8FF', lineStyle: 'dashed' })
  })

  it('keeps guide arrays owned by their individual cameras and serializable', () => {
    const definition = CAMERA_DATABASE[0]
    const mode = definition.captureModes[0]
    const first = { ...createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, mode.id), frameGuides: [createFrameGuide('guide-01', '16:9', 16 / 9)] }
    const second = createCameraDocument('camera-02', 'Camera 02', [1, 1, 3], [0, 0, 0], definition.id, mode.id)
    const document = { cameras: [first, second] }
    const restored = JSON.parse(JSON.stringify(document)) as typeof document
    expect(restored.cameras[0].frameGuides).toHaveLength(1)
    expect(restored.cameras[1].frameGuides).toEqual([])
    expect(restored.cameras[0].frameGuides).not.toBe(restored.cameras[1].frameGuides)
  })
})
