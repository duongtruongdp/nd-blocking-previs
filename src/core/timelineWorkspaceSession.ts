import { DEFAULT_MUSIC_TRACK_HEIGHT, DEFAULT_SHOTS_TRACK_HEIGHT } from './masterGraphics'

export type TimelineWorkspaceViewState = {
  pixelsPerSecond: number | null
  horizontalScroll: number
  verticalScroll: number
}
export type MasterTimelineWorkspaceState = {
  pixelsPerFrame: number | null
  horizontalScroll: number
  verticalScroll: number
  trackHeights: Record<string, number>
}

export type TimelineWorkspaceSessionState = {
  master: MasterTimelineWorkspaceState
  sceneById: Record<string, TimelineWorkspaceViewState>
}

export type TimelineWorkspaceViewPatch = Partial<TimelineWorkspaceViewState>

export type MasterTimelineWorkspacePatch = Partial<Omit<MasterTimelineWorkspaceState, 'trackHeights'>> & {
  trackHeights?: Record<string, number>
}

export function createTimelineWorkspaceSessionState(): TimelineWorkspaceSessionState {
  return {
    master: {
      pixelsPerFrame: null,
      horizontalScroll: 0,
      verticalScroll: 0,
      trackHeights: {
        shots: DEFAULT_SHOTS_TRACK_HEIGHT,
        music: DEFAULT_MUSIC_TRACK_HEIGHT,
      },
    },
    sceneById: {},
  }
}

export function getSceneTimelineWorkspace(state: TimelineWorkspaceSessionState, sceneId: string): TimelineWorkspaceViewState {
  return state.sceneById[sceneId] ?? { pixelsPerSecond: null, horizontalScroll: 0, verticalScroll: 0 }
}

export function updateMasterTimelineWorkspace(state: TimelineWorkspaceSessionState, patch: MasterTimelineWorkspacePatch): TimelineWorkspaceSessionState {
  return {
    ...state,
    master: {
      ...state.master,
      ...patch,
      trackHeights: patch.trackHeights ? { ...patch.trackHeights } : state.master.trackHeights,
    },
  }
}

export function updateSceneTimelineWorkspace(state: TimelineWorkspaceSessionState, sceneId: string, patch: TimelineWorkspaceViewPatch): TimelineWorkspaceSessionState {
  return {
    ...state,
    sceneById: {
      ...state.sceneById,
      [sceneId]: { ...getSceneTimelineWorkspace(state, sceneId), ...patch },
    },
  }
}

export function pruneTimelineWorkspaceScenes(state: TimelineWorkspaceSessionState, sceneIds: readonly string[]): TimelineWorkspaceSessionState {
  const validIds = new Set(sceneIds)
  const sceneById = Object.fromEntries(Object.entries(state.sceneById).filter(([sceneId]) => validIds.has(sceneId)))
  return { ...state, sceneById }
}

export function resetTimelineWorkspaceState(): TimelineWorkspaceSessionState {
  return createTimelineWorkspaceSessionState()
}
