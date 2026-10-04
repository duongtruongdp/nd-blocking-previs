import { describe, expect, it } from 'vitest'
import {
  centeredDeliveryAperture,
  computeAnamorphicGeometry,
  diagonalFovRadians,
  frameCoverageAtDistance,
  horizontalFovRadians,
  sensorDiagonalMm,
  verticalFovRadians,
} from '../math/cinematography'

const openGate = { activeWidthMm: 36, activeHeightMm: 24 }

describe('cinematography calculations', () => {
  it('calculates capture aspect, diagonal, and rectilinear FOV', () => {
    expect(openGate.activeWidthMm / openGate.activeHeightMm).toBe(1.5)
    expect(sensorDiagonalMm(openGate)).toBeCloseTo(43.266615, 5)
    expect(horizontalFovRadians(openGate, 50)).toBeCloseTo(2 * Math.atan(36 / 100), 12)
    expect(verticalFovRadians(openGate, 50)).toBeCloseTo(2 * Math.atan(24 / 100), 12)
    expect(diagonalFovRadians(openGate, 50)).toBeCloseTo(2 * Math.atan(Math.hypot(36, 24) / 100), 12)
  })

  it('calculates physical frame coverage in metres at subject distance', () => {
    expect(frameCoverageAtDistance(openGate, 50, 4)).toEqual({ widthM: 2.88, heightM: 1.92 })
  })

  it('returns a centered crop and separate delivery FOV geometry', () => {
    const crop = centeredDeliveryAperture(openGate, 2.39)
    expect(crop.cropAxis).toBe('vertical')
    expect(crop.activeWidthMm).toBe(36)
    expect(crop.activeHeightMm).toBeCloseTo(36 / 2.39, 12)
    expect(crop.cropHorizontalFraction).toBe(0)
    expect(crop.cropVerticalFraction).toBeGreaterThan(0)
  })

  it('keeps anamorphic squeeze separate from physical capture FOV', () => {
    const spherical = computeAnamorphicGeometry(openGate, 35, 1)
    const anamorphic = computeAnamorphicGeometry(openGate, 35, 1.8)
    expect(anamorphic.physicalCaptureHorizontalFovRadians).toBe(spherical.physicalCaptureHorizontalFovRadians)
    expect(anamorphic.desqueezedAspectRatio).toBeCloseTo(1.5 * 1.8, 12)
    expect(anamorphic.desqueezedDisplayHorizontalFovRadians).toBeGreaterThan(anamorphic.physicalCaptureHorizontalFovRadians)
  })

  it('rejects invalid optical and distance inputs', () => {
    expect(() => horizontalFovRadians(openGate, 0)).toThrow()
    expect(() => verticalFovRadians({ activeWidthMm: 0, activeHeightMm: 24 }, 50)).toThrow()
    expect(() => frameCoverageAtDistance(openGate, 50, Number.NaN)).toThrow()
    expect(() => centeredDeliveryAperture(openGate, Infinity)).toThrow()
    expect(() => diagonalFovRadians(openGate, -1)).toThrow()
  })
})
