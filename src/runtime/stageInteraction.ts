import * as THREE from 'three'

export type StagePointerRegion = {
  left: number
  top: number
  width: number
  height: number
}

export type NormalizedStagePointer = {
  x: number
  y: number
}

export const STAGE_GESTURE_THRESHOLD_PX = 5

export function stagePointerMovedBeyondThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = STAGE_GESTURE_THRESHOLD_PX,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) > threshold
}

/**
 * Converts a browser pointer into normalized Stage coordinates for the active
 * image region. Returning null keeps letterbox and pillarbox areas inert.
 */
export function normalizeStagePointer(
  clientX: number,
  clientY: number,
  stageRect: StagePointerRegion,
  imageRegion: StagePointerRegion = stageRect,
): NormalizedStagePointer | null {
  if (imageRegion.width <= 0 || imageRegion.height <= 0) return null
  if (
    clientX < imageRegion.left ||
    clientX > imageRegion.left + imageRegion.width ||
    clientY < imageRegion.top ||
    clientY > imageRegion.top + imageRegion.height
  ) return null

  const x = ((clientX - imageRegion.left) / imageRegion.width) * 2 - 1
  const y = -((clientY - imageRegion.top) / imageRegion.height) * 2 + 1
  return {
    x: THREE.MathUtils.clamp(x, -1, 1),
    y: THREE.MathUtils.clamp(y, -1, 1),
  }
}

/**
 * Rejects visual helpers that are not filmmaking subjects. The owner resolver
 * still handles nested actor, prop, and camera meshes after this filter.
 */
export function isSelectableStageObject(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object
  while (current) {
    if (
      current.userData.stageSelectable === false ||
      current.userData.cameraFrustum === true ||
      current.userData.cameraDirection === true ||
      current.userData.diagnosticOverlay === true ||
      current.userData.facingIndicator === true
    ) return false
    current = current.parent
  }
  return true
}
