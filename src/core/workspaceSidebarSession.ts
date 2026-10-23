export const WORKSPACE_SIDEBAR_SECTIONS = [
  'scenes',
  'shots',
  'actors',
  'props',
  'architecture',
  'cameras',
  'lights',
  'groups',
] as const

export type WorkspaceSidebarSection = typeof WORKSPACE_SIDEBAR_SECTIONS[number]

export type WorkspaceSidebarSectionState = Record<WorkspaceSidebarSection, boolean>

export type WorkspaceSidebarSectionCounts = Partial<Record<WorkspaceSidebarSection, number>>

export function createWorkspaceSidebarState(counts: WorkspaceSidebarSectionCounts = {}): WorkspaceSidebarSectionState {
  return {
    scenes: true,
    shots: true,
    actors: true,
    props: true,
    architecture: (counts.architecture ?? 0) > 0,
    cameras: true,
    lights: (counts.lights ?? 0) > 0,
    groups: (counts.groups ?? 0) > 0,
  }
}

export function updateWorkspaceSidebarSection(state: WorkspaceSidebarSectionState, section: WorkspaceSidebarSection, expanded: boolean): WorkspaceSidebarSectionState {
  if (state[section] === expanded) return state
  return { ...state, [section]: expanded }
}

export function workspaceSidebarSessionKey(projectId: string, createdAt: string): string {
  return `${projectId}:${createdAt}`
}
