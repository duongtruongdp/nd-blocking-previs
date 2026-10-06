import * as THREE from 'three'

export type StageViewDirection = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

export type NavigationSnapshot = {
  position: [number, number, number]
  target: [number, number, number]
  quaternion: [number, number, number, number]
  distance: number
}

export type BlockingNavigationState = {
  target: THREE.Vector3
  distance: number
  azimuth: number
  polar: number
}

export const NAVIGATION_MIN_DISTANCE = 1.4
export const NAVIGATION_MAX_DISTANCE = 200
export const NAVIGATION_MIN_POLAR = 0.05
export const NAVIGATION_MAX_POLAR = Math.PI - NAVIGATION_MIN_POLAR
export const NAVIGATION_ORBIT_SENSITIVITY = 0.006
export const NAVIGATION_PAN_SENSITIVITY = 0.0014
export const NAVIGATION_ZOOM_BASE = 1.0012

export const DEFAULT_NAVIGATION_TARGET = new THREE.Vector3(0, 0.65, 0)
export const DEFAULT_NAVIGATION_POSITION = new THREE.Vector3(6, 4.8, 7)

export function createBlockingNavigationState(
  position = DEFAULT_NAVIGATION_POSITION,
  target = DEFAULT_NAVIGATION_TARGET,
): BlockingNavigationState {
  const offset = position.clone().sub(target)
  const spherical = new THREE.Spherical().setFromVector3(offset)
  return {
    target: target.clone(),
    distance: THREE.MathUtils.clamp(spherical.radius, NAVIGATION_MIN_DISTANCE, NAVIGATION_MAX_DISTANCE),
    azimuth: spherical.theta,
    polar: THREE.MathUtils.clamp(spherical.phi, NAVIGATION_MIN_POLAR, NAVIGATION_MAX_POLAR),
  }
}

export function applyBlockingNavigationState(
  camera: THREE.PerspectiveCamera,
  state: BlockingNavigationState,
): void {
  state.distance = THREE.MathUtils.clamp(state.distance, NAVIGATION_MIN_DISTANCE, NAVIGATION_MAX_DISTANCE)
  state.polar = THREE.MathUtils.clamp(state.polar, NAVIGATION_MIN_POLAR, NAVIGATION_MAX_POLAR)
  camera.up.set(0, 1, 0)
  camera.position.setFromSphericalCoords(state.distance, state.polar, state.azimuth).add(state.target)
  camera.lookAt(state.target)
}

/**
 * Synchronizes the derived Blocking View camera and scene transforms before
 * projection, raycasting, or any other screen/world interaction calculation.
 */
export function synchronizeBlockingInteractionMatrices(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
): void {
  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
}

export function orbitBlockingNavigation(
  state: BlockingNavigationState,
  deltaX: number,
  deltaY: number,
  sensitivity = NAVIGATION_ORBIT_SENSITIVITY,
): void {
  state.azimuth -= deltaX * sensitivity
  state.polar = THREE.MathUtils.clamp(
    state.polar - deltaY * sensitivity,
    NAVIGATION_MIN_POLAR,
    NAVIGATION_MAX_POLAR,
  )
}

export function panBlockingNavigation(
  state: BlockingNavigationState,
  camera: THREE.PerspectiveCamera,
  deltaX: number,
  deltaY: number,
  sensitivity = NAVIGATION_PAN_SENSITIVITY,
): void {
  camera.updateMatrixWorld(true)
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const scale = state.distance * sensitivity
  state.target.addScaledVector(right, -deltaX * scale)
  state.target.addScaledVector(up, deltaY * scale)
}

export function zoomBlockingNavigation(
  state: BlockingNavigationState,
  deltaY: number,
  base = NAVIGATION_ZOOM_BASE,
): void {
  state.distance = THREE.MathUtils.clamp(
    state.distance * Math.pow(base, deltaY),
    NAVIGATION_MIN_DISTANCE,
    NAVIGATION_MAX_DISTANCE,
  )
}

export function setBlockingNavigationFromPosition(
  state: BlockingNavigationState,
  position: THREE.Vector3,
): void {
  const offset = position.clone().sub(state.target)
  const spherical = new THREE.Spherical().setFromVector3(offset)
  state.distance = THREE.MathUtils.clamp(spherical.radius, NAVIGATION_MIN_DISTANCE, NAVIGATION_MAX_DISTANCE)
  state.azimuth = spherical.theta
  state.polar = THREE.MathUtils.clamp(spherical.phi, NAVIGATION_MIN_POLAR, NAVIGATION_MAX_POLAR)
}

/**
 * Returns a perspective distance that fits a world-space bounds sphere with
 * padding in the current navigation camera's field of view.
 */
export function framingDistanceForBounds(
  bounds: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  padding = 1.25,
): number {
  const size = bounds.getSize(new THREE.Vector3())
  const radius = size.length() / 2
  if (!Number.isFinite(radius) || radius <= 0) return Math.max(camera.near * 2, 1)

  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.001))
  const limitingHalfFov = Math.min(verticalFov, horizontalFov) / 2
  return Math.max(camera.near * 2, (radius / Math.sin(limitingHalfFov)) * padding)
}

export function framingPositionForBounds(
  bounds: THREE.Box3,
  camera: THREE.PerspectiveCamera,
  currentTarget: THREE.Vector3,
  currentPosition: THREE.Vector3,
  padding = 1.25,
): { center: THREE.Vector3; position: THREE.Vector3; distance: number } {
  const center = bounds.getCenter(new THREE.Vector3())
  const direction = currentPosition.clone().sub(currentTarget)
  if (direction.lengthSq() <= 1e-8) direction.set(6, 4.8, 7).normalize()
  else direction.normalize()
  const distance = framingDistanceForBounds(bounds, camera, padding)
  return {
    center,
    position: center.clone().addScaledVector(direction, distance),
    distance,
  }
}

export function isEditableNavigationTarget(target: { tagName?: string; isContentEditable?: boolean } | null | undefined): boolean {
  if (!target) return false
  return target.isContentEditable === true || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName?.toUpperCase() ?? '')
}

const STANDARD_VIEW_OFFSETS: Record<StageViewDirection, THREE.Vector3> = {
  // Actors and filmmaking Cameras face local -Z, so Front is the +Z side.
  front: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  top: new THREE.Vector3(0, 1, 0),
  bottom: new THREE.Vector3(0, -1, 0),
}

export function standardViewOffset(direction: StageViewDirection): THREE.Vector3 {
  return STANDARD_VIEW_OFFSETS[direction].clone()
}

/**
 * Keeps top and bottom views almost exactly vertical without looking directly
 * along the camera up vector. The tiny depth offset gives the camera a
 * deterministic screen-up direction and prevents repeated TOP clicks from
 * accumulating a roll.
 */
export function standardViewPosition(
  direction: StageViewDirection,
  target: THREE.Vector3,
  distance: number,
): THREE.Vector3 {
  const offset = standardViewOffset(direction).multiplyScalar(Math.max(0.001, distance))
  if (direction === 'top' || direction === 'bottom') offset.z = direction === 'top' ? -0.0001 : 0.0001
  return target.clone().add(offset)
}

export function navigationSnapshot(camera: THREE.PerspectiveCamera, target: THREE.Vector3): NavigationSnapshot {
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [target.x, target.y, target.z],
    quaternion: [camera.quaternion.x, camera.quaternion.y, camera.quaternion.z, camera.quaternion.w],
    distance: camera.position.distanceTo(target),
  }
}
