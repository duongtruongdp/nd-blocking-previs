import type { ActorVector3, RationalFrameRate, TimelineDocument, TimelineEasing, TimelineEasingMode, TimelineEntityType, TimelineInterpolation, TimelineProperty, TimelineTrack, TimelineValue } from '../core/sceneDocument'
import type { CameraPathSegmentSelection } from './cameraPath'

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

/** Non-drop-frame presentation timecode. Integer project frames remain canonical. */
export function frameToTimecode(frame: number, rate: RationalFrameRate): string {
  const safeFrame = Math.max(0, Math.round(frame))
  const nominalFps = Math.max(1, Math.round(frameRateValue(rate)))
  const totalSeconds = Math.floor(safeFrame / nominalFps)
  const frames = safeFrame % nominalFps
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds, frames].map((value) => String(value).padStart(2, '0')).join(':')
}

/** Parses HH:MM:SS:FF using deterministic non-drop-frame semantics. */
export function timecodeToFrame(value: string, rate: RationalFrameRate): number | null {
  const match = /^\s*(\d{1,3}):(\d{2}):(\d{2}):(\d{2})\s*$/.exec(value)
  if (!match) return null
  const [, hoursText, minutesText, secondsText, framesText] = match
  const hours = Number(hoursText); const minutes = Number(minutesText); const seconds = Number(secondsText); const frames = Number(framesText)
  const nominalFps = Math.max(1, Math.round(frameRateValue(rate)))
  if (minutes >= 60 || seconds >= 60 || frames >= nominalFps) return null
  return ((hours * 60 + minutes) * 60 + seconds) * nominalFps + frames
}

export function timelineDurationFrames(timeline: Pick<TimelineDocument, 'startFrame' | 'durationFrames' | 'endFrame'>): number {
  return Number.isInteger(timeline.durationFrames) && timeline.durationFrames >= 1 ? timeline.durationFrames : Math.max(1, timeline.endFrame - timeline.startFrame)
}

export type TimelinePlaybackRange = { startFrame: number; endFrame: number }

export function timelinePlaybackRange(timeline: Pick<TimelineDocument, 'startFrame' | 'durationFrames' | 'endFrame' | 'markIn' | 'markOut'>): TimelinePlaybackRange {
  const durationEnd = timeline.startFrame + timelineDurationFrames(timeline)
  const startFrame = Math.min(durationEnd, Math.max(timeline.startFrame, Math.round(timeline.markIn)))
  const endFrame = Math.min(durationEnd, Math.max(startFrame, Math.round(timeline.markOut)))
  return { startFrame, endFrame }
}

/** Presentation scale for the NLE-style Timeline canvas. The document remains frame-based. */
export const DEFAULT_TIMELINE_PIXELS_PER_SECOND = 160
export const MIN_TIMELINE_PIXELS_PER_SECOND = 40
export const MAX_TIMELINE_PIXELS_PER_SECOND = 640
export const TIMELINE_CANVAS_START_PADDING = 16
export const TIMELINE_CANVAS_TRAILING_PADDING = 40
export const TIMELINE_ZOOM_LEVELS = [
  { percent: 25, pixelsPerSecond: 40 },
  { percent: 33, pixelsPerSecond: 53 },
  { percent: 50, pixelsPerSecond: 80 },
  { percent: 67, pixelsPerSecond: 107 },
  { percent: 75, pixelsPerSecond: 120 },
  { percent: 100, pixelsPerSecond: 160 },
  { percent: 125, pixelsPerSecond: 200 },
  { percent: 150, pixelsPerSecond: 240 },
  { percent: 200, pixelsPerSecond: 320 },
  { percent: 300, pixelsPerSecond: 480 },
  { percent: 400, pixelsPerSecond: 640 },
] as const

export type TimelineCanvasModel = {
  pixelsPerSecond: number
  pixelsPerFrame: number
  durationWidth: number
  contentWidth: number
  startPadding: number
  trailingPadding: number
}

export function timelineCanvasModel(
  timeline: Pick<TimelineDocument, 'startFrame' | 'durationFrames' | 'endFrame' | 'frameRate'>,
  pixelsPerSecond = DEFAULT_TIMELINE_PIXELS_PER_SECOND,
  startPadding = TIMELINE_CANVAS_START_PADDING,
  trailingPadding = TIMELINE_CANVAS_TRAILING_PADDING,
): TimelineCanvasModel {
  const safePixelsPerSecond = Math.max(1, pixelsPerSecond)
  const safeStartPadding = Math.max(0, startPadding)
  const safeTrailingPadding = Math.max(0, trailingPadding)
  const durationWidth = timelineDurationFrames(timeline) / frameRateValue(timeline.frameRate) * safePixelsPerSecond
  return {
    pixelsPerSecond: safePixelsPerSecond,
    pixelsPerFrame: safePixelsPerSecond / frameRateValue(timeline.frameRate),
    durationWidth,
    contentWidth: safeStartPadding + durationWidth + safeTrailingPadding,
    startPadding: safeStartPadding,
    trailingPadding: safeTrailingPadding,
  }
}

export function timelineFrameToCanvasX(
  frame: number,
  timeline: Pick<TimelineDocument, 'startFrame' | 'frameRate'>,
  model: Pick<TimelineCanvasModel, 'pixelsPerFrame' | 'startPadding'>,
): number {
  return model.startPadding + (frame - timeline.startFrame) * model.pixelsPerFrame
}

export function timelineCanvasXToFrame(
  x: number,
  timeline: Pick<TimelineDocument, 'startFrame' | 'endFrame'>,
  model: Pick<TimelineCanvasModel, 'pixelsPerFrame' | 'startPadding'>,
  clampToDuration = true,
): number {
  const raw = timeline.startFrame + (x - model.startPadding) / Math.max(1e-9, model.pixelsPerFrame)
  return clampToDuration ? clampTimelineFrame(raw, timeline.startFrame, timeline.endFrame) : Math.max(timeline.startFrame, Math.round(raw))
}

export function timelineDurationEndX(model: Pick<TimelineCanvasModel, 'startPadding' | 'durationWidth'>): number {
  return model.startPadding + model.durationWidth
}

export function timelineCanvasModelForViewport(
  timeline: Pick<TimelineDocument, 'startFrame' | 'durationFrames' | 'endFrame' | 'frameRate'>,
  pixelsPerSecond: number,
  viewportWidth: number,
): TimelineCanvasModel {
  const model = timelineCanvasModel(timeline, pixelsPerSecond)
  return { ...model, contentWidth: Math.max(model.contentWidth, Math.max(1, viewportWidth)) }
}

export function timelineFitPixelsPerSecond(
  viewportWidth: number,
  timeline: Pick<TimelineDocument, 'startFrame' | 'durationFrames' | 'endFrame' | 'frameRate'>,
  minPixelsPerSecond = MIN_TIMELINE_PIXELS_PER_SECOND,
  maxPixelsPerSecond = MAX_TIMELINE_PIXELS_PER_SECOND,
): number {
  const durationSeconds = timelineDurationFrames(timeline) / frameRateValue(timeline.frameRate)
  const availableWidth = Math.max(1, viewportWidth - TIMELINE_CANVAS_START_PADDING - TIMELINE_CANVAS_TRAILING_PADDING)
  return Math.min(maxPixelsPerSecond, Math.max(minPixelsPerSecond, availableWidth / Math.max(0.001, durationSeconds)))
}

export type TimelineContentLayout = {
  viewportWidth: number
  naturalContentWidth: number
  timelineContentWidth: number
}

/** @deprecated Kept for compatibility with older integrations; the Timeline UI uses timelineCanvasModel instead. */
export function timelineLayoutForViewport(viewportWidth: number, timeline: Pick<TimelineDocument, 'startFrame' | 'durationFrames' | 'endFrame' | 'frameRate'>, pixelsPerSecond = 120): TimelineContentLayout {
  const safeViewportWidth = Math.max(1, viewportWidth)
  const naturalContentWidth = timelineDurationFrames(timeline) / frameRateValue(timeline.frameRate) * pixelsPerSecond
  return { viewportWidth: safeViewportWidth, naturalContentWidth, timelineContentWidth: Math.max(safeViewportWidth, naturalContentWidth) }
}

/** @deprecated Use timelineFrameToCanvasX with an explicit TimelineCanvasModel. */
export function frameToTimelineContentX(frame: number, timeline: Pick<TimelineDocument, 'startFrame' | 'endFrame'>, timelineContentWidth: number): number {
  return frameToTimelineX(frame, { left: 0, width: Math.max(1, timelineContentWidth), startFrame: timeline.startFrame, endFrame: timeline.endFrame })
}

/** @deprecated Use timelineCanvasXToFrame with an explicit TimelineCanvasModel. */
export function timelineContentXToFrame(x: number, timeline: Pick<TimelineDocument, 'startFrame' | 'endFrame'>, timelineContentWidth: number): number {
  return timelineXToFrame(x, { left: 0, width: Math.max(1, timelineContentWidth), startFrame: timeline.startFrame, endFrame: timeline.endFrame })
}

export function extendTimelineToFrame(timeline: TimelineDocument, frame: number): TimelineDocument {
  const requiredDuration = Math.max(1, Math.round(frame) - timeline.startFrame)
  if (requiredDuration <= timelineDurationFrames(timeline)) return timeline
  return { ...timeline, durationFrames: requiredDuration, endFrame: timeline.startFrame + requiredDuration }
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

export function timelineEasingMode(keyframe: Pick<{ interpolation: TimelineInterpolation; easeIn?: boolean; easeOut?: boolean }, 'interpolation' | 'easeIn' | 'easeOut'>): TimelineEasingMode {
  if (keyframe.interpolation === 'hold') return 'linear'
  if (keyframe.easeIn && keyframe.easeOut) return 'easeInOut'
  if (keyframe.easeIn) return 'easeIn'
  if (keyframe.easeOut) return 'easeOut'
  return 'linear'
}

export function timelineEasingForMode(mode: TimelineEasingMode): TimelineEasing {
  return {
    easeIn: mode === 'easeIn' || mode === 'easeInOut',
    easeOut: mode === 'easeOut' || mode === 'easeInOut',
  }
}

/** Applies the outgoing easing on the starting key and incoming easing on the destination key. */
export function timelineEasedProgress(amount: number, outgoingEase: boolean | undefined, incomingEase: boolean | undefined): number {
  const t = Math.min(1, Math.max(0, amount))
  if (outgoingEase && incomingEase) return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  if (outgoingEase) return 1 - Math.pow(1 - t, 3)
  if (incomingEase) return Math.pow(t, 3)
  return t
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

export function upsertTimelineKeyframe(timeline: TimelineDocument, entityId: string, entityType: TimelineEntityType, property: TimelineProperty, frame: number, value: TimelineValue, interpolation: TimelineInterpolation = 'linear', easing?: TimelineEasing): TimelineDocument {
  const id = timelineTrackId(entityId, property)
  const existingTrack = timeline.tracks.find((track) => track.id === id)
  const keyframes = existingTrack ? [...existingTrack.keyframes] : []
  const existingIndex = keyframes.findIndex((keyframe) => keyframe.frame === frame)
  const existing = existingIndex >= 0 ? keyframes[existingIndex] : undefined
  const nextKeyframe = {
    id: existing?.id ?? `${id}:${frame}`,
    frame,
    value: cloneValue(value),
    interpolation: existing && easing === undefined ? existing.interpolation : interpolation,
    ...(easing !== undefined ? { easeIn: easing.easeIn, easeOut: easing.easeOut } : existing ? { easeIn: existing.easeIn, easeOut: existing.easeOut } : {}),
  }
  if (existingIndex >= 0) keyframes[existingIndex] = nextKeyframe
  else keyframes.push(nextKeyframe)
  keyframes.sort((a, b) => a.frame - b.frame)
  const nextTrack = { id, entityId, entityType, property, keyframes }
  const trackIndex = timeline.tracks.findIndex((track) => track.id === id)
  const tracks = [...timeline.tracks]
  if (trackIndex >= 0) tracks[trackIndex] = nextTrack
  else tracks.push(nextTrack)
  return extendTimelineToFrame({ ...timeline, tracks }, frame)
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

export function setTimelineKeyframeEasing(timeline: TimelineDocument, trackId: string, keyframeId: string, mode: TimelineEasingMode): TimelineDocument {
  const easing = timelineEasingForMode(mode)
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => track.id !== trackId ? track : {
      ...track,
      keyframes: track.keyframes.map((keyframe) => keyframe.id !== keyframeId ? keyframe : {
        ...keyframe,
        interpolation: 'linear',
        ...easing,
      }),
    }),
  }
}

/** Move one keyframe, replacing a same-track destination deterministically. */
export function moveTimelineKeyframe(timeline: TimelineDocument, trackId: string, keyframeId: string, targetFrame: number): TimelineDocument {
  const source = timeline.tracks.find((track) => track.id === trackId)?.keyframes.find((keyframe) => keyframe.id === keyframeId)
  if (!source) return timeline
  const frame = Math.max(timeline.startFrame, Math.round(targetFrame))
  const endFrame = Math.max(timeline.endFrame, frame)
  return {
    ...timeline,
    durationFrames: Math.max(1, endFrame - timeline.startFrame),
    endFrame,
    tracks: timeline.tracks.flatMap((track) => {
      if (track.id !== trackId) return [track]
      const keyframes = track.keyframes
        .filter((keyframe) => keyframe.id !== keyframeId && keyframe.frame !== frame)
        .concat([{ ...source, frame }])
        .sort((a, b) => a.frame - b.frame)
      return keyframes.length > 0 ? [{ ...track, keyframes }] : []
    }),
  }
}

export type TimelineKeyframeSelection = { trackId: string; keyframeId: string }

function selectedKeyframes(timeline: TimelineDocument, selections: readonly TimelineKeyframeSelection[]) {
  const seen = new Set<string>()
  return selections.flatMap((selection) => {
    const identity = `${selection.trackId}:${selection.keyframeId}`
    if (seen.has(identity)) return []
    seen.add(identity)
    const track = timeline.tracks.find((candidate) => candidate.id === selection.trackId)
    const keyframe = track?.keyframes.find((candidate) => candidate.id === selection.keyframeId)
    return track && keyframe ? [{ selection, track, keyframe }] : []
  })
}

/** Keeps a group from moving before the Timeline start; forward moves can extend duration. */
export function clampTimelineKeyframeDelta(timeline: TimelineDocument, selections: readonly TimelineKeyframeSelection[], deltaFrames: number): number {
  const selected = selectedKeyframes(timeline, selections)
  if (selected.length === 0) return 0
  const earliest = Math.min(...selected.map(({ keyframe }) => keyframe.frame))
  return Math.max(timeline.startFrame - earliest, Math.round(deltaFrames))
}

/** Moves a selection as one atomic time-only operation, replacing non-selected collisions. */
export function moveTimelineKeyframes(timeline: TimelineDocument, selections: readonly TimelineKeyframeSelection[], deltaFrames: number): TimelineDocument {
  const selected = selectedKeyframes(timeline, selections)
  if (selected.length === 0) return timeline
  const selectedLatest = Math.max(...selected.map(({ keyframe }) => keyframe.frame))
  const delta = Math.max(timeline.startFrame - Math.min(...selected.map(({ keyframe }) => keyframe.frame)), Math.round(deltaFrames))
  const nextEndFrame = Math.max(timeline.endFrame, selectedLatest + delta)
  const selectedIdsByTrack = new Map<string, Set<string>>()
  const destinationFramesByTrack = new Map<string, Set<number>>()
  selected.forEach(({ track, keyframe }) => {
    const ids = selectedIdsByTrack.get(track.id) ?? new Set<string>()
    ids.add(keyframe.id)
    selectedIdsByTrack.set(track.id, ids)
    const destinations = destinationFramesByTrack.get(track.id) ?? new Set<number>()
    destinations.add(keyframe.frame + delta)
    destinationFramesByTrack.set(track.id, destinations)
  })

  return {
    ...timeline,
    durationFrames: Math.max(1, nextEndFrame - timeline.startFrame),
    endFrame: nextEndFrame,
    tracks: timeline.tracks.flatMap((track) => {
      const ids = selectedIdsByTrack.get(track.id)
      if (!ids) return [track]
      const destinations = destinationFramesByTrack.get(track.id) ?? new Set<number>()
      const moved = selected.filter((item) => item.track.id === track.id).map(({ keyframe }) => ({ ...keyframe, frame: keyframe.frame + delta }))
      const keyframes = track.keyframes
        .filter((keyframe) => !ids.has(keyframe.id) && !destinations.has(keyframe.frame))
        .concat(moved)
        .sort((a, b) => a.frame - b.frame)
      return keyframes.length > 0 ? [{ ...track, keyframes }] : []
    }),
  }
}

export type CameraRetimeMode = 'moveEnd' | 'rippleFollowing'

export type CameraRetimeResult = {
  timeline: TimelineDocument
  changed: boolean
  targetFrame: number
  requestedDurationFrames: number
  clamped: boolean
  reason: string | null
}

function retimeTrackKeyframes(track: TimelineTrack, frames: ReadonlyMap<string, number>): TimelineTrack {
  return { ...track, keyframes: track.keyframes.map((keyframe) => frames.has(keyframe.id) ? { ...keyframe, frame: frames.get(keyframe.id)! } : keyframe).sort((a, b) => a.frame - b.frame) }
}

function hasRetimeCollision(track: TimelineTrack, frames: ReadonlyMap<string, number>): boolean {
  const movingIds = new Set(frames.keys())
  const occupied = new Set<number>()
  for (const keyframe of track.keyframes) {
    if (movingIds.has(keyframe.id)) continue
    if (occupied.has(keyframe.frame)) return true
    occupied.add(keyframe.frame)
  }
  for (const frame of frames.values()) {
    if (occupied.has(frame)) return true
    occupied.add(frame)
  }
  return false
}

/** Retimes a Camera position segment while preserving authored values and stable key IDs. */
export function retimeCameraPathSegment(timeline: TimelineDocument, selection: CameraPathSegmentSelection, requestedDurationFrames: number, mode: CameraRetimeMode): CameraRetimeResult {
  const positionTrack = timeline.tracks.find((track) => track.id === selection.trackId && track.entityId === selection.cameraId && track.entityType === 'Camera' && track.property === 'position')
  const from = positionTrack?.keyframes.find((keyframe) => keyframe.id === selection.fromKeyframeId)
  const to = positionTrack?.keyframes.find((keyframe) => keyframe.id === selection.toKeyframeId)
  const roundedRequested = Math.round(requestedDurationFrames)
  const requested = Math.max(1, roundedRequested)
  if (!positionTrack || !from || !to || to.frame <= from.frame) return { timeline, changed: false, targetFrame: to?.frame ?? from?.frame ?? timeline.startFrame, requestedDurationFrames: requested, clamped: false, reason: 'The selected Camera move segment is no longer available.' }
  let targetFrame = from.frame + requested
  let reason: string | null = roundedRequested < 1 ? 'Camera moves require at least one frame.' : null
  const nextPosition = positionTrack.keyframes.filter((keyframe) => keyframe.frame > to.frame).sort((a, b) => a.frame - b.frame)[0]
  if (mode === 'moveEnd' && nextPosition) {
    const maximum = nextPosition.frame - 1
    if (targetFrame > maximum) {
      targetFrame = maximum
      reason = 'Move End was clamped before the following Camera position key.'
    }
  }
  if (targetFrame <= from.frame) return { timeline, changed: false, targetFrame: from.frame + 1, requestedDurationFrames: requested, clamped: true, reason: reason ?? 'The segment must remain at least one frame long.' }
  const delta = targetFrame - to.frame
  const positionFrames = new Map<string, number>()
  const rotationFrames = new Map<string, number>()
  if (mode === 'moveEnd') {
    positionFrames.set(to.id, targetFrame)
  } else {
    positionTrack.keyframes.filter((keyframe) => keyframe.frame >= to.frame).forEach((keyframe) => positionFrames.set(keyframe.id, keyframe.frame + delta))
  }
  const rotationTrack = timeline.tracks.find((track) => track.entityId === selection.cameraId && track.entityType === 'Camera' && track.property === 'rotation')
  if (rotationTrack) {
    const positionFramesToMove = new Set(positionTrack.keyframes.filter((keyframe) => mode === 'moveEnd' ? keyframe.id === to.id : keyframe.frame >= to.frame).map((keyframe) => keyframe.frame))
    rotationTrack.keyframes.filter((keyframe) => positionFramesToMove.has(keyframe.frame)).forEach((keyframe) => rotationFrames.set(keyframe.id, keyframe.frame + delta))
  }
  if (hasRetimeCollision(positionTrack, positionFrames) || (rotationTrack && hasRetimeCollision(rotationTrack, rotationFrames))) {
    return { timeline, changed: false, targetFrame, requestedDurationFrames: requested, clamped: true, reason: 'The requested retime would collide with another Camera keyframe.' }
  }
  const tracks = timeline.tracks.map((track) => {
    if (track.id === positionTrack.id) return retimeTrackKeyframes(track, positionFrames)
    if (rotationTrack && track.id === rotationTrack.id) return retimeTrackKeyframes(track, rotationFrames)
    return track
  })
  const furthestFrame = tracks.reduce((furthest, track) => Math.max(furthest, ...track.keyframes.map((keyframe) => keyframe.frame)), timeline.endFrame)
  const nextTimeline = { ...timeline, durationFrames: Math.max(1, furthestFrame - timeline.startFrame), endFrame: furthestFrame, tracks }
  return { timeline: nextTimeline, changed: true, targetFrame, requestedDurationFrames: requested, clamped: targetFrame !== from.frame + requested, reason }
}

export function removeTimelineKeyframes(timeline: TimelineDocument, selections: readonly TimelineKeyframeSelection[]): TimelineDocument {
  const idsByTrack = new Map<string, Set<string>>()
  selections.forEach((selection) => {
    const ids = idsByTrack.get(selection.trackId) ?? new Set<string>()
    ids.add(selection.keyframeId)
    idsByTrack.set(selection.trackId, ids)
  })
  return {
    ...timeline,
    tracks: timeline.tracks.flatMap((track) => {
      const ids = idsByTrack.get(track.id)
      if (!ids) return [track]
      const keyframes = track.keyframes.filter((keyframe) => !ids.has(keyframe.id))
      return keyframes.length > 0 ? [{ ...track, keyframes }] : []
    }),
  }
}

export function setTimelineKeyframesEasing(timeline: TimelineDocument, selections: readonly TimelineKeyframeSelection[], mode: TimelineEasingMode): TimelineDocument {
  const selected = new Set(selections.map((selection) => `${selection.trackId}:${selection.keyframeId}`))
  const easing = timelineEasingForMode(mode)
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map((keyframe) => selected.has(`${track.id}:${keyframe.id}`) ? { ...keyframe, interpolation: 'linear', ...easing } : keyframe),
    })),
  }
}
