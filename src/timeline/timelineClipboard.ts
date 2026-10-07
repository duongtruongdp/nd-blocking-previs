import type { SceneDocument, TimelineEntityType, TimelineInterpolation, TimelineProperty, TimelineValue } from '../core/sceneDocument'
import type { TimelineKeyframeSelection } from './timelineMath'
import { upsertTimelineKeyframe } from './timelineMath'

export type TimelineKeyframeClipboardEntry = {
  sourceTrackId: string
  sourceEntityId: string
  sourceEntityType: TimelineEntityType
  property: TimelineProperty
  sourceFrame: number
  value: TimelineValue
  interpolation: TimelineInterpolation
  easeIn?: boolean
  easeOut?: boolean
}

export type TimelineKeyframeClipboard = {
  sourceProjectId: string
  sourceSceneId: string
  /** The earliest selected frame. Paste places this origin on the playhead. */
  originFrame: number
  entries: TimelineKeyframeClipboardEntry[]
}

export type PastedTimelineKeyframes = {
  document: SceneDocument
  selections: TimelineKeyframeSelection[]
  skippedCount: number
}

export type PastedTimelineKeyframe = {
  document: SceneDocument
  selection: TimelineKeyframeSelection
}

function cloneValue(value: TimelineValue): TimelineValue {
  return Array.isArray(value) ? [...value] as [number, number, number] : value
}

function entityExists(document: SceneDocument, entityId: string, entityType: TimelineEntityType): boolean {
  if (entityType === 'Actor') return document.actors.some((entity) => entity.id === entityId)
  if (entityType === 'Prop') return document.props.some((entity) => entity.id === entityId)
  if (entityType === 'Wall') return document.walls.some((entity) => entity.id === entityId)
  if (entityType === 'Opening') return document.openings.some((entity) => entity.id === entityId)
  if (entityType === 'Sun') return document.lights.some((entity) => entity.id === entityId)
  return document.cameras.some((entity) => entity.id === entityId)
}

export function createTimelineKeyframeClipboardGroup(sourceProjectId: string, sourceSceneId: string, tracks: readonly SceneDocument['timeline']['tracks'][number][], selections: readonly TimelineKeyframeSelection[]): TimelineKeyframeClipboard | null {
  const entries = selections.flatMap((selection) => {
    const track = tracks.find((candidate) => candidate.id === selection.trackId)
    const keyframe = track?.keyframes.find((candidate) => candidate.id === selection.keyframeId)
    if (!track || !keyframe) return []
    return [{
      sourceTrackId: track.id,
      sourceEntityId: track.entityId,
      sourceEntityType: track.entityType,
      property: track.property,
      sourceFrame: keyframe.frame,
      value: cloneValue(keyframe.value),
      interpolation: keyframe.interpolation,
      ...(keyframe.easeIn !== undefined ? { easeIn: keyframe.easeIn } : {}),
      ...(keyframe.easeOut !== undefined ? { easeOut: keyframe.easeOut } : {}),
    }]
  }).sort((left, right) => left.sourceFrame - right.sourceFrame || left.sourceTrackId.localeCompare(right.sourceTrackId))
  if (entries.length === 0) return null
  return { sourceProjectId, sourceSceneId, originFrame: entries[0].sourceFrame, entries }
}

/** Single-key compatibility wrapper; single-key copy is the one-entry group case. */
export function createTimelineKeyframeClipboard(sourceProjectId: string, sourceSceneId: string, track: SceneDocument['timeline']['tracks'][number], keyframe: SceneDocument['timeline']['tracks'][number]['keyframes'][number]): TimelineKeyframeClipboard {
  return createTimelineKeyframeClipboardGroup(sourceProjectId, sourceSceneId, [track], [{ trackId: track.id, keyframeId: keyframe.id }])!
}

export function pasteTimelineKeyframes(document: SceneDocument, clipboard: TimelineKeyframeClipboard, frame: number, projectId: string): PastedTimelineKeyframes | null {
  if (document.metadata.id !== clipboard.sourceSceneId || clipboard.sourceProjectId !== projectId) return null
  const validEntries = clipboard.entries.filter((entry) => entityExists(document, entry.sourceEntityId, entry.sourceEntityType))
  if (validEntries.length === 0) return null

  // Plan all destinations first. Applying the plan afterward makes multi-track and
  // same-track collisions deterministic and prevents mutation order from changing it.
  const planned = validEntries.map((entry) => ({ entry, destinationFrame: frame + (entry.sourceFrame - clipboard.originFrame) }))
  let timeline = document.timeline
  planned.forEach(({ entry, destinationFrame }) => {
    timeline = upsertTimelineKeyframe(timeline, entry.sourceEntityId, entry.sourceEntityType, entry.property, destinationFrame, cloneValue(entry.value), entry.interpolation, { easeIn: entry.easeIn, easeOut: entry.easeOut })
  })
  const selections = planned.flatMap(({ entry, destinationFrame }) => {
    const keyframe = timeline.tracks.find((track) => track.id === entry.sourceTrackId)?.keyframes.find((candidate) => candidate.frame === destinationFrame)
    return keyframe ? [{ trackId: entry.sourceTrackId, keyframeId: keyframe.id }] : []
  })
  return {
    document: { ...document, timeline },
    selections,
    skippedCount: clipboard.entries.length - validEntries.length,
  }
}

/** Single-key compatibility wrapper; single-key paste is the one-entry group case. */
export function pasteTimelineKeyframe(document: SceneDocument, clipboard: TimelineKeyframeClipboard, frame: number, projectId: string): PastedTimelineKeyframe | null {
  const result = pasteTimelineKeyframes(document, clipboard, frame, projectId)
  const selection = result?.selections[0]
  return result && selection ? { document: result.document, selection } : null
}
