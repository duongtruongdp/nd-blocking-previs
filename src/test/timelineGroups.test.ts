import { describe, expect, it } from 'vitest'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { groupTimelineTracks } from '../timeline/timelineGroups'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('timeline entity groups', () => {
  it('groups animated properties in deterministic Scene order', () => {
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, 'camera-01', 'Camera', 'focalLengthMm', 0, 50)
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, 'prop-01', 'Prop', 'rotation', 0, [0, 0, 0])
    const groups = groupTimelineTracks(timeline.tracks, [
      { id: 'actor-01', name: 'Actor 01', entityType: 'Actor' },
      { id: 'prop-01', name: 'Cube', entityType: 'Prop' },
      { id: 'camera-01', name: 'Camera 01', entityType: 'Camera' },
    ])
    expect(groups.map((group) => group.name)).toEqual(['Actor 01', 'Cube', 'Camera 01'])
    expect(groups.map((group) => group.tracks.length)).toEqual([1, 1, 1])
  })

  it('does not alter TimelineDocument when a group is collapsed', () => {
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, 'actor-01', 'Actor', 'position', 0, [1, 2, 3])
    const before = JSON.stringify(timeline)
    const groups = groupTimelineTracks(timeline.tracks, [{ id: 'actor-01', name: 'Actor 01', entityType: 'Actor' }])
    expect(groups[0].tracks[0].keyframes[0].value).toEqual([1, 2, 3])
    expect(JSON.stringify(timeline)).toBe(before)
  })
})
