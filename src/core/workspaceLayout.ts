export const TIMELINE_HEIGHT_MIN = 140
export const TIMELINE_HEIGHT_DEFAULT = 240
export const STAGE_HEIGHT_MIN = 240

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
