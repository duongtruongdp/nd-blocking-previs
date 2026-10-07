import { useState, type KeyboardEvent, type ReactNode } from 'react'
import type { ActorDocument, CameraDocument, OpeningDocument, PropDocument, SunDocument, TimelineDocument, TimelineProperty, WallDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE, CAMERA_MANUFACTURERS, camerasForManufacturer, defaultCaptureModeForDefinition, resolveCameraDefinition } from '../core/cameraDatabase'
import { activeCaptureAspect, cameraProjectionForDocument } from '../runtime/cameraMath'
import { degreesToRadians, formatCameraNumber, parseCameraNumber, radiansToDegrees } from '../runtime/cameraInputMath'
import { FrameGuideInspector } from './FrameGuideInspector'

type V2DetailsPanelProps = {
  actor: ActorDocument | null
  prop: PropDocument | null
  wall: WallDocument | null
  opening: OpeningDocument | null
  sun: SunDocument | null
  camera: CameraDocument | null
  activeCameraId: string | null
  timeline: TimelineDocument
  onActorChange: (actorId: string, changes: Partial<ActorDocument>) => void
  onPropChange: (propId: string, changes: Partial<PropDocument>) => void
  onCameraChange: (cameraId: string, changes: Partial<CameraDocument>) => void
  onWallChange: (wallId: string, changes: Partial<WallDocument>) => void
  onOpeningChange: (openingId: string, changes: Partial<OpeningDocument>) => void
  onSunChange: (sunId: string, changes: Partial<SunDocument>) => void
  onDuplicateEntity: (entityId: string) => void
  onDeleteEntity: (entityId: string) => void
  onSetActiveCamera: (cameraId: string) => void
  onAddKeyframe: (entityId: string, property: TimelineProperty) => void
  selectedFrameGuideId: string | null
  onFrameGuideSelection: (guideId: string | null) => void
}

export function V2DetailsPanel({ actor, prop, wall, opening, sun, camera, activeCameraId, timeline, onActorChange, onPropChange, onCameraChange, onWallChange, onOpeningChange, onSunChange, onDuplicateEntity, onDeleteEntity, onSetActiveCamera, onAddKeyframe, selectedFrameGuideId, onFrameGuideSelection }: V2DetailsPanelProps) {
  return (
    <aside className="v2-panel v2-details-panel" aria-label="Details">
      <span className="v2-eyebrow">Details</span>
      {camera ? <CameraInspector camera={camera} activeCameraId={activeCameraId} timeline={timeline} onCameraChange={onCameraChange} onSetActiveCamera={onSetActiveCamera} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} selectedFrameGuideId={selectedFrameGuideId} onFrameGuideSelection={onFrameGuideSelection} /> : actor ? <ActorInspector actor={actor} timeline={timeline} onActorChange={onActorChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} /> : prop ? <PropInspector prop={prop} timeline={timeline} onPropChange={onPropChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} /> : wall ? <WallInspector wall={wall} timeline={timeline} onWallChange={onWallChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} /> : opening ? <OpeningInspector opening={opening} timeline={timeline} onOpeningChange={onOpeningChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} /> : sun ? <SunInspector sun={sun} timeline={timeline} onSunChange={onSunChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} /> : <EmptyInspector />}
    </aside>
  )
}

function CameraInspector({ camera, activeCameraId, timeline, onCameraChange, onSetActiveCamera, onAddKeyframe, onDuplicateEntity, onDeleteEntity, selectedFrameGuideId, onFrameGuideSelection }: { camera: CameraDocument; activeCameraId: string | null; timeline: TimelineDocument; onCameraChange: V2DetailsPanelProps['onCameraChange']; onSetActiveCamera: V2DetailsPanelProps['onSetActiveCamera']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity']; selectedFrameGuideId: string | null; onFrameGuideSelection: V2DetailsPanelProps['onFrameGuideSelection'] }) {
  const definition = resolveCameraDefinition(camera.cameraDefinitionId)
  const projection = cameraProjectionForDocument(camera)
  const captureMode = projection?.captureMode
  return (
    <div className="v2-inspector-content">
      <span className="v2-eyebrow">Camera</span>
      <h3>{camera.name}</h3>
      <span className="v2-eyebrow v2-inspector-subsection">Appearance</span>
      <ColorField key={camera.id} value={camera.proxyColor} onCommit={(value) => onCameraChange(camera.id, { proxyColor: value })} />
      <button className={`v2-inspector-action${activeCameraId === camera.id ? ' is-active' : ''}`} onClick={() => onSetActiveCamera(camera.id)} type="button">{activeCameraId === camera.id ? 'Active Camera' : 'Set Active Camera'}</button>
      <div className="v2-inspector-divider" />
      <span className="v2-eyebrow">Manufacturer</span>
      <select className="v2-inspector-select" value={definition?.manufacturer ?? CAMERA_MANUFACTURERS[0]} onChange={(event) => {
        const next = camerasForManufacturer(event.target.value)[0] ?? CAMERA_DATABASE[0]
        onCameraChange(camera.id, { cameraDefinitionId: next.id, captureModeId: defaultCaptureModeForDefinition(next).id })
      }}>
        {CAMERA_MANUFACTURERS.map((manufacturer) => <option key={manufacturer} value={manufacturer}>{manufacturer}</option>)}
      </select>
      <span className="v2-eyebrow v2-inspector-subsection">Camera Model</span>
      <select className="v2-inspector-select" value={camera.cameraDefinitionId} onChange={(event) => {
        const next = CAMERA_DATABASE.find((item) => item.id === event.target.value) ?? CAMERA_DATABASE[0]
        onCameraChange(camera.id, { cameraDefinitionId: next.id, captureModeId: defaultCaptureModeForDefinition(next).id })
      }}>
        {camerasForManufacturer(definition?.manufacturer ?? CAMERA_MANUFACTURERS[0]).map((item) => <option key={item.id} value={item.id}>{item.model}</option>)}
      </select>
      <span className="v2-eyebrow v2-inspector-subsection">Capture Mode</span>
      <select className="v2-inspector-select" value={camera.captureModeId} onChange={(event) => onCameraChange(camera.id, { captureModeId: event.target.value })}>
        {definition?.captureModes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <span className="v2-eyebrow v2-inspector-subsection">Lens</span>
      <div className="v2-inspector-inline-fields">
        <NumericCameraInput label="Focal length" value={camera.focalLengthMm} unit="mm" min={0.1} max={1000} step={0.1} keyframe={{ active: hasTimelineKeyframe(timeline, camera.id, 'focalLengthMm'), hasTrack: hasTimelineTrack(timeline, camera.id, 'focalLengthMm'), onClick: () => onAddKeyframe(camera.id, 'focalLengthMm') }} onCommit={(value) => onCameraChange(camera.id, { focalLengthMm: value })} />
        <label>Type<select className="v2-inspector-select" value={camera.lensType} onChange={(event) => onCameraChange(camera.id, { lensType: event.target.value as CameraDocument['lensType'], anamorphicSqueeze: event.target.value === 'Spherical' ? 1 : camera.anamorphicSqueeze === 1 ? 1.33 : camera.anamorphicSqueeze })}><option value="Spherical">Spherical</option><option value="Anamorphic">Anamorphic</option></select></label>
      </div>
      {camera.lensType === 'Anamorphic' ? <label className="v2-inspector-label">Squeeze<select className="v2-inspector-select" value={camera.anamorphicSqueeze} onChange={(event) => onCameraChange(camera.id, { anamorphicSqueeze: Number(event.target.value) as CameraDocument['anamorphicSqueeze'] })}>{[1.3, 1.33, 1.5, 1.6, 1.8, 2].map((value) => <option key={value} value={value}>{value}:1</option>)}</select></label> : null}
      <span className="v2-eyebrow v2-inspector-subsection">Format</span>
      <div className="v2-camera-metrics v2-camera-format-metrics">
        <Metric label="Active Area" value={captureMode ? `${captureMode.activeWidthMm.toFixed(2)} × ${captureMode.activeHeightMm.toFixed(2)} mm` : '—'} />
        <Metric label="Resolution" value={captureMode ? `${captureMode.recordingWidthPx} × ${captureMode.recordingHeightPx}` : '—'} />
        <Metric label="Capture" value={captureMode ? `${activeCaptureAspect(captureMode).toFixed(2)}:1` : '—'} />
        {projection && projection.squeeze > 1 ? <Metric label="Desqueezed" value={`${projection.displayAspect.toFixed(2)}:1`} /> : null}
        <Metric label="Mount" value={definition?.lensMounts?.join(' / ') ?? '—'} />
      </div>
      <div className="v2-camera-fov-section">
        <span className="v2-eyebrow">Field of View</span>
        <div className="v2-camera-metrics v2-camera-fov-metrics">
          <Metric label="Horizontal" value={projection ? `${projection.horizontalFov.toFixed(1)}°` : '—'} />
          <Metric label="Vertical" value={projection ? `${projection.fov.toFixed(1)}°` : '—'} />
        </div>
      </div>
      <span className="v2-eyebrow v2-inspector-subsection">Delivery</span>
      <select className="v2-inspector-select" value={camera.deliveryAspectRatio} onChange={(event) => onCameraChange(camera.id, { deliveryAspectRatio: event.target.value as CameraDocument['deliveryAspectRatio'] })}><option value="sensor">Sensor / Native</option><option value="16:9">16:9</option><option value="1.85">1.85</option><option value="2.00">2.00</option><option value="2.39">2.39</option></select>
      <FrameGuideInspector camera={camera} selectedGuideId={selectedFrameGuideId} onSelectGuide={onFrameGuideSelection} onCameraChange={onCameraChange} />
      <span className="v2-eyebrow v2-inspector-subsection">Transform</span>
      <span className="v2-eyebrow v2-inspector-field-label v2-inspector-keyframe-label">Position <KeyframeButton active={hasTimelineKeyframe(timeline, camera.id, 'position')} hasTrack={hasTimelineTrack(timeline, camera.id, 'position')} onClick={() => onAddKeyframe(camera.id, 'position')} label="Add Camera Position keyframe" /></span>
      <div className="v2-editable-vector">
        {(['X', 'Y', 'Z'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={camera.position[index]} unit="m" min={-1000} max={1000} step={0.01} onCommit={(value) => {
          const position = [...camera.position] as [number, number, number]
          position[index] = value
          onCameraChange(camera.id, { position })
        }} />)}
      </div>
      <span className="v2-eyebrow v2-inspector-field-label v2-inspector-keyframe-label">Orientation <KeyframeButton active={hasTimelineKeyframe(timeline, camera.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, camera.id, 'rotation')} onClick={() => onAddKeyframe(camera.id, 'rotation')} label="Add Camera Rotation keyframe" /></span>
      <div className="v2-editable-vector">
        {(['Pitch', 'Heading', 'Roll'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={radiansToDegrees(camera.rotation[index])} unit="°" min={-360} max={360} step={0.1} onCommit={(value) => {
          const rotation = [...camera.rotation] as [number, number, number]
          rotation[index] = degreesToRadians(value)
          onCameraChange(camera.id, { rotation })
        }} />)}
      </div>
      <EntityActions onDuplicate={() => onDuplicateEntity(camera.id)} onDelete={() => onDeleteEntity(camera.id)} />
      <p className="v2-inspector-note">{definition?.manufacturer} {definition?.model}. Capture geometry is resolved from the selected production mode.</p>
    </div>
  )
}

function ActorInspector({ actor, timeline, onActorChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity }: { actor: ActorDocument; timeline: TimelineDocument; onActorChange: V2DetailsPanelProps['onActorChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity'] }) {
  return <EntityInspector eyebrow="Actor" name={actor.name} position={actor.position} rotation={actor.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, actor.id, 'position')} hasTrack={hasTimelineTrack(timeline, actor.id, 'position')} onClick={() => onAddKeyframe(actor.id, 'position')} label="Add Actor Position keyframe" />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, actor.id, 'heading')} hasTrack={hasTimelineTrack(timeline, actor.id, 'heading')} onClick={() => onAddKeyframe(actor.id, 'heading')} label="Add Actor Heading keyframe" />}><span className="v2-eyebrow v2-inspector-subsection">Appearance</span><ColorField key={actor.id} value={actor.appearance.primaryColor} onCommit={(value) => onActorChange(actor.id, { appearance: { ...actor.appearance, primaryColor: value } })} /><span className="v2-eyebrow v2-inspector-subsection">Pose</span><span className="v2-readonly-value">Standing</span><EntityActions onDuplicate={() => onDuplicateEntity(actor.id)} onDelete={() => onDeleteEntity(actor.id)} /></EntityInspector>
}

function PropInspector({ prop, timeline, onPropChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity }: { prop: PropDocument; timeline: TimelineDocument; onPropChange: V2DetailsPanelProps['onPropChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity'] }) {
  const primitive = ['cube', 'sphere', 'cylinder'].includes(prop.propType ?? prop.shape)
  const scale = prop.scale ?? [1, 1, 1]
  return <EntityInspector eyebrow="Prop" name={prop.name} position={prop.position} rotation={prop.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, prop.id, 'position')} hasTrack={hasTimelineTrack(timeline, prop.id, 'position')} onClick={() => onAddKeyframe(prop.id, 'position')} label="Add Prop Position keyframe" />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, prop.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, prop.id, 'rotation')} onClick={() => onAddKeyframe(prop.id, 'rotation')} label="Add Prop Rotation keyframe" />}><span className="v2-eyebrow v2-inspector-subsection">Appearance</span><ColorField key={prop.id} value={prop.primaryColor} onCommit={(value) => onPropChange(prop.id, { primaryColor: value })} />{primitive ? <><span className="v2-eyebrow v2-inspector-subsection">Scale</span><div className="v2-editable-vector">{(['X', 'Y', 'Z'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={scale[index]} unit="×" min={0.05} max={100} step={0.01} onCommit={(value) => { const next = [...scale] as [number, number, number]; next[index] = value; onPropChange(prop.id, { scale: next }) }} />)}</div></> : null}<span className="v2-eyebrow v2-inspector-subsection">Type</span><span className="v2-readonly-value">{prop.propType ?? prop.shape}</span><EntityActions onDuplicate={() => onDuplicateEntity(prop.id)} onDelete={() => onDeleteEntity(prop.id)} /></EntityInspector>
}

function WallInspector({ wall, timeline, onWallChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity }: { wall: WallDocument; timeline: TimelineDocument; onWallChange: V2DetailsPanelProps['onWallChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity'] }) {
  return <EntityInspector eyebrow="Wall" name={wall.name} position={wall.position} rotation={wall.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, wall.id, 'position')} hasTrack={hasTimelineTrack(timeline, wall.id, 'position')} onClick={() => onAddKeyframe(wall.id, 'position')} label="Add Wall Position keyframe" />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, wall.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, wall.id, 'rotation')} onClick={() => onAddKeyframe(wall.id, 'rotation')} label="Add Wall Rotation keyframe" />}><span className="v2-eyebrow v2-inspector-subsection">Appearance</span><ColorField key={wall.id} value={wall.primaryColor} onCommit={(value) => onWallChange(wall.id, { primaryColor: value })} /><span className="v2-eyebrow v2-inspector-subsection">Construction</span><div className="v2-editable-vector"><NumericCameraInput label="Length" value={wall.length} unit="m" min={0.1} max={100} step={0.01} onCommit={(value) => onWallChange(wall.id, { length: value })} /><NumericCameraInput label="Height" value={wall.height} unit="m" min={0.1} max={30} step={0.01} onCommit={(value) => onWallChange(wall.id, { height: value })} /><NumericCameraInput label="Thickness" value={wall.thickness} unit="m" min={0.02} max={5} step={0.01} onCommit={(value) => onWallChange(wall.id, { thickness: value })} /></div><EntityActions onDuplicate={() => onDuplicateEntity(wall.id)} onDelete={() => onDeleteEntity(wall.id)} /><p className="v2-inspector-note">A lightweight scenic wall segment. Openings remain separate scene elements for future refinement.</p></EntityInspector>
}

function OpeningInspector({ opening, timeline, onOpeningChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity }: { opening: OpeningDocument; timeline: TimelineDocument; onOpeningChange: V2DetailsPanelProps['onOpeningChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity'] }) {
  const wallPlacement = opening.wallId ? `Attached to ${opening.wallId}${opening.offsetAlongWallMeters === undefined ? '' : ` · ${opening.offsetAlongWallMeters.toFixed(2)} m along wall`}` : 'Free-standing opening element'
  const isWindow = opening.openingType === 'window'
  const openAngle = isWindow ? Math.min(90, Math.max(0, opening.openAngle ?? 0)) : opening.openAngle ?? 0
  return <EntityInspector eyebrow={isWindow ? 'Window' : 'Door'} name={opening.name} position={opening.position} rotation={opening.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, opening.id, 'position')} hasTrack={hasTimelineTrack(timeline, opening.id, 'position')} onClick={() => onAddKeyframe(opening.id, 'position')} label={`Add ${opening.openingType} Position keyframe`} />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, opening.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, opening.id, 'rotation')} onClick={() => onAddKeyframe(opening.id, 'rotation')} label={`Add ${opening.openingType} Rotation keyframe`} />}>
    <span className="v2-eyebrow v2-inspector-subsection">Appearance</span>
    <ColorField key={opening.id} value={opening.primaryColor} onCommit={(value) => onOpeningChange(opening.id, { primaryColor: value })} />
    <span className="v2-eyebrow v2-inspector-subsection">Opening</span>
    <div className="v2-editable-vector">
      <NumericCameraInput label="Width" value={opening.width} unit="m" min={0.1} max={20} step={0.01} onCommit={(value) => onOpeningChange(opening.id, { width: value })} />
      <NumericCameraInput label="Height" value={opening.height} unit="m" min={0.1} max={20} step={0.01} onCommit={(value) => onOpeningChange(opening.id, { height: value })} />
      <NumericCameraInput label="Sill" value={opening.sillHeight} unit="m" min={0} max={20} step={0.01} onCommit={(value) => onOpeningChange(opening.id, { sillHeight: value, position: [opening.position[0], isWindow ? value : opening.position[1], opening.position[2]] })} />
    </div>
    <span className="v2-eyebrow v2-inspector-subsection v2-inspector-keyframe-label">Open Angle <KeyframeButton active={hasTimelineKeyframe(timeline, opening.id, 'openAngle')} hasTrack={hasTimelineTrack(timeline, opening.id, 'openAngle')} onClick={() => onAddKeyframe(opening.id, 'openAngle')} label={`Add ${isWindow ? 'Window' : 'Door'} Open Angle keyframe`} /></span>
    <NumericCameraInput label={isWindow ? 'Open Angle' : 'Swing'} value={openAngle} unit="°" min={isWindow ? 0 : -170} max={isWindow ? 90 : 170} step={1} onCommit={(value) => onOpeningChange(opening.id, { openAngle: isWindow ? Math.min(90, Math.max(0, value)) : value })} />
    {isWindow ? <div className="v2-opening-presets" aria-label="Window open angle presets"><button type="button" onClick={() => onOpeningChange(opening.id, { openAngle: 0 })}>Closed</button><button type="button" onClick={() => onOpeningChange(opening.id, { openAngle: 45 })}>45°</button><button type="button" onClick={() => onOpeningChange(opening.id, { openAngle: 90 })}>Open</button></div> : null}
    <label className="v2-inspector-label">Hinge<select className="v2-inspector-select" value={opening.hingeSide ?? 'left'} onChange={(event) => onOpeningChange(opening.id, { hingeSide: event.target.value as OpeningDocument['hingeSide'] })}><option value="left">Left</option><option value="right">Right</option></select></label>
    <span className="v2-eyebrow v2-inspector-subsection">Wall placement</span>
    <span className="v2-readonly-value">{wallPlacement}</span>
    <EntityActions onDuplicate={() => onDuplicateEntity(opening.id)} onDelete={() => onDeleteEntity(opening.id)} />
  </EntityInspector>
}

function SunInspector({ sun, timeline, onSunChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity }: { sun: SunDocument; timeline: TimelineDocument; onSunChange: V2DetailsPanelProps['onSunChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity'] }) {
  return <div className="v2-inspector-content"><span className="v2-eyebrow">Sun</span><h3>{sun.name}</h3><span className="v2-eyebrow v2-inspector-subsection">Sun Position</span><NumericCameraInput label="Direction" value={sun.azimuth} unit="°" min={-360} max={360} step={1} keyframe={{ active: hasTimelineKeyframe(timeline, sun.id, 'azimuth'), hasTrack: hasTimelineTrack(timeline, sun.id, 'azimuth'), onClick: () => onAddKeyframe(sun.id, 'azimuth') }} onCommit={(value) => onSunChange(sun.id, { azimuth: value })} /><NumericCameraInput label="Height" value={sun.elevation} unit="°" min={-10} max={89} step={1} keyframe={{ active: hasTimelineKeyframe(timeline, sun.id, 'elevation'), hasTrack: hasTimelineTrack(timeline, sun.id, 'elevation'), onClick: () => onAddKeyframe(sun.id, 'elevation') }} onCommit={(value) => onSunChange(sun.id, { elevation: value })} /><span className="v2-eyebrow v2-inspector-subsection">Sunlight</span><NumericCameraInput label="Brightness" value={sun.intensity} unit="×" min={0} max={10} step={0.1} keyframe={{ active: hasTimelineKeyframe(timeline, sun.id, 'intensity'), hasTrack: hasTimelineTrack(timeline, sun.id, 'intensity'), onClick: () => onAddKeyframe(sun.id, 'intensity') }} onCommit={(value) => onSunChange(sun.id, { intensity: value })} /><label className="v2-editable-number"><span className="v2-inspector-keyframe-label">Light Color <KeyframeButton active={hasTimelineKeyframe(timeline, sun.id, 'color')} hasTrack={hasTimelineTrack(timeline, sun.id, 'color')} onClick={() => onAddKeyframe(sun.id, 'color')} label="Add Sun Light Color keyframe" /></span><input type="color" value={sun.color} onChange={(event) => onSunChange(sun.id, { color: event.target.value })} /></label><EntityActions onDuplicate={() => onDuplicateEntity(sun.id)} onDelete={() => onDeleteEntity(sun.id)} /><p className="v2-inspector-note">Drag the Sun helper in Blocking View to set its direction and height. It is excluded from the production image.</p></div>
}

function EntityActions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return <div className="v2-inspector-actions"><button className="v2-inspector-action" onClick={onDuplicate} title="Duplicate (⌘D / Ctrl+D)" type="button">Duplicate <small>⌘D</small></button><button className="v2-inspector-action is-danger" onClick={onDelete} title="Delete (Delete)" type="button">Delete <small>Delete</small></button></div>
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

function ColorField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const commit = (next: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(next)) return
    setDraft(next)
    if (next.toLowerCase() !== value.toLowerCase()) onCommit(next)
  }
  return <label className="v2-color-field"><span>Color</span><span><input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#808080'} onChange={(event) => commit(event.target.value)} /><input type="text" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => commit(draft)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(draft) } }} /></span></label>
}

function NumericCameraInput({ label, value, unit, min, max, step, keyframe, onCommit }: { label: string; value: number; unit: string; min: number; max: number; step: number; keyframe?: { active: boolean; hasTrack: boolean; onClick: () => void }; onCommit: (value: number) => void }) {
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

  return <label className="v2-editable-number"><span className="v2-inspector-keyframe-label">{label}{keyframe ? <KeyframeButton active={keyframe.active} hasTrack={keyframe.hasTrack} onClick={keyframe.onClick} label={`Add ${label} keyframe`} /> : null}</span><span className="v2-editable-number-field"><input type="number" inputMode="decimal" step={step} min={min} max={max} value={editing ? draft : formatCameraNumber(value)} onFocus={() => { setDraft(formatCameraNumber(value)); setEditing(true) }} onChange={(event) => { setEditing(true); setDraft(event.target.value) }} onBlur={commit} onKeyDown={handleKeyDown} /><small>{unit}</small></span></label>
}

function hasTimelineKeyframe(timeline: TimelineDocument, entityId: string, property: TimelineProperty): boolean {
  return timeline.tracks.some((track) => track.entityId === entityId && track.property === property && track.keyframes.some((keyframe) => keyframe.frame === timeline.currentFrame))
}

function hasTimelineTrack(timeline: TimelineDocument, entityId: string, property: TimelineProperty): boolean {
  return timeline.tracks.some((track) => track.entityId === entityId && track.property === property)
}

function KeyframeButton({ active, hasTrack, onClick, label }: { active: boolean; hasTrack: boolean; onClick: () => void; label: string }) {
  const actionLabel = active ? label.replace(/^Add /, 'Update ') : hasTrack ? `${label} using current value` : label
  return <button className={`v2-keyframe-button${active ? ' is-active' : ''}${hasTrack ? ' has-track' : ''}`} aria-label={actionLabel} title={actionLabel} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick() }} type="button">{active ? '◆' : '◇'}</button>
}

function EmptyInspector() {
  return <div className="v2-details-empty"><div className="v2-details-empty-icon">◇</div><strong>Select something in the scene</strong><p>Blocking settings will appear here when a scene element is selected.</p></div>
}
