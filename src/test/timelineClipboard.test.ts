import { describe, expect, it } from 'vitest'
import { createActorDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createTimelineKeyframeClipboard, createTimelineKeyframeClipboardGroup, pasteTimelineKeyframe, pasteTimelineKeyframes } from '../timeline/timelineClipboard'
import { setTimelineKeyframeEasing, upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('Timeline keyframe clipboard', () => {
  it('copies a key faithfully and pastes it at the canonical destination frame', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 10, [1, 2, 3])
    timeline = setTimelineKeyframeEasing(timeline, 'actor-01:position', 'actor-01:position:10', 'easeInOut')
    const sourceTrack = timeline.tracks[0]
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline }
    const clipboard = createTimelineKeyframeClipboard('project-01', document.metadata.id, sourceTrack, sourceTrack.keyframes[0])
    const result = pasteTimelineKeyframe(document, clipboard, 40, 'project-01')
    expect(result?.selection).toEqual({ trackId: 'actor-01:position', keyframeId: 'actor-01:position:40' })
    expect(result?.document.timeline.tracks[0].keyframes).toHaveLength(2)
    expect(result?.document.timeline.tracks[0].keyframes[1]).toMatchObject({ frame: 40, value: [1, 2, 3], easeIn: true, easeOut: true })
  })

  it('replaces a same-frame destination without consuming the clipboard', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 10, [1, 2, 3])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 40, [9, 9, 9])
    const sourceTrack = timeline.tracks[0]
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline }
    const clipboard = createTimelineKeyframeClipboard('project-01', document.metadata.id, sourceTrack, sourceTrack.keyframes[0])
    const result = pasteTimelineKeyframe(document, clipboard, 40, 'project-01')
    expect(result?.document.timeline.tracks[0].keyframes).toHaveLength(2)
    expect(result?.document.timeline.tracks[0].keyframes.find((keyframe) => keyframe.frame === 40)?.value).toEqual([1, 2, 3])
  })

  it('ignores a copied key when its original entity no longer exists', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 10, [1, 2, 3])
    const sourceTrack = timeline.tracks[0]
    const sourceDocument = { ...createEmptySceneDocument(), actors: [actor], timeline }
    const clipboard = createTimelineKeyframeClipboard('project-01', sourceDocument.metadata.id, sourceTrack, sourceTrack.keyframes[0])
    expect(pasteTimelineKeyframe(createEmptySceneDocument(), clipboard, 40, 'project-01')).toBeNull()
  })

  it('copies a group from the earliest frame and pastes relative timing across tracks', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 20, [2, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 35, [3, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'heading', 50, 1)
    const document = { ...createEmptySceneDocument(), actors: [actor], timeline }
    const clipboard = createTimelineKeyframeClipboardGroup('project-01', document.metadata.id, timeline.tracks, [
      { trackId: 'actor-01:position', keyframeId: 'actor-01:position:20' },
      { trackId: 'actor-01:position', keyframeId: 'actor-01:position:35' },
      { trackId: 'actor-01:heading', keyframeId: 'actor-01:heading:50' },
    ])!
    const result = pasteTimelineKeyframes(document, clipboard, 100, 'project-01')!
    expect(clipboard.originFrame).toBe(20)
    expect(result.selections).toHaveLength(3)
    expect(result.document.timeline.tracks.find((track) => track.property === 'position')?.keyframes.map((keyframe) => keyframe.frame)).toEqual([20, 35, 100, 115])
    expect(result.document.timeline.tracks.find((track) => track.property === 'heading')?.keyframes.map((keyframe) => keyframe.frame)).toEqual([50, 130])
  })

  it('partially pastes valid group entries and skips deleted source entities', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 20, [2, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, 'actor-02', 'Actor', 'position', 35, [3, 0, 0])
    const source = { ...createEmptySceneDocument(), actors: [actor, createActorDocument('actor-02', 'Actor 02', [0, 0, 0])], timeline }
    const clipboard = createTimelineKeyframeClipboardGroup('project-01', source.metadata.id, timeline.tracks, [
      { trackId: 'actor-01:position', keyframeId: 'actor-01:position:20' },
      { trackId: 'actor-02:position', keyframeId: 'actor-02:position:35' },
    ])!
    const result = pasteTimelineKeyframes({ ...source, actors: [actor] }, clipboard, 100, 'project-01')!
    expect(result.skippedCount).toBe(1)
    expect(result.selections).toEqual([{ trackId: 'actor-01:position', keyframeId: 'actor-01:position:100' }])
  })
})
