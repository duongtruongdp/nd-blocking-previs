import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { V2ScenePanel } from '../components/V2ScenePanel'
import type { ProjectSceneEntry } from '../core/projectDocument'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { createShotDocument, type ShotDocument } from '../core/shotDocument'
import type { WorkspaceSidebarSectionState } from '../core/workspaceSidebarSession'

describe('Scenes sidebar action layout', () => {
  const renderPanel = (shots: ShotDocument[] = []) => {
    const sceneDocument = createEmptySceneDocument()
    const scene = { id: 'scene-1', name: 'Scene 01', scene: { ...sceneDocument, metadata: { ...sceneDocument.metadata, id: 'scene-1', name: 'Scene 01' } } } as ProjectSceneEntry
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
      onSectionToggle: vi.fn(), onSelectScene: vi.fn(), onAddScene: vi.fn(), onRenameScene: vi.fn(), onDuplicateScene: vi.fn(), onDeleteScene: vi.fn(), onImportScene: vi.fn(), onExportScene: vi.fn(), onAddActor: vi.fn(), onAddProp: vi.fn(), onAddWall: vi.fn(), onAddOpening: vi.fn(), onAddSun: vi.fn(), onAddCamera: vi.fn(), onSetActiveCamera: vi.fn(), onSelectEntity: vi.fn(), onBeginEntityRename: vi.fn(), shots, activeShotId: shots[0]?.id ?? null, onCreateShot: vi.fn(), onSelectShot: vi.fn(), onRenameShot: vi.fn(), onDuplicateShot: vi.fn(), onDeleteShot: vi.fn(), onMoveShot: vi.fn(), onCaptureShotThumbnail: vi.fn(), onShotNotesChange: vi.fn(), onShotRangeChange: vi.fn(), onPreviewShot: vi.fn(), onAddShotToMaster: vi.fn(),
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

  it('renders reorder handles as explicit pointer targets without native HTML5 drag', () => {
    const markup = renderPanel()
    expect(markup).toContain('class="v2-order-handle"')
    expect(markup).toContain('aria-label="Drag Scene 01 to reorder"')
    expect(markup).toContain('data-scene-row-id="scene-1"')
    expect(markup).toContain('title="Scene 01"')
    expect(markup.match(/v2-scene-menu-button/g) ?? []).toHaveLength(1)
    expect(markup).not.toContain('draggable="true"')
  })

  it('keeps long Shot names readable with concise metadata and one row menu', () => {
    const shot = createShotDocument({ id: 'shot-1', name: 'A very long blocking Shot name that should wrap', sceneId: 'scene-1', cameraId: null, startFrame: 0, endFrame: 48, order: 0, notes: '', thumbnail: null })
    const markup = renderPanel([shot])
    expect(markup).toContain('class="v2-shot-name"')
    expect(markup).toContain('class="v2-shot-name">A very long blocking Shot name that should wrap</span>')
    expect(markup).toContain('title="A very long blocking Shot name that should wrap · Scene 01 · Missing Camera · 00:00:02:00"')
    expect(markup).not.toContain('v2-shot-index')
    expect(markup.match(/v2-scene-menu-button/g) ?? []).toHaveLength(2)
  })

  it('abbreviates generated Shot names only in the Workspace row', () => {
    const shot = createShotDocument({ id: 'shot-1', name: 'Shot 01', sceneId: 'scene-1', cameraId: null, startFrame: 0, endFrame: 48, order: 0, notes: '', thumbnail: null })
    const markup = renderPanel([shot])
    expect(markup).toContain('class="v2-shot-name">01</span>')
    expect(markup).toContain('v2-shot-thumb-placeholder" aria-hidden="true">—</span>')
    expect(markup).not.toContain('class="v2-shot-name">Shot 01</span>')
  })
})
