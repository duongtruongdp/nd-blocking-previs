import { describe, expect, it } from 'vitest'
import { TIMELINE_HEIGHT_MIN, clampTimelineHeight, clampWorkspaceSidebarWidth, timelineHeightBounds, workspaceSidebarWidthBounds, WORKSPACE_SIDEBAR_WIDTH_DEFAULT, WORKSPACE_SIDEBAR_WIDTH_MAX, WORKSPACE_SIDEBAR_WIDTH_MIN } from '../core/workspaceLayout'

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

describe('workspace sidebar sizing', () => {
  it('keeps the sidebar within its responsive bounds', () => {
    expect(clampWorkspaceSidebarWidth(180, 1440)).toBe(WORKSPACE_SIDEBAR_WIDTH_MIN)
    expect(clampWorkspaceSidebarWidth(WORKSPACE_SIDEBAR_WIDTH_DEFAULT, 1440)).toBe(WORKSPACE_SIDEBAR_WIDTH_DEFAULT)
    expect(clampWorkspaceSidebarWidth(900, 1440)).toBe(WORKSPACE_SIDEBAR_WIDTH_MAX)
  })

  it('preserves a usable minimum when the viewport is narrow', () => {
    const bounds = workspaceSidebarWidthBounds(700)
    expect(bounds.min).toBe(WORKSPACE_SIDEBAR_WIDTH_MIN)
    expect(bounds.max).toBe(WORKSPACE_SIDEBAR_WIDTH_MIN)
  })
})
