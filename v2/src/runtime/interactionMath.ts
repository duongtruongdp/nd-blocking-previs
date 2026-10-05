import * as THREE from 'three'

export const V2_GESTURE_THRESHOLD_PX = 3
export type V2ShortcutTool = 'select' | 'move' | 'rotate'

export type V2PointerRegion = { left: number; top: number; width: number; height: number }

export function v2PointerToNdc(clientX: number, clientY: number, rect: V2PointerRegion): THREE.Vector2 {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
}

export function v2MovedBeyondThreshold(startX: number, startY: number, currentX: number, currentY: number, threshold = V2_GESTURE_THRESHOLD_PX): boolean {
  return Math.hypot(currentX - startX, currentY - startY) > threshold
}

export function v2ToolForShortcut(key: string): V2ShortcutTool | null {
  const shortcut = key.toLowerCase()
  if (shortcut === 'q') return 'move'
  if (shortcut === 'e') return 'select'
  if (shortcut === 'r') return 'rotate'
  return null
}

export function signedV2AxisAngle(start: THREE.Vector3, current: THREE.Vector3, axis: THREE.Vector3): number {
  const startDirection = start.clone().normalize()
  const currentDirection = current.clone().normalize()
  const normal = axis.clone().normalize()
  return Math.atan2(startDirection.clone().cross(currentDirection).dot(normal), startDirection.dot(currentDirection))
}
