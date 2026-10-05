import * as THREE from 'three'

export type CameraFrustumGuideDimensions = {
  width: number
  height: number
  aspect: number
}

/** Returns the actual production camera aperture at a chosen guide distance. */
export function cameraFrustumGuideDimensions(camera: THREE.PerspectiveCamera, distance: number): CameraFrustumGuideDimensions {
  const size = camera.getViewSize(Math.max(0.001, distance), new THREE.Vector2())
  return { width: size.x, height: size.y, aspect: size.x / Math.max(0.001, size.y) }
}
