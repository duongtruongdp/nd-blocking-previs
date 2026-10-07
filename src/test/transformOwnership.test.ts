import { describe, expect, it } from 'vitest'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createDefaultProps } from '../scene/testEntities'
import { captureTimelineValue, shouldApplyTimelineEvaluation, commitTimelineTransform, timelineEditingEnabled } from '../timeline/transformOwnership'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

const change = (entityId: string) => ({ entityId, position: [2, 0, -3] as [number, number, number], rotation: [0.1, 0.8, 0] as [number, number, number] })

describe('V2.6B timeline transform ownership and keyframe capture', () => {
  it('commits an unanimated Actor move to base SceneDocument state', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), actors: [actor] }, { ...change(actor.id), editedProperty: 'position' })
    expect(result.document.actors[0].position).toEqual([2, 0, -3])
    expect(result.document.timeline.tracks).toHaveLength(0)
    expect(result.suspendEvaluation).toBe(false)
  })

  it('auto-keys an animated Position edit at the current frame', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), actors: [actor], timeline }, { ...change(actor.id), editedProperty: 'position' })
    expect(result.document.timeline.tracks[0].keyframes).toHaveLength(1)
    expect(result.document.timeline.tracks[0].keyframes[0].value).toEqual([2, 0, -3])
    expect(result.document.actors[0].position).toEqual([2, 0, -3])
    expect(result.changedKeyframe).toBe(true)
    expect(result.suspendEvaluation).toBe(false)
  })

  it('auto-keys Position at the current frame when the track has no key there', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 48, [8, 0, 0])
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), actors: [actor], timeline }, { ...change(actor.id), editedProperty: 'position' })
    expect(result.document.actors[0].position).toEqual([2, 0, -3])
    expect(result.document.timeline.tracks[0].keyframes).toHaveLength(2)
    expect(result.document.timeline.tracks[0].keyframes.find((keyframe) => keyframe.frame === 0)?.value).toEqual([2, 0, -3])
    expect(result.suspendEvaluation).toBe(false)
  })

  it('skips timeline application for the transforming or suspended entity only', () => {
    expect(shouldApplyTimelineEvaluation('actor-01', 'actor-01', new Set())).toBe(false)
    expect(shouldApplyTimelineEvaluation('actor-01', null, new Set(['actor-01']))).toBe(false)
    expect(shouldApplyTimelineEvaluation('actor-02', 'actor-01', new Set())).toBe(true)
  })

  it('restores transform editing as soon as playback stops', () => {
    expect(timelineEditingEnabled(true)).toBe(false)
    expect(timelineEditingEnabled(false)).toBe(true)
  })

  it('keeps unanimated Prop and Camera transforms editable through the same base path', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const prop = createDefaultProps()[0]
    const cameraResult = commitTimelineTransform({ ...createEmptySceneDocument(), cameras: [camera] }, change(camera.id))
    const propResult = commitTimelineTransform({ ...createEmptySceneDocument(), props: [prop] }, change(prop.id))
    expect(cameraResult.document.cameras[0].position).toEqual([2, 0, -3])
    expect(propResult.document.props[0].position).toEqual([2, 0, -3])
  })

  it('captures and commits animated Prop transforms through the generic ownership path', () => {
    const prop = createDefaultProps()[0]
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'rotation', 0, [0, 0, 0])
    const document = { ...createEmptySceneDocument(), props: [prop], timeline }
    const result = commitTimelineTransform(document, { ...change(prop.id), editedProperty: 'position' })
    expect(captureTimelineValue({ ...prop, position: [4, 1, -2], rotation: [0.2, 0.4, 0.1] }, 'position')).toEqual([4, 1, -2])
    expect(captureTimelineValue({ ...prop, position: [4, 1, -2], rotation: [0.2, 0.4, 0.1] }, 'rotation')).toEqual([0.2, 0.4, 0.1])
    expect(result.document.props[0].position).toEqual([2, 0, -3])
    expect(result.suspendEvaluation).toBe(false)
  })

  it('auto-keys Rotation independently from Position', () => {
    const prop = createDefaultProps()[0]
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, prop.id, 'Prop', 'rotation', 0, [0, 0, 0])
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), props: [prop], timeline }, { ...change(prop.id), editedProperty: 'rotation' })
    expect(result.document.timeline.tracks.find((track) => track.property === 'position')?.keyframes).toHaveLength(1)
    expect(result.document.timeline.tracks.find((track) => track.property === 'rotation')?.keyframes[0].value).toEqual([0.1, 0.8, 0])
  })

  it('keeps Actor rotation auto-keying on the semantic Heading track', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const timeline = upsertTimelineKeyframe(createEmptySceneDocument().timeline, actor.id, 'Actor', 'heading', 0, 0)
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), actors: [actor], timeline }, { ...change(actor.id), editedProperty: 'heading' })
    expect(result.document.timeline.tracks.find((track) => track.property === 'heading')?.keyframes[0].value).toBe(0.8)
    expect(result.document.timeline.tracks.some((track) => track.property === 'rotation')).toBe(false)
  })

  it('updates an existing same-frame key without duplicating it', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 24, [1, 0, 0])
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline: { ...timeline, currentFrame: 24 } }
    const result = commitTimelineTransform(document, { ...change(actor.id), editedProperty: 'position' })
    expect(result.document.timeline.tracks[0].keyframes).toHaveLength(2)
    expect(result.document.timeline.tracks[0].keyframes.find((keyframe) => keyframe.frame === 24)?.value).toEqual([2, 0, -3])
  })

  it('captures the current visible Actor value when creating a first keyframe', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [2, 0, -3])
    const value = captureTimelineValue(actor, 'position')
    const timeline = upsertTimelineKeyframe(createEmptySceneDocument().timeline, actor.id, 'Actor', 'position', 0, value!)
    expect(timeline.tracks[0].keyframes[0].value).toEqual([2, 0, -3])
  })

  it('captures a user override instead of the evaluated value when a track already exists', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [2, 0, -3])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 48, [8, 0, 0])
    const value = captureTimelineValue(actor, 'position')
    const next = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 24, value!)
    expect(next.tracks[0].keyframes.find((keyframe) => keyframe.frame === 24)?.value).toEqual([2, 0, -3])
  })

  it('captures the current Camera focal length without creating duplicate same-frame keys', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const visibleCamera = { ...camera, focalLengthMm: 47.5 }
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 0, 24)
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 0, captureTimelineValue(visibleCamera, 'focalLengthMm')!)
    expect(timeline.tracks[0].keyframes).toHaveLength(1)
    expect(timeline.tracks[0].keyframes[0].value).toBe(47.5)
  })
})
