import type { ActorVector3, RationalFrameRate, TimelineDocument, TimelineEntityType, TimelineInterpolation, TimelineProperty, TimelineValue } from '../core/sceneDocument'

export const TIMELINE_FRAME_RATES: readonly RationalFrameRate[] = [
  { numerator: 24000, denominator: 1001 },
  { numerator: 24, denominator: 1 },
  { numerator: 25, denominator: 1 },
  { numerator: 30000, denominator: 1001 },
  { numerator: 30, denominator: 1 },
  { numerator: 50, denominator: 1 },
  { numerator: 60000, denominator: 1001 },
  { numerator: 60, denominator: 1 },
]

export function frameRateValue(rate: RationalFrameRate): number {
  return rate.numerator / rate.denominator
}

export function frameRateLabel(rate: RationalFrameRate): string {
  const value = frameRateValue(rate)
  return Number.isInteger(value) ? String(value) : value.toFixed(3)
}

export function frameToSeconds(frame: number, rate: RationalFrameRate): number {
  return frame * rate.denominator / rate.numerator
}

export function secondsToFrame(seconds: number, rate: RationalFrameRate): number {
  return Math.max(0, Math.floor(seconds * frameRateValue(rate) + 1e-9))
}

export function clampTimelineFrame(frame: number, startFrame: number, endFrame: number): number {
  return Math.min(endFrame, Math.max(startFrame, Math.round(frame)))
}

export function frameToTimelinePercent(frame: number, timeline: Pick<TimelineDocument, 'startFrame' | 'endFrame'>): number {
  return Math.min(100, Math.max(0, frameToTimelineX(frame, { left: 0, width: 100, startFrame: timeline.startFrame, endFrame: timeline.endFrame })))
}

export type TimelineFrameGeometry = {
  left: number
  width: number
  startFrame: number
  endFrame: number
}

export function frameToTimelineX(frame: number, geometry: TimelineFrameGeometry): number {
  const range = Math.max(1, geometry.endFrame - geometry.startFrame)
  return geometry.left + ((frame - geometry.startFrame) / range) * geometry.width
}

export function timelineXToFrame(x: number, geometry: TimelineFrameGeometry): number {
  const range = Math.max(1, geometry.endFrame - geometry.startFrame)
  return clampTimelineFrame(geometry.startFrame + ((x - geometry.left) / Math.max(1, geometry.width)) * range, geometry.startFrame, geometry.endFrame)
}

export function setTimelineMark(timeline: TimelineDocument, kind: 'in' | 'out', frame: number): TimelineDocument {
  const nextFrame = clampTimelineFrame(frame, timeline.startFrame, timeline.endFrame)
  return kind === 'in'
    ? { ...timeline, markIn: nextFrame, markOut: Math.max(timeline.markOut, nextFrame) }
    : { ...timeline, markIn: Math.min(timeline.markIn, nextFrame), markOut: nextFrame }
}

export function interpolateScalar(start: number, end: number, amount: number): number {
  return start + (end - start) * amount
}

export function interpolateVector(start: ActorVector3, end: ActorVector3, amount: number): ActorVector3 {
  return [interpolateScalar(start[0], end[0], amount), interpolateScalar(start[1], end[1], amount), interpolateScalar(start[2], end[2], amount)]
}

export function normalizeAngleRadians(angle: number): number {
  const fullTurn = Math.PI * 2
  return ((angle + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
}

export function interpolateAngleRadians(start: number, end: number, amount: number): number {
  return start + normalizeAngleRadians(end - start) * amount
}

function cloneValue(value: TimelineValue): TimelineValue {
  return Array.isArray(value) ? [...value] as ActorVector3 : value
}

export function timelineTrackId(entityId: string, property: TimelineProperty): string {
  return `${entityId}:${property}`
}

export function trackHasKeyframe(timeline: TimelineDocument, entityId: string, property: TimelineProperty, frame: number): boolean {
  return timeline.tracks.some((track) => track.entityId === entityId && track.property === property && track.keyframes.some((keyframe) => keyframe.frame === frame))
}

export function upsertTimelineKeyframe(timeline: TimelineDocument, entityId: string, entityType: TimelineEntityType, property: TimelineProperty, frame: number, value: TimelineValue, interpolation: TimelineInterpolation = 'linear'): TimelineDocument {
  const id = timelineTrackId(entityId, property)
  const existingTrack = timeline.tracks.find((track) => track.id === id)
  const keyframes = existingTrack ? [...existingTrack.keyframes] : []
  const existingIndex = keyframes.findIndex((keyframe) => keyframe.frame === frame)
  const nextKeyframe = { id: existingIndex >= 0 ? keyframes[existingIndex].id : `${id}:${frame}`, frame, value: cloneValue(value), interpolation }
  if (existingIndex >= 0) keyframes[existingIndex] = nextKeyframe
  else keyframes.push(nextKeyframe)
  keyframes.sort((a, b) => a.frame - b.frame)
  const nextTrack = { id, entityId, entityType, property, keyframes }
  const trackIndex = timeline.tracks.findIndex((track) => track.id === id)
  const tracks = [...timeline.tracks]
  if (trackIndex >= 0) tracks[trackIndex] = nextTrack
  else tracks.push(nextTrack)
  return { ...timeline, tracks }
}

export function removeTimelineKeyframe(timeline: TimelineDocument, trackId: string, keyframeId: string): TimelineDocument {
  return {
    ...timeline,
    tracks: timeline.tracks.flatMap((track) => {
      if (track.id !== trackId) return [track]
      const keyframes = track.keyframes.filter((keyframe) => keyframe.id !== keyframeId)
      return keyframes.length > 0 ? [{ ...track, keyframes }] : []
    }),
  }
}

/** Move one keyframe, replacing a same-track destination deterministically. */
export function moveTimelineKeyframe(timeline: TimelineDocument, trackId: string, keyframeId: string, targetFrame: number): TimelineDocument {
  return {
    ...timeline,
    tracks: timeline.tracks.flatMap((track) => {
      if (track.id !== trackId) return [track]
      const source = track.keyframes.find((keyframe) => keyframe.id === keyframeId)
      if (!source) return [track]
      const frame = clampTimelineFrame(targetFrame, timeline.startFrame, timeline.endFrame)
      const keyframes = track.keyframes
        .filter((keyframe) => keyframe.id !== keyframeId && keyframe.frame !== frame)
        .concat([{ ...source, frame }])
        .sort((a, b) => a.frame - b.frame)
      return keyframes.length > 0 ? [{ ...track, keyframes }] : []
    }),
  }
}
