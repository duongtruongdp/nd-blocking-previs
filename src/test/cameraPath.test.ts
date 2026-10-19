import { describe, expect, it } from 'vitest'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { cameraPathForSelectedCamera, cameraPathModel, cameraPathPlayheadPosition, cameraPositionKeyframes } from '../timeline/cameraPath'
import { retimeCameraPathSegment, upsertTimelineKeyframe } from '../timeline/timelineMath'

function sceneWithCamera() {
  const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
  return { ...createEmptySceneDocument(), cameras: [camera] }
}

describe('camera path model', () => {
  it('uses only the selected camera position track and preserves keyframe identity', () => {
    const scene = sceneWithCamera()
    const second = { ...scene.cameras[0], id: 'camera-02', name: 'Camera 02' }
    let timeline = scene.timeline
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 24, [2, 1, 4])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, second.id, 'Camera', 'position', 0, [100, 100, 100])
    const document = { ...scene, cameras: [scene.cameras[0], second], timeline }
    const path = cameraPathModel(document, scene.cameras[0].id)
    expect(path.keyframes.map((keyframe) => keyframe.frame)).toEqual([0, 24])
    expect(path.keyframes.every((keyframe) => keyframe.cameraId === scene.cameras[0].id)).toBe(true)
    expect(path.segments).toHaveLength(1)
    expect(path.samples[0]).toEqual([0, 1, 5])
    expect(path.samples.at(-1)).toEqual([2, 1, 4])
    expect(cameraPathForSelectedCamera(document, second)?.cameraId).toBe('camera-02')
  })

  it('derives playhead position from the existing timeline evaluator', () => {
    const scene = sceneWithCamera()
    let timeline = upsertTimelineKeyframe(scene.timeline, scene.cameras[0].id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 24, [2, 1, 3])
    const document = { ...scene, timeline }
    expect(cameraPathPlayheadPosition(document, scene.cameras[0].id, 12)).toEqual([1, 1, 4])
    expect(cameraPositionKeyframes(timeline, scene.cameras[0].id)[0].keyframeId).toBeTruthy()
  })

  it('reports distance, duration, and average segment speed', () => {
    const scene = sceneWithCamera()
    let timeline = upsertTimelineKeyframe(scene.timeline, scene.cameras[0].id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 24, [3, 1, 5])
    const segment = cameraPathModel({ ...scene, timeline }, scene.cameras[0].id).segments[0]
    expect(segment.distance).toBeCloseTo(3)
    expect(segment.durationSeconds).toBe(1)
    expect(segment.speed).toBeCloseTo(3)
  })

  it('retimes Move End in exact frames without changing spatial values or interpolation', () => {
    const scene = sceneWithCamera()
    let timeline = upsertTimelineKeyframe(scene.timeline, scene.cameras[0].id, 'Camera', 'position', 24, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 96, [3, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 168, [6, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 24, [0, 1, 5], 'linear', { easeOut: true })
    const segment = cameraPathModel({ ...scene, timeline }, scene.cameras[0].id).segments[0]
    const result = retimeCameraPathSegment(timeline, { cameraId: scene.cameras[0].id, trackId: segment.from.trackId, fromKeyframeId: segment.from.keyframeId, toKeyframeId: segment.to.keyframeId }, 96, 'moveEnd')
    const position = result.timeline.tracks.find((track) => track.property === 'position')!.keyframes
    expect(position.map((keyframe) => keyframe.frame)).toEqual([24, 120, 168])
    expect(position.map((keyframe) => keyframe.value)).toEqual([[0, 1, 5], [3, 1, 5], [6, 1, 5]])
    expect(result.timeline.tracks.find((track) => track.property === 'position')!.keyframes[0].easeOut).toBe(true)
    expect(result.clamped).toBe(false)
  })

  it('clamps Move End before the next position key and ripples following camera keys', () => {
    const scene = sceneWithCamera()
    let timeline = upsertTimelineKeyframe(scene.timeline, scene.cameras[0].id, 'Camera', 'position', 24, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 96, [3, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 168, [6, 1, 5])
    const segment = cameraPathModel({ ...scene, timeline }, scene.cameras[0].id).segments[0]
    const selection = { cameraId: scene.cameras[0].id, trackId: segment.from.trackId, fromKeyframeId: segment.from.keyframeId, toKeyframeId: segment.to.keyframeId }
    const clamped = retimeCameraPathSegment(timeline, selection, 6 * 24, 'moveEnd')
    expect(clamped.timeline.tracks.find((track) => track.property === 'position')!.keyframes.map((keyframe) => keyframe.frame)).toEqual([24, 167, 168])
    const ripple = retimeCameraPathSegment(timeline, selection, 4 * 24, 'rippleFollowing')
    expect(ripple.timeline.tracks.find((track) => track.property === 'position')!.keyframes.map((keyframe) => keyframe.frame)).toEqual([24, 120, 192])
    expect(ripple.timeline.durationFrames).toBe(192)
  })

  it('retimes matching Camera rotation keys but leaves optical tracks and other cameras alone', () => {
    const scene = sceneWithCamera()
    const second = { ...scene.cameras[0], id: 'camera-02', name: 'Camera 02' }
    let timeline = upsertTimelineKeyframe(scene.timeline, scene.cameras[0].id, 'Camera', 'position', 24, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 96, [3, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'position', 168, [6, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'rotation', 24, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'rotation', 96, [0, 0.5, 0])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'rotation', 168, [0, 1, 0])
    timeline = upsertTimelineKeyframe(timeline, scene.cameras[0].id, 'Camera', 'focalLengthMm', 96, 50)
    timeline = upsertTimelineKeyframe(timeline, second.id, 'Camera', 'position', 96, [20, 1, 5])
    const segment = cameraPathModel({ ...scene, timeline }, scene.cameras[0].id).segments[0]
    const result = retimeCameraPathSegment(timeline, { cameraId: scene.cameras[0].id, trackId: segment.from.trackId, fromKeyframeId: segment.from.keyframeId, toKeyframeId: segment.to.keyframeId }, 4 * 24, 'rippleFollowing')
    expect(result.timeline.tracks.find((track) => track.property === 'rotation' && track.entityId === scene.cameras[0].id)?.keyframes.map((keyframe) => keyframe.frame)).toEqual([24, 120, 192])
    expect(result.timeline.tracks.find((track) => track.property === 'focalLengthMm')?.keyframes[0].frame).toBe(96)
    expect(result.timeline.tracks.find((track) => track.entityId === second.id)?.keyframes[0].frame).toBe(96)
  })
})
