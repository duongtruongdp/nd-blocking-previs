import { describe, expect, it } from 'vitest'
import { createWorkspaceSidebarState, updateWorkspaceSidebarSection, workspaceSidebarSessionKey } from '../core/workspaceSidebarSession'

describe('workspace sidebar session state', () => {
  it('defaults primary content sections open and empty utility sections closed', () => {
    expect(createWorkspaceSidebarState()).toEqual({
      scenes: true,
      shots: true,
      actors: true,
      props: true,
      architecture: false,
      cameras: true,
      lights: false,
      groups: false,
    })
  })

  it('opens utility sections when their project starts with content', () => {
    const state = createWorkspaceSidebarState({ architecture: 1, lights: 1, groups: 2 })
    expect(state.architecture).toBe(true)
    expect(state.lights).toBe(true)
    expect(state.groups).toBe(true)
  })

  it('preserves explicit section choices instead of deriving them from later counts', () => {
    const initial = createWorkspaceSidebarState()
    const collapsed = updateWorkspaceSidebarSection(initial, 'actors', false)
    const unchanged = updateWorkspaceSidebarSection(collapsed, 'actors', false)
    expect(collapsed.actors).toBe(false)
    expect(unchanged).toBe(collapsed)
  })

  it('scopes session state by project identity without entering the document', () => {
    expect(workspaceSidebarSessionKey('project-a', '2026-01-01')).toBe('project-a:2026-01-01')
    expect(workspaceSidebarSessionKey('project-a', '2026-01-01')).not.toBe(workspaceSidebarSessionKey('project-b', '2026-01-01'))
  })
})
