import { useRef } from 'react'

type V2TopBarProps = {
  view: 'blocking' | 'camera'
  sceneName: string
  isDirty: boolean
  fileError: string | null
  onViewChange: (view: 'blocking' | 'camera') => void
  onNewScene: () => void
  onSaveScene: () => void
  onLoadScene: (file: File) => void
  onExport: () => void
  exportDisabled?: boolean
}

export function V2TopBar({ view, sceneName, isDirty, fileError, onViewChange, onNewScene, onSaveScene, onLoadScene, onExport, exportDisabled = false }: V2TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <header className="v2-topbar">
      <div className="v2-brand">
        <span className="v2-brand-mark">ND</span>
        <span>ND Blocking &amp; Previs</span>
      </div>
      <div className="v2-scene-title" title={fileError ?? undefined}>{sceneName}{isDirty ? <span className="v2-unsaved-dot" aria-label="Unsaved changes">•</span> : null}</div>
      {fileError ? <span className="v2-file-error" role="alert">{fileError}</span> : null}
      <div className="v2-topbar-actions">
        <div className="v2-file-actions" aria-label="Scene file actions">
          <button className="v2-button" onClick={onNewScene} type="button">New</button>
          <button className="v2-button" onClick={() => fileInputRef.current?.click()} type="button">Load</button>
          <button className="v2-button" onClick={onSaveScene} type="button">Save</button>
          <input ref={fileInputRef} className="v2-hidden-file-input" type="file" accept=".ndscene,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onLoadScene(file); event.currentTarget.value = '' }} />
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
