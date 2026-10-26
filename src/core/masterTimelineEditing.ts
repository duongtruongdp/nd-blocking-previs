import {
  createMasterClipId,
  insertMasterClipAtFrame,
  materializeMasterClipPlacements,
  masterClipDurationFrames,
  masterClipStartFrame,
  orderedMasterClips,
  type MasterClipDocument,
  type MasterImageClipDocument,
  type MasterSequenceDocument,
} from './masterSequence'
import type { ShotDocument } from './shotDocument'

export type MasterTimelineItem = { kind: 'clip' | 'image'; id: string }
export type MasterMarqueeMode = 'replace' | 'add' | 'subtract'

export type MasterTimelineEditResult = {
  sequence: MasterSequenceDocument
  selection: MasterTimelineItem[]
}

export type MasterTrimMode = 'trim-left' | 'trim-right'
export type MasterTrimLimit = 'SOURCE_LIMIT' | 'NEIGHBOR_LIMIT' | 'TIMELINE_ZERO' | 'MIN_DURATION' | null

export type MasterTrimPreview = {
  mode: MasterTrimMode
  requestedBoundary: number
  boundary: number
  minimumBoundary: number
  maximumBoundary: number
  startMasterFrame: number
  sourceStartFrame: number
  sourceEndFrame: number
  constrained: boolean
  neighborCollisionBoundary: number | null
  limitingConstraint: MasterTrimLimit
}

/** Returns the Shot clips intersected by a frame-domain marquee. */
export function masterTimelineMarqueeItems(sequence: MasterSequenceDocument, startFrame: number, endFrame: number): MasterTimelineItem[] {
  const materialized = materializeMasterClipPlacements(sequence)
  const rangeStart = Math.min(Math.round(startFrame), Math.round(endFrame))
  const rangeEnd = Math.max(Math.round(startFrame), Math.round(endFrame))
  return orderedMasterClips(materialized).flatMap((clip) => {
    const start = masterClipStartFrame(materialized, clip.id) ?? 0
    const end = start + masterClipDurationFrames(clip)
    return start < rangeEnd && end > rangeStart ? [{ kind: 'clip' as const, id: clip.id }] : []
  })
}

/** Applies marquee modifiers without creating history or selecting Graphics clips. */
export function applyMasterTimelineMarqueeSelection(sequence: MasterSequenceDocument, current: readonly MasterTimelineItem[], startFrame: number, endFrame: number, mode: MasterMarqueeMode): MasterTimelineItem[] {
  const hits = masterTimelineMarqueeItems(sequence, startFrame, endFrame)
  const hitKeys = new Set(hits.map((item) => `${item.kind}:${item.id}`))
  const normalized = normalizeMasterTimelineSelection(sequence, current)
  if (mode === 'replace') return hits
  if (mode === 'add') {
    return normalizeMasterTimelineSelection(sequence, [...normalized, ...hits])
  }
  return normalized.filter((item) => !hitKeys.has(`${item.kind}:${item.id}`))
}

/** Inserts a Shot at an empty/boundary frame and shifts only following Shot clips. */
export function insertMasterClipWithRoomAtFrame(sequence: MasterSequenceDocument, shot: ShotDocument, startMasterFrame: number): MasterSequenceDocument | null {
  const materialized = materializeMasterClipPlacements(sequence)
  const start = Math.max(0, Math.round(Number.isFinite(startMasterFrame) ? startMasterFrame : 0))
  const duration = Math.max(1, Math.round(shot.endFrame) - Math.round(shot.startFrame))
  const starts = materialized.clips.map((clip) => ({ clip, start: masterClipStartFrame(materialized, clip.id) ?? 0 }))
  const insideClip = starts.some(({ clip, start: clipStart }) => {
    const end = clipStart + masterClipDurationFrames(clip)
    return start > clipStart && start < end
  })
  if (insideClip) return null
  const shifted = {
    ...materialized,
    clips: materialized.clips.map((clip) => {
      const clipStart = masterClipStartFrame(materialized, clip.id) ?? 0
      return clipStart >= start ? { ...clip, startMasterFrame: clipStart + duration } : clip
    }),
  }
  return insertMasterClipAtFrame(shifted, shot, start)
}

/**
 * Calculates a trim from the original clip snapshot. Master Shot source and
 * placement frames use the same canonical frame domain; mixed-rate sequences
 * are rejected by the existing Master export validation.
 *
 * A trim boundary is clamped before it is converted back to a source range so
 * pointer motion beyond a source or collision limit remains a valid preview.
 */
export function previewMasterClipTrim(sequence: MasterSequenceDocument, clipId: string, shot: ShotDocument, mode: MasterTrimMode, requestedBoundary: number): MasterTrimPreview | null {
  const materialized = materializeMasterClipPlacements(sequence)
  const clip = materialized.clips.find((candidate) => candidate.id === clipId)
  if (!clip) return null
  const start = masterClipStartFrame(materialized, clipId)
  if (start === null) return null
  const sourceStart = Math.round(clip.sourceStartFrame)
  const sourceEnd = Math.round(clip.sourceEndFrame)
  const duration = sourceEnd - sourceStart
  if (duration < 1) return null
  const end = start + duration
  const otherIntervals = materialized.clips
    .filter((candidate) => candidate.id !== clipId)
    .map((candidate) => {
      const candidateStart = masterClipStartFrame(materialized, candidate.id) ?? 0
      return { start: candidateStart, end: candidateStart + masterClipDurationFrames(candidate) }
    })

  let minimumBoundary = start + 1
  let maximumBoundary = end - 1
  const sourceBoundary = mode === 'trim-right' ? start + (Math.round(shot.endFrame) - sourceStart) : start + (Math.round(shot.startFrame) - sourceStart)
  let neighborCollisionBoundary: number | null = null
  if (mode === 'trim-right') {
    const sourceMaximum = sourceBoundary
    const nextClipStart = otherIntervals
      .filter((interval) => interval.start > start)
      .reduce<number | null>((nearest, interval) => nearest === null ? interval.start : Math.min(nearest, interval.start), null)
    neighborCollisionBoundary = nextClipStart
    maximumBoundary = Math.min(sourceMaximum, nextClipStart ?? Number.POSITIVE_INFINITY)
  } else {
    const sourceMinimum = sourceBoundary
    const previousClipEnd = otherIntervals
      .filter((interval) => interval.end <= start)
      .reduce<number | null>((nearest, interval) => nearest === null ? interval.end : Math.max(nearest, interval.end), null)
    neighborCollisionBoundary = previousClipEnd
    minimumBoundary = Math.max(0, sourceMinimum, previousClipEnd ?? 0)
  }
  if (minimumBoundary > maximumBoundary) return null
  const requested = Math.round(Number.isFinite(requestedBoundary) ? requestedBoundary : mode === 'trim-left' ? start : end)
  const boundary = Math.max(minimumBoundary, Math.min(maximumBoundary, requested))
  let limitingConstraint: MasterTrimLimit = null
  if (requested < minimumBoundary) {
    if (mode === 'trim-left' && neighborCollisionBoundary !== null && neighborCollisionBoundary >= Math.max(0, sourceBoundary)) limitingConstraint = 'NEIGHBOR_LIMIT'
    else if (mode === 'trim-left' && sourceBoundary > 0) limitingConstraint = 'SOURCE_LIMIT'
    else if (mode === 'trim-left') limitingConstraint = 'TIMELINE_ZERO'
    else limitingConstraint = 'MIN_DURATION'
  } else if (requested > maximumBoundary) {
    if (mode === 'trim-right' && neighborCollisionBoundary !== null && neighborCollisionBoundary <= sourceBoundary) limitingConstraint = 'NEIGHBOR_LIMIT'
    else if (mode === 'trim-right') limitingConstraint = 'SOURCE_LIMIT'
    else limitingConstraint = 'MIN_DURATION'
  }
  const preview = mode === 'trim-left'
    ? { startMasterFrame: boundary, sourceStartFrame: sourceStart + (boundary - start), sourceEndFrame: sourceEnd }
    : { startMasterFrame: start, sourceStartFrame: sourceStart, sourceEndFrame: sourceStart + (boundary - start) }
  return {
    mode,
    requestedBoundary: requested,
    boundary,
    minimumBoundary,
    maximumBoundary,
    ...preview,
    constrained: boundary !== requested,
    neighborCollisionBoundary,
    limitingConstraint,
  }
}

export function masterTimelineItemStart(sequence: MasterSequenceDocument, item: MasterTimelineItem): number | null {
  if (item.kind === 'clip') return masterClipStartFrame(sequence, item.id)
  const image = (sequence.imageClips ?? []).find((candidate) => candidate.id === item.id)
  return image ? Math.max(0, Math.round(image.startMasterFrame)) : null
}

export function masterTimelineItemEnd(sequence: MasterSequenceDocument, item: MasterTimelineItem): number | null {
  const start = masterTimelineItemStart(sequence, item)
  if (start === null) return null
  if (item.kind === 'clip') {
    const clip = sequence.clips.find((candidate) => candidate.id === item.id)
    return clip ? start + masterClipDurationFrames(clip) : null
  }
  const image = (sequence.imageClips ?? []).find((candidate) => candidate.id === item.id)
  return image ? start + Math.max(1, Math.round(image.durationFrames)) : null
}

export function normalizeMasterTimelineSelection(sequence: MasterSequenceDocument, selection: readonly MasterTimelineItem[]): MasterTimelineItem[] {
  const seen = new Set<string>()
  return selection.filter((item) => {
    const key = `${item.kind}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return item.kind === 'clip' ? sequence.clips.some((clip) => clip.id === item.id) : (sequence.imageClips ?? []).some((clip) => clip.id === item.id)
  })
}

/** Move a mixed Shot/Graphics selection by its anchor while preserving relative offsets. */
export function moveMasterTimelineSelection(sequence: MasterSequenceDocument, selection: readonly MasterTimelineItem[], anchor: MasterTimelineItem, targetStartFrame: number): MasterSequenceDocument | null {
  const items = normalizeMasterTimelineSelection(sequence, selection)
  const anchorItem = items.some((item) => item.kind === anchor.kind && item.id === anchor.id) ? anchor : { ...anchor }
  const anchorStart = masterTimelineItemStart(sequence, anchorItem)
  if (anchorStart === null) return null
  const selected = items.some((item) => item.kind === anchorItem.kind && item.id === anchorItem.id) ? items : [anchorItem]
  const starts = selected.map((item) => masterTimelineItemStart(sequence, item)).filter((value): value is number => value !== null)
  if (starts.length === 0) return null
  const requested = Math.round(Number.isFinite(targetStartFrame) ? targetStartFrame : 0)
  const delta = Math.max(-Math.min(...starts), requested - anchorStart)
  const materialized = selected.some((item) => item.kind === 'clip') ? materializeMasterClipPlacements(sequence) : sequence
  const selectedClipIds = new Set(selected.filter((item) => item.kind === 'clip').map((item) => item.id))
  const nextClips = materialized.clips.map((clip) => selectedClipIds.has(clip.id)
    ? { ...clip, startMasterFrame: Math.max(0, (masterClipStartFrame(materialized, clip.id) ?? 0) + delta) }
    : clip)
  const selectedImageIds = new Set(selected.filter((item) => item.kind === 'image').map((item) => item.id))
  const nextImages = (materialized.imageClips ?? []).map((clip) => selectedImageIds.has(clip.id)
    ? { ...clip, startMasterFrame: Math.max(0, Math.round(clip.startMasterFrame + delta)) }
    : clip)
  const next = { ...materialized, clips: nextClips, imageClips: materialized.imageClips ? nextImages : materialized.imageClips }
  if (!selectedClipIds.size) return next
  const selectedStarts = new Map(nextClips.filter((clip) => selectedClipIds.has(clip.id)).map((clip) => [clip.id, masterClipStartFrame(next, clip.id) ?? 0]))
  for (const clip of nextClips) {
    if (selectedClipIds.has(clip.id)) continue
    const otherStart = masterClipStartFrame(next, clip.id) ?? 0
    const otherEnd = otherStart + masterClipDurationFrames(clip)
    for (const selectedId of selectedClipIds) {
      const selectedClip = nextClips.find((candidate) => candidate.id === selectedId)
      const selectedStart = selectedStarts.get(selectedId) ?? 0
      if (selectedClip && selectedStart < otherEnd && selectedStart + masterClipDurationFrames(selectedClip) > otherStart) return null
    }
  }
  return next
}

export function removeMasterTimelineSelection(sequence: MasterSequenceDocument, selection: readonly MasterTimelineItem[]): MasterSequenceDocument {
  const items = normalizeMasterTimelineSelection(sequence, selection)
  const clipIds = new Set(items.filter((item) => item.kind === 'clip').map((item) => item.id))
  const imageIds = new Set(items.filter((item) => item.kind === 'image').map((item) => item.id))
  return {
    ...sequence,
    clips: orderedMasterClips(sequence).filter((clip) => !clipIds.has(clip.id)).map((clip, order) => ({ ...clip, order })),
    imageClips: sequence.imageClips?.filter((clip) => !imageIds.has(clip.id)),
  }
}

function createImageClipId(existingIds: ReadonlySet<string>): string {
  let id = `image-clip-${Math.random().toString(36).slice(2, 10)}`
  while (existingIds.has(id)) id = `image-clip-${Math.random().toString(36).slice(2, 10)}`
  return id
}

function shotDuplicatesFit(sequence: MasterSequenceDocument, duplicates: readonly MasterClipDocument[]): boolean {
  const existing = sequence.clips
  return duplicates.every((duplicate) => {
    const start = masterClipStartFrame(sequence, duplicate.id) ?? duplicate.startMasterFrame ?? 0
    const end = start + masterClipDurationFrames(duplicate)
    return existing.every((candidate) => {
      const candidateStart = masterClipStartFrame(sequence, candidate.id) ?? candidate.startMasterFrame ?? 0
      const candidateEnd = candidateStart + masterClipDurationFrames(candidate)
      return start >= candidateEnd || end <= candidateStart
    })
  })
}

/** Duplicate the selected clips without moving existing editorial placements. */
export function duplicateMasterTimelineSelection(sequence: MasterSequenceDocument, selection: readonly MasterTimelineItem[]): MasterTimelineEditResult | null {
  const items = normalizeMasterTimelineSelection(sequence, selection)
  if (items.length === 0) return null
  const materialized = materializeMasterClipPlacements(sequence)
  const bounds = items.reduce<{ start: number; end: number } | null>((result, item) => {
    const start = masterTimelineItemStart(materialized, item)
    const end = masterTimelineItemEnd(materialized, item)
    if (start === null || end === null) return result
    return result ? { start: Math.min(result.start, start), end: Math.max(result.end, end) } : { start, end }
  }, null)
  if (!bounds) return null
  const selectedClipIds = new Set(items.filter((item) => item.kind === 'clip').map((item) => item.id))
  const selectedImageIds = new Set(items.filter((item) => item.kind === 'image').map((item) => item.id))
  const existingClipIds = new Set(materialized.clips.map((clip) => clip.id))
  const existingImageIds = new Set((materialized.imageClips ?? []).map((clip) => clip.id))
  const sourceClips = materialized.clips.filter((clip) => selectedClipIds.has(clip.id))
  const groupSpan = Math.max(1, bounds.end - bounds.start)
  let delta = groupSpan
  let duplicateClips: MasterClipDocument[] = []
  for (let attempt = 0; attempt < 100000; attempt += 1) {
    duplicateClips = sourceClips.map((clip) => ({ ...clip, id: createMasterClipId(existingClipIds), startMasterFrame: (masterClipStartFrame(materialized, clip.id) ?? 0) + delta, order: materialized.clips.length + attempt + 1 }))
    if (shotDuplicatesFit(materialized, duplicateClips)) break
    duplicateClips = []
    delta += 1
  }
  if (sourceClips.length > 0 && duplicateClips.length === 0) return null
  const duplicateImages: MasterImageClipDocument[] = (materialized.imageClips ?? []).filter((clip) => selectedImageIds.has(clip.id)).map((clip) => ({ ...clip, id: createImageClipId(existingImageIds), startMasterFrame: clip.startMasterFrame + delta }))
  const next = { ...materialized, clips: [...materialized.clips, ...duplicateClips].map((clip, order) => ({ ...clip, order })), imageClips: materialized.imageClips ? [...materialized.imageClips, ...duplicateImages] : materialized.imageClips }
  return { sequence: next, selection: [...duplicateClips.map((clip) => ({ kind: 'clip' as const, id: clip.id })), ...duplicateImages.map((clip) => ({ kind: 'image' as const, id: clip.id }))] }
}
