import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ActorDocument, CameraDocument, OpeningDocument, PropDocument, RationalFrameRate, SceneGroup, SunDocument, WallDocument } from '../core/sceneDocument'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { ShotDocument } from '../core/shotDocument'
import { shotDurationFrames, workspaceShotLabel } from '../core/shotDocument'
import { frameToTimecode, timecodeToFrame } from '../timeline/timelineMath'
import { resolveShotCamera } from '../core/shotCameraResolver'
import type { WorkspaceSidebarSection, WorkspaceSidebarSectionState } from '../core/workspaceSidebarSession'
import { type RelativeInsertPosition } from '../core/sceneShotOrdering'

type V2ScenePanelProps = {
  scenes: readonly ProjectSceneEntry[]
  activeSceneId: string
  actors: readonly ActorDocument[]
  props: readonly PropDocument[]
  walls: readonly WallDocument[]
  openings: readonly OpeningDocument[]
  lights: readonly SunDocument[]
  cameras: readonly CameraDocument[]
  groups: readonly SceneGroup[]
  activeCameraId: string | null
  groupEditGroupId?: string | null
  selectedEntityIds: readonly string[]
  sectionState: WorkspaceSidebarSectionState
  onSectionToggle: (section: WorkspaceSidebarSection, expanded: boolean) => void
  onSelectScene: (sceneId: string) => void
  canEditOrdering?: boolean
  onReorderScene?: (sceneId: string, targetIndex: number) => void
  onInsertSceneRelative?: (sceneId: string, position: RelativeInsertPosition) => void
  onAddScene: () => void
  onRenameScene: (sceneId: string, name: string) => void
  onDuplicateScene: (sceneId: string) => void
  onDeleteScene: (sceneId: string) => void
  onImportScene: () => void
  onExportScene: (sceneId?: string) => void
  onAddActor: () => void
  onAddProp: (propType: NonNullable<PropDocument['propType']>) => void
  onAddWall: () => void
  onAddOpening: (openingType: 'door' | 'window') => void
  onAddSun: () => void
  onAddCamera: () => void
  onSetActiveCamera: (cameraId: string) => void
  onSelectEntity: (entityId: string, additive?: boolean) => void
  onEnterGroupEdit?: (groupId: string, childId: string) => void
  onBeginEntityRename: (entityId: string) => void
  shots: readonly ShotDocument[]
  activeShotId: string | null
  onCreateShot: () => void
  onSelectShot: (shotId: string) => void
  onRenameShot: (shotId: string, name: string) => void
  onDuplicateShot: (shotId: string) => void
  onDeleteShot: (shotId: string) => void
  onReorderShotWithinScene?: (shotId: string, targetIndex: number) => void
  onInsertShotRelative?: (shotId: string, position: RelativeInsertPosition) => void
  /** @deprecated Kept for legacy embedders; use scene-scoped ordering instead. */
  onMoveShot?: (shotId: string, direction: -1 | 1) => void
  onCaptureShotThumbnail: (shotId: string) => void
  onShotNotesChange: (shotId: string, notes: string) => void
  onShotRangeChange: (shotId: string, startFrame: number, endFrame: number) => void
  onPreviewShot: (shotId: string) => void
  onAddShotToMaster: (shotId: string) => void
}

type WorkspaceMenuState = {
  kind: 'scene' | 'shot'
  id: string
  anchor: { top: number; bottom: number; left: number; right: number }
}

type ReorderDragState = {
  kind: 'scene' | 'shot'
  id: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
  targetId: string | null
  before: boolean
  completed: boolean
  captureTarget: HTMLButtonElement
}

const REORDER_DRAG_THRESHOLD_PX = 4

function releaseReorderPointerCapture(drag: ReorderDragState) {
  if (drag.captureTarget.hasPointerCapture?.(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId)
}

export function V2ScenePanel({ scenes, activeSceneId, actors, props, walls, openings, lights, cameras, groups, activeCameraId, groupEditGroupId = null, selectedEntityIds, sectionState, onSectionToggle, onSelectScene, canEditOrdering = true, onReorderScene = () => {}, onInsertSceneRelative = () => {}, onAddScene, onRenameScene, onDuplicateScene, onDeleteScene, onImportScene, onExportScene, onAddActor, onAddProp, onAddWall, onAddOpening, onAddSun, onAddCamera, onSetActiveCamera, onSelectEntity, onEnterGroupEdit = () => {}, onBeginEntityRename, shots, activeShotId, onCreateShot, onSelectShot, onRenameShot, onDuplicateShot, onDeleteShot, onReorderShotWithinScene = () => {}, onInsertShotRelative = () => {}, onCaptureShotThumbnail, onShotNotesChange, onShotRangeChange, onPreviewShot, onAddShotToMaster }: V2ScenePanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState<WorkspaceMenuState | null>(null)
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const [sceneAddMenuOpen, setSceneAddMenuOpen] = useState(false)
  const [sceneAddMenuPosition, setSceneAddMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const sceneAddMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null)
  const [editingSceneName, setEditingSceneName] = useState('')
  const [editingShotId, setEditingShotId] = useState<string | null>(null)
  const [editingShotName, setEditingShotName] = useState('')
  const [entityMenu, setEntityMenu] = useState<{ entityId: string; x: number; y: number } | null>(null)
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null)
  const [sceneDrop, setSceneDrop] = useState<{ sceneId: string; before: boolean } | null>(null)
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null)
  const [shotDrop, setShotDrop] = useState<{ shotId: string; before: boolean } | null>(null)
  const sceneListRef = useRef<HTMLDivElement>(null)
  const shotListRef = useRef<HTMLDivElement>(null)
  const reorderDragRef = useRef<ReorderDragState | null>(null)

  const sceneMenuId = workspaceMenu?.kind === 'scene' ? workspaceMenu.id : null
  const shotMenuId = workspaceMenu?.kind === 'shot' ? workspaceMenu.id : null

  const menuScene = workspaceMenu?.kind === 'scene' ? scenes.find((scene) => scene.id === workspaceMenu.id) ?? null : null
  const menuShot = workspaceMenu?.kind === 'shot' ? shots.find((shot) => shot.id === workspaceMenu.id) ?? null : null
  const menuSceneIndex = menuScene ? scenes.findIndex((scene) => scene.id === menuScene.id) : -1
  const menuShotSceneShots = menuShot ? shots.filter((shot) => shot.sceneId === menuShot.sceneId) : []
  const menuShotIndex = menuShot ? menuShotSceneShots.findIndex((shot) => shot.id === menuShot.id) : -1

  const clearReorderDrag = () => {
    reorderDragRef.current = null
    setDraggedSceneId(null)
    setDraggedShotId(null)
    setSceneDrop(null)
    setShotDrop(null)
  }

  useEffect(() => {
    if (!sceneAddMenuOpen) return
    const updatePosition = () => {
      const rect = sceneAddMenuButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      setSceneAddMenuPosition({ top: rect.bottom + 4, left: Math.max(8, rect.right - 164) })
    }
    const dismiss = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (target instanceof Element && (target.closest('.v2-scenes-section') || target.closest('.v2-section-popup-menu'))) return
      setSceneAddMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setSceneAddMenuOpen(false)
      sceneAddMenuButtonRef.current?.focus()
    }
    updatePosition()
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [sceneAddMenuOpen])

  useEffect(() => {
    if (!entityMenu) return
    const dismiss = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.v2-entity-context-menu')) return
      setEntityMenu(null)
    }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [entityMenu])

  useEffect(() => {
    const cancelReorder = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !reorderDragRef.current) return
      event.preventDefault()
      releaseReorderPointerCapture(reorderDragRef.current)
      clearReorderDrag()
    }
    window.addEventListener('keydown', cancelReorder)
    return () => {
      window.removeEventListener('keydown', cancelReorder)
      if (reorderDragRef.current) releaseReorderPointerCapture(reorderDragRef.current)
      clearReorderDrag()
    }
  }, [])

  const selectEntity = (entityId: string, additive = false) => {
    setEntityMenu(null)
    const parentGroup = groups.find((group) => group.childIds.includes(entityId))
    if (parentGroup) onEnterGroupEdit(parentGroup.id, entityId)
    onSelectEntity(entityId, additive)
  }

  const openEntityMenu = (event: MouseEvent, entityId: string) => {
    event.preventDefault()
    event.stopPropagation()
    if (selectedEntityIds.length > 1 && selectedEntityIds.includes(entityId)) return
    const parentGroup = groups.find((group) => group.childIds.includes(entityId))
    if (parentGroup) onEnterGroupEdit(parentGroup.id, entityId)
    onSelectEntity(entityId)
    setEntityMenu({ entityId, x: event.clientX, y: event.clientY })
  }

  const renameScene = (scene: ProjectSceneEntry) => {
    closeWorkspaceMenu()
    setEditingSceneId(scene.id)
    setEditingSceneName(scene.name)
  }

  const finishSceneRename = () => {
    if (!editingSceneId) return
    onRenameScene(editingSceneId, editingSceneName)
    setEditingSceneId(null)
  }

  const addActor = () => { onAddActor(); setAddOpen(false) }
  const addCamera = () => { onAddCamera(); setAddOpen(false) }
  const addProp = (propType: NonNullable<PropDocument['propType']>) => { onAddProp(propType); setAddOpen(false) }
  const activeShot = shots.find((shot) => shot.id === activeShotId) ?? null
  const hierarchyEntities = [...actors, ...props, ...walls, ...openings, ...cameras, ...lights]
  const beginShotRename = (shot: ShotDocument) => {
    closeWorkspaceMenu()
    setEditingShotId(shot.id)
    setEditingShotName(shot.name)
  }
  const finishShotRename = () => {
    if (!editingShotId) return
    onRenameShot(editingShotId, editingShotName)
    setEditingShotId(null)
  }

  const scrollDuringDrag = (container: HTMLDivElement | null, clientY: number) => {
    if (!container) return
    const rect = container.getBoundingClientRect()
    const edge = 28
    if (clientY < rect.top + edge) container.scrollBy({ top: -12 })
    else if (clientY > rect.bottom - edge) container.scrollBy({ top: 12 })
  }

  const closeWorkspaceMenu = () => {
    setWorkspaceMenu(null)
    menuTriggerRef.current?.focus()
    menuTriggerRef.current = null
  }

  const openWorkspaceMenu = (event: MouseEvent<HTMLButtonElement>, kind: WorkspaceMenuState['kind'], id: string) => {
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    menuTriggerRef.current = event.currentTarget
    setWorkspaceMenu({ kind, id, anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } })
  }

  const rowAtPoint = (kind: ReorderDragState['kind'], clientX: number, clientY: number): HTMLElement | null => {
    if (typeof document === 'undefined') return null
    const element = document.elementFromPoint(clientX, clientY)
    const selector = kind === 'scene' ? '[data-scene-row-id]' : '[data-shot-row-id]'
    const row = element?.closest<HTMLElement>(selector) ?? null
    const list = kind === 'scene' ? sceneListRef.current : shotListRef.current
    return row && list?.contains(row) ? row : null
  }

  const updateReorderDropTarget = (drag: ReorderDragState, clientX: number, clientY: number) => {
    const row = rowAtPoint(drag.kind, clientX, clientY)
    if (!row) {
      drag.targetId = null
      if (drag.kind === 'scene') setSceneDrop(null)
      else setShotDrop(null)
      return
    }
    const targetId = drag.kind === 'scene' ? row.dataset.sceneRowId ?? null : row.dataset.shotRowId ?? null
    if (!targetId || targetId === drag.id) {
      drag.targetId = null
      if (drag.kind === 'scene') setSceneDrop(null)
      else setShotDrop(null)
      return
    }
    if (drag.kind === 'shot') {
      const source = shots.find((shot) => shot.id === drag.id)
      if (!source || row.dataset.shotSceneId !== source.sceneId) {
        drag.targetId = null
        setShotDrop(null)
        return
      }
    }
    const rect = row.getBoundingClientRect()
    drag.targetId = targetId
    drag.before = clientY < rect.top + rect.height / 2
    if (drag.kind === 'scene') setSceneDrop({ sceneId: targetId, before: drag.before })
    else setShotDrop({ shotId: targetId, before: drag.before })
    scrollDuringDrag(drag.kind === 'scene' ? sceneListRef.current : shotListRef.current, clientY)
  }

  const beginReorderPointer = (event: PointerEvent<HTMLButtonElement>, kind: ReorderDragState['kind'], id: string) => {
    if (!canEditOrdering || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    closeWorkspaceMenu()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    reorderDragRef.current = { kind, id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, targetId: null, before: true, completed: false, captureTarget: event.currentTarget }
  }

  const moveReorderPointer = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = reorderDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || !canEditOrdering) return
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
    if (!drag.active && distance < REORDER_DRAG_THRESHOLD_PX) return
    event.preventDefault()
    if (!drag.active) {
      drag.active = true
      if (drag.kind === 'scene') setDraggedSceneId(drag.id)
      else setDraggedShotId(drag.id)
    }
    updateReorderDropTarget(drag, event.clientX, event.clientY)
  }

  const endReorderPointer = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = reorderDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!cancelled && drag.active) updateReorderDropTarget(drag, event.clientX, event.clientY)
    if (!cancelled && drag.active && drag.targetId && drag.targetId !== drag.id) {
      if (drag.kind === 'scene') {
        const sourceIndex = scenes.findIndex((scene) => scene.id === drag.id)
        const targetIndex = scenes.findIndex((scene) => scene.id === drag.targetId)
        const rawIndex = targetIndex + (drag.before ? 0 : 1)
        if (sourceIndex >= 0 && targetIndex >= 0) onReorderScene(drag.id, sourceIndex < rawIndex ? rawIndex - 1 : rawIndex)
      } else {
        const source = shots.find((shot) => shot.id === drag.id)
        const target = shots.find((shot) => shot.id === drag.targetId)
        if (source && target && source.sceneId === target.sceneId) {
          const sceneShots = shots.filter((shot) => shot.sceneId === target.sceneId)
          const sourceIndex = sceneShots.findIndex((shot) => shot.id === source.id)
          const targetIndex = sceneShots.findIndex((shot) => shot.id === target.id)
          const rawIndex = targetIndex + (drag.before ? 0 : 1)
          if (sourceIndex >= 0 && targetIndex >= 0) onReorderShotWithinScene(source.id, sourceIndex < rawIndex ? rawIndex - 1 : rawIndex)
        }
      }
    }
    drag.completed = true
    releaseReorderPointerCapture(drag)
    clearReorderDrag()
  }

  return (
    <aside className="v2-panel v2-scene-panel" aria-label="Scene">
      <div className="v2-panel-heading">
        <div><span className="v2-eyebrow">Workspace</span></div>
        <div className="v2-add-wrap">
          <button className="v2-add-button" onClick={() => setAddOpen((open) => !open)} type="button">+ Add</button>
          {addOpen ? <div className="v2-add-menu">
            <AddMenuItem kind="shot" label="Shot" onClick={() => { onCreateShot(); setAddOpen(false) }} />
            <AddMenuItem kind="actor" label="Actor" onClick={addActor} />
            <AddMenuItem kind="camera" label="Camera" onClick={addCamera} />
            <span className="v2-add-menu-label">Props</span>
            {(['cube', 'sphere', 'cylinder', 'table', 'chair', 'bicycle', 'motorbike', 'car'] as const).map((kind) => <AddMenuItem key={kind} kind={kind} label={kind[0].toUpperCase() + kind.slice(1)} onClick={() => addProp(kind)} />)}
            <span className="v2-add-menu-label">Architecture</span>
            <AddMenuItem kind="wall" label="Wall" onClick={() => { onAddWall(); setAddOpen(false) }} />
            <AddMenuItem kind="door" label="Door" onClick={() => { onAddOpening('door'); setAddOpen(false) }} />
            <AddMenuItem kind="window" label="Window" onClick={() => { onAddOpening('window'); setAddOpen(false) }} />
            <span className="v2-add-menu-label">Lighting</span>
            <AddMenuItem kind="sun" label="Sun" onClick={() => { onAddSun(); setAddOpen(false) }} />
          </div> : null}
        </div>
      </div>
      <SidebarSection section="scenes" label="Scenes" count={scenes.length} expanded={sectionState.scenes} onToggle={onSectionToggle} className="v2-scenes-section" actions={<>
        <button className="v2-section-action-button v2-inline-add" aria-label="Add or Import Scene" aria-expanded={sceneAddMenuOpen} aria-haspopup="menu" onClick={(event) => { event.stopPropagation(); setSceneAddMenuOpen((open) => !open) }} onPointerDown={(event) => event.stopPropagation()} ref={sceneAddMenuButtonRef} title="Add or Import Scene" type="button">+</button>
      </>}>
        <div className="v2-scene-list" ref={sceneListRef}>
          {scenes.map((scene, index) => <div className={`v2-scene-row${scene.id === activeSceneId ? ' is-active' : ''}${draggedSceneId === scene.id ? ' is-dragging' : ''}`} data-scene-row-id={scene.id} key={scene.id}>
            {sceneDrop?.sceneId === scene.id && sceneDrop.before ? <span className="v2-order-drop-indicator is-before" aria-hidden="true" /> : null}
            <button className="v2-order-handle" aria-label={`Drag ${scene.name} to reorder`} onPointerDown={(event) => beginReorderPointer(event, 'scene', scene.id)} onPointerMove={moveReorderPointer} onPointerUp={endReorderPointer} onPointerCancel={(event) => endReorderPointer(event, true)} onLostPointerCapture={(event) => { if (!reorderDragRef.current?.completed) endReorderPointer(event, true) }} type="button">⠿</button>
            <button className="v2-scene-select" title={scene.name} onClick={() => onSelectScene(scene.id)} type="button"><span className="v2-scene-index">{String(index + 1).padStart(2, '0')}</span>{editingSceneId === scene.id ? <input autoFocus value={editingSceneName} onChange={(event) => setEditingSceneName(event.target.value)} onBlur={finishSceneRename} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishSceneRename() } if (event.key === 'Escape') setEditingSceneId(null) }} aria-label="Scene name" /> : <span>{scene.name}</span>}</button>
            <button className="v2-scene-menu-button" aria-label={`Actions for ${scene.name}`} aria-expanded={sceneMenuId === scene.id} aria-haspopup="menu" onClick={(event) => sceneMenuId === scene.id ? closeWorkspaceMenu() : openWorkspaceMenu(event, 'scene', scene.id)} type="button">•••</button>
            {sceneDrop?.sceneId === scene.id && !sceneDrop.before ? <span className="v2-order-drop-indicator is-after" aria-hidden="true" /> : null}
          </div>)}
        </div>
      </SidebarSection>
      <SidebarSection section="shots" label="Shots" count={shots.length} expanded={sectionState.shots} onToggle={onSectionToggle} className="v2-shot-section" actions={<button className="v2-section-action-button v2-inline-add" aria-label="Add Shot" onClick={(event) => { event.stopPropagation(); onCreateShot() }} onPointerDown={(event) => event.stopPropagation()} type="button" title="Add Shot">+</button>}>
        {shots.length === 0 ? <p>No Shots yet. Create one from the active Camera.</p> : <div className="v2-shot-list" ref={shotListRef}>
          {shots.map((shot) => {
            const shotScene = scenes.find((scene) => scene.id === shot.sceneId)?.scene
            const shotSceneName = scenes.find((scene) => scene.id === shot.sceneId)?.name ?? 'Missing Scene'
            const shotCamera = resolveShotCamera({ scenes }, shot).camera
            const cameraLabel = shotCamera ? `${Math.round(shotCamera.focalLengthMm)}mm` : 'Missing Camera'
            const rate = shotScene?.timeline.frameRate ?? { numerator: 24, denominator: 1 }
            const shotLabel = workspaceShotLabel(shot.name)
            return <div className={`v2-shot-row${shot.id === activeShotId ? ' is-active' : ''}${draggedShotId === shot.id ? ' is-dragging' : ''}`} data-shot-row-id={shot.id} data-shot-scene-id={shot.sceneId} key={shot.id}>
              {shotDrop?.shotId === shot.id && shotDrop.before ? <span className="v2-order-drop-indicator is-before" aria-hidden="true" /> : null}
              <button className="v2-order-handle" aria-label={`Drag ${shot.name} within ${shotSceneName} to reorder`} onPointerDown={(event) => beginReorderPointer(event, 'shot', shot.id)} onPointerMove={moveReorderPointer} onPointerUp={endReorderPointer} onPointerCancel={(event) => endReorderPointer(event, true)} onLostPointerCapture={(event) => { if (!reorderDragRef.current?.completed) endReorderPointer(event, true) }} type="button">⠿</button>
              <button className="v2-shot-select" title={`${shot.name} · ${shotSceneName} · ${cameraLabel} · ${frameToTimecode(shotDurationFrames(shot), rate)}`} onClick={() => onSelectShot(shot.id)} type="button">
                {shot.thumbnail ? <img src={shot.thumbnail.dataUrl} alt="" /> : <span className="v2-shot-thumb-placeholder" aria-hidden="true">—</span>}
                <span className="v2-shot-copy"><strong><span className="v2-shot-name">{editingShotId === shot.id ? <input autoFocus value={editingShotName} onChange={(event) => setEditingShotName(event.target.value)} onBlur={finishShotRename} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); finishShotRename() } if (event.key === 'Escape') setEditingShotId(null) }} aria-label="Shot name" /> : shotLabel}</span></strong><small>{shotSceneName} · {cameraLabel} · {frameToTimecode(shotDurationFrames(shot), rate)}</small></span>
              </button>
              <button className="v2-scene-menu-button" aria-label={`Actions for ${shot.name}`} aria-expanded={shotMenuId === shot.id} aria-haspopup="menu" onClick={(event) => shotMenuId === shot.id ? closeWorkspaceMenu() : openWorkspaceMenu(event, 'shot', shot.id)} type="button">•••</button>
              {shotDrop?.shotId === shot.id && !shotDrop.before ? <span className="v2-order-drop-indicator is-after" aria-hidden="true" /> : null}
            </div>
          })}
        </div>}
        {activeShot ? <div className="v2-shot-details">
          <div className="v2-shot-detail-title"><span>{activeShot.name}</span><small>{scenes.find((scene) => scene.id === activeShot.sceneId)?.name ?? 'Missing Scene'}</small></div>
          {(() => {
            const activeScene = scenes.find((scene) => scene.id === activeShot.sceneId)?.scene
            const rate = activeScene?.timeline.frameRate ?? { numerator: 24, denominator: 1 }
            const timelineStart = activeScene?.timeline.startFrame ?? 0
            const timelineEnd = activeScene?.timeline.endFrame ?? Number.MAX_SAFE_INTEGER
            return <div className="v2-shot-range"><ShotTimecodeField label="Start" value={activeShot.startFrame} rate={rate} minFrame={timelineStart} maxFrame={Math.min(timelineEnd - 1, activeShot.endFrame - 1)} onCommit={(frame) => onShotRangeChange(activeShot.id, frame, activeShot.endFrame)} /><ShotTimecodeField label="End" value={activeShot.endFrame} rate={rate} minFrame={activeShot.startFrame + 1} maxFrame={timelineEnd} onCommit={(frame) => onShotRangeChange(activeShot.id, activeShot.startFrame, frame)} /></div>
          })()}
          <textarea value={activeShot.notes} onChange={(event) => onShotNotesChange(activeShot.id, event.target.value)} placeholder="Shot notes" aria-label="Shot notes" />
          <div className="v2-shot-actions"><button className="v2-small-action" onClick={() => onPreviewShot(activeShot.id)} type="button">Preview Shot</button><button className="v2-small-action" onClick={() => onCaptureShotThumbnail(activeShot.id)} type="button">Capture Thumbnail</button></div>
        </div> : null}
      </SidebarSection>
      <div className="v2-scene-sections">
        <SidebarSection section="actors" label="Actors" count={actors.length} expanded={sectionState.actors} onToggle={onSectionToggle} actions={<button className="v2-section-action-button v2-inline-add" aria-label="Add Actor" onClick={(event) => { event.stopPropagation(); onAddActor() }} onPointerDown={(event) => event.stopPropagation()} type="button" title="Add Actor">+</button>}>
          {actors.length === 0 ? <p>No actors in this Scene</p> : <div className="v2-entity-list">{actors.map((actor) => <button className={`v2-entity-row${selectedEntityIds.includes(actor.id) ? ' is-selected' : ''}`} key={actor.id} onClick={(event) => selectEntity(actor.id, event.shiftKey)} onContextMenu={(event) => openEntityMenu(event, actor.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: actor.appearance.primaryColor }} /><span>{actor.name}</span></button>)}</div>}
        </SidebarSection>
        <SidebarSection section="props" label="Props" count={props.length} expanded={sectionState.props} onToggle={onSectionToggle}>
          <div className="v2-entity-list">{props.map((entity) => <button className={`v2-entity-row${selectedEntityIds.includes(entity.id) ? ' is-selected' : ''}`} key={entity.id} onClick={(event) => selectEntity(entity.id, event.shiftKey)} onContextMenu={(event) => openEntityMenu(event, entity.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: entity.primaryColor }} /><span>{entity.name}</span><small>{entity.propType ?? entity.shape}</small></button>)}</div>
        </SidebarSection>
        <SidebarSection section="architecture" label="Architecture" count={walls.length + openings.length} expanded={sectionState.architecture} onToggle={onSectionToggle} actions={<button className="v2-section-action-button v2-inline-add" aria-label="Add Wall" onClick={(event) => { event.stopPropagation(); onAddWall() }} onPointerDown={(event) => event.stopPropagation()} type="button" title="Add Wall">+</button>}>
          <div className="v2-entity-list">{[...walls, ...openings].map((entity) => <button className={`v2-entity-row${selectedEntityIds.includes(entity.id) ? ' is-selected' : ''}`} key={entity.id} onClick={(event) => selectEntity(entity.id, event.shiftKey)} onContextMenu={(event) => openEntityMenu(event, entity.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: entity.primaryColor }} /><span>{entity.name}</span><small>{entity.type === 'Wall' ? 'Wall' : entity.openingType}</small></button>)}</div>
        </SidebarSection>
        <SidebarSection section="cameras" label="Cameras" count={cameras.length} expanded={sectionState.cameras} onToggle={onSectionToggle} actions={<button className="v2-section-action-button v2-inline-add" aria-label="Add Camera" onClick={(event) => { event.stopPropagation(); onAddCamera() }} onPointerDown={(event) => event.stopPropagation()} type="button" title="Add Camera">+</button>}>
          {cameras.length === 0 ? <p>No cameras in this Scene</p> : <div className="v2-entity-list">{cameras.map((camera) => <div className={`v2-camera-row${selectedEntityIds.includes(camera.id) ? ' is-selected' : ''}`} key={camera.id} onContextMenu={(event) => openEntityMenu(event, camera.id)}><button className="v2-camera-select" onClick={(event) => selectEntity(camera.id, event.shiftKey)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: camera.proxyColor }} /><span>{camera.name}</span></button><button className={`v2-camera-active${activeCameraId === camera.id ? ' is-active' : ''}`} onClick={() => onSetActiveCamera(camera.id)} type="button" title={activeCameraId === camera.id ? 'Active Camera' : 'Set Active Camera'}>{activeCameraId === camera.id ? 'A' : '·'}</button></div>)}</div>}
        </SidebarSection>
        <SidebarSection section="lights" label="Lights" count={lights.length} expanded={sectionState.lights} onToggle={onSectionToggle} actions={<button className="v2-section-action-button v2-inline-add" aria-label="Add Light" onClick={(event) => { event.stopPropagation(); onAddSun() }} onPointerDown={(event) => event.stopPropagation()} type="button" title="Add Light">+</button>}>
          {lights.length === 0 ? <p>No lights in this Scene</p> : <div className="v2-entity-list">{lights.map((sun) => <button className={`v2-entity-row${selectedEntityIds.includes(sun.id) ? ' is-selected' : ''}`} key={sun.id} onClick={(event) => selectEntity(sun.id, event.shiftKey)} onContextMenu={(event) => openEntityMenu(event, sun.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: sun.color }} /><span>{sun.name}</span><small>Sun</small></button>)}</div>}
        </SidebarSection>
        <SidebarSection section="groups" label="Groups" count={groups.length} expanded={sectionState.groups} onToggle={onSectionToggle}>
          {groups.length === 0 ? <p>No groups in this Scene</p> : <div className="v2-entity-list v2-group-hierarchy">{groups.map((group) => <div className="v2-group-tree" key={group.id}>
            <button className={`v2-entity-row${selectedEntityIds.includes(group.id) ? ' is-selected' : ''}`} onClick={(event) => selectEntity(group.id, event.shiftKey)} onContextMenu={(event) => openEntityMenu(event, group.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: '#7d72cf' }} /><span>{group.name}</span><small>{group.childIds.length} items</small></button>
            <div className="v2-group-child-list" role="group" aria-label={`Children of ${group.name}`}>
              {group.childIds.map((childId) => {
                const child = hierarchyEntities.find((entity) => entity.id === childId)
                if (!child) return null
                const color = 'appearance' in child ? child.appearance.primaryColor : 'proxyColor' in child ? child.proxyColor : 'primaryColor' in child ? child.primaryColor : 'color' in child ? child.color : '#9aa6b8'
                const kind = 'proxyColor' in child ? 'Camera' : 'appearance' in child ? 'Actor' : 'shape' in child ? ('propType' in child ? child.propType ?? child.shape : child.shape) : 'type' in child ? child.type : 'Sun'
                return <button className={`v2-entity-row v2-group-child-row${selectedEntityIds.includes(child.id) ? ' is-selected' : ''}${groupEditGroupId === group.id ? ' is-editable' : ''}`} key={child.id} onClick={(event) => selectEntity(child.id, event.shiftKey)} onContextMenu={(event) => openEntityMenu(event, child.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: color }} /><span>{child.name}</span><small>{kind}</small></button>
              })}
            </div>
          </div>)}</div>}
        </SidebarSection>
      </div>
      {entityMenu ? <div className="v2-entity-context-menu" role="menu" style={{ left: entityMenu.x, top: entityMenu.y }} onPointerDown={(event) => event.stopPropagation()}><button onClick={() => { onBeginEntityRename(entityMenu.entityId); setEntityMenu(null) }} type="button">Rename</button></div> : null}
      {workspaceMenu && (menuScene || menuShot) && typeof document !== 'undefined' ? createPortal(
        <WorkspaceFloatingMenu anchor={workspaceMenu.anchor} ariaLabel={menuScene ? `Actions for ${menuScene.name}` : `Actions for ${menuShot?.name ?? 'Shot'}`} onClose={closeWorkspaceMenu}>
          {menuScene ? <>
            <WorkspaceMenuLabel>Ordering</WorkspaceMenuLabel>
            <WorkspaceMenuButton disabled={!canEditOrdering || menuSceneIndex <= 0} onClick={() => { onReorderScene(menuScene.id, menuSceneIndex - 1); closeWorkspaceMenu() }}>Move Up</WorkspaceMenuButton>
            <WorkspaceMenuButton disabled={!canEditOrdering || menuSceneIndex < 0 || menuSceneIndex >= scenes.length - 1} onClick={() => { onReorderScene(menuScene.id, menuSceneIndex + 1); closeWorkspaceMenu() }}>Move Down</WorkspaceMenuButton>
            <WorkspaceMenuSeparator />
            <WorkspaceMenuLabel>Creation</WorkspaceMenuLabel>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onInsertSceneRelative(menuScene.id, 'before'); closeWorkspaceMenu() }}>Insert Scene Before</WorkspaceMenuButton>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onInsertSceneRelative(menuScene.id, 'after'); closeWorkspaceMenu() }}>Insert Scene After</WorkspaceMenuButton>
            <WorkspaceMenuSeparator />
            <WorkspaceMenuLabel>Management</WorkspaceMenuLabel>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => renameScene(menuScene)}>Rename</WorkspaceMenuButton>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onDuplicateScene(menuScene.id); closeWorkspaceMenu() }}>Duplicate</WorkspaceMenuButton>
            <WorkspaceMenuButton onClick={() => { onExportScene(menuScene.id); closeWorkspaceMenu() }}>Export Scene</WorkspaceMenuButton>
            <WorkspaceMenuSeparator />
            <WorkspaceMenuButton danger disabled={!canEditOrdering || scenes.length <= 1} onClick={() => { onDeleteScene(menuScene.id); closeWorkspaceMenu() }}>Delete</WorkspaceMenuButton>
          </> : menuShot ? <>
            <WorkspaceMenuLabel>Ordering</WorkspaceMenuLabel>
            <WorkspaceMenuButton disabled={!canEditOrdering || menuShotIndex <= 0} onClick={() => { onReorderShotWithinScene(menuShot.id, menuShotIndex - 1); closeWorkspaceMenu() }}>Move Up</WorkspaceMenuButton>
            <WorkspaceMenuButton disabled={!canEditOrdering || menuShotIndex < 0 || menuShotIndex >= menuShotSceneShots.length - 1} onClick={() => { onReorderShotWithinScene(menuShot.id, menuShotIndex + 1); closeWorkspaceMenu() }}>Move Down</WorkspaceMenuButton>
            <WorkspaceMenuSeparator />
            <WorkspaceMenuLabel>Creation</WorkspaceMenuLabel>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onInsertShotRelative(menuShot.id, 'before'); closeWorkspaceMenu() }}>Insert Shot Before</WorkspaceMenuButton>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onInsertShotRelative(menuShot.id, 'after'); closeWorkspaceMenu() }}>Insert Shot After</WorkspaceMenuButton>
            <WorkspaceMenuSeparator />
            <WorkspaceMenuLabel>Management</WorkspaceMenuLabel>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => beginShotRename(menuShot)}>Rename</WorkspaceMenuButton>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onDuplicateShot(menuShot.id); closeWorkspaceMenu() }}>Duplicate</WorkspaceMenuButton>
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onCaptureShotThumbnail(menuShot.id); closeWorkspaceMenu() }}>Capture Thumbnail</WorkspaceMenuButton>
            <WorkspaceMenuSeparator />
            <WorkspaceMenuButton danger disabled={!canEditOrdering} onClick={() => { onDeleteShot(menuShot.id); closeWorkspaceMenu() }}>Delete</WorkspaceMenuButton>
            <WorkspaceMenuSeparator />
            <WorkspaceMenuButton disabled={!canEditOrdering} onClick={() => { onAddShotToMaster(menuShot.id); closeWorkspaceMenu() }}>Add to Master</WorkspaceMenuButton>
          </> : null}
        </WorkspaceFloatingMenu>,
        document.body,
      ) : null}
      {sceneAddMenuOpen && sceneAddMenuPosition && typeof document !== 'undefined' ? createPortal(
        <div className="v2-section-popup-menu v2-scene-add-menu" role="menu" aria-label="Scene actions" style={{ top: sceneAddMenuPosition.top, left: sceneAddMenuPosition.left }} onPointerDown={(event) => event.stopPropagation()}>
          <button onClick={() => { onAddScene(); setSceneAddMenuOpen(false); sceneAddMenuButtonRef.current?.focus() }} role="menuitem" type="button">Add Scene</button>
          <button onClick={() => { onImportScene(); setSceneAddMenuOpen(false); sceneAddMenuButtonRef.current?.focus() }} role="menuitem" type="button">Import Scene</button>
        </div>,
        document.body,
      ) : null}
    </aside>
  )
}

function WorkspaceFloatingMenu({ anchor, ariaLabel, onClose, children }: { anchor: WorkspaceMenuState['anchor']; ariaLabel: string; onClose: () => void; children: ReactNode }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: anchor.bottom + 4, left: anchor.left, maxHeight: 'min(60vh, 380px)' })

  useLayoutEffect(() => {
    const updatePosition = () => {
      const menu = menuRef.current
      if (!menu) return
      const margin = 8
      const width = menu.offsetWidth
      const height = menu.offsetHeight
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const belowTop = anchor.bottom + 4
      const aboveTop = anchor.top - height - 4
      const top = belowTop + height <= viewportHeight - margin || aboveTop < margin ? belowTop : aboveTop
      const preferredLeft = anchor.right - width
      const left = preferredLeft >= margin ? preferredLeft : anchor.left
      setStyle({ position: 'fixed', top: Math.max(margin, Math.min(top, viewportHeight - height - margin)), left: Math.max(margin, Math.min(left, viewportWidth - width - margin)), maxHeight: 'min(60vh, 380px)' })
      if (anchor.bottom < 0 || anchor.top > viewportHeight) onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    updatePosition()
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const dismiss = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return
      onClose()
    }
    window.addEventListener('pointerdown', dismiss)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('pointerdown', dismiss)
    }
  }, [anchor, onClose])

  return <div ref={menuRef} className="v2-floating-workspace-menu" role="menu" aria-label={ariaLabel} style={style} onPointerDown={(event) => event.stopPropagation()}>{children}</div>
}

function WorkspaceMenuLabel({ children }: { children: ReactNode }) {
  return <span className="v2-floating-workspace-menu-label">{children}</span>
}

function WorkspaceMenuSeparator() {
  return <span className="v2-floating-workspace-menu-separator" role="separator" aria-hidden="true" />
}

function WorkspaceMenuButton({ children, onClick, disabled = false, danger = false }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button className={danger ? 'is-danger' : undefined} disabled={disabled} onClick={onClick} role="menuitem" type="button">{children}</button>
}

function SidebarSection({ section, label, count, expanded, onToggle, className, actions, children }: { section: WorkspaceSidebarSection; label: string; count: number; expanded: boolean; onToggle: (section: WorkspaceSidebarSection, expanded: boolean) => void; className?: string; actions?: ReactNode; children: ReactNode }) {
  const bodyId = `v2-workspace-section-${section}`
  return <section className={`v2-scene-section v2-collapsible-section${className ? ` ${className}` : ''}`}>
    <div className="v2-section-title">
      <button className="v2-section-label" type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={() => onToggle(section, !expanded)}>{label}</button>
      <span className="v2-section-actions">
        <span className="v2-count">{count}</span>
        {actions}
        <button className="v2-section-toggle" type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label}`} aria-expanded={expanded} aria-controls={bodyId} onClick={() => onToggle(section, !expanded)}>
          <span className="v2-section-chevron" aria-hidden="true">⌄</span>
        </button>
      </span>
    </div>
    <div id={bodyId} className="v2-collapsible-body" hidden={!expanded}>{children}</div>
  </section>
}

function ShotTimecodeField({ label, value, rate, minFrame, maxFrame, onCommit }: { label: string; value: number; rate: RationalFrameRate; minFrame: number; maxFrame: number; onCommit: (frame: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.value = frameToTimecode(value, rate)
  }, [value, rate])
  const commit = () => {
    const input = inputRef.current
    if (!input) return
    const parsed = timecodeToFrame(input.value, rate)
    if (parsed !== null && parsed >= minFrame && parsed <= maxFrame) onCommit(parsed)
    else input.value = frameToTimecode(value, rate)
  }
  return <label>{label} <input ref={inputRef} type="text" inputMode="numeric" defaultValue={frameToTimecode(value, rate)} aria-label={`Shot ${label} timecode`} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); inputRef.current?.blur() } if (event.key === 'Escape' && inputRef.current) inputRef.current.value = frameToTimecode(value, rate) }} /></label>
}

type MenuIconKind = 'scene' | 'shot' | 'actor' | 'camera' | 'cube' | 'sphere' | 'cylinder' | 'table' | 'chair' | 'bicycle' | 'motorbike' | 'car' | 'wall' | 'door' | 'window' | 'sun'

function AddMenuItem({ kind, label, onClick }: { kind: MenuIconKind; label: string; onClick: () => void }) {
  return <button onClick={onClick} type="button"><MenuIcon kind={kind} /><span>{label}</span></button>
}

function MenuIcon({ kind }: { kind: MenuIconKind }) {
  const paths: Record<MenuIconKind, string> = {
    scene: 'M3 4h18v16H3z M7 8h10 M7 12h10 M7 16h6',
    shot: 'M4 6h16v12H4z M7 9h5 M7 12h10 M7 15h6',
    actor: 'M12 4a3 3 0 1 0 0 6a3 3 0 0 0 0-6 M6 20c.5-4 2.5-6 6-6s5.5 2 6 6',
    camera: 'M4 8h4l1.5-2h5L16 8h4v10H4z M12 10a3 3 0 1 0 0 6a3 3 0 0 0 0-6',
    cube: 'm12 3 8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
    sphere: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16',
    cylinder: 'M5 6c0-2 14-2 14 0v12c0 2-14 2-14 0z M5 6c0 2 14 2 14 0 M5 18c0 2 14 2 14 0',
    table: 'M4 7h16v3H4z M6 10v10 M18 10v10',
    chair: 'M6 5h12v3H9v5h9v3H6z M8 16v4 M16 16v4',
    bicycle: 'M5 17a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M19 17a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M5 14h5l3-5 3 5h3 M10 14l-2-5h3',
    motorbike: 'M4 16a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M20 16a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M7 13h7l3-4h2 M10 13l2-4h3',
    car: 'M4 15l2-6h12l2 6v4H4z M6 9l2-3h8l2 3 M7 17a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3 M17 17a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3',
    wall: 'M4 4h16v16H4z M8 4v16 M16 4v16',
    door: 'M6 20V4h12v16 M9 12h1',
    window: 'M4 5h16v14H4z M12 5v14 M4 12h16',
    sun: 'M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M19 5l-1.5 1.5 M6.5 17.5 5 19',
  }
  return <svg className="v2-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>
}
