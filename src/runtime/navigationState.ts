import * as THREE from 'three'

export type V2NavigationState = {
  target: THREE.Vector3
  distance: number
  azimuth: number
  polar: number
}

export const V2_MOUSE_PAN_SENSITIVITY = 0.0014
export const V2_TRACKPAD_PAN_SENSITIVITY = 0.0014
export const V2_ZOOM_SENSITIVITY = 0.0012

export function createV2NavigationState(): V2NavigationState {
  const target = new THREE.Vector3(0, 0.65, 0)
  const position = new THREE.Vector3(6, 4.8, 7)
  const offset = position.clone().sub(target)
  const spherical = new THREE.Spherical().setFromVector3(offset)
  return {
    target,
    distance: spherical.radius,
    azimuth: spherical.theta,
    polar: spherical.phi,
  }
}

export function applyV2NavigationState(camera: THREE.PerspectiveCamera, state: V2NavigationState): void {
  camera.up.set(0, 1, 0)
  camera.position.setFromSphericalCoords(state.distance, state.polar, state.azimuth).add(state.target)
  camera.lookAt(state.target)
  camera.updateMatrixWorld(true)
}

export function orbitV2Navigation(state: V2NavigationState, deltaX: number, deltaY: number, sensitivity = 0.006): void {
  state.azimuth -= deltaX * sensitivity
  state.polar = THREE.MathUtils.clamp(state.polar - deltaY * sensitivity, 0.05, Math.PI - 0.05)
}

export function panV2Navigation(state: V2NavigationState, camera: THREE.PerspectiveCamera, deltaX: number, deltaY: number, sensitivity = V2_MOUSE_PAN_SENSITIVITY): void {
  camera.updateMatrixWorld(true)
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const scale = state.distance * sensitivity
  state.target.addScaledVector(right, -deltaX * scale)
  state.target.addScaledVector(up, deltaY * scale)
}

export function panTrackpadV2Navigation(state: V2NavigationState, camera: THREE.PerspectiveCamera, deltaX: number, deltaY: number, sensitivity = V2_TRACKPAD_PAN_SENSITIVITY): void {
  panV2Navigation(state, camera, deltaX, deltaY, sensitivity)
}

export function zoomV2Navigation(state: V2NavigationState, deltaY: number, sensitivity = V2_ZOOM_SENSITIVITY): void {
  state.distance = THREE.MathUtils.clamp(state.distance * Math.pow(1 + sensitivity, deltaY), 0.6, 200)
}

export function resetV2Navigation(state: V2NavigationState): void {
  const defaults = createV2NavigationState()
  state.target.copy(defaults.target)
  state.distance = defaults.distance
  state.azimuth = defaults.azimuth
  state.polar = defaults.polar
}

export function framingDistanceForV2Bounds(bounds: THREE.Box3, camera: THREE.PerspectiveCamera): number {
  const radius = bounds.getSize(new THREE.Vector3()).length() / 2
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 0.001))
  const limitingHalfFov = Math.min(verticalFov, horizontalFov) / 2
  return Math.max(camera.near * 2, (radius / Math.sin(limitingHalfFov)) * 1.25)
}

export function synchronizeV2StageMatrices(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
  scene.updateMatrixWorld(true)
  camera.updateMatrixWorld(true)
}
