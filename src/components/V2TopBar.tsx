import { useEffect, useRef, useState } from 'react'
import type { LiveReviewRole } from '../liveReview/protocol'
import type { LiveReviewTransportStatus } from '../liveReview/liveReviewTransport'

type V2TopBarProps = {
  view: 'blocking' | 'camera' | 'shot-list'
  projectName: string
  sceneName: string
  isDirty: boolean
  fileError: string | null
  saveState?: 'idle' | 'saving' | 'saved' | 'error'
  onViewChange: (view: 'blocking' | 'camera' | 'shot-list') => void
  onNewProject: () => void
  onBackToLibrary?: () => void
  onSaveProject: () => void
  onSaveProjectAs: () => void
  onLoadProject: () => void
  onOpenProjectSettings?: () => void
  onOpenMediaManager?: () => void
  onExportProjectPackage?: () => void
  missingMediaCount?: number
  onProjectNameChange: (name: string) => void
  onExport: () => void
  onOpenAbout?: () => void
  exportDisabled?: boolean
  readOnly?: boolean
  liveStatus?: LiveReviewTransportStatus
  liveRole?: LiveReviewRole | null
  liveViewerCount?: number
  onOpenLive?: () => void
}

export function V2TopBar({ view, projectName, sceneName, isDirty, fileError, saveState = 'idle', onViewChange, onNewProject, onBackToLibrary, onSaveProject, onSaveProjectAs, onLoadProject, onOpenProjectSettings, onOpenMediaManager, onExportProjectPackage, missingMediaCount = 0, onProjectNameChange, onExport, onOpenAbout, exportDisabled = false, readOnly = false, liveStatus = 'idle', liveRole = null, liveViewerCount = 0, onOpenLive }: V2TopBarProps) {
  const skipBlurRef = useRef(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const projectMenuButtonRef = useRef<HTMLButtonElement>(null)
  const [editingProjectName, setEditingProjectName] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState(projectName)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)

  useEffect(() => {
    if (!projectMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!projectMenuRef.current?.contains(event.target as Node)) setProjectMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setProjectMenuOpen(false)
        projectMenuButtonRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [projectMenuOpen])

  const beginProjectRename = () => {
    setProjectNameDraft(projectName)
    setEditingProjectName(true)
  }

  const commitProjectRename = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) onProjectNameChange(trimmed)
    setProjectNameDraft(trimmed || projectName)
    setEditingProjectName(false)
  }

  const cancelProjectRename = () => {
    skipBlurRef.current = true
    setProjectNameDraft(projectName)
    setEditingProjectName(false)
    window.requestAnimationFrame(() => { skipBlurRef.current = false })
  }

  return (
    <header className="v2-topbar">
      <div className="v2-project-menu-anchor" ref={projectMenuRef}>
        <button className="v2-brand" ref={projectMenuButtonRef} aria-expanded={projectMenuOpen} aria-haspopup="menu" aria-label="Open Project menu" onClick={() => setProjectMenuOpen((open) => !open)} type="button">
          <span className="v2-brand-mark">ND</span>
          <span>Blocking &amp; Previs</span>
          <span className="v2-brand-chevron" aria-hidden="true">⌄</span>
        </button>
        {projectMenuOpen ? <div className="v2-project-menu" role="menu" aria-label="Project menu">
          {onBackToLibrary ? <button role="menuitem" className="v2-project-menu-item" onClick={() => { setProjectMenuOpen(false); onBackToLibrary() }} type="button">Projects</button> : null}
          <button role="menuitem" className="v2-project-menu-item" disabled={readOnly} onClick={() => { setProjectMenuOpen(false); onNewProject() }} type="button">New Project</button>
          <button role="menuitem" className="v2-project-menu-item" disabled={readOnly} onClick={() => { setProjectMenuOpen(false); onLoadProject() }} type="button">Load Project</button>
          <div className="v2-project-menu-separator" role="separator" />
          <button role="menuitem" className="v2-project-menu-item" disabled={readOnly || saveState === 'saving'} onClick={() => { setProjectMenuOpen(false); onSaveProject() }} type="button"><span>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save'}</span>{saveState === 'idle' ? <kbd>⌘S</kbd> : null}</button>
          <button role="menuitem" className="v2-project-menu-item" disabled={readOnly || saveState === 'saving'} onClick={() => { setProjectMenuOpen(false); onSaveProjectAs() }} type="button">Save As…</button>
          {onExportProjectPackage ? <button role="menuitem" className="v2-project-menu-item" disabled={readOnly} onClick={() => { setProjectMenuOpen(false); onExportProjectPackage() }} type="button">Export Project Package…</button> : null}
          {onOpenProjectSettings ? <><div className="v2-project-menu-separator" role="separator" /><button role="menuitem" className="v2-project-menu-item" disabled={readOnly} onClick={() => { setProjectMenuOpen(false); onOpenProjectSettings() }} type="button">Project Settings…</button></> : null}
          {onOpenMediaManager ? <><div className="v2-project-menu-separator" role="separator" /><button role="menuitem" className="v2-project-menu-item" onClick={() => { setProjectMenuOpen(false); onOpenMediaManager() }} type="button">Media Manager{missingMediaCount > 0 ? <span className="v2-project-menu-count">{missingMediaCount}</span> : null}</button></> : null}
        </div> : null}
      </div>
      <div className="v2-project-context" title={fileError ?? projectName}>
        {editingProjectName && !readOnly ? <input className="v2-project-name-input v2-project-name-edit" aria-label="Project name" autoFocus size={Math.max(12, Math.min(36, projectNameDraft.length + 2))} value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={() => { if (!skipBlurRef.current) commitProjectRename(projectNameDraft) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitProjectRename(projectNameDraft) } else if (event.key === 'Escape') { event.preventDefault(); cancelProjectRename() } }} /> : <button className="v2-project-name" aria-label={`Rename project ${projectName}`} onClick={beginProjectRename} disabled={readOnly} type="button"><span className="v2-project-name-label">{projectName}</span>{isDirty ? <span className="v2-unsaved-dot" aria-label="Unsaved Project changes">•</span> : null}</button>}
        <span className="v2-project-scene">/ {sceneName}</span>
      </div>
      {saveState === 'saving' ? <span className="v2-save-status" role="status">Saving…</span> : saveState === 'saved' ? <span className="v2-save-status is-saved" role="status">Saved</span> : null}
      {fileError ? <span className="v2-file-error" role="alert">{fileError}</span> : null}
      <div className="v2-topbar-actions">
        <div className="v2-segmented" aria-label="View mode">
          <button className={view === 'blocking' ? 'is-active' : ''} onClick={() => onViewChange('blocking')}>Blocking View</button>
          <button className={view === 'camera' ? 'is-active' : ''} onClick={() => onViewChange('camera')}>Camera View</button>
          <button className={view === 'shot-list' ? 'is-active' : ''} onClick={() => onViewChange('shot-list')}>Shot List</button>
        </div>
        {onOpenAbout ? <button className="v2-button" onClick={onOpenAbout} type="button">About</button> : null}
        {onOpenLive ? <button className={`v2-button${liveRole ? ' is-active' : ''}`} onClick={onOpenLive} type="button" title="Open Live Review">{liveRole ? `Live · ${liveStatus === 'reconnecting' ? '…' : liveViewerCount}` : 'Live'}</button> : null}
        <button className="v2-button v2-button-primary" disabled={readOnly || exportDisabled} onClick={onExport} type="button">Export</button>
      </div>
    </header>
  )
}
