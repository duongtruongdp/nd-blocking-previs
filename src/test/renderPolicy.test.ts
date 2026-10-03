import { describe, expect, it } from 'vitest'
import { capStagePixelRatio, MAX_STAGE_PIXEL_RATIO } from '../runtime/renderPolicy'

describe('Stage render policy', () => {
  it('keeps standard displays at native density and caps Retina density', () => {
    expect(capStagePixelRatio(1)).toBe(1)
    expect(capStagePixelRatio(1.5)).toBe(1.5)
    expect(capStagePixelRatio(3)).toBe(MAX_STAGE_PIXEL_RATIO)
    expect(capStagePixelRatio(undefined)).toBe(1)
  })
})
