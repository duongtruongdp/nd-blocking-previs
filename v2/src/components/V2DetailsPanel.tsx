import type { ReactNode } from 'react'
import type { ActorDocument, CameraDocument, PropDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE, resolveCameraDefinition } from '../core/cameraDatabase'
import { cameraProjectionForDocument, horizontalFovDegrees, verticalFovDegrees } from '../runtime/cameraMath'

type V2DetailsPanelProps = {
  actor: ActorDocument | null
  prop: PropDocument | null
  camera: CameraDocument | null
  activeCameraId: string | null
  onCameraChange: (cameraId: string, changes: Partial<CameraDocument>) => void
  onSetActiveCamera: (cameraId: string) => void
}

const FOCAL_LENGTHS = [14, 18, 21, 24, 28, 32, 35, 40, 50, 65, 75, 85, 100, 135]

export function V2DetailsPanel({ actor, prop, camera, activeCameraId, onCameraChange, onSetActiveCamera }: V2DetailsPanelProps) {
  return (
    <aside className="v2-panel v2-details-panel" aria-label="Details">
      <span className="v2-eyebrow">Details</span>
      <h2>Inspector</h2>
      {camera ? <CameraInspector camera={camera} activeCameraId={activeCameraId} onCameraChange={onCameraChange} onSetActiveCamera={onSetActiveCamera} /> : actor ? <ActorInspector actor={actor} /> : prop ? <PropInspector prop={prop} /> : <EmptyInspector />}
    </aside>
  )
}

function CameraInspector({ camera, activeCameraId, onCameraChange, onSetActiveCamera }: { camera: CameraDocument; activeCameraId: string | null; onCameraChange: V2DetailsPanelProps['onCameraChange']; onSetActiveCamera: V2DetailsPanelProps['onSetActiveCamera'] }) {
  const definition = resolveCameraDefinition(camera.cameraDefinitionId)
  const projection = cameraProjectionForDocument(camera)
  const captureMode = projection?.captureMode
  return (
    <div className="v2-inspector-content">
      <span className="v2-eyebrow">Camera</span>
      <h3>{camera.name}</h3>
      <button className={`v2-inspector-action${activeCameraId === camera.id ? ' is-active' : ''}`} onClick={() => onSetActiveCamera(camera.id)} type="button">{activeCameraId === camera.id ? 'Active Camera' : 'Set Active Camera'}</button>
      <div className="v2-inspector-divider" />
      <span className="v2-eyebrow">Camera Model</span>
      <select className="v2-inspector-select" value={camera.cameraDefinitionId} onChange={(event) => {
        const next = CAMERA_DATABASE.find((item) => item.id === event.target.value) ?? CAMERA_DATABASE[0]
        onCameraChange(camera.id, { cameraDefinitionId: next.id, captureModeId: next.captureModes[0].id })
      }}>
        {CAMERA_DATABASE.map((item) => <option key={item.id} value={item.id}>{item.manufacturer} · {item.model}</option>)}
      </select>
      <span className="v2-eyebrow v2-inspector-subsection">Capture Mode</span>
      <select className="v2-inspector-select" value={camera.captureModeId} onChange={(event) => onCameraChange(camera.id, { captureModeId: event.target.value })}>
        {definition?.captureModes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <span className="v2-eyebrow v2-inspector-subsection">Lens</span>
      <div className="v2-inspector-inline-fields">
        <label>Focal length<select className="v2-inspector-select" value={camera.focalLengthMm} onChange={(event) => onCameraChange(camera.id, { focalLengthMm: Number(event.target.value) })}>{FOCAL_LENGTHS.map((value) => <option key={value} value={value}>{value}mm</option>)}</select></label>
        <label>Type<select className="v2-inspector-select" value={camera.lensType} onChange={(event) => onCameraChange(camera.id, { lensType: event.target.value as CameraDocument['lensType'], anamorphicSqueeze: event.target.value === 'Spherical' ? 1 : camera.anamorphicSqueeze === 1 ? 1.33 : camera.anamorphicSqueeze })}><option value="Spherical">Spherical</option><option value="Anamorphic">Anamorphic</option></select></label>
      </div>
      {camera.lensType === 'Anamorphic' ? <label className="v2-inspector-label">Squeeze<select className="v2-inspector-select" value={camera.anamorphicSqueeze} onChange={(event) => onCameraChange(camera.id, { anamorphicSqueeze: Number(event.target.value) as CameraDocument['anamorphicSqueeze'] })}>{[1.33, 1.5, 1.8, 2].map((value) => <option key={value} value={value}>{value}:1</option>)}</select></label> : null}
      <span className="v2-eyebrow v2-inspector-subsection">Delivery Frame</span>
      <select className="v2-inspector-select" value={camera.deliveryAspectRatio} onChange={(event) => onCameraChange(camera.id, { deliveryAspectRatio: event.target.value as CameraDocument['deliveryAspectRatio'] })}><option value="sensor">Sensor / Native</option><option value="16:9">16:9</option><option value="1.85">1.85</option><option value="2.00">2.00</option><option value="2.39">2.39</option></select>
      <span className="v2-eyebrow v2-inspector-subsection">Position</span>
      <ReadonlyVector values={camera.position} suffix="m" labels={['X', 'Y', 'Z']} />
      <span className="v2-eyebrow v2-inspector-subsection">Orientation</span>
      <ReadonlyVector values={camera.rotation.map((value) => Math.round((value * 180) / Math.PI)) as [number, number, number]} suffix="°" labels={['Pitch', 'Heading', 'Roll']} />
      <span className="v2-eyebrow v2-inspector-subsection">Capture</span>
      <div className="v2-camera-metrics">
        <Metric label="Active area" value={captureMode ? `${captureMode.activeWidthMm.toFixed(2)} × ${captureMode.activeHeightMm.toFixed(2)} mm` : '—'} />
        <Metric label="Recording" value={captureMode ? `${captureMode.recordingWidthPx} × ${captureMode.recordingHeightPx}` : '—'} />
        <Metric label="Capture aspect" value={captureMode ? `${(captureMode.activeWidthMm / captureMode.activeHeightMm).toFixed(2)}:1` : '—'} />
        <Metric label="Horizontal FOV" value={captureMode ? `${horizontalFovDegrees(camera.focalLengthMm, captureMode).toFixed(1)}°` : '—'} />
        <Metric label="Vertical FOV" value={captureMode ? `${verticalFovDegrees(camera.focalLengthMm, captureMode).toFixed(1)}°` : '—'} />
      </div>
      <p className="v2-inspector-note">{definition?.manufacturer} {definition?.model}. Capture geometry is resolved from the selected production mode.</p>
    </div>
  )
}

function ActorInspector({ actor }: { actor: ActorDocument }) {
  return <EntityInspector eyebrow="Actor" name={actor.name} position={actor.position} rotation={actor.rotation}><span className="v2-eyebrow v2-inspector-subsection">Pose</span><span className="v2-readonly-value">Standing</span></EntityInspector>
}

function PropInspector({ prop }: { prop: PropDocument }) {
  return <EntityInspector eyebrow="Prop" name={prop.name} position={prop.position} rotation={prop.rotation} />
}

function EntityInspector({ eyebrow, name, position, rotation, children }: { eyebrow: string; name: string; position: [number, number, number]; rotation: [number, number, number]; children?: ReactNode }) {
  return <div className="v2-inspector-content"><span className="v2-eyebrow">{eyebrow}</span><h3>{name}</h3><div className="v2-inspector-divider" /><span className="v2-eyebrow">Position</span><ReadonlyVector values={position} suffix="m" labels={['X', 'Y', 'Z']} /><span className="v2-eyebrow v2-inspector-subsection">Rotation</span><ReadonlyVector values={rotation.map((value) => Math.round((value * 180) / Math.PI)) as [number, number, number]} suffix="°" labels={['X', 'Y', 'Z']} />{children}<p className="v2-inspector-note">Read-only scene values for the V2 blocking foundation.</p></div>
}

function ReadonlyVector({ values, suffix, labels }: { values: [number, number, number]; suffix: string; labels: string[] }) {
  return <div className="v2-readonly-fields">{values.map((value, index) => <label key={labels[index]}><span>{labels[index]}</span><span className="v2-readonly-value">{value.toFixed(suffix === 'm' ? 2 : 0)} <small>{suffix}</small></span></label>)}</div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="v2-camera-metric"><span>{label}</span><strong>{value}</strong></div>
}

function EmptyInspector() {
  return <div className="v2-details-empty"><div className="v2-details-empty-icon">◇</div><strong>Select something in the scene</strong><p>Blocking settings will appear here when a scene element is selected.</p></div>
}
