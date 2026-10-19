import { useRef, useState } from 'react'
import type { LiveReviewRole } from '../liveReview/protocol'
import type { LiveReviewTransportStatus } from '../liveReview/liveReviewTransport'

type V2TopBarProps = {
  view: 'blocking' | 'camera' | 'shot-list'
  projectName: string
  sceneName: string
  isDirty: boolean
  fileError: string | null
  onViewChange: (view: 'blocking' | 'camera' | 'shot-list') => void
  onNewProject: () => void
  onBackToLibrary?: () => void
  onSaveProject: () => void
  onSaveProjectAs: () => void
  onLoadProject: () => void
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

export function V2TopBar({ view, projectName, sceneName, isDirty, fileError, onViewChange, onNewProject, onBackToLibrary, onSaveProject, onSaveProjectAs, onLoadProject, onProjectNameChange, onExport, onOpenAbout, exportDisabled = false, readOnly = false, liveStatus = 'idle', liveRole = null, liveViewerCount = 0, onOpenLive }: V2TopBarProps) {
  const skipBlurRef = useRef(false)
  const [editingProjectName, setEditingProjectName] = useState(false)
  const [projectNameDraft, setProjectNameDraft] = useState(projectName)

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
      <div className="v2-brand">
        <span className="v2-brand-mark">ND</span>
        <span>Blocking &amp; Previs</span>
      </div>
      <div className="v2-project-context" title={fileError ?? projectName}>
        {editingProjectName && !readOnly ? <input className="v2-project-name-input v2-project-name-edit" aria-label="Project name" autoFocus size={Math.max(12, Math.min(36, projectNameDraft.length + 2))} value={projectNameDraft} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={() => { if (!skipBlurRef.current) commitProjectRename(projectNameDraft) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitProjectRename(projectNameDraft) } else if (event.key === 'Escape') { event.preventDefault(); cancelProjectRename() } }} /> : <button className="v2-project-name" aria-label={`Rename project ${projectName}`} onClick={beginProjectRename} disabled={readOnly} type="button"><span className="v2-project-name-label">{projectName}</span>{isDirty ? <span className="v2-unsaved-dot" aria-label="Unsaved Project changes">•</span> : null}</button>}
        <span className="v2-project-scene">/ {sceneName}</span>
      </div>
      {fileError ? <span className="v2-file-error" role="alert">{fileError}</span> : null}
      <div className="v2-topbar-actions">
        <div className="v2-file-actions" aria-label="Project file actions">
          {onBackToLibrary ? <button className="v2-button" onClick={onBackToLibrary} title="Back to Project Library" type="button">Projects</button> : null}
          <button className="v2-button" disabled={readOnly} onClick={onNewProject} title="New Project" type="button">New</button>
          <button className="v2-button" disabled={readOnly} onClick={onLoadProject} title="Load Project" type="button">Load</button>
          <button className="v2-button" disabled={readOnly} onClick={onSaveProject} title="Save Project (.ndblock)" type="button">Save</button>
          <button className="v2-button" disabled={readOnly} onClick={onSaveProjectAs} title="Save Project As (.ndblock)" type="button">Save As</button>
        </div>
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
