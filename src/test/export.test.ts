import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { cameraRotationLookingAt } from '../runtime/cameraMath'
import { evaluateExportFrame } from '../export/exportEvaluation'
import { centeredCrop, deliveryAspectForCamera, desqueezedCaptureAspect, dimensionsForDeliveryAspect, exportDurationSeconds, exportFilename, exportFrameRange, formatExportDuration, frameTimestampMicroseconds, physicalCaptureAspect, rationalFrameDuration, sanitizeExportFilename, validateExportRequest } from '../export/exportMath'
import { preferredExportFormat } from '../export/formatSupport'
import { selectWebmMimeType, supportedWebmMimeTypes } from '../export/mediaRecorder'
import { frameToTimelinePercent, upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('V2.6 video export logic', () => {
  it('creates an inclusive integer Mark In to Mark Out frame range', () => {
    expect(exportFrameRange(0, 47)).toEqual(Array.from({ length: 48 }, (_, frame) => frame))
    expect(exportFrameRange(3, 3)).toEqual([3])
    expect(exportFrameRange(3.5, 8)).toEqual([])
  })

  it('preserves rational frame durations', () => {
    expect(rationalFrameDuration({ numerator: 24, denominator: 1 })).toBeCloseTo(1 / 24)
    expect(rationalFrameDuration({ numerator: 24000, denominator: 1001 })).toBeCloseTo(1001 / 24000)
    expect(rationalFrameDuration({ numerator: 25, denominator: 1 })).toBeCloseTo(1 / 25)
    expect(rationalFrameDuration({ numerator: 30000, denominator: 1001 })).toBeCloseTo(1001 / 30000)
  })

  it('derives export duration and media timestamps from the rational frame rate', () => {
    expect(exportDurationSeconds(0, 47, { numerator: 24, denominator: 1 })).toBe(2)
    expect(exportDurationSeconds(0, 112, { numerator: 24, denominator: 1 })).toBeCloseTo(113 / 24)
    expect(exportDurationSeconds(0, 239, { numerator: 24000, denominator: 1001 })).toBeCloseTo(240 * 1001 / 24000)
    expect(frameTimestampMicroseconds(0, { numerator: 24, denominator: 1 })).toBe(0)
    expect(frameTimestampMicroseconds(1, { numerator: 24, denominator: 1 })).toBe(41_667)
    expect(frameTimestampMicroseconds(24, { numerator: 24000, denominator: 1001 })).toBe(1_001_000)
  })

  it('derives even output dimensions from the Delivery Frame', () => {
    expect(dimensionsForDeliveryAspect(1280, 16 / 9)).toEqual({ width: 1280, height: 720 })
    expect(dimensionsForDeliveryAspect(1920, 16 / 9)).toEqual({ width: 1920, height: 1080 })
    expect(dimensionsForDeliveryAspect(2560, 16 / 9)).toEqual({ width: 2560, height: 1440 })
    expect(dimensionsForDeliveryAspect(1920, 2)).toEqual({ width: 1920, height: 960 })
    expect(dimensionsForDeliveryAspect(1920, 2.39).height).toBe(804)
    expect(dimensionsForDeliveryAspect(1920, 2.39).height % 2).toBe(0)
  })

  it('keeps the delivery dimensions independent from the physical capture aspect', () => {
    const physicalAspect = 27.99 / 19.22
    expect(dimensionsForDeliveryAspect(1920, 16 / 9)).toEqual({ width: 1920, height: 1080 })
    expect(dimensionsForDeliveryAspect(1920, physicalAspect)).not.toEqual({ width: 1920, height: 1080 })
  })

  it('center-crops without stretching', () => {
    expect(centeredCrop(1920, 1080, 2)).toEqual({ x: 0, y: 60, width: 1920, height: 960 })
    expect(centeredCrop(1920, 1080, 16 / 9)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('formats safe download names and durations', () => {
    expect(sanitizeExportFilename('Scene / 01:Wide')).toBe('Scene_01_Wide')
    expect(exportFilename('Scene / 01', 'Camera: 01', 0, 47)).toBe('Scene_01_Camera_01_0-47.webm')
    expect(formatExportDuration(0, 47, { numerator: 24, denominator: 1 })).toBe('00:02:00')
    expect(exportFilename('Scene', 'Camera', 0, 47, 'mp4')).toBe('Scene_Camera_0-47.mp4')
  })

  it('prefers MP4, then falls back to WebM based on browser capability', () => {
    expect(preferredExportFormat({ mp4: true, webm: true })).toBe('mp4')
    expect(preferredExportFormat({ mp4: false, webm: true })).toBe('webm')
    expect(preferredExportFormat({ mp4: false, webm: false })).toBeNull()
  })

  it('maps Mark In and Mark Out to exact timeline positions', () => {
    const timeline = { startFrame: 0, endFrame: 120 }
    const markIn = frameToTimelinePercent(24, timeline)
    const markOut = frameToTimelinePercent(96, timeline)
    expect(frameToTimelinePercent(0, timeline)).toBe(0)
    expect(markIn).toBe(20)
    expect(markOut).toBe(80)
    expect(markOut - markIn).toBe(60)
    expect(frameToTimelinePercent(120, timeline)).toBe(100)
  })

  it('requires an active camera and a valid Mark range', () => {
    const document = createEmptySceneDocument()
    expect(validateExportRequest(document, null, 0, 10)).toContain('Camera')
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 2, 4], cameraRotationLookingAt([0, 2, 4], [0, 1, 0]), CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    const withCamera = { ...document, cameras: [camera], activeCameraId: camera.id }
    expect(validateExportRequest(withCamera, camera.id, 10, 0)).toContain('Mark Out')
    expect(validateExportRequest(withCamera, camera.id, 0, 10)).toBeNull()
  })

  it('keeps physical capture geometry separate from the Delivery Frame', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 2, 4], cameraRotationLookingAt([0, 2, 4], [0, 1, 0]), CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    const document = { ...createEmptySceneDocument(), cameras: [camera], activeCameraId: camera.id }
    const physical = physicalCaptureAspect(document, camera.id)
    expect(physical).toBeCloseTo(27.99 / 19.22)
    expect(deliveryAspectForCamera('2.39', camera.id, document)).toBe(2.39)
    expect(physicalCaptureAspect(document, camera.id)).toBe(physical)
  })

  it('desqueezes the source before applying the delivery crop', () => {
    const base = createCameraDocument('camera-01', 'Camera 01', [0, 2, 4], cameraRotationLookingAt([0, 2, 4], [0, 1, 0]), CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    const camera = { ...base, lensType: 'Anamorphic' as const, anamorphicSqueeze: 2 as const, deliveryAspectRatio: '2.39' as const }
    const document = { ...createEmptySceneDocument(), cameras: [camera], activeCameraId: camera.id }
    const physical = physicalCaptureAspect(document, camera.id)!
    const desqueezed = desqueezedCaptureAspect(document, camera.id)!
    expect(desqueezed).toBeCloseTo(physical * 2, 8)
    expect(deliveryAspectForCamera(camera.deliveryAspectRatio, camera.id, document)).toBe(2.39)
    const source = dimensionsForDeliveryAspect(1920, desqueezed)
    const crop = centeredCrop(source.width, source.height, 2.39)
    expect(source.width / source.height).toBeCloseTo(desqueezed, 2)
    expect(crop.width / crop.height).toBeCloseTo(2.39, 8)
    expect(dimensionsForDeliveryAspect(1920, 2.39)).toEqual({ width: 1920, height: 804 })
  })

  it('evaluates export frames through the existing Timeline evaluator', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const timeline = upsertTimelineKeyframe(createEmptySceneDocument().timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline: upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 24, [4, 0, 0]) }
    expect(evaluateExportFrame(document, 12)[actor.id].position).toEqual([2, 0, 0])
  })

  it('prefers VP9, then VP8, then generic WebM when supported', () => {
    const original = globalThis.MediaRecorder
    class MockMediaRecorder {
      static isTypeSupported(type: string) { return type === 'video/webm;codecs=vp8' || type === 'video/webm' }
    }
    vi.stubGlobal('MediaRecorder', MockMediaRecorder)
    expect(supportedWebmMimeTypes()).toEqual(['video/webm;codecs=vp8', 'video/webm'])
    expect(selectWebmMimeType()).toBe('video/webm;codecs=vp8')
    vi.stubGlobal('MediaRecorder', original)
  })

  afterEach(() => vi.unstubAllGlobals())
})
