import type { ActorVector3 } from './sceneDocument'

export type DefaultCameraPlacement = {
  position: ActorVector3
  target: ActorVector3
}

/** Deterministic human-height placements for newly added blocking cameras. */
export function defaultCameraPlacement(cameraNumber: number): DefaultCameraPlacement {
  const index = Math.max(1, Math.floor(cameraNumber))
  return {
    position: [index - 1, 1.6, 6],
    target: [0, 1.2, 0],
  }
}
