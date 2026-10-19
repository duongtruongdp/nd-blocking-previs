import * as THREE from 'three'
import type { PhoneCameraControlChannels, PhoneCameraScreenOrientation } from './protocol'

const SCREEN_CORRECTION = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)

/** Convert the browser's alpha/beta/gamma sensor angles into the app's -Z camera convention. */
export function deviceOrientationQuaternion(alpha: number, beta: number, gamma: number, screenAngle = 0): THREE.Quaternion {
  const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ')
  const orientation = new THREE.Quaternion().setFromEuler(euler)
  const screen = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -screenAngle)
  return orientation.multiply(SCREEN_CORRECTION).multiply(screen).normalize()
}

export function relativeCameraQuaternion(base: THREE.Quaternion, reference: THREE.Quaternion, current: THREE.Quaternion, sensitivity = 1): THREE.Quaternion {
  const delta = reference.clone().invert().multiply(current).normalize()
  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, Math.abs(delta.w))))
  if (angle < 1e-7) return base.clone().normalize()
  const axis = new THREE.Vector3(delta.x, delta.y, delta.z)
  if (axis.lengthSq() < 1e-10) return base.clone().normalize()
  axis.normalize()
  const scaled = new THREE.Quaternion().setFromAxisAngle(axis, angle * Math.max(0, sensitivity))
  if (delta.w < 0) scaled.set(-scaled.x, -scaled.y, -scaled.z, scaled.w)
  return base.clone().multiply(scaled).normalize()
}

/** Return the recentered phone rotation in the app's semantic XYZ order. */
export function relativeSemanticRotation(reference: THREE.Quaternion, current: THREE.Quaternion): [number, number, number] {
  const delta = reference.clone().invert().multiply(current).normalize()
  const euler = new THREE.Euler().setFromQuaternion(delta, 'XYZ')
  return [euler.x, euler.y, euler.z]
}

/** Rebuild a Camera orientation from semantic Pitch / Pan / Dutch values. */
export function semanticCameraQuaternion(rotation: [number, number, number]): THREE.Quaternion {
  return quaternionFromEulerRotation(rotation)
}

export function hasMovementChannels(channels: PhoneCameraControlChannels): boolean {
  return channels.truck || channels.pedestal || channels.dolly
}

export function hasRotationChannels(channels: PhoneCameraControlChannels): boolean {
  return channels.pan || channels.tilt || channels.dutch
}

export function semanticPositionDelta(
  referencePhonePosition: THREE.Vector3,
  currentPhonePosition: THREE.Vector3,
  referencePhoneOrientation: THREE.Quaternion,
  cameraOrientation: THREE.Quaternion,
  channels: PhoneCameraControlChannels,
  scale = 1,
): THREE.Vector3 {
  const physicalWorldDelta = currentPhonePosition.clone().sub(referencePhonePosition)
  const phoneLocalDelta = physicalWorldDelta.applyQuaternion(referencePhoneOrientation.clone().invert())
  const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraOrientation)
  cameraForward.y = 0
  if (cameraForward.lengthSq() < 1e-10) cameraForward.set(0, 0, -1)
  cameraForward.normalize()
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraOrientation)
  cameraRight.y = 0
  if (cameraRight.lengthSq() < 1e-10) cameraRight.set(1, 0, 0)
  cameraRight.normalize()
  const result = new THREE.Vector3()
  if (channels.truck) result.add(cameraRight.multiplyScalar(phoneLocalDelta.x))
  if (channels.pedestal) result.y += phoneLocalDelta.y
  if (channels.dolly) result.add(cameraForward.multiplyScalar(-phoneLocalDelta.z))
  return result.multiplyScalar(Math.max(0, scale))
}

export function smoothQuaternion(current: THREE.Quaternion, target: THREE.Quaternion, amount: number): THREE.Quaternion {
  return current.clone().slerp(target, Math.min(1, Math.max(0, amount))).normalize()
}

/**
 * Convert an ARKit/world-space phone translation into the recentered ND
 * Camera frame. The reference phone orientation removes the arbitrary ARKit
 * session heading; the virtual Camera's yaw puts horizontal motion back into
 * the shot's world axes. Phone +X/-Z map to Camera right/forward while phone
 * +Y stays world-up, so pedestal movement remains vertical even when the
 * Camera is tilted or dutched.
 */
export function recenteredCameraPositionDelta(
  referencePhonePosition: THREE.Vector3,
  currentPhonePosition: THREE.Vector3,
  referencePhoneOrientation: THREE.Quaternion,
  virtualCameraOrientation: THREE.Quaternion,
  scale = 1,
): THREE.Vector3 {
  const physicalWorldDelta = currentPhonePosition.clone().sub(referencePhonePosition)
  const phoneLocalDelta = physicalWorldDelta.applyQuaternion(referencePhoneOrientation.clone().invert())
  const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(virtualCameraOrientation)
  cameraForward.y = 0
  if (cameraForward.lengthSq() < 1e-10) cameraForward.set(0, 0, -1)
  cameraForward.normalize()
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(virtualCameraOrientation)
  cameraRight.y = 0
  if (cameraRight.lengthSq() < 1e-10) cameraRight.set(1, 0, 0)
  cameraRight.normalize()
  return cameraRight.multiplyScalar(phoneLocalDelta.x)
    .add(new THREE.Vector3(0, phoneLocalDelta.y, 0))
    .add(cameraForward.multiplyScalar(-phoneLocalDelta.z))
    .multiplyScalar(Math.max(0, scale))
}

export function smoothVector(current: THREE.Vector3, target: THREE.Vector3, amount: number): THREE.Vector3 {
  return current.clone().lerp(target, Math.min(1, Math.max(0, amount)))
}

export function quaternionFromEulerRotation(rotation: [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, 'XYZ')).normalize()
}

export function eulerRotationFromQuaternion(quaternion: THREE.Quaternion): [number, number, number] {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
  return [euler.x, euler.y, euler.z]
}

export function screenOrientationAngle(): number {
  return THREE.MathUtils.degToRad(screenOrientationAngleDegrees())
}

export function screenOrientationAngleDegrees(): number {
  const legacyOrientation = typeof window !== 'undefined' ? (window as Window & { orientation?: number }).orientation : undefined
  if (typeof screen !== 'undefined') {
    const orientation = screen.orientation?.angle
    if (typeof orientation === 'number' && Number.isFinite(orientation) && !(normalizeScreenAngle(orientation) === 0 && typeof legacyOrientation === 'number' && Math.abs(legacyOrientation) === 90)) return normalizeScreenAngle(orientation)
  }
  if (typeof legacyOrientation === 'number' && Number.isFinite(legacyOrientation)) return normalizeScreenAngle(legacyOrientation)
  return 0
}

export function screenOrientationState(angle = screenOrientationAngleDegrees()): PhoneCameraScreenOrientation {
  const normalized = normalizeScreenAngle(angle)
  if (normalized === 90) return 'landscape-right'
  if (normalized === 270) return 'landscape-left'
  if (normalized === 0 || normalized === 180) return 'portrait'
  return 'unknown'
}

function normalizeScreenAngle(angle: number): number {
  return ((Math.round(angle) % 360) + 360) % 360
}
