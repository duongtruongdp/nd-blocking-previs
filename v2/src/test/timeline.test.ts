import { describe, expect, it } from 'vitest'
import { EditorHistory } from '../core/editorHistory'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { cameraProjectionForDocument } from '../runtime/cameraMath'
import { createPlaybackClock, playbackFrameAt, playbackReachedMarkOut } from '../timeline/playbackClock'
import { evaluateTimeline } from '../timeline/timelineEvaluator'
import { TIMELINE_FRAME_RATES, frameToSeconds, interpolateAngleRadians, interpolateScalar, interpolateVector, secondsToFrame, setTimelineMark, upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('V2 timeline foundation', () => {
  it('keeps supported frame rates rational and converts frames without float time storage', () => {
    expect(TIMELINE_FRAME_RATES.map((rate) => `${rate.numerator}/${rate.denominator}`)).toEqual(['24000/1001', '24/1', '25/1', '30000/1001', '30/1', '50/1', '60000/1001', '60/1'])
    expect(frameToSeconds(24, { numerator: 24, denominator: 1 })).toBe(1)
    expect(secondsToFrame(1, { numerator: 24000, denominator: 1001 })).toBe(23)
  })

  it('interpolates scalar, vector, and shortest-path heading values', () => {
    expect(interpolateScalar(0, 10, 0.5)).toBe(5)
    expect(interpolateVector([0, 0, 0], [10, 4, -2], 0.5)).toEqual([5, 2, -1])
    const tenDegrees = 10 * Math.PI / 180
    const threeFiftyDegrees = 350 * Math.PI / 180
    expect(interpolateAngleRadians(threeFiftyDegrees, tenDegrees, 0.5)).toBeCloseTo(Math.PI * 2, 6)
  })

  it('evaluates exact, interpolated, before-first, and after-last keyframes', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 24, [24, 0, -12])
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline }
    expect(evaluateTimeline(document, 0)[actor.id].position).toEqual([0, 0, 0])
    expect(evaluateTimeline(document, 12)[actor.id].position).toEqual([12, 0, -6])
    expect(evaluateTimeline(document, -4)[actor.id].position).toEqual([0, 0, 0])
    expect(evaluateTimeline(document, 48)[actor.id].position).toEqual([24, 0, -12])
  })

  it('evaluates Actor heading and Camera focal length/rotation without changing base values', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'heading', 0, 350 * Math.PI / 180)
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'heading', 24, 10 * Math.PI / 180)
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 24, [0, Math.PI / 2, 0])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 0, 24)
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 48, 85)
    const document = { ...createEmptySceneDocument(), actors: [actor], cameras: [camera], timeline }
    const halfway = evaluateTimeline(document, 12)
    expect(halfway[actor.id].rotation[1]).toBeCloseTo(Math.PI * 2, 6)
    expect(halfway[camera.id].rotation[1]).toBeCloseTo(Math.PI / 4, 5)
    expect(evaluateTimeline(document, 24)[camera.id].focalLengthMm).toBe(54.5)
    expect(document.cameras[0].focalLengthMm).toBe(35)
  })

  it('keeps Delivery Frame separate from physical FOV during focal animation', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], definition.id, definition.captureModes[0].id)
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 0, 24)
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 48, 85)
    const document = { ...createEmptySceneDocument(), cameras: [camera], timeline }
    const evaluatedFocalLength = evaluateTimeline(document, 24)[camera.id].focalLengthMm!
    const sensorProjection = cameraProjectionForDocument({ ...camera, focalLengthMm: evaluatedFocalLength, deliveryAspectRatio: 'sensor' })
    const deliveryProjection = cameraProjectionForDocument({ ...camera, focalLengthMm: evaluatedFocalLength, deliveryAspectRatio: '2.39' })
    expect(deliveryProjection?.fov).toBe(sensorProjection?.fov)
  })

  it('keeps Mark In at or before Mark Out with predictable adjustment', () => {
    const timeline = createEmptySceneDocument().timeline
    expect(setTimelineMark(timeline, 'in', 90)).toMatchObject({ markIn: 90, markOut: 120 })
    expect(setTimelineMark(timeline, 'out', 10)).toMatchObject({ markIn: 0, markOut: 10 })
    expect(setTimelineMark({ ...timeline, markIn: 40 }, 'out', 10).markIn).toBe(10)
  })

  it('advances at the rational frame rate and stops at Mark Out', () => {
    const rate = { numerator: 24000, denominator: 1001 }
    const clock = createPlaybackClock(0, 1000)
    expect(playbackFrameAt(clock, 1000 + 1000, rate, 120)).toBe(23)
    expect(playbackFrameAt(clock, 1000 + 6000, rate, 48)).toBe(48)
    expect(playbackReachedMarkOut(clock, 1000 + 6000, rate, 48)).toBe(true)
  })

  it('records one add-keyframe operation and supports undo/redo', () => {
    const before = createEmptySceneDocument()
    const timeline = upsertTimelineKeyframe(before.timeline, 'camera-01', 'Camera', 'focalLengthMm', 0, 24)
    const after = { ...before, timeline }
    const history = new EditorHistory()
    history.record({ label: 'Add Camera focalLengthMm keyframe', before: { document: before, selectedEntityId: null }, after: { document: after, selectedEntityId: null } })
    expect(history.undo()?.after.document.timeline.tracks[0].keyframes[0].value).toBe(24)
    expect(history.redo()?.after.document.timeline.tracks[0].keyframes[0].value).toBe(24)
  })
})
