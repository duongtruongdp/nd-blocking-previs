export const TIMELINE_HEIGHT_MIN = 140
export const TIMELINE_HEIGHT_DEFAULT = 190
export const STAGE_HEIGHT_MIN = 240
export const WORKSPACE_SIDEBAR_WIDTH_DEFAULT = 280
export const WORKSPACE_SIDEBAR_WIDTH_MIN = 240
export const WORKSPACE_SIDEBAR_WIDTH_MAX = 440

type TimelineHeightBounds = {
  min: number
  max: number
}

export function timelineHeightBounds(availableHeight: number): TimelineHeightBounds {
  const safeHeight = Math.max(0, availableHeight)
  const viewportMaximum = Math.floor(safeHeight * 0.5)
  const stageMaximum = Math.floor(safeHeight - 56 - STAGE_HEIGHT_MIN - 30)
  return {
    min: TIMELINE_HEIGHT_MIN,
    max: Math.max(TIMELINE_HEIGHT_MIN, Math.min(viewportMaximum, stageMaximum)),
  }
}

export function clampTimelineHeight(requestedHeight: number, availableHeight: number): number {
  const bounds = timelineHeightBounds(availableHeight)
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(requestedHeight)))
}

export function workspaceSidebarWidthBounds(viewportWidth: number): { min: number; max: number } {
  const safeWidth = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 1280
  const max = Math.min(WORKSPACE_SIDEBAR_WIDTH_MAX, Math.max(WORKSPACE_SIDEBAR_WIDTH_MIN, Math.floor(safeWidth - 600)))
  return { min: WORKSPACE_SIDEBAR_WIDTH_MIN, max: Math.max(WORKSPACE_SIDEBAR_WIDTH_MIN, max) }
}

export function clampWorkspaceSidebarWidth(requestedWidth: number, viewportWidth: number): number {
  const bounds = workspaceSidebarWidthBounds(viewportWidth)
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(requestedWidth)))
}
