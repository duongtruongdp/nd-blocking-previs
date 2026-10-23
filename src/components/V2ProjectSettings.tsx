import { CAMERA_DATABASE } from '../core/cameraDatabase'

type V2ProjectSettingsProps = {
  cameraModelId: string
  readOnly?: boolean
  onCameraModelChange: (cameraModelId: string) => void
  onClose: () => void
}

export function V2ProjectSettings({ cameraModelId, readOnly = false, onCameraModelChange, onClose }: V2ProjectSettingsProps) {
  return <div className="v2-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="v2-project-settings-modal" role="dialog" aria-modal="true" aria-labelledby="v2-project-settings-title">
      <div className="v2-modal-heading"><div><span className="v2-eyebrow">Project Settings</span><h2 id="v2-project-settings-title">Camera</h2></div><button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close Project Settings">×</button></div>
      <label className="v2-project-settings-field">
        <span>Default Camera</span>
        <select className="v2-inspector-select" value={cameraModelId} disabled={readOnly} onChange={(event) => onCameraModelChange(event.target.value)}>
          {CAMERA_DATABASE.map((camera, index) => <option key={`${camera.id}-${index}`} value={camera.id}>{camera.manufacturer} · {camera.model}</option>)}
        </select>
        <small>Used when creating new cameras in this project.</small>
      </label>
      <div className="v2-modal-actions"><button className="v2-small-action" onClick={onClose} type="button">Done</button></div>
    </section>
  </div>
}
