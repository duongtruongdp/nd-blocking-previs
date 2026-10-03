import { describe, expect, it } from 'vitest'
import {
  computeAnamorphicDisplay,
  computeCameraProjection,
  computeDeliveryFrameCrop,
  fieldOfViewRadians,
  resolveSensorFormat,
} from '../math/cameraMath'

describe('camera and framing math', () => {
  it('resolves the full-frame sensor preset', () => {
    expect(resolveSensorFormat({ kind: 'preset', preset: 'full-frame' })).toEqual({
      widthMm: 36,
      heightMm: 24,
      aspectRatio: 1.5,
    })
  })

  it('calculates a known 50mm full-frame horizontal field of view', () => {
    expect(fieldOfViewRadians(36, 50)).toBeCloseTo(2 * Math.atan(36 / 100), 12)
  })

  it('separates sensor gate from a wider delivery frame crop', () => {
    const sensor = resolveSensorFormat({ kind: 'preset', preset: 'full-frame' })
    const crop = computeDeliveryFrameCrop(sensor, { width: 16, height: 9 })

    expect(crop.mode).toBe('crop-vertical')
    expect(crop.visibleSensorWidthMm).toBe(36)
    expect(crop.visibleSensorHeightMm).toBeCloseTo(20.25, 12)

    const sixteenByNine = computeCameraProjection(
      { kind: 'preset', preset: 'full-frame' },
      50,
      { width: 16, height: 9 },
    )
    const twoPointThirtyNine = computeCameraProjection(
      { kind: 'preset', preset: 'full-frame' },
      50,
      { width: 2.39, height: 1 },
    )

    expect(sixteenByNine.sensorGate.horizontalFovRadians).toBe(
      twoPointThirtyNine.sensorGate.horizontalFovRadians,
    )
    expect(sixteenByNine.deliveryFrame.verticalFovRadians).toBeGreaterThan(
      twoPointThirtyNine.deliveryFrame.verticalFovRadians,
    )
  })

  it('keeps the final delivery frame aspect while modeling squeeze separately', () => {
    const display = computeAnamorphicDisplay(
      { width: 2.39, height: 1 },
      1.33,
      'desqueezed',
    )

    expect(display.squeezedAspectRatio).toBeCloseTo(2.39 / 1.33, 12)
    expect(display.desqueezedAspectRatio).toBeCloseTo(2.39, 12)
    expect(display.horizontalScale).toBe(1.33)
  })
})
