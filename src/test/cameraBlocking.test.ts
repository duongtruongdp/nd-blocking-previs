import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createActorDocument, createCameraDocument, createEmptySceneDocument, createPropDocument } from '../core/sceneDocument'
import { cameraAimRotation, cameraPositionAfterMove, cameraSubjectDistance, currentEditableCameraPose, targetReferencePoint } from '../runtime/cameraBlocking'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('camera blocking helpers', () => {
  const camera = createCameraDocument('camera-01', 'Camera 01', [0, 2, 5], [0, 0, 0], 'arri-alexa-mini-lf', 'lf-open-gate-4-5k')

  it('aims the optical -Z axis at an actor reference point without moving the camera', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const rotation = cameraAimRotation(camera, actor)
    const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation, 'XYZ'))
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(orientation).normalize()
    const targetDirection = new THREE.Vector3(...targetReferencePoint(actor)).sub(new THREE.Vector3(...camera.position)).normalize()
    expect(forward.dot(targetDirection)).toBeCloseTo(1, 6)
    expect(camera.position).toEqual([0, 2, 5])
  })

  it('uses prop bounds proxy position and computes camera-to-subject distance', () => {
    const prop = createPropDocument('prop-01', 'Prop 01', 'cube', [3, 2, 1], '#999999')
    expect(targetReferencePoint(prop)).toEqual([3, 2, 1])
    expect(cameraSubjectDistance(camera, prop)).toBeCloseTo(5, 6)
  })

  it('moves Dolly along local -Z, Truck along local +X, and Pedestal in world Y', () => {
    const turned = { ...camera, rotation: [0, Math.PI / 2, 0] as [number, number, number] }
    expect(cameraPositionAfterMove(turned, 'dolly', 1).map((value) => Number(value.toFixed(6)))).toEqual([-1, 2, 5])
    expect(cameraPositionAfterMove(turned, 'truck', 1).map((value) => Number(value.toFixed(6)))).toEqual([0, 2, 4])
    expect(cameraPositionAfterMove(turned, 'pedestal', 1)).toEqual([0, 3, 5])
  })

  it('uses the resolved A pose for blocking edits without contaminating future keyframe B', () => {
    const scene = createEmptySceneDocument()
    const cameraAtB = { ...camera, position: [5, 1.5, 0] as [number, number, number] }
    const withCamera = { ...scene, cameras: [cameraAtB], timeline: { ...scene.timeline, currentFrame: 0 } }
    const withKeys = {
      ...withCamera,
      timeline: upsertTimelineKeyframe(
        upsertTimelineKeyframe(withCamera.timeline, camera.id, 'Camera', 'position', 0, [0, 1.5, 0]),
        camera.id,
        'Camera',
        'position',
        24,
        [5, 1.5, 0],
      ),
    }
    const resolved = currentEditableCameraPose(withKeys, camera.id)
    expect(resolved?.position).toEqual([0, 1.5, 0])
    const moved = resolved ? cameraPositionAfterMove(resolved, 'dolly', 0.1) : null
    expect(moved?.[0]).toBeCloseTo(0, 6)
    expect(moved?.[2]).toBeCloseTo(-0.1, 6)
    const editedTimeline = upsertTimelineKeyframe(withKeys.timeline, camera.id, 'Camera', 'position', 0, moved ?? [0, 1.5, 0])
    const positionKeys = editedTimeline.tracks.find((track) => track.property === 'position')?.keyframes ?? []
    expect(positionKeys.find((keyframe) => keyframe.frame === 0)?.value).toEqual([0, 1.5, -0.1])
    expect(positionKeys.find((keyframe) => keyframe.frame === 24)?.value).toEqual([5, 1.5, 0])
  })

  it('uses the resolved rotation at A for Dolly and Truck instead of future B rotation', () => {
    const scene = createEmptySceneDocument()
    const withCamera = { ...scene, cameras: [camera], timeline: { ...scene.timeline, currentFrame: 0 } }
    const withKeys = {
      ...withCamera,
      timeline: upsertTimelineKeyframe(
        upsertTimelineKeyframe(withCamera.timeline, camera.id, 'Camera', 'rotation', 0, [0, 0, 0]),
        camera.id,
        'Camera',
        'rotation',
        24,
        [0, Math.PI / 2, 0],
      ),
    }
    const resolved = currentEditableCameraPose(withKeys, camera.id)
    expect(resolved).not.toBeNull()
    expect(cameraPositionAfterMove(resolved!, 'dolly', 1).map((value) => Number(value.toFixed(6)))).toEqual([0, 2, 4])
    expect(cameraPositionAfterMove(resolved!, 'truck', 1).map((value) => Number(value.toFixed(6)))).toEqual([1, 2, 5])
  })
})
