import * as THREE from 'three'
import type { ActorDocument, CameraDocument, PropDocument, WallDocument, OpeningDocument, SceneDocument } from '../core/sceneDocument'
import { actorAimPoint, type TargetAimPoint } from './compositionMath'
import { cameraDocumentWithTimelineEvaluation, evaluateTimeline } from '../timeline/timelineEvaluator'

export type CameraBlockingTarget = ActorDocument | PropDocument | WallDocument | OpeningDocument | CameraDocument
export type CameraBlockingMove = 'dolly' | 'truck' | 'pedestal'

/**
 * The camera pose the editor is currently showing and therefore the pose that
 * a blocking edit must start from. Authored Timeline properties take
 * precedence over the base CameraDocument at the current playhead.
 */
export function currentEditableCameraPose(scene: SceneDocument, cameraId: string): CameraDocument | null {
  const camera = scene.cameras.find((item) => item.id === cameraId)
  if (!camera) return null
  return cameraDocumentWithTimelineEvaluation(camera, evaluateTimeline(scene, scene.timeline.currentFrame)[cameraId])
}

export function targetReferencePoint(target: CameraBlockingTarget, aimPoint: TargetAimPoint = 'center'): [number, number, number] {
  if ('cameraDefinitionId' in target) return [...target.position]
  if ('pose' in target) return actorAimPoint(target, aimPoint)
  return [...target.position]
}

export function cameraSubjectDistance(camera: CameraDocument, target: CameraBlockingTarget, aimPoint: TargetAimPoint = 'center'): number {
  const [x, y, z] = targetReferencePoint(target, aimPoint)
  return new THREE.Vector3(x, y, z).distanceTo(new THREE.Vector3(...camera.position))
}

export function cameraAimRotation(camera: CameraDocument, target: CameraBlockingTarget, aimPoint: TargetAimPoint = 'center'): [number, number, number] {
  const position = new THREE.Vector3(...camera.position)
  const targetPoint = new THREE.Vector3(...targetReferencePoint(target, aimPoint))
  const direction = targetPoint.clone().sub(position)
  if (direction.lengthSq() < 1e-10) return [...camera.rotation]
  const helper = new THREE.PerspectiveCamera()
  helper.position.copy(position)
  helper.lookAt(targetPoint)
  return [helper.rotation.x, helper.rotation.y, helper.rotation.z]
}

export function cameraPositionAfterMove(camera: CameraDocument, move: CameraBlockingMove, delta: number): [number, number, number] {
  const position = new THREE.Vector3(...camera.position)
  if (move === 'pedestal') position.y += delta
  else {
    const rotation = new THREE.Euler(...camera.rotation, 'XYZ')
    const orientation = new THREE.Quaternion().setFromEuler(rotation)
    const axis = move === 'dolly' ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(1, 0, 0)
    position.add(axis.applyQuaternion(orientation).multiplyScalar(delta))
  }
  return [position.x, position.y, position.z]
}
