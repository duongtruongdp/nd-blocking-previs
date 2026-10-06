import * as THREE from 'three'

export type StageTool = 'select' | 'move' | 'rotate' | 'scale'

export type StagePointerMode = 'idle' | 'orbit' | 'pan' | 'move' | 'gizmo'

export type StagePointerPoint = {
  clientX: number
  clientY: number
}

export type StageCanvasRect = {
  left: number
  top: number
  width: number
  height: number
}

export function stageProjectToClient(point: THREE.Vector3, camera: THREE.PerspectiveCamera, rect: StageCanvasRect): THREE.Vector2 {
  const projected = point.clone().project(camera)
  return new THREE.Vector2(
    rect.left + ((projected.x + 1) * 0.5 * rect.width),
    rect.top + ((1 - projected.y) * 0.5 * rect.height),
  )
}

export function stageProjectWorldAxisToScreen(camera: THREE.PerspectiveCamera, origin: THREE.Vector3, axis: THREE.Vector3, rect: StageCanvasRect, minimumPixels = 4): THREE.Vector2 | null {
  const originClient = stageProjectToClient(origin, camera, rect)
  const axisClient = stageProjectToClient(origin.clone().add(axis), camera, rect)
  const direction = axisClient.sub(originClient)
  if (direction.length() < minimumPixels) return null
  return direction.normalize()
}

export function stagePointerDeltaAlongAxis(startX: number, startY: number, clientX: number, clientY: number, screenAxis: THREE.Vector2): number {
  return new THREE.Vector2(clientX - startX, clientY - startY).dot(screenAxis)
}

export function stageCameraSpaceDepth(camera: THREE.PerspectiveCamera, worldPoint: THREE.Vector3): number {
  return Math.max(0.001, -worldPoint.clone().applyMatrix4(camera.matrixWorldInverse).z)
}

export function stageWorldUnitsPerPixelAtDepth(camera: THREE.PerspectiveCamera, depth: number, viewportHeight: number): number {
  return (2 * Math.max(0.001, depth) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, viewportHeight)
}

export function stageWorldUnitsPerPixelAlongAxis(camera: THREE.PerspectiveCamera, origin: THREE.Vector3, axis: THREE.Vector3, rect: StageCanvasRect, minimumPixels = 4): number | null {
  const axisDirection = stageProjectWorldAxisToScreen(camera, origin, axis, rect, minimumPixels)
  if (!axisDirection) return null
  const originClient = stageProjectToClient(origin, camera, rect)
  const axisClient = stageProjectToClient(origin.clone().add(axis), camera, rect)
  const projectedPixelsPerWorldUnit = axisClient.distanceTo(originClient)
  const baseScale = stageWorldUnitsPerPixelAtDepth(camera, stageCameraSpaceDepth(camera, origin), rect.height)
  const verticalPixelsPerWorldUnit = 1 / baseScale
  const projectionAdjustment = projectedPixelsPerWorldUnit / verticalPixelsPerWorldUnit
  return baseScale / projectionAdjustment
}

export function stageNdcFromEvent(event: StagePointerPoint, rect: StageCanvasRect): THREE.Vector2 {
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
}

export function stageMovedBeyondThreshold(startX: number, startY: number, clientX: number, clientY: number): boolean {
  return Math.hypot(clientX - startX, clientY - startY) >= 3
}

export function stageToolForKey(key: string): StageTool | null {
  if (key.toLowerCase() === 'e') return 'select'
  if (key.toLowerCase() === 'q') return 'move'
  if (key.toLowerCase() === 'r') return 'rotate'
  if (key.toLowerCase() === 's') return 'scale'
  return null
}

export function stageZoomDistance(distance: number, deltaY: number, sensitivity = 0.0012): number {
  return THREE.MathUtils.clamp(distance * Math.pow(1 + sensitivity, deltaY), 0.6, 200)
}
