import { describe, expect, it } from 'vitest'
import { TIMELINE_HEIGHT_MIN, clampTimelineHeight, timelineHeightBounds } from '../core/workspaceLayout'

describe('workspace timeline sizing', () => {
  it('clamps below the minimum, within the range, and above the maximum', () => {
    expect(clampTimelineHeight(80, 900)).toBe(TIMELINE_HEIGHT_MIN)
    expect(clampTimelineHeight(280, 900)).toBe(280)
    expect(clampTimelineHeight(900, 900)).toBe(timelineHeightBounds(900).max)
  })

  it('keeps a minimum Stage allowance when calculating the upper bound', () => {
    const bounds = timelineHeightBounds(900)
    expect(bounds.max).toBe(450)
    expect(bounds.max / 900).toBeLessThanOrEqual(0.5)
  })
})
