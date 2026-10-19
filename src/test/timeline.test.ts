import { describe, expect, it } from 'vitest'
import { EditorHistory } from '../core/editorHistory'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createDefaultProps } from '../scene/testEntities'
import { cameraProjectionForDocument } from '../runtime/cameraMath'
import { createPlaybackClock, playbackFrameAt, playbackFrameAtLoop, playbackReachedMarkOut, playbackStartFrame } from '../timeline/playbackClock'
import { timelineRulerLabelAlignment } from '../timeline/timelinePresentation'
import { cameraDocumentWithTimelineEvaluation, evaluateTimeline, timelinePropertyIsAuthored } from '../timeline/timelineEvaluator'
import { cameraDocumentForRecording } from '../phoneCamera/recordingScope'
import { DEFAULT_TIMELINE_PIXELS_PER_SECOND, TIMELINE_FRAME_RATES, TIMELINE_ZOOM_LEVELS, clampTimelineKeyframeDelta, frameToSeconds, frameToTimecode, frameToTimelineX, interpolateAngleRadians, interpolateScalar, interpolateVector, moveTimelineKeyframe, moveTimelineKeyframes, removeTimelineKeyframes, secondsToFrame, setTimelineKeyframeEasing, setTimelineKeyframesEasing, setTimelineMark, timecodeToFrame, timelineCanvasModel, timelineCanvasModelForViewport, timelineCanvasXToFrame, timelineDurationEndX, timelineEasedProgress, timelineEasingMode, timelineFitPixelsPerSecond, timelineFrameToCanvasX, timelinePlaybackRange, timelineXToFrame, upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('V2 timeline foundation', () => {
  it('keeps supported frame rates rational and converts frames without float time storage', () => {
    expect(TIMELINE_FRAME_RATES.map((rate) => `${rate.numerator}/${rate.denominator}`)).toEqual(['24000/1001', '24/1', '25/1', '30000/1001', '30/1', '50/1', '60000/1001', '60/1'])
    expect(frameToSeconds(24, { numerator: 24, denominator: 1 })).toBe(1)
    expect(secondsToFrame(1, { numerator: 24000, denominator: 1001 })).toBe(23)
  })

  it('converts canonical frames to deterministic non-drop timecode and back', () => {
    const fps24 = { numerator: 24, denominator: 1 }
    expect(frameToTimecode(0, fps24)).toBe('00:00:00:00')
    expect(frameToTimecode(24, fps24)).toBe('00:00:01:00')
    expect(frameToTimecode(84, fps24)).toBe('00:00:03:12')
    expect(frameToTimecode(72, fps24)).toBe('00:00:03:00')
    expect(frameToTimecode(109, fps24)).toBe('00:00:04:13')
    expect(timecodeToFrame('00:00:04:13', fps24)).toBe(109)
    expect(timecodeToFrame('00:00:03:12', fps24)).toBe(84)
    expect(frameToTimecode(25, { numerator: 25, denominator: 1 })).toBe('00:00:01:00')
    expect(timecodeToFrame('00:00:01:00', { numerator: 25, denominator: 1 })).toBe(25)
    expect(timecodeToFrame('00:00:03:00', { numerator: 25, denominator: 1 })).toBe(75)
    expect(timecodeToFrame('00:00:03:00', { numerator: 30, denominator: 1 })).toBe(90)
    expect(timecodeToFrame('00:00:00:24', fps24)).toBeNull()
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

  it('keeps Camera property authority partial for phone composition', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0.1, 0.2, 0.3], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 24, [0, 1, 3])
    const evaluated = evaluateTimeline({ ...createEmptySceneDocument(), cameras: [camera], timeline }, 12)[camera.id]
    expect(timelinePropertyIsAuthored(evaluated, 'position')).toBe(true)
    expect(timelinePropertyIsAuthored(evaluated, 'rotation')).toBe(false)
    expect(cameraDocumentWithTimelineEvaluation(camera, evaluated).rotation).toEqual(camera.rotation)
    expect(cameraDocumentWithTimelineEvaluation(camera, evaluated).position).toEqual([0, 1, 4])
  })

  it('keeps Position Timeline evaluation live while Rotation recording uses a stable baseline', () => {
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0.1, 0.2, 0.3], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 24, [1, 1, 4])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 48, [2, 1, 3])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 0, [0.1, 0.2, 0.3])
    const recordingStart = { ...createEmptySceneDocument(), cameras: [camera], timeline }
    const current = { ...recordingStart, timeline: upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 24, [0.4, 0.5, 0.6]) }
    const currentEvaluated = evaluateTimeline(current, 24)[camera.id]
    const baselineEvaluated = evaluateTimeline(recordingStart, 24)[camera.id]
    const resolved = cameraDocumentForRecording(camera, currentEvaluated, camera, baselineEvaluated, { position: false, rotation: true })
    expect(resolved.position).toEqual([1, 1, 4])
    expect(resolved.rotation).toEqual([0.1, 0.2, 0.3])
    expect(current.timeline.tracks.find((track) => track.property === 'position')?.keyframes).toHaveLength(3)
  })

  it('auto-extends Timeline duration when a keyframe moves beyond the current length', () => {
    const timeline = createEmptySceneDocument().timeline
    const extended = upsertTimelineKeyframe(timeline, 'camera-01', 'Camera', 'position', 240, [0, 1, 0])
    expect(extended.durationFrames).toBe(240)
    expect(extended.endFrame).toBe(240)
    const moved = moveTimelineKeyframes(extended, [{ trackId: 'camera-01:position', keyframeId: 'camera-01:position:240' }], 120)
    expect(moved.durationFrames).toBe(360)
    expect(moved.tracks[0].keyframes[0].frame).toBe(360)
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

  it('evaluates authored Prop scale through the same timeline path', () => {
    const prop = createDefaultProps()[0]
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'scale', 0, [1, 1, 1])
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'scale', 48, [2, 3, 4])
    const evaluated = evaluateTimeline({ ...createEmptySceneDocument(), props: [prop], timeline }, 24)[prop.id]
    expect(evaluated.scale).toEqual([1.5, 2, 2.5])
    expect(timelinePropertyIsAuthored(evaluated, 'scale')).toBe(true)
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

  it('uses a fixed pixels-per-second canvas scale for short timelines', () => {
    const timeline = createEmptySceneDocument().timeline
    const model = timelineCanvasModel(timeline, 120)
    expect(model.durationWidth).toBe(600)
    expect(model.contentWidth).toBe(656)
    expect(timelineFrameToCanvasX(0, timeline, model)).toBe(16)
    expect(timelineFrameToCanvasX(24, timeline, model)).toBeCloseTo(136)
    expect(timelineFrameToCanvasX(120, timeline, model)).toBe(616)
    expect(timelineCanvasXToFrame(316, timeline, model)).toBe(60)
  })

  it('keeps frame positions stable when duration changes', () => {
    const timeline = createEmptySceneDocument().timeline
    const model = timelineCanvasModel(timeline, 120)
    const longTimeline = { ...timeline, durationFrames: 360, endFrame: 360 }
    const longModel = timelineCanvasModel(longTimeline, 120)
    expect(timelineFrameToCanvasX(72, timeline, model)).toBe(timelineFrameToCanvasX(72, longTimeline, longModel))
    expect(longModel.durationWidth).toBe(1800)
    expect(timelineDurationEndX(longModel)).toBe(1816)
    expect(timelineCanvasXToFrame(timelineFrameToCanvasX(72, longTimeline, longModel), longTimeline, longModel)).toBe(72)
  })

  it('changes frame spacing predictably with zoom and round-trips canvas coordinates', () => {
    const timeline = createEmptySceneDocument().timeline
    const oneX = timelineCanvasModel(timeline, 120)
    const twoX = timelineCanvasModel(timeline, 240)
    expect(timelineFrameToCanvasX(48, timeline, twoX) - twoX.startPadding).toBe((timelineFrameToCanvasX(48, timeline, oneX) - oneX.startPadding) * 2)
    for (const frame of [0, 1, 24, 48, 96, 120]) expect(timelineCanvasXToFrame(timelineFrameToCanvasX(frame, timeline, twoX), timeline, twoX)).toBe(frame)
  })

  it('calculates Fit as an explicit viewport command without making it the canvas default', () => {
    const timeline = createEmptySceneDocument().timeline
    expect(timelineFitPixelsPerSecond(1256, timeline)).toBeCloseTo(240, 5)
    expect(timelineFitPixelsPerSecond(180, timeline)).toBe(40)
  })

  it('fills a short canvas to the viewport without stretching frame coordinates', () => {
    const timeline = createEmptySceneDocument().timeline
    const fiveSecond = { ...timeline, durationFrames: 120, endFrame: 120 }
    const tenSecond = { ...timeline, durationFrames: 240, endFrame: 240 }
    const wideCanvas = timelineCanvasModelForViewport(fiveSecond, DEFAULT_TIMELINE_PIXELS_PER_SECOND, 1900)
    expect(wideCanvas.contentWidth).toBeGreaterThanOrEqual(1900)
    expect(timelineFrameToCanvasX(72, fiveSecond, wideCanvas)).toBe(496)
    expect(timelineFrameToCanvasX(72, tenSecond, timelineCanvasModelForViewport(tenSecond, DEFAULT_TIMELINE_PIXELS_PER_SECOND, 1900))).toBe(496)
    expect(timelineFrameToCanvasX(72, fiveSecond, timelineCanvasModelForViewport(fiveSecond, DEFAULT_TIMELINE_PIXELS_PER_SECOND, 1200))).toBe(496)
  })

  it('allows inspection beyond the shot boundary while preserving normal bounded mapping', () => {
    const timeline = createEmptySceneDocument().timeline
    const model = timelineCanvasModelForViewport(timeline, DEFAULT_TIMELINE_PIXELS_PER_SECOND, 1900)
    const beyondShotX = timelineFrameToCanvasX(168, timeline, model)
    expect(timelineCanvasXToFrame(beyondShotX, timeline, model, false)).toBe(168)
    expect(timelineCanvasXToFrame(beyondShotX, timeline, model)).toBe(timeline.endFrame)
  })

  it('defines deterministic polished zoom steps around the 160 px/sec 100 percent scale', () => {
    expect(DEFAULT_TIMELINE_PIXELS_PER_SECOND).toBe(160)
    expect(TIMELINE_ZOOM_LEVELS.find((level) => level.percent === 100)?.pixelsPerSecond).toBe(160)
    expect(TIMELINE_ZOOM_LEVELS[0].percent).toBe(25)
    expect(TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1].percent).toBe(400)
  })

  it('anchors only the actual first and final ruler labels to their edges', () => {
    const ticks = [0, 24, 48, 72, 96, 120]
    expect(timelineRulerLabelAlignment(0, 0, ticks, 0, 120)).toBe('start')
    expect(timelineRulerLabelAlignment(48, 2, ticks, 0, 120)).toBe('center')
    expect(timelineRulerLabelAlignment(120, ticks.length - 1, ticks, 0, 120)).toBe('end')
    expect(timelineRulerLabelAlignment(24, 0, ticks, 0, 120)).toBe('center')
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

  it('wraps loop playback inclusively from Mark Out back to Mark In', () => {
    const rate = { numerator: 24, denominator: 1 }
    const clock = createPlaybackClock(48, 1000)
    expect(playbackFrameAtLoop(clock, 1000 + 3000, rate, 48, 120)).toBe(120)
    expect(playbackFrameAtLoop(clock, 1000 + 3100, rate, 48, 120)).toBe(49)
    expect(playbackFrameAtLoop(clock, 1000 + (73 / 24) * 1000, rate, 48, 120)).toBe(48)
  })

  it('starts loop playback at Mark In when the playhead is outside the range', () => {
    expect(playbackStartFrame(7, 48, 120)).toBe(48)
    expect(playbackStartFrame(120, 48, 120)).toBe(48)
    expect(playbackStartFrame(72, 48, 120)).toBe(72)
  })

  it('uses the full Duration when the default marks are still active', () => {
    const timeline = createEmptySceneDocument().timeline
    expect(timelinePlaybackRange(timeline)).toEqual({ startFrame: 0, endFrame: 120 })
    expect(timelinePlaybackRange({ ...timeline, durationFrames: 240, endFrame: 240, markOut: 240 })).toEqual({ startFrame: 0, endFrame: 240 })
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
