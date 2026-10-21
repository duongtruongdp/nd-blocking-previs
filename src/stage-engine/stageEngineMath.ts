import * as THREE from 'three'

export type StageTool = 'select' | 'move' | 'rotate' | 'scale'

export type StageTransformEntityKind = 'camera' | 'default'

export const STAGE_ROTATION_SNAP_PRESETS = [5, 15, 30, 45, 90] as const

export type StageAxisName = 'x' | 'y' | 'z'

export type StageGizmoSpace = 'local' | 'world'

export type StageViewMode = 'perspective' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'

export type StageIsometricCorner = 'top-front-right' | 'top-front-left' | 'top-back-right' | 'top-back-left'

export type StageViewSelection = StageViewMode | StageIsometricCorner

export const STAGE_VIEW_CUBE_FACE_MODES = ['top', 'bottom', 'front', 'back', 'left', 'right'] as const
export type StageViewCubeFace = typeof STAGE_VIEW_CUBE_FACE_MODES[number]

export type StageOrbitState = {
  radius: number
  theta: number
  phi: number
}

export type StagePointerMode = 'idle' | 'orbit' | 'pan' | 'move' | 'gizmo' | 'marquee'

export const STAGE_SNAP_GRID_PRESETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1] as const

export type StageSnapAxis = StageAxisName

export function snapStageValue(value: number, gridSize: number): number {
  const safeGridSize = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 0.1
  const snapped = Math.sign(value) * Math.floor(Math.abs(value) / safeGridSize + 0.5 + 1e-9) * safeGridSize
  return Math.abs(snapped) < safeGridSize * 0.000001 ? 0 : Number(snapped.toFixed(6))
}

export function snapStagePosition(position: THREE.Vector3, axes: readonly StageSnapAxis[], gridSize: number): THREE.Vector3 {
  const snapped = position.clone()
  if (axes.includes('x')) snapped.x = snapStageValue(snapped.x, gridSize)
  if (axes.includes('y')) snapped.y = snapStageValue(snapped.y, gridSize)
  if (axes.includes('z')) snapped.z = snapStageValue(snapped.z, gridSize)
  return snapped
}

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

export function stageProjectToClient(point: THREE.Vector3, camera: THREE.Camera, rect: StageCanvasRect): THREE.Vector2 {
  const projected = point.clone().project(camera)
  return new THREE.Vector2(
    rect.left + ((projected.x + 1) * 0.5 * rect.width),
    rect.top + ((1 - projected.y) * 0.5 * rect.height),
  )
}

export function stageProjectWorldAxisToScreen(camera: THREE.Camera, origin: THREE.Vector3, axis: THREE.Vector3, rect: StageCanvasRect, minimumPixels = 4): THREE.Vector2 | null {
  const originClient = stageProjectToClient(origin, camera, rect)
  const axisClient = stageProjectToClient(origin.clone().add(axis), camera, rect)
  const direction = axisClient.sub(originClient)
  if (direction.length() < minimumPixels) return null
  return direction.normalize()
}

export function stagePointerDeltaAlongAxis(startX: number, startY: number, clientX: number, clientY: number, screenAxis: THREE.Vector2): number {
  return new THREE.Vector2(clientX - startX, clientY - startY).dot(screenAxis)
}

export function stageCameraSpaceDepth(camera: THREE.Camera, worldPoint: THREE.Vector3): number {
  return Math.max(0.001, -worldPoint.clone().applyMatrix4(camera.matrixWorldInverse).z)
}

export function stageWorldUnitsPerPixelAtDepth(camera: THREE.Camera, depth: number, viewportHeight: number): number {
  if (camera instanceof THREE.OrthographicCamera) return Math.abs(camera.top - camera.bottom) / Math.max(1, viewportHeight)
  const perspective = camera as THREE.PerspectiveCamera
  return (2 * Math.max(0.001, depth) * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2)) / Math.max(1, viewportHeight)
}

export function stageWorldUnitsPerPixelAlongAxis(camera: THREE.Camera, origin: THREE.Vector3, axis: THREE.Vector3, rect: StageCanvasRect, minimumPixels = 4): number | null {
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

export function stageViewCubeDragStarted(startX: number, startY: number, clientX: number, clientY: number): boolean {
  return Math.hypot(clientX - startX, clientY - startY) >= 4
}

export function stageViewCubeFaceMode(face: StageViewCubeFace): Exclude<StageViewMode, 'perspective'> {
  return face
}

export function stageOrbitAfterPointerDelta(orbit: StageOrbitState, deltaX: number, deltaY: number, sensitivity = 0.006): StageOrbitState {
  return {
    radius: orbit.radius,
    theta: orbit.theta - deltaX * sensitivity,
    phi: THREE.MathUtils.clamp(orbit.phi - deltaY * sensitivity, 0.05, 3.1),
  }
}

export function stageOrbitAnglesFromDirection(direction: THREE.Vector3, fallbackTheta = 0.62): Pick<StageOrbitState, 'theta' | 'phi'> {
  const normalized = direction.clone().normalize()
  const phi = Math.acos(THREE.MathUtils.clamp(normalized.y, -1, 1))
  const horizontalLength = Math.hypot(normalized.x, normalized.z)
  return {
    theta: horizontalLength < 0.001 ? fallbackTheta : Math.atan2(normalized.x, normalized.z),
    phi: THREE.MathUtils.clamp(phi, 0.05, 3.1),
  }
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

export function dominantStageAxis(delta: THREE.Vector3): StageAxisName {
  const values: Array<[StageAxisName, number]> = [['x', Math.abs(delta.x)], ['y', Math.abs(delta.y)], ['z', Math.abs(delta.z)]]
  return values.sort((left, right) => right[1] - left[1])[0][0]
}

export function constrainStageDeltaToAxis(delta: THREE.Vector3, axis: StageAxisName): THREE.Vector3 {
  return new THREE.Vector3(axis === 'x' ? delta.x : 0, axis === 'y' ? delta.y : 0, axis === 'z' ? delta.z : 0)
}

/** Single selections use their current object basis; groups retain world axes. */
export function stageGizmoSpaceForSelection(selectionCount: number): StageGizmoSpace {
  return selectionCount === 1 ? 'local' : 'world'
}

/**
 * Transform-space policy for the filmmaking gizmo. A single Camera uses the
 * same local object basis for Move and Rotate; multi-selection remains in
 * world space so existing group behavior is unchanged.
 */
export function stageTransformSpace(entityKind: StageTransformEntityKind, mode: StageTool, selectionCount: number): StageGizmoSpace {
  if (selectionCount > 1) return 'world'
  return stageGizmoSpaceForSelection(selectionCount)
}

export function stageWorldAxis(axis: StageAxisName): THREE.Vector3 {
  return new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
}

export function stageViewModeIsOrthographic(mode: StageViewMode): mode is Exclude<StageViewMode, 'perspective'> {
  return mode !== 'perspective'
}

export function stageViewSelectionIsIsometric(selection: StageViewSelection): selection is StageIsometricCorner {
  return selection.startsWith('top-')
}

/** Stable editor-only orbit angles for the four useful isometric corners. */
export function stageIsometricAngles(corner: StageIsometricCorner): { theta: number; phi: number } {
  const phi = THREE.MathUtils.degToRad(54)
  switch (corner) {
    case 'top-front-right': return { theta: Math.PI / 4, phi }
    case 'top-front-left': return { theta: -Math.PI / 4, phi }
    case 'top-back-right': return { theta: (Math.PI * 3) / 4, phi }
    case 'top-back-left': return { theta: (-Math.PI * 3) / 4, phi }
  }
}

export function stageViewDirection(mode: Exclude<StageViewMode, 'perspective'>): { direction: THREE.Vector3; up: THREE.Vector3 } {
  switch (mode) {
    case 'top': return { direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) }
    case 'bottom': return { direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) }
    case 'front': return { direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) }
    case 'back': return { direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) }
    case 'left': return { direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) }
    case 'right': return { direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) }
  }
}

/**
 * Semantic rotation basis for the filmmaking gizmo. Y is always world-up
 * pan; X and Z follow the entity's current local right/forward axes.
 */
export function stageRotationAxis(rotation: [number, number, number], axis: 'x' | 'y' | 'z'): THREE.Vector3 {
  if (axis === 'y') return new THREE.Vector3(0, 1, 0)
  const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, 'XYZ'))
  return new THREE.Vector3(axis === 'x' ? 1 : 0, 0, axis === 'z' ? 1 : 0).applyQuaternion(orientation).normalize()
}

/** Full object-local basis, including the object's local Y axis. */
export function stageLocalAxis(rotation: [number, number, number], axis: StageAxisName): THREE.Vector3 {
  const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, 'XYZ'))
  const direction = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
  return direction.applyQuaternion(orientation).normalize()
}

/** Resolve the actual ring/handle basis for one transform context. */
export function stageTransformAxis(entityKind: StageTransformEntityKind, mode: StageTool, rotation: [number, number, number], axis: StageAxisName, selectionCount: number): THREE.Vector3 {
  const space = stageTransformSpace(entityKind, mode, selectionCount)
  if (space === 'local') return stageLocalAxis(rotation, axis)
  return mode === 'rotate' ? stageRotationAxis(rotation, axis) : stageWorldAxis(axis)
}

/**
 * Apply one deterministic rotation delta in the selected transform space.
 * `axis` is a canonical local axis for local space and a world-space axis for
 * world space; callers measure the pointer with the corresponding world basis
 * and pass the canonical local axis when composing a local quaternion.
 */
export function stageApplyRotation(start: THREE.Quaternion, axis: THREE.Vector3, angle: number, space: StageGizmoSpace): THREE.Quaternion {
  const delta = new THREE.Quaternion().setFromAxisAngle(axis, angle)
  return space === 'local'
    ? start.clone().multiply(delta).normalize()
    : delta.multiply(start.clone()).normalize()
}
