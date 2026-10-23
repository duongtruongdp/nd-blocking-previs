import { describe, expect, it } from 'vitest'
import { createTimelineWorkspaceSessionState, getSceneTimelineWorkspace, pruneTimelineWorkspaceScenes, resetTimelineWorkspaceState, updateMasterTimelineWorkspace, updateSceneTimelineWorkspace } from '../core/timelineWorkspaceSession'

describe('timeline workspace session state', () => {
  it('keeps Master and Scene viewport state independent', () => {
    let state = createTimelineWorkspaceSessionState()
    state = updateMasterTimelineWorkspace(state, { pixelsPerFrame: 2, horizontalScroll: 480 })
    state = updateSceneTimelineWorkspace(state, 'scene-a', { pixelsPerSecond: 150, horizontalScroll: 120 })

    expect(state.master.pixelsPerFrame).toBe(2)
    expect(state.master.horizontalScroll).toBe(480)
    expect(getSceneTimelineWorkspace(state, 'scene-a')).toMatchObject({ pixelsPerSecond: 150, horizontalScroll: 120 })
    expect(getSceneTimelineWorkspace(state, 'scene-b')).toEqual({ pixelsPerSecond: null, horizontalScroll: 0, verticalScroll: 0 })
  })

  it('remembers each Scene independently, including vertical scroll', () => {
    let state = createTimelineWorkspaceSessionState()
    state = updateSceneTimelineWorkspace(state, 'scene-a', { pixelsPerSecond: 150, horizontalScroll: 120, verticalScroll: 36 })
    state = updateSceneTimelineWorkspace(state, 'scene-b', { pixelsPerSecond: 75, horizontalScroll: 640, verticalScroll: 12 })

    expect(getSceneTimelineWorkspace(state, 'scene-a')).toMatchObject({ pixelsPerSecond: 150, horizontalScroll: 120, verticalScroll: 36 })
    expect(getSceneTimelineWorkspace(state, 'scene-b')).toMatchObject({ pixelsPerSecond: 75, horizontalScroll: 640, verticalScroll: 12 })
  })

  it('preserves Master track heights as session state', () => {
    let state = createTimelineWorkspaceSessionState()
    state = updateMasterTimelineWorkspace(state, { trackHeights: { shots: 120, graphics01: 96, music: 48 } })
    state = updateSceneTimelineWorkspace(state, 'scene-a', { pixelsPerSecond: 80 })

    expect(state.master.trackHeights).toEqual({ shots: 120, graphics01: 96, music: 48 })
    expect(state.sceneById['scene-a'].pixelsPerSecond).toBe(80)
  })

  it('prunes deleted Scene state without affecting Master state', () => {
    let state = createTimelineWorkspaceSessionState()
    state = updateMasterTimelineWorkspace(state, { pixelsPerFrame: 3, horizontalScroll: 200 })
    state = updateSceneTimelineWorkspace(state, 'scene-a', { pixelsPerSecond: 150 })
    state = updateSceneTimelineWorkspace(state, 'scene-b', { pixelsPerSecond: 75 })
    state = pruneTimelineWorkspaceScenes(state, ['scene-b'])

    expect(state.sceneById).toEqual({ 'scene-b': { pixelsPerSecond: 75, horizontalScroll: 0, verticalScroll: 0 } })
    expect(state.master).toMatchObject({ pixelsPerFrame: 3, horizontalScroll: 200 })
  })

  it('resets all workspace state for a new or loaded project', () => {
    let state = updateSceneTimelineWorkspace(createTimelineWorkspaceSessionState(), 'scene-a', { pixelsPerSecond: 150 })
    state = updateMasterTimelineWorkspace(state, { pixelsPerFrame: 3, horizontalScroll: 200 })

    expect(resetTimelineWorkspaceState()).toEqual(createTimelineWorkspaceSessionState())
    expect(state.sceneById['scene-a'].pixelsPerSecond).toBe(150)
  })
})
