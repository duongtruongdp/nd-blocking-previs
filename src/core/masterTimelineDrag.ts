import { masterClipDurationFrames, type MasterClipDocument } from './masterSequence'
import { masterFrameToPixel } from './masterTimelineMath'

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
  let cursor = 0
  for (let index = 0; index < remaining.length; index += 1) {
    const durationPixels = masterFrameToPixel(masterClipDurationFrames(remaining[index]), pixelsPerFrame)
    if (pointerTimelineX < cursor + durationPixels / 2) return index
    cursor += durationPixels
  }
  return remaining.length
}

export function masterTimelineOrderStartFrames(clips: readonly MasterClipDocument[]): Map<string, number> {
  const starts = new Map<string, number>()
  let cursor = 0
  for (const clip of clips) {
    starts.set(clip.id, cursor)
    cursor += masterClipDurationFrames(clip)
  }
  return starts
}
