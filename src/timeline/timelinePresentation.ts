export type TimelineRulerLabelAlignment = 'start' | 'center' | 'end'

export function timelineRulerLabelAlignment(frame: number, index: number, ticks: readonly number[], startFrame: number, endFrame: number): TimelineRulerLabelAlignment {
  if (index === 0 && frame === startFrame) return 'start'
  if (index === ticks.length - 1 && frame === endFrame) return 'end'
  return 'center'
}
