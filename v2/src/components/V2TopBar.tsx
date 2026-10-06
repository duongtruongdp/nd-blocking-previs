import { useRef } from 'react'

type V2TopBarProps = {
  view: 'blocking' | 'camera'
  projectName: string
  sceneName: string
  isDirty: boolean
  fileError: string | null
  onViewChange: (view: 'blocking' | 'camera') => void
  onNewProject: () => void
  onSaveProject: () => void
  onLoadProject: (file: File) => void
  onExport: () => void
  exportDisabled?: boolean
}

export function V2TopBar({ view, projectName, sceneName, isDirty, fileError, onViewChange, onNewProject, onSaveProject, onLoadProject, onExport, exportDisabled = false }: V2TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <header className="v2-topbar">
      <div className="v2-brand">
        <span className="v2-brand-mark">ND</span>
        <span>ND Blocking &amp; Previs</span>
      </div>
      <div className="v2-project-context" title={fileError ?? undefined}>
        <span className="v2-project-name">{projectName}{isDirty ? <span className="v2-unsaved-dot" aria-label="Unsaved Project changes">•</span> : null}</span>
        <span className="v2-project-scene">/ {sceneName}</span>
      </div>
      {fileError ? <span className="v2-file-error" role="alert">{fileError}</span> : null}
      <div className="v2-topbar-actions">
        <div className="v2-file-actions" aria-label="Project file actions">
          <button className="v2-button" onClick={onNewProject} title="New Project" type="button">New</button>
          <button className="v2-button" onClick={() => fileInputRef.current?.click()} title="Load Project" type="button">Load</button>
          <button className="v2-button" onClick={onSaveProject} title="Save Project (.ndblock)" type="button">Save</button>
          <input ref={fileInputRef} className="v2-hidden-file-input" type="file" accept=".ndblock,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onLoadProject(file); event.currentTarget.value = '' }} />
        </div>
        <div className="v2-segmented" aria-label="View mode">
          <button className={view === 'blocking' ? 'is-active' : ''} onClick={() => onViewChange('blocking')}>Blocking View</button>
          <button className={view === 'camera' ? 'is-active' : ''} onClick={() => onViewChange('camera')}>Camera View</button>
        </div>
        <button className="v2-button v2-button-primary" disabled={exportDisabled} onClick={onExport} type="button">Export</button>
      </div>
    </header>
  )
}
