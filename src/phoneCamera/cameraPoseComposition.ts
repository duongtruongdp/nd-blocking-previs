import * as THREE from 'three'
import type { ActorVector3 } from '../core/sceneDocument'
import { eulerRotationFromQuaternion, quaternionFromEulerRotation } from './poseMath'

export type CameraPose = {
  position: ActorVector3
  rotation: ActorVector3
}

export type CameraPoseSnapshot = CameraPose & {
  playbackFrame: number
  basePoseVersion: number
  phoneLayerVersion: number
  finalPoseVersion: number
}

export type PhoneCameraLiveLayer = {
  cameraId: string
  positionDelta: ActorVector3
  rotationDelta: ActorVector3
  rotationDeltaQuaternion: [number, number, number, number]
}

export function createCameraPoseSnapshot(base: CameraPose, layer: PhoneCameraLiveLayer | null, metadata: Omit<CameraPoseSnapshot, keyof CameraPose>): CameraPoseSnapshot {
  const final = composeFinalCameraPose(base, layer)
  return { ...final, ...metadata }
}

/** Compose the normal evaluated shot pose with the latest temporary Phone Camera layer. */
export function composeFinalCameraPose(base: CameraPose, layer: PhoneCameraLiveLayer | null): CameraPose {
  if (!layer) return { position: [...base.position], rotation: [...base.rotation] }
  const position: ActorVector3 = [
    base.position[0] + layer.positionDelta[0],
    base.position[1] + layer.positionDelta[1],
    base.position[2] + layer.positionDelta[2],
  ]
  const baseRotation = quaternionFromEulerRotation(base.rotation)
  const deltaRotation = new THREE.Quaternion(...layer.rotationDeltaQuaternion).normalize()
  const rotation = eulerRotationFromQuaternion(baseRotation.multiply(deltaRotation).normalize())
  return { position, rotation }
}
