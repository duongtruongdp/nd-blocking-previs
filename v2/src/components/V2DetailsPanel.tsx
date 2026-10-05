import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ActorDocument, CameraDocument, PropDocument, TimelineDocument, TimelineProperty } from '../core/sceneDocument'
import { CAMERA_DATABASE, resolveCameraDefinition } from '../core/cameraDatabase'
import { activeCaptureAspect, cameraProjectionForDocument, horizontalFovDegrees, verticalFovDegrees } from '../runtime/cameraMath'
import { degreesToRadians, formatCameraNumber, parseCameraNumber, radiansToDegrees } from '../runtime/cameraInputMath'

type V2DetailsPanelProps = {
  actor: ActorDocument | null
  prop: PropDocument | null
  camera: CameraDocument | null
  activeCameraId: string | null
  timeline: TimelineDocument
  onCameraChange: (cameraId: string, changes: Partial<CameraDocument>) => void
  onSetActiveCamera: (cameraId: string) => void
  onAddKeyframe: (entityId: string, property: TimelineProperty) => void
}

export function V2DetailsPanel({ actor, prop, camera, activeCameraId, timeline, onCameraChange, onSetActiveCamera, onAddKeyframe }: V2DetailsPanelProps) {
  return (
    <aside className="v2-panel v2-details-panel" aria-label="Details">
      <span className="v2-eyebrow">Details</span>
      <h2>Inspector</h2>
      {camera ? <CameraInspector camera={camera} activeCameraId={activeCameraId} timeline={timeline} onCameraChange={onCameraChange} onSetActiveCamera={onSetActiveCamera} onAddKeyframe={onAddKeyframe} /> : actor ? <ActorInspector actor={actor} timeline={timeline} onAddKeyframe={onAddKeyframe} /> : prop ? <PropInspector prop={prop} /> : <EmptyInspector />}
    </aside>
  )
}

function CameraInspector({ camera, activeCameraId, timeline, onCameraChange, onSetActiveCamera, onAddKeyframe }: { camera: CameraDocument; activeCameraId: string | null; timeline: TimelineDocument; onCameraChange: V2DetailsPanelProps['onCameraChange']; onSetActiveCamera: V2DetailsPanelProps['onSetActiveCamera']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe'] }) {
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
        <NumericCameraInput label="Focal length" value={camera.focalLengthMm} unit="mm" min={0.1} max={1000} step={0.1} keyframe={{ active: hasTimelineKeyframe(timeline, camera.id, 'focalLengthMm'), onClick: () => onAddKeyframe(camera.id, 'focalLengthMm') }} onCommit={(value) => onCameraChange(camera.id, { focalLengthMm: value })} />
        <label>Type<select className="v2-inspector-select" value={camera.lensType} onChange={(event) => onCameraChange(camera.id, { lensType: event.target.value as CameraDocument['lensType'], anamorphicSqueeze: event.target.value === 'Spherical' ? 1 : camera.anamorphicSqueeze === 1 ? 1.33 : camera.anamorphicSqueeze })}><option value="Spherical">Spherical</option><option value="Anamorphic">Anamorphic</option></select></label>
      </div>
      {camera.lensType === 'Anamorphic' ? <label className="v2-inspector-label">Squeeze<select className="v2-inspector-select" value={camera.anamorphicSqueeze} onChange={(event) => onCameraChange(camera.id, { anamorphicSqueeze: Number(event.target.value) as CameraDocument['anamorphicSqueeze'] })}>{[1.33, 1.5, 1.8, 2].map((value) => <option key={value} value={value}>{value}:1</option>)}</select></label> : null}
      <span className="v2-eyebrow v2-inspector-subsection">Format</span>
      <div className="v2-camera-metrics v2-camera-format-metrics">
        <Metric label="Active Area" value={captureMode ? `${captureMode.activeWidthMm.toFixed(2)} × ${captureMode.activeHeightMm.toFixed(2)} mm` : '—'} />
        <Metric label="Resolution" value={captureMode ? `${captureMode.recordingWidthPx} × ${captureMode.recordingHeightPx}` : '—'} />
        <Metric label="Capture" value={captureMode ? `${activeCaptureAspect(captureMode).toFixed(2)}:1` : '—'} />
      </div>
      <div className="v2-camera-fov-section">
        <span className="v2-eyebrow">Field of View</span>
        <div className="v2-camera-metrics v2-camera-fov-metrics">
          <Metric label="Horizontal" value={captureMode ? `${horizontalFovDegrees(camera.focalLengthMm, captureMode).toFixed(1)}°` : '—'} />
          <Metric label="Vertical" value={captureMode ? `${verticalFovDegrees(camera.focalLengthMm, captureMode).toFixed(1)}°` : '—'} />
        </div>
      </div>
      <span className="v2-eyebrow v2-inspector-subsection">Delivery</span>
      <select className="v2-inspector-select" value={camera.deliveryAspectRatio} onChange={(event) => onCameraChange(camera.id, { deliveryAspectRatio: event.target.value as CameraDocument['deliveryAspectRatio'] })}><option value="sensor">Sensor / Native</option><option value="16:9">16:9</option><option value="1.85">1.85</option><option value="2.00">2.00</option><option value="2.39">2.39</option></select>
      <span className="v2-eyebrow v2-inspector-subsection">Transform</span>
      <span className="v2-eyebrow v2-inspector-field-label v2-inspector-keyframe-label">Position <KeyframeButton active={hasTimelineKeyframe(timeline, camera.id, 'position')} onClick={() => onAddKeyframe(camera.id, 'position')} label="Add Camera Position keyframe" /></span>
      <div className="v2-editable-vector">
        {(['X', 'Y', 'Z'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={camera.position[index]} unit="m" min={-1000} max={1000} step={0.01} onCommit={(value) => {
          const position = [...camera.position] as [number, number, number]
          position[index] = value
          onCameraChange(camera.id, { position })
        }} />)}
      </div>
      <span className="v2-eyebrow v2-inspector-field-label v2-inspector-keyframe-label">Orientation <KeyframeButton active={hasTimelineKeyframe(timeline, camera.id, 'rotation')} onClick={() => onAddKeyframe(camera.id, 'rotation')} label="Add Camera Rotation keyframe" /></span>
      <div className="v2-editable-vector">
        {(['Pitch', 'Heading', 'Roll'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={radiansToDegrees(camera.rotation[index])} unit="°" min={-360} max={360} step={0.1} onCommit={(value) => {
          const rotation = [...camera.rotation] as [number, number, number]
          rotation[index] = degreesToRadians(value)
          onCameraChange(camera.id, { rotation })
        }} />)}
      </div>
      <p className="v2-inspector-note">{definition?.manufacturer} {definition?.model}. Capture geometry is resolved from the selected production mode.</p>
    </div>
  )
}

function ActorInspector({ actor, timeline, onAddKeyframe }: { actor: ActorDocument; timeline: TimelineDocument; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe'] }) {
  return <EntityInspector eyebrow="Actor" name={actor.name} position={actor.position} rotation={actor.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, actor.id, 'position')} onClick={() => onAddKeyframe(actor.id, 'position')} label="Add Actor Position keyframe" />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, actor.id, 'heading')} onClick={() => onAddKeyframe(actor.id, 'heading')} label="Add Actor Heading keyframe" />}><span className="v2-eyebrow v2-inspector-subsection">Pose</span><span className="v2-readonly-value">Standing</span></EntityInspector>
}

function PropInspector({ prop }: { prop: PropDocument }) {
  return <EntityInspector eyebrow="Prop" name={prop.name} position={prop.position} rotation={prop.rotation} />
}

function EntityInspector({ eyebrow, name, position, rotation, positionKeyframe, rotationKeyframe, children }: { eyebrow: string; name: string; position: [number, number, number]; rotation: [number, number, number]; positionKeyframe?: ReactNode; rotationKeyframe?: ReactNode; children?: ReactNode }) {
  return <div className="v2-inspector-content"><span className="v2-eyebrow">{eyebrow}</span><h3>{name}</h3><div className="v2-inspector-divider" /><span className="v2-eyebrow v2-inspector-keyframe-label">Position {positionKeyframe}</span><ReadonlyVector values={position} suffix="m" labels={['X', 'Y', 'Z']} /><span className="v2-eyebrow v2-inspector-subsection v2-inspector-keyframe-label">Rotation {rotationKeyframe}</span><ReadonlyVector values={rotation.map((value) => Math.round((value * 180) / Math.PI)) as [number, number, number]} suffix="°" labels={['X', 'Y', 'Z']} />{children}<p className="v2-inspector-note">Read-only scene values for the V2 blocking foundation.</p></div>
}

function ReadonlyVector({ values, suffix, labels }: { values: [number, number, number]; suffix: string; labels: string[] }) {
  return <div className="v2-readonly-fields">{values.map((value, index) => <label key={labels[index]}><span>{labels[index]}</span><span className="v2-readonly-value">{value.toFixed(suffix === 'm' ? 2 : 0)} <small>{suffix}</small></span></label>)}</div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="v2-camera-metric"><span>{label}</span><strong>{value}</strong></div>
}

function NumericCameraInput({ label, value, unit, min, max, step, keyframe, onCommit }: { label: string; value: number; unit: string; min: number; max: number; step: number; keyframe?: { active: boolean; onClick: () => void }; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(() => formatCameraNumber(value))
  const [editing, setEditing] = useState(false)

  const commit = () => {
    const parsed = parseCameraNumber(draft, min, max)
    if (parsed === null) {
      setDraft(formatCameraNumber(value))
      setEditing(false)
      return
    }
    setDraft(formatCameraNumber(parsed))
    setEditing(false)
    if (parsed !== value) onCommit(parsed)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setDraft(formatCameraNumber(value))
      event.currentTarget.blur()
    }
  }

  return <label className="v2-editable-number"><span className="v2-inspector-keyframe-label">{label}{keyframe ? <KeyframeButton active={keyframe.active} onClick={keyframe.onClick} label={`Add ${label} keyframe`} /> : null}</span><span className="v2-editable-number-field"><input type="number" inputMode="decimal" step={step} min={min} max={max} value={editing ? draft : formatCameraNumber(value)} onFocus={() => { setDraft(formatCameraNumber(value)); setEditing(true) }} onChange={(event) => { setEditing(true); setDraft(event.target.value) }} onBlur={commit} onKeyDown={handleKeyDown} /><small>{unit}</small></span></label>
}

function hasTimelineKeyframe(timeline: TimelineDocument, entityId: string, property: TimelineProperty): boolean {
  return timeline.tracks.some((track) => track.entityId === entityId && track.property === property && track.keyframes.some((keyframe) => keyframe.frame === timeline.currentFrame))
}

function KeyframeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button className={`v2-keyframe-button${active ? ' is-active' : ''}`} aria-label={label} title={label} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick() }} type="button">{active ? '◆' : '◇'}</button>
}

function EmptyInspector() {
  return <div className="v2-details-empty"><div className="v2-details-empty-icon">◇</div><strong>Select something in the scene</strong><p>Blocking settings will appear here when a scene element is selected.</p></div>
}
