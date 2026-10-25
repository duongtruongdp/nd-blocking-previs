import { masterClipDurationFrames, masterClipStartFrame, orderedMasterClips, type MasterClipDocument, type MasterSequenceDocument } from './masterSequence'
import { masterFrameRangeToPixels } from './masterTimelineMath'

/** Returns the ordered clip IDs after inserting a dragged clip at a post-removal index. */
export function previewMasterClipOrder(clips: readonly MasterClipDocument[], draggedClipId: string, insertionIndex: number): MasterClipDocument[] {
  const dragged = clips.find((clip) => clip.id === draggedClipId)
  if (!dragged) return [...clips]
  const remaining = clips.filter((clip) => clip.id !== draggedClipId)
  const safeIndex = Math.max(0, Math.min(remaining.length, Math.round(insertionIndex)))
  remaining.splice(safeIndex, 0, dragged)
  return remaining
}

/** Resolves an insertion index from actual duration-based timeline geometry. */
export function masterTimelineInsertionIndex(clips: readonly MasterClipDocument[], pointerTimelineX: number, pixelsPerFrame: number, draggedClipId: string | null = null): number {
  const remaining = draggedClipId ? clips.filter((clip) => clip.id !== draggedClipId) : [...clips]
  let cursorFrame = 0
  for (let index = 0; index < remaining.length; index += 1) {
    const durationFrames = masterClipDurationFrames(remaining[index])
    const range = masterFrameRangeToPixels(cursorFrame, cursorFrame + durationFrames, pixelsPerFrame)
    if (pointerTimelineX < range.startPx + range.widthPx / 2) return index
    cursorFrame += durationFrames
  }
  return remaining.length
}

export function masterTimelineOrderStartFrames(clips: readonly MasterClipDocument[]): Map<string, number> {
  const starts = new Map<string, number>()
  let cursor = 0
  for (const clip of clips) {
    const start = clip.startMasterFrame === undefined ? cursor : Math.max(0, Math.round(clip.startMasterFrame))
    starts.set(clip.id, start)
    cursor = Math.max(cursor, start + masterClipDurationFrames(clip))
  }
  return starts
}

export type MasterSnapTarget = { frame: number; kind: 'clip-start' | 'clip-end' | 'playhead' | 'mark-in' | 'mark-out' | 'frame' }

/** Snaps only to the nearest target inside the supplied integer-frame threshold. */
export function snapMasterFrame(frame: number, targets: readonly MasterSnapTarget[], thresholdFrames: number): number {
  const candidate = Math.max(0, Math.round(Number.isFinite(frame) ? frame : 0))
  let nearest = candidate
  let distance = Math.max(0, Number.isFinite(thresholdFrames) ? thresholdFrames : 0) + 1
  for (const target of targets) {
    const targetFrame = Math.max(0, Math.round(target.frame))
    const nextDistance = Math.abs(targetFrame - candidate)
    if (nextDistance < distance) {
      nearest = targetFrame
      distance = nextDistance
    }
  }
  return nearest
}

export function masterShotSnapTargets(sequence: MasterSequenceDocument, excludeClipId: string | null, playhead: number, markIn: number | null, markOut: number | null): MasterSnapTarget[] {
  const targets: MasterSnapTarget[] = [{ frame: 0, kind: 'frame' }, { frame: Math.max(0, Math.round(playhead)), kind: 'playhead' }]
  if (markIn !== null) targets.push({ frame: markIn, kind: 'mark-in' })
  if (markOut !== null) targets.push({ frame: markOut, kind: 'mark-out' })
  const orderedClips = orderedMasterClips(sequence)
  const starts = masterTimelineOrderStartFrames(orderedClips)
  for (const clip of orderedClips) {
    if (clip.id === excludeClipId) continue
    const start = starts.get(clip.id) ?? masterClipStartFrame(sequence, clip.id) ?? 0
    targets.push({ frame: start, kind: 'clip-start' }, { frame: start + masterClipDurationFrames(clip), kind: 'clip-end' })
  }
  return targets
}

export function masterShotPlacementIsValid(sequence: MasterSequenceDocument, clipId: string, startFrame: number): boolean {
  const clip = sequence.clips.find((candidate) => candidate.id === clipId)
  if (!clip) return false
  const start = Math.max(0, Math.round(startFrame))
  const end = start + masterClipDurationFrames(clip)
  const orderedClips = orderedMasterClips(sequence)
  const starts = masterTimelineOrderStartFrames(orderedClips)
  return orderedClips.every((candidate) => {
    if (candidate.id === clipId) return true
    const candidateStart = starts.get(candidate.id) ?? 0
    const candidateEnd = candidateStart + masterClipDurationFrames(candidate)
    return start >= candidateEnd || end <= candidateStart
  })
}
