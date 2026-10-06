import { describe, expect, it } from 'vitest'
import { computeCameraViewProjection, computeCameraViewViewport } from '../math/cameraView'
import type { CameraDocument } from '../domain/types'

function camera(overrides: Partial<CameraDocument> = {}): CameraDocument {
  return {
    id: 'camera-1',
    name: 'Camera 01',
    cameraModelId: 'generic.camera',
    sensorModeId: 'generic.camera.open-gate',
    resolvedCapture: {
      datasetVersion: '1.0.0',
      cameraId: 'generic.camera',
      recordingModeId: 'generic.camera.open-gate',
      physicalSensorId: 'generic.camera.sensor',
      activeWidthMm: 36,
      activeHeightMm: 24,
    },
    placement: { position: [0, 1.5, 4], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
    lens: {
      focalLengthMm: 50,
      sensorFormat: { kind: 'custom', widthMm: 36, heightMm: 24 },
      profile: { type: 'spherical', preset: 'spherical', squeezeFactor: 1 },
      focusDistanceM: 5,
    },
    frameGuide: { preset: 'capture' },
    aim: { mode: 'free' },
    ...overrides,
  }
}

describe('Camera View projection and layout', () => {
  it('uses the selected Camera capture dimensions and focal length', () => {
    const initial = computeCameraViewProjection(camera())
    const longLens = computeCameraViewProjection(camera({ lens: { ...camera().lens, focalLengthMm: 85 } }))
    const super35 = computeCameraViewProjection(camera({ resolvedCapture: { ...camera().resolvedCapture, activeWidthMm: 24.89, activeHeightMm: 18.66 } }))

    expect(initial.displayAspectRatio).toBeCloseTo(1.5, 12)
    expect(longLens.verticalFovRadians).toBeLessThan(initial.verticalFovRadians)
    expect(super35.displayAspectRatio).not.toBe(initial.displayAspectRatio)
  })

  it('keeps Frame Guide crop centered without changing capture projection', () => {
    const capture = computeCameraViewProjection(camera({ frameGuide: { preset: '2.39:1' } }))
    const base = computeCameraViewProjection(camera())

    expect(capture.verticalFovRadians).toBe(base.verticalFovRadians)
    expect(capture.horizontalFovRadians).toBe(base.horizontalFovRadians)
    expect(capture.frameGuideAspectRatio).toBeCloseTo(2.39, 12)
    expect(capture.delivery.widthFraction).toBe(1)
    expect(capture.delivery.heightFraction).toBeLessThan(1)
    expect(capture.delivery.cropAxis).toBe('vertical')
  })

  it('desqueezes anamorphic display once while preserving physical vertical framing', () => {
    const spherical = computeCameraViewProjection(camera())
    const anamorphic = computeCameraViewProjection(camera({
      lens: {
        ...camera().lens,
        profile: { type: 'anamorphic', preset: '1.5', squeezeFactor: 1.5 },
      },
    }))

    expect(anamorphic.verticalFovRadians).toBe(spherical.verticalFovRadians)
    expect(anamorphic.displayAspectRatio).toBeCloseTo(1.5 * 1.5, 12)
    expect(anamorphic.horizontalFovRadians).toBeGreaterThan(spherical.horizontalFovRadians)
    expect(anamorphic.squeezeFactor).toBe(1.5)
  })

  it('letterboxes or pillarboxes the Camera image without changing its aspect', () => {
    const wide = computeCameraViewViewport(1600, 900, 1.5)
    const tall = computeCameraViewViewport(900, 1200, 1.5)

    expect(wide.width).toBe(1350)
    expect(wide.height).toBe(900)
    expect(wide.left).toBe(125)
    expect(tall.width).toBe(900)
    expect(tall.height).toBe(600)
    expect(tall.top).toBe(300)
    expect(wide.width / wide.height).toBeCloseTo(1.5, 12)
    expect(tall.width / tall.height).toBeCloseTo(1.5, 12)
  })
})
