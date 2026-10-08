import { describe, expect, it } from 'vitest'
import { EditorHistory } from '../core/editorHistory'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createDefaultProps } from '../scene/testEntities'
import { cameraProjectionForDocument } from '../runtime/cameraMath'
import { createPlaybackClock, playbackFrameAt, playbackReachedMarkOut } from '../timeline/playbackClock'
import { evaluateTimeline } from '../timeline/timelineEvaluator'
import { TIMELINE_FRAME_RATES, clampTimelineKeyframeDelta, frameToSeconds, frameToTimelineX, interpolateAngleRadians, interpolateScalar, interpolateVector, moveTimelineKeyframe, moveTimelineKeyframes, removeTimelineKeyframes, secondsToFrame, setTimelineKeyframeEasing, setTimelineKeyframesEasing, setTimelineMark, timelineEasedProgress, timelineEasingMode, timelineXToFrame, upsertTimelineKeyframe } from '../timeline/timelineMath'

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

  it('evaluates Prop position and rotation through the same generic path', () => {
    const prop = createDefaultProps()[0]
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'position', 48, [4, 2, -2])
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'rotation', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'rotation', 48, [0, Math.PI / 2, 0])
    const document = { ...createEmptySceneDocument(), props: [prop], timeline }
    const halfway = evaluateTimeline(document, 24)[prop.id]
    expect(halfway.position).toEqual([2, 1, -1])
    expect(halfway.rotation[1]).toBeCloseTo(Math.PI / 4, 5)
  })

  it('applies easing to the temporal progress while preserving vector interpolation', () => {
    expect(timelineEasedProgress(0.5, undefined, undefined)).toBe(0.5)
    expect(timelineEasedProgress(0.25, true, undefined)).toBeGreaterThan(0.25)
    expect(timelineEasedProgress(0.25, undefined, true)).toBeLessThan(0.25)
    expect(timelineEasedProgress(0.25, true, true)).toBeLessThan(0.25)

    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 100, [100, 40, -20])
    timeline = setTimelineKeyframeEasing(timeline, actor.id + ':position', actor.id + ':position:0', 'easeOut')
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline }
    const quarter = evaluateTimeline(document, 25)[actor.id].position
    expect(quarter[0]).toBeGreaterThan(25)
    expect(quarter[1] / quarter[0]).toBeCloseTo(0.4, 8)
    expect(quarter[2] / quarter[0]).toBeCloseTo(-0.2, 8)
  })

  it('uses incoming Ease In metadata on the destination key and exposes its mode', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 100, [100, 0, 0])
    timeline = setTimelineKeyframeEasing(timeline, actor.id + ':position', actor.id + ':position:100', 'easeIn')
    expect(timelineEasingMode(timeline.tracks[0].keyframes[1])).toBe('easeIn')
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline }
    expect(evaluateTimeline(document, 25)[actor.id].position[0]).toBeLessThan(25)
    expect(evaluateTimeline(document, 75)[actor.id].position[0]).toBeLessThan(75)
    expect(evaluateTimeline(document, 75)[actor.id].position[0] - evaluateTimeline(document, 50)[actor.id].position[0]).toBeGreaterThan(evaluateTimeline(document, 25)[actor.id].position[0])
  })

  it('applies easing to Camera Rotation without changing quaternion-based interpolation', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 100, [0, Math.PI / 2, 0])
    timeline = setTimelineKeyframeEasing(timeline, camera.id + ':rotation', camera.id + ':rotation:0', 'easeOut')
    const document = { ...createEmptySceneDocument(), cameras: [camera], timeline }
    expect(evaluateTimeline(document, 25)[camera.id].rotation[1]).toBeGreaterThan(Math.PI / 8)
    expect(evaluateTimeline(document, 25)[camera.id].rotation[0]).toBeCloseTo(0, 8)
    expect(evaluateTimeline(document, 25)[camera.id].rotation[2]).toBeCloseTo(0, 8)
  })

  it('preserves easing metadata when Auto-Key updates an existing frame', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    timeline = setTimelineKeyframeEasing(timeline, actor.id + ':position', actor.id + ':position:0', 'easeInOut')
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [2, 0, 0])
    expect(timelineEasingMode(timeline.tracks[0].keyframes[0])).toBe('easeInOut')
  })

  it('supports a manual Camera Rotation key at the current frame without moving the playhead', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    let document = { ...createEmptySceneDocument(), cameras: [camera], timeline: { ...createEmptySceneDocument().timeline, currentFrame: 42 } }
    document = { ...document, timeline: upsertTimelineKeyframe(document.timeline, camera.id, 'Camera', 'rotation', document.timeline.currentFrame, [0.1, 0.2, 0.3], 'linear') }
    document = { ...document, timeline: upsertTimelineKeyframe(document.timeline, camera.id, 'Camera', 'rotation', document.timeline.currentFrame, [0.4, 0.5, 0.6], 'linear') }
    const track = document.timeline.tracks.find((item) => item.id === `${camera.id}:rotation`)
    expect(track?.keyframes).toHaveLength(1)
    expect(track?.keyframes[0]).toMatchObject({ frame: 42, value: [0.4, 0.5, 0.6], interpolation: 'linear' })
    expect(document.timeline.currentFrame).toBe(42)
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

  it('uses one frame/X mapping for ruler, playhead, and keyframes', () => {
    const geometry = { left: 104, width: 876, startFrame: 0, endFrame: 120 }
    for (const frame of [0, 1, 24, 48, 96, 120]) {
      expect(timelineXToFrame(frameToTimelineX(frame, geometry), geometry)).toBe(frame)
    }
  })

  it('moves one keyframe without changing its value and replaces a collision', () => {
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 48, [1, 2, 3])
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 72, [9, 9, 9])
    const moved = moveTimelineKeyframe(timeline, 'actor-01:position', 'actor-01:position:48', 72)
    expect(moved.tracks[0].keyframes).toHaveLength(1)
    expect(moved.tracks[0].keyframes[0]).toMatchObject({ frame: 72, value: [1, 2, 3], id: 'actor-01:position:48' })
  })

  it('moves a selected group by one clamped delta and preserves spacing across tracks', () => {
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 5, [5, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 20, [20, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'heading', 12, 0.5)
    const selection = [
      { trackId: 'actor-01:position', keyframeId: 'actor-01:position:5' },
      { trackId: 'actor-01:position', keyframeId: 'actor-01:position:20' },
      { trackId: 'actor-01:heading', keyframeId: 'actor-01:heading:12' },
    ]
    expect(clampTimelineKeyframeDelta(timeline, selection, -10)).toBe(-5)
    const moved = moveTimelineKeyframes(timeline, selection, -10)
    expect(moved.tracks.find((track) => track.id === 'actor-01:position')?.keyframes.map((keyframe) => keyframe.frame)).toEqual([0, 15])
    expect(moved.tracks.find((track) => track.id === 'actor-01:heading')?.keyframes[0].frame).toBe(7)
  })

  it('replaces non-selected collisions atomically during group movement', () => {
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 10, [1, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 30, [9, 0, 0])
    const moved = moveTimelineKeyframes(timeline, [{ trackId: 'actor-01:position', keyframeId: 'actor-01:position:10' }], 20)
    expect(moved.tracks[0].keyframes).toEqual([{ id: 'actor-01:position:10', frame: 30, value: [1, 0, 0], interpolation: 'linear' }])
  })

  it('removes a multi-selection and applies one easing mode to the selected keys only', () => {
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 10, [1, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 20, [2, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'heading', 20, 0)
    const selection = [{ trackId: 'actor-01:position', keyframeId: 'actor-01:position:10' }, { trackId: 'actor-01:position', keyframeId: 'actor-01:position:20' }]
    const eased = setTimelineKeyframesEasing(timeline, selection, 'easeInOut')
    expect(eased.tracks[0].keyframes.every((keyframe) => keyframe.easeIn && keyframe.easeOut)).toBe(true)
    const removed = removeTimelineKeyframes(eased, selection)
    expect(removed.tracks).toHaveLength(1)
    expect(removed.tracks[0].property).toBe('heading')
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
