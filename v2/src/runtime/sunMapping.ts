import * as THREE from 'three'

export const SUN_HELPER_RADIUS = 4
export const SUN_MIN_ELEVATION = -10
export const SUN_MAX_ELEVATION = 89

/** Direction from the scene toward the incoming sunlight. */
export function sunDirectionFromAngles(azimuth: number, elevation: number): THREE.Vector3 {
  const azimuthRadians = THREE.MathUtils.degToRad(azimuth)
  const elevationRadians = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(elevation, SUN_MIN_ELEVATION, SUN_MAX_ELEVATION))
  return new THREE.Vector3(
    Math.sin(azimuthRadians) * Math.cos(elevationRadians),
    -Math.sin(elevationRadians),
    Math.cos(azimuthRadians) * Math.cos(elevationRadians),
  ).normalize()
}

/** The editor helper sits on a fixed sky sphere opposite the light direction. */
export function sunHelperPosition(azimuth: number, elevation: number, radius = SUN_HELPER_RADIUS): THREE.Vector3 {
  return sunDirectionFromAngles(azimuth, elevation).multiplyScalar(-Math.max(0.001, radius))
}

/** Convert a dragged helper position back to the serializable direction model. */
export function sunAnglesFromHelperPosition(position: THREE.Vector3): { azimuth: number; elevation: number } {
  const helper = position.lengthSq() > 0.000001 ? position.clone().normalize() : sunHelperPosition(0, 45, 1)
  const direction = helper.multiplyScalar(-1)
  const azimuth = THREE.MathUtils.radToDeg(Math.atan2(direction.x, direction.z))
  const elevation = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(-direction.y, -1, 1))), SUN_MIN_ELEVATION, SUN_MAX_ELEVATION)
  return { azimuth, elevation }
}
