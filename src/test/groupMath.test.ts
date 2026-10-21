import { describe, expect, it } from 'vitest'
import { applyGroupTransform, bakeGroupChildren, evaluateGroupTransforms, groupPivot } from '../core/groupMath'
import { createActorDocument, createEmptySceneDocument, type SceneGroup } from '../core/sceneDocument'
import { evaluateTimeline } from '../timeline/timelineEvaluator'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('persistent blocking groups', () => {
  const group: SceneGroup = {
    id: 'group-01',
    name: 'Group 01',
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    pivot: [0, 0, 0],
    childIds: ['actor-01'],
  }

  it('keeps the child transform unchanged at the identity delta', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [1, 0, 0])
    expect(applyGroupTransform(actor, group).position).toEqual(actor.position)
    expect(applyGroupTransform(actor, group).rotation).toEqual(actor.rotation)
  })

  it('applies group translation and rotation around the stored pivot', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [1, 0, 0])
    const transformed = applyGroupTransform(actor, { ...group, position: [2, 0, 0], rotation: [0, Math.PI / 2, 0] })
    expect(transformed.position[0]).toBeCloseTo(2, 8)
    expect(transformed.position[2]).toBeCloseTo(-1, 8)
  })

  it('bakes the evaluated group delta without changing the child ID', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [1, 0, 0])
    const movedGroup = { ...group, position: [0, 1, 0] as [number, number, number] }
    expect(bakeGroupChildren([actor], movedGroup)[0]).toEqual(applyGroupTransform(actor, movedGroup))
  })

  it('evaluates a group timeline before composing the child world transforms', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [1, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, group.id, 'Group', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, group.id, 'Group', 'position', 10, [2, 0, 0])
    const scene = { ...createEmptySceneDocument(), actors: [actor], groups: [group], timeline }
    const evaluated = evaluateTimeline(scene, 5)
    const evaluatedGroup = { ...group, ...evaluated[group.id] } as SceneGroup
    expect(evaluatedGroup.position).toEqual([1, 0, 0])
    expect(evaluateGroupTransforms([actor], [evaluatedGroup])[0].position).toEqual([2, 0, 0])
  })

  it('computes a stable pivot from child world positions', () => {
    const first = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const second = createActorDocument('actor-02', 'Actor 02', [2, 0, 0])
    expect(groupPivot([first, second])).toEqual([1, 0, 0])
  })
})
