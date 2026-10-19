import type { TimelineDocument } from '../core/sceneDocument'
import { cameraPathSegmentForSelection, type CameraPathSegmentSelection } from './cameraPath'

export type CameraMoveReviewMode = 'preview' | 'loop'

export type CameraMoveReviewRange = {
  startFrame: number
  endFrame: number
}
/** Resolve the current review bounds from the selected path segment.
 *
 * This deliberately resolves on demand instead of caching frame numbers so a
 * Move End/Ripple Following retime immediately changes the review range.
 */
export function cameraMoveReviewRange(timeline: TimelineDocument, selection: CameraPathSegmentSelection | null): CameraMoveReviewRange | null {
  const segment = cameraPathSegmentForSelection(timeline, selection)
  if (!segment || segment.to.frame < segment.from.frame) return null
  return { startFrame: segment.from.frame, endFrame: segment.to.frame }
}
