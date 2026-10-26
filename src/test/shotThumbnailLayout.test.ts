import { describe, expect, it } from 'vitest'
import { containThumbnailRect, SHOT_LIST_PREVIEW_ASPECT, thumbnailAspectRatio } from '../core/shotThumbnailLayout'

describe('Shot List thumbnail layout', () => {
  it.each([
    ['16:9', 1920, 1080, 16 / 9],
    ['2.39:1', 2390, 1000, 2.39],
    ['4:3', 1440, 1080, 4 / 3],
    ['1:1', 1000, 1000, 1],
    ['9:16', 900, 1600, 9 / 16],
  ])('uses intrinsic %s dimensions', (_label, width, height, expected) => {
    expect(thumbnailAspectRatio({ width, height })).toBeCloseTo(expected, 8)
  })

  it('uses the standard 16:9 preview ratio only for missing or invalid dimensions', () => {
    expect(SHOT_LIST_PREVIEW_ASPECT).toBeCloseTo(16 / 9, 8)
    expect(thumbnailAspectRatio(null)).toBe(SHOT_LIST_PREVIEW_ASPECT)
    expect(thumbnailAspectRatio({ width: 0, height: 1080 })).toBe(SHOT_LIST_PREVIEW_ASPECT)
    expect(thumbnailAspectRatio({ width: Number.NaN, height: 1080 })).toBe(SHOT_LIST_PREVIEW_ASPECT)
  })

  it('fits without crop or stretch and centers letterboxing', () => {
    const rect = containThumbnailRect(400, 225, 1920, 1080)
    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 225 })
    expect(rect.width / rect.height).toBeCloseTo(16 / 9, 8)
  })

  it.each([
    ['2.39:1', 2390, 1000, { x: 0, y: 28.817991631799174, width: 400, height: 167.36401673640165 }],
    ['4:3', 1440, 1080, { x: 50, y: 0, width: 300, height: 225 }],
    ['1:1', 1000, 1000, { x: 87.5, y: 0, width: 225, height: 225 }],
    ['9:16', 900, 1600, { x: 136.71875, y: 0, width: 126.5625, height: 225 }],
  ])('contains the full %s image in the standard frame', (_label, sourceWidth, sourceHeight, expected) => {
    const rect = containThumbnailRect(400, 225, sourceWidth, sourceHeight)
    expect(rect.x).toBeCloseTo(expected.x, 8)
    expect(rect.y).toBeCloseTo(expected.y, 8)
    expect(rect.width).toBeCloseTo(expected.width, 8)
    expect(rect.height).toBeCloseTo(expected.height, 8)
    expect(rect.width / rect.height).toBeCloseTo(sourceWidth / sourceHeight, 8)
  })
})
