import { describe, expect, it } from 'vitest'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createDefaultProps } from '../scene/testEntities'
import { shouldApplyTimelineEvaluation, commitTimelineTransform, timelineEditingEnabled } from '../timeline/transformOwnership'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

const change = (entityId: string) => ({ entityId, position: [2, 0, -3] as [number, number, number], rotation: [0.1, 0.8, 0] as [number, number, number] })

describe('V2.5A timeline transform ownership', () => {
  it('commits an unanimated Actor move to base SceneDocument state', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), actors: [actor] }, change(actor.id))
    expect(result.document.actors[0].position).toEqual([2, 0, -3])
    expect(result.document.timeline.tracks).toHaveLength(0)
    expect(result.suspendEvaluation).toBe(false)
  })

  it('updates an existing exact Actor keyframe without duplicating it', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), actors: [actor], timeline }, change(actor.id))
    expect(result.document.timeline.tracks[0].keyframes).toHaveLength(1)
    expect(result.document.timeline.tracks[0].keyframes[0].value).toEqual([2, 0, -3])
    expect(result.document.actors[0].position).toEqual([0, 0, 0])
    expect(result.changedKeyframe).toBe(true)
  })

  it('commits base state but suspends immediate evaluation when a track lacks a current-frame keyframe', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 48, [8, 0, 0])
    const result = commitTimelineTransform({ ...createEmptySceneDocument(), actors: [actor], timeline }, change(actor.id))
    expect(result.document.actors[0].position).toEqual([2, 0, -3])
    expect(result.document.timeline.tracks[0].keyframes[0].value).toEqual([8, 0, 0])
    expect(result.suspendEvaluation).toBe(true)
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
})
