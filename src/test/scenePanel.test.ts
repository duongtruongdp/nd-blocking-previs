import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { V2ScenePanel } from '../components/V2ScenePanel'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { WorkspaceSidebarSectionState } from '../core/workspaceSidebarSession'

describe('Scenes sidebar action layout', () => {
  const renderPanel = () => {
    const scene = { id: 'scene-1', name: 'Scene 01' } as ProjectSceneEntry
    const sectionState: WorkspaceSidebarSectionState = {
      scenes: true,
      shots: true,
      actors: true,
      props: true,
      architecture: true,
      cameras: true,
      lights: true,
      groups: true,
    }
    return renderToStaticMarkup(createElement(V2ScenePanel, {
      scenes: [scene], activeSceneId: scene.id, actors: [], props: [], walls: [], openings: [], lights: [], cameras: [], groups: [], activeCameraId: null, selectedEntityIds: [], sectionState,
      onSectionToggle: vi.fn(), onSelectScene: vi.fn(), onAddScene: vi.fn(), onRenameScene: vi.fn(), onDuplicateScene: vi.fn(), onDeleteScene: vi.fn(), onImportScene: vi.fn(), onExportScene: vi.fn(), onAddActor: vi.fn(), onAddProp: vi.fn(), onAddWall: vi.fn(), onAddOpening: vi.fn(), onAddSun: vi.fn(), onAddCamera: vi.fn(), onSetActiveCamera: vi.fn(), onSelectEntity: vi.fn(), onBeginEntityRename: vi.fn(), shots: [], activeShotId: null, onCreateShot: vi.fn(), onSelectShot: vi.fn(), onRenameShot: vi.fn(), onDuplicateShot: vi.fn(), onDeleteShot: vi.fn(), onMoveShot: vi.fn(), onCaptureShotThumbnail: vi.fn(), onShotNotesChange: vi.fn(), onShotRangeChange: vi.fn(), onPreviewShot: vi.fn(), onAddShotToMaster: vi.fn(),
    }))
  }

  it('keeps scene creation in the header and removes the redundant action row', () => {
    const markup = renderPanel()
    expect(markup).toContain('aria-label="Add or Import Scene"')
    expect(markup).toContain('title="Add or Import Scene"')
    expect(markup).not.toContain('Scenes actions')
    expect(markup).not.toContain('+ Add Scene')
  })

  it('uses one accessible header pattern and only exposes supported direct actions', () => {
    const markup = renderPanel()
    expect(markup.match(/v2-section-title/g)).toHaveLength(8)
    expect(markup).toContain('aria-haspopup="menu"')
    expect(markup).not.toContain('Scenes actions')
    expect(markup).toContain('aria-label="Add Shot"')
    expect(markup).toContain('aria-label="Add Actor"')
    expect(markup).toContain('aria-label="Add Wall"')
    expect(markup).toContain('aria-label="Add Camera"')
    expect(markup).toContain('aria-label="Add Light"')
    expect(markup).not.toContain('aria-label="Add Prop"')
    expect(markup).not.toContain('aria-label="Add Group"')
    expect(markup.match(/aria-label="(Collapse|Expand) /g) ?? []).toHaveLength(8)
  })
})
