export type MasterClipInteractionMode = 'move' | 'trim-left' | 'trim-right'

export type MasterClipHitRect = { left: number; width: number }

/** Comfortable NLE-style edge acquisition target, measured in CSS pixels. */
export const MASTER_CLIP_EDGE_HIT_ZONE_PX = 13

const MASTER_CLIP_MIN_BODY_HIT_ZONE_PX = 16
const MASTER_CLIP_MIN_EDGE_HIT_ZONE_PX = 6

export function masterClipEdgeHitZonePx(width: number, requestedEdgePx = MASTER_CLIP_EDGE_HIT_ZONE_PX): number {
  const safeWidth = Math.max(0, Number.isFinite(width) ? width : 0)
  const requestedEdge = Math.max(1, requestedEdgePx)
  if (safeWidth <= MASTER_CLIP_MIN_BODY_HIT_ZONE_PX) return 0
  const proportionalEdge = Math.max(0, (safeWidth - MASTER_CLIP_MIN_BODY_HIT_ZONE_PX) / 2)
  const edge = Math.min(requestedEdge, proportionalEdge)
  return edge < MASTER_CLIP_MIN_EDGE_HIT_ZONE_PX ? 0 : edge
}

/**
 * Chooses the edit mode once from the pointerdown screen coordinate.
 * The threshold is deliberately in CSS pixels so timeline zoom cannot turn
 * the whole temporal clip into a trim target.
 */
export function masterClipInteractionMode(rect: MasterClipHitRect, clientX: number, edgeThresholdPx = MASTER_CLIP_EDGE_HIT_ZONE_PX): MasterClipInteractionMode {
  const width = Math.max(0, Number.isFinite(rect.width) ? rect.width : 0)
  const localX = clientX - rect.left
  const edge = masterClipEdgeHitZonePx(width, edgeThresholdPx)
  if (edge <= 0) return 'move'
  if (localX <= edge) return 'trim-left'
  if (width - localX <= edge) return 'trim-right'
  return 'move'
}
