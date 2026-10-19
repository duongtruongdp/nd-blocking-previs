import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { composeFinalCameraPose, createCameraPoseSnapshot, type PhoneCameraLiveLayer } from '../phoneCamera/cameraPoseComposition'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { evaluateTimeline } from '../timeline/timelineEvaluator'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

function layer(overrides: Partial<PhoneCameraLiveLayer> = {}): PhoneCameraLiveLayer {
  return {
    cameraId: 'camera-01',
    positionDelta: [0, 0, 0],
    rotationDelta: [0, 0, 0],
    rotationDeltaQuaternion: [0, 0, 0, 1],
    ...overrides,
  }
}

describe('Phone Camera final pose composition', () => {
  it('leaves the evaluated base unchanged without a live layer', () => {
    const base = { position: [2, 3, 4] as [number, number, number], rotation: [0.1, 0.2, 0.3] as [number, number, number] }
    expect(composeFinalCameraPose(base, null)).toEqual(base)
  })

  it('adds a Dolly delta in world space without changing the base rotation', () => {
    const base = { position: [2, 3, 4] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }
    const final = composeFinalCameraPose(base, layer({ positionDelta: [0, 0, -1] }))
    expect(final.position).toEqual([2, 3, 3])
    final.rotation.forEach((value) => expect(value).toBeCloseTo(0))
  })

  it('composes Pan on top of a changing Timeline base instead of replacing it', () => {
    const phonePan = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.25, 0, 'XYZ')).toArray() as [number, number, number, number]
    const layerValue = layer({ rotationDelta: [0, 0.25, 0], rotationDeltaQuaternion: phonePan })
    const baseA = { position: [0, 0, 0] as [number, number, number], rotation: [0, 0.4, 0] as [number, number, number] }
    const baseB = { position: [0, 0, -2] as [number, number, number], rotation: [0, -0.4, 0] as [number, number, number] }
    const finalA = composeFinalCameraPose(baseA, layerValue)
    const finalB = composeFinalCameraPose(baseB, layerValue)
    expect(finalA.position).toEqual(baseA.position)
    expect(finalB.position).toEqual(baseB.position)
    expect(finalA.rotation[1]).toBeCloseTo(0.65, 5)
    expect(finalB.rotation[1]).toBeCloseTo(-0.15, 5)
  })

  it('keeps multiple movement and rotation deltas in one final pose', () => {
    const phoneRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.2, 0.05, 'XYZ')).toArray() as [number, number, number, number]
    const final = composeFinalCameraPose(
      { position: [1, 2, 3], rotation: [0, 0, 0] },
      layer({ positionDelta: [0.5, -0.25, -1.25], rotationDelta: [0.1, 0.2, 0.05], rotationDeltaQuaternion: phoneRotation }),
    )
    expect(final.position).toEqual([1.5, 1.75, 1.75])
    expect(final.rotation[0]).toBeCloseTo(0.1, 5)
    expect(final.rotation[1]).toBeCloseTo(0.2, 5)
    expect(final.rotation[2]).toBeCloseTo(0.05, 5)
  })

  it('composes from the canonical playback frame before applying the phone layer', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 24, [1, 1, 4])
    const scene = { ...createEmptySceneDocument(), cameras: [camera], timeline }
    const canonicalFrame = 24
    const evaluated = evaluateTimeline(scene, canonicalFrame)[camera.id]
    const base = { position: evaluated.position, rotation: evaluated.rotation }
    const final = composeFinalCameraPose(base, layer({ positionDelta: [0, 0, -0.5] }))
    expect(final.position).toEqual([1, 1, 3.5])
  })

  it('preserves zero-phone parity across 300 canonical playback frames', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 299, [3, 2, -4])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 299, [0.2, 0.6, -0.1])
    const scene = { ...createEmptySceneDocument(), cameras: [camera], timeline }
    for (let frame = 0; frame < 300; frame += 1) {
      const evaluated = evaluateTimeline(scene, frame)[camera.id]
      const base = { position: evaluated.position, rotation: evaluated.rotation }
      expect(composeFinalCameraPose(base, null)).toEqual(base)
      const zeroPhone = composeFinalCameraPose(base, layer())
      zeroPhone.position.forEach((value, index) => expect(value).toBeCloseTo(base.position[index], 12))
      zeroPhone.rotation.forEach((value, index) => expect(value).toBeCloseTo(base.rotation[index], 12))
    }
  })

  it('keeps Position equal to the Timeline base for 300 rotation-only frames', () => {
    const phone = layer({ rotationDeltaQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.25, 0)).toArray() as [number, number, number, number] })
    for (let frame = 0; frame < 300; frame += 1) {
      const base = { position: [frame / 100, 1, 5 - frame / 60] as [number, number, number], rotation: [0, frame / 100, 0] as [number, number, number] }
      expect(composeFinalCameraPose(base, phone).position).toEqual(base.position)
    }
  })

  it('produces one final snapshot per canonical frame while Phone updates arrive asynchronously', () => {
    const basePosition = [0, 1, 5] as [number, number, number]
    let latestLayer: PhoneCameraLiveLayer | null = null
    const phoneUpdateFrames = new Set([3, 8, 14, 21, 29])
    const snapshots = []
    for (let frame = 0; frame < 30; frame += 1) {
      if (phoneUpdateFrames.has(frame)) latestLayer = layer({ positionDelta: [frame / 100, 0, 0] })
      const snapshot = createCameraPoseSnapshot({ position: basePosition, rotation: [0, 0, 0] }, latestLayer, { playbackFrame: frame, basePoseVersion: frame + 1, phoneLayerVersion: phoneUpdateFrames.has(frame) ? frame : frame - 1, finalPoseVersion: frame + 1 })
      snapshots.push(snapshot)
      expect(snapshot.playbackFrame).toBe(frame)
      expect(snapshot.position[0]).toBeCloseTo(latestLayer?.positionDelta[0] ?? 0)
    }
    expect(new Set(snapshots.map((snapshot) => snapshot.finalPoseVersion)).size).toBe(30)
    expect(snapshots).toHaveLength(30)
  })
})
