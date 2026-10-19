import * as THREE from 'three'

export const VIEW_CUBE_TARGET_OCCUPANCY = 0.8

export type ViewCubeFaceMode = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

export const VIEW_CUBE_FACE_LABELS: Record<ViewCubeFaceMode, string> = {
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
}

export function viewCubeFaceLabel(mode: ViewCubeFaceMode): string {
  return VIEW_CUBE_FACE_LABELS[mode]
}

export type ViewCubeProjectedBounds = {
  width: number
  height: number
}

const cubeCorners = [
  new THREE.Vector3(-1, -1, -1),
  new THREE.Vector3(-1, -1, 1),
  new THREE.Vector3(-1, 1, -1),
  new THREE.Vector3(-1, 1, 1),
  new THREE.Vector3(1, -1, -1),
  new THREE.Vector3(1, -1, 1),
  new THREE.Vector3(1, 1, -1),
  new THREE.Vector3(1, 1, 1),
]

/** Project the unit-consistent cube into the fixed mini-camera's X/Y plane. */
export function viewCubeProjectedBounds(rotation: THREE.Quaternion): ViewCubeProjectedBounds {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  cubeCorners.forEach((corner) => {
    const rotated = corner.clone().applyQuaternion(rotation)
    minX = Math.min(minX, rotated.x)
    maxX = Math.max(maxX, rotated.x)
    minY = Math.min(minY, rotated.y)
    maxY = Math.max(maxY, rotated.y)
  })
  return { width: maxX - minX, height: maxY - minY }
}

/**
 * Return the orthographic half-height needed to keep the whole cube visible
 * at the requested occupancy in both CSS render dimensions.
 */
export function viewCubeOrthoHalfHeight(bounds: ViewCubeProjectedBounds, aspect: number, occupancy = VIEW_CUBE_TARGET_OCCUPANCY): number {
  const safeAspect = Math.max(0.1, aspect)
  const safeOccupancy = THREE.MathUtils.clamp(occupancy, 0.1, 0.95)
  return Math.max(bounds.height / (2 * safeOccupancy), bounds.width / (2 * safeAspect * safeOccupancy))
}
