import { describe, expect, it } from 'vitest'
import {
  frameDurationSeconds,
  frameRateLabel,
  frameToSeconds,
  secondsToNearestFrame,
} from '../math/frameRate'

describe('frame-rate math', () => {
  it('represents fractional production rates as exact rationals', () => {
    const rate = { numerator: 24_000, denominator: 1_001 }

    expect(frameRateLabel(rate)).toBe('23.976')
    expect(frameDurationSeconds(rate)).toBeCloseTo(1_001 / 24_000, 12)
    expect(frameToSeconds(24, rate)).toBeCloseTo(1.001, 12)
  })

  it('converts seconds to the nearest integer frame', () => {
    const rate = { numerator: 30_000, denominator: 1_001 }

    expect(secondsToNearestFrame(1, rate)).toBe(30)
    expect(secondsToNearestFrame(1.016, rate)).toBe(30)
    expect(secondsToNearestFrame(1.018, rate)).toBe(31)
  })
})
