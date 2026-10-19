import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { committedEntityName, normalizeEntityName } from '../core/entityNaming'
import { ACTOR_POSE_PRESETS, createActorPoseForPreset, normalizeActorPosePreset } from '../core/actorPosePresets'
import type { ActorDocument, CameraDocument, OpeningDocument, PropDocument, SunDocument, TimelineDocument, TimelineProperty, WallDocument } from '../core/sceneDocument'
import { CAMERA_DATABASE, CAMERA_MANUFACTURERS, camerasForManufacturer, defaultCaptureModeForDefinition, resolveCameraDefinition } from '../core/cameraDatabase'
import { activeCaptureAspect, cameraProjectionForDocument } from '../runtime/cameraMath'
import { degreesToRadians, formatCameraNumber, parseCameraNumber, radiansToDegrees } from '../runtime/cameraInputMath'
import { FrameGuideInspector } from './FrameGuideInspector'
import { FRAME_GUIDE_PRESETS } from '../core/frameGuides'
import QRCode from 'qrcode'
import type { PhoneCameraControllerState } from '../phoneCamera/phoneCameraController'
import { channelsForPreset, phoneCameraChannelSummary, type PhoneCameraControlChannels, type PhoneCameraControlPreset } from '../phoneCamera/protocol'
import type { CameraBlockingMove } from '../runtime/cameraBlocking'
import { cameraPathSegmentForSelection, cameraPathSegments, cameraPositionKeyframes, type CameraPathSegmentSelection } from '../timeline/cameraPath'
import { timelineEasingMode, type CameraRetimeMode } from '../timeline/timelineMath'
import type { CameraMoveReviewMode } from '../timeline/cameraReview'

type CameraTargetOption = { id: string; name: string; entityType: 'Actor' | 'Prop' | 'Wall' | 'Opening' | 'Camera' }

type V2DetailsPanelProps = {
  actor: ActorDocument | null
  prop: PropDocument | null
  wall: WallDocument | null
  opening: OpeningDocument | null
  sun: SunDocument | null
  camera: CameraDocument | null
  selectedEntityIds: readonly string[]
  selectedTypeCounts: Readonly<Record<string, number>>
  activeCameraId: string | null
  timeline: TimelineDocument
  selectedTimelineKeyframes: readonly { trackId: string; keyframeId: string }[]
  selectedCameraPathSegment: CameraPathSegmentSelection | null
  cameraPathVisible: boolean
  onCameraPathVisibleChange: (visible: boolean) => void
  onCameraPathSegmentSelect: (segment: CameraPathSegmentSelection) => void
  onCameraPathRetime: (segment: CameraPathSegmentSelection, durationSeconds: number, mode: CameraRetimeMode) => string | null
  cameraMoveReview: { mode: CameraMoveReviewMode } | null
  onCameraMoveReview: (mode: CameraMoveReviewMode) => void
  onCameraMoveReviewStop: () => void
  onCameraMoveReviewPose: (edge: 'start' | 'end') => void
  onActorChange: (actorId: string, changes: Partial<ActorDocument>) => void
  onPropChange: (propId: string, changes: Partial<PropDocument>) => void
  onCameraChange: (cameraId: string, changes: Partial<CameraDocument>) => void
  onAimAtTarget: (cameraId: string) => void
  onMoveCameraBlocking: (cameraId: string, move: CameraBlockingMove, delta: number) => void
  onFrameCamera: (cameraId: string, preset: 'full' | 'medium-full' | 'medium' | 'mcu' | 'cu') => void
  cameraTargets: readonly CameraTargetOption[]
  cameraSubjectDistance: number | null
  onWallChange: (wallId: string, changes: Partial<WallDocument>) => void
  onOpeningChange: (openingId: string, changes: Partial<OpeningDocument>) => void
  onSunChange: (sunId: string, changes: Partial<SunDocument>) => void
  onDuplicateEntity: (entityId: string) => void
  onDeleteEntity: (entityId: string) => void
  onDeleteSelected: () => void
  onSetActiveCamera: (cameraId: string) => void
  onAddKeyframe: (entityId: string, property: TimelineProperty) => void
  selectedFrameGuideId: string | null
  onFrameGuideSelection: (guideId: string | null) => void
  renameRequest: { entityId: string; token: number } | null
  phoneCamera: {
    enabled: boolean
    state: PhoneCameraControllerState
    onPair: () => void
    onDisconnect: () => void
    onRecenter: () => void
    onControlChannels: (channels: PhoneCameraControlChannels) => void
    onMovementScale: (value: number) => void
    onRotationSensitivity: (value: number) => void
    onSetCameraKey: () => void
    onStartRecording: () => void
    onStopRecording: () => void
  }
}

type CameraPathInspectorContextValue = {
  selectedTimelineKeyframes: readonly { trackId: string; keyframeId: string }[]
  selectedSegment: CameraPathSegmentSelection | null
  visible: boolean
  onVisibleChange: (visible: boolean) => void
  onSegmentSelect: (segment: CameraPathSegmentSelection) => void
  onRetime: (segment: CameraPathSegmentSelection, durationSeconds: number, mode: CameraRetimeMode) => string | null
  review: { mode: CameraMoveReviewMode } | null
  onReview: (mode: CameraMoveReviewMode) => void
  onReviewStop: () => void
  onReviewPose: (edge: 'start' | 'end') => void
}

const CameraPathInspectorContext = createContext<CameraPathInspectorContextValue | null>(null)

export function V2DetailsPanel({ actor, prop, wall, opening, sun, camera, selectedEntityIds, selectedTypeCounts, activeCameraId, timeline, selectedTimelineKeyframes, selectedCameraPathSegment, cameraPathVisible, onCameraPathVisibleChange, onCameraPathSegmentSelect, onCameraPathRetime, cameraMoveReview, onCameraMoveReview, onCameraMoveReviewStop, onCameraMoveReviewPose, onActorChange, onPropChange, onCameraChange, onAimAtTarget, onMoveCameraBlocking, onFrameCamera, cameraTargets, cameraSubjectDistance, onWallChange, onOpeningChange, onSunChange, onDuplicateEntity, onDeleteEntity, onDeleteSelected, onSetActiveCamera, onAddKeyframe, selectedFrameGuideId, onFrameGuideSelection, renameRequest, phoneCamera }: V2DetailsPanelProps) {
  if (selectedEntityIds.length > 1) return <aside className="v2-panel v2-details-panel" aria-label="Details"><MultiSelectionInspector count={selectedEntityIds.length} typeCounts={selectedTypeCounts} onDeleteSelected={onDeleteSelected} /></aside>
  return (
    <CameraPathInspectorContext.Provider value={{ selectedTimelineKeyframes, selectedSegment: selectedCameraPathSegment, visible: cameraPathVisible, onVisibleChange: onCameraPathVisibleChange, onSegmentSelect: onCameraPathSegmentSelect, onRetime: onCameraPathRetime, review: cameraMoveReview, onReview: onCameraMoveReview, onReviewStop: onCameraMoveReviewStop, onReviewPose: onCameraMoveReviewPose }}>
      <aside className="v2-panel v2-details-panel" aria-label="Details">
      {camera ? <CameraInspector camera={camera} activeCameraId={activeCameraId} timeline={timeline} onCameraChange={onCameraChange} onAimAtTarget={onAimAtTarget} onMoveCameraBlocking={onMoveCameraBlocking} onFrameCamera={onFrameCamera} cameraTargets={cameraTargets} cameraSubjectDistance={cameraSubjectDistance} onSetActiveCamera={onSetActiveCamera} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} selectedFrameGuideId={selectedFrameGuideId} onFrameGuideSelection={onFrameGuideSelection} renameRequest={renameRequest} phoneCamera={phoneCamera} /> : actor ? <ActorInspector actor={actor} timeline={timeline} onActorChange={onActorChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} renameRequest={renameRequest} /> : prop ? <PropInspector prop={prop} timeline={timeline} onPropChange={onPropChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} renameRequest={renameRequest} /> : wall ? <WallInspector wall={wall} timeline={timeline} onWallChange={onWallChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} renameRequest={renameRequest} /> : opening ? <OpeningInspector opening={opening} timeline={timeline} onOpeningChange={onOpeningChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} renameRequest={renameRequest} /> : sun ? <SunInspector sun={sun} timeline={timeline} onSunChange={onSunChange} onAddKeyframe={onAddKeyframe} onDuplicateEntity={onDuplicateEntity} onDeleteEntity={onDeleteEntity} renameRequest={renameRequest} /> : <EmptyInspector />}
      </aside>
    </CameraPathInspectorContext.Provider>
  )
}

function MultiSelectionInspector({ count, typeCounts, onDeleteSelected }: { count: number; typeCounts: Readonly<Record<string, number>>; onDeleteSelected: () => void }) {
  const types = Object.entries(typeCounts).filter(([, value]) => value > 0).map(([type, value]) => `${value} ${type}`).join(' · ')
  return <div className="v2-inspector-content"><span className="v2-eyebrow">Selection</span><h2 className="v2-multi-selection-title">{count} items selected</h2><span className="v2-readonly-value">Types · {types || 'Mixed'}</span><p className="v2-inspector-note">Group transforms preserve spacing. Choose an Arrange action in the Stage toolbar for alignment or distribution.</p><div className="v2-inspector-actions"><button className="v2-inspector-action is-danger" onClick={onDeleteSelected} type="button">Delete Selected</button></div></div>
}

function CameraInspector({ camera, activeCameraId, timeline, onCameraChange, onAimAtTarget, onMoveCameraBlocking, onFrameCamera, cameraTargets, cameraSubjectDistance, onSetActiveCamera, onAddKeyframe, onDuplicateEntity, onDeleteEntity, selectedFrameGuideId, onFrameGuideSelection, renameRequest, phoneCamera }: { camera: CameraDocument; activeCameraId: string | null; timeline: TimelineDocument; onCameraChange: V2DetailsPanelProps['onCameraChange']; onAimAtTarget: V2DetailsPanelProps['onAimAtTarget']; onMoveCameraBlocking: V2DetailsPanelProps['onMoveCameraBlocking']; onFrameCamera: V2DetailsPanelProps['onFrameCamera']; cameraTargets: readonly CameraTargetOption[]; cameraSubjectDistance: number | null; onSetActiveCamera: V2DetailsPanelProps['onSetActiveCamera']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity']; selectedFrameGuideId: string | null; onFrameGuideSelection: V2DetailsPanelProps['onFrameGuideSelection']; renameRequest: V2DetailsPanelProps['renameRequest']; phoneCamera: V2DetailsPanelProps['phoneCamera'] }) {
  const definition = resolveCameraDefinition(camera.cameraDefinitionId)
  const projection = cameraProjectionForDocument(camera)
  const captureMode = projection?.captureMode
  const phoneLive = phoneCamera.state.status === 'connected' && phoneCamera.state.activeCameraId === camera.id
  const [cameraStep, setCameraStep] = useState(0.1)
  const targetOptions = cameraTargets.filter((target) => target.id !== camera.id)
  const focalPresets = [18, 24, 28, 35, 50, 75, 85, 100, 135]
  const cameraPathContext = useContext(CameraPathInspectorContext)
  const pathKeyframes = cameraPositionKeyframes(timeline, camera.id)
  const pathSegments = cameraPathSegments(timeline, camera.id)
  const selectedPathSegment = cameraPathContext?.selectedSegment?.cameraId === camera.id ? cameraPathSegmentForSelection(timeline, cameraPathContext.selectedSegment) : null
  const selectedSegmentKeyframe = selectedPathSegment ? timeline.tracks.find((track) => track.id === selectedPathSegment.from.trackId)?.keyframes.find((keyframe) => keyframe.id === selectedPathSegment.from.keyframeId) : null
  const pathDistance = selectedPathSegment?.distance ?? null
  const pathDuration = selectedPathSegment?.durationSeconds ?? null
  const pathSpeed = selectedPathSegment?.speed ?? null
  const [retimeMode, setRetimeMode] = useState<CameraRetimeMode>('moveEnd')
  const [retimeFeedback, setRetimeFeedback] = useState<string | null>(null)
  return (
    <div className="v2-inspector-content">
      <span className="v2-eyebrow">Camera</span>
      <NameField entityId={camera.id} value={camera.name} renameRequest={renameRequest} onCommit={(name) => onCameraChange(camera.id, { name })} />
      <span className="v2-eyebrow v2-inspector-subsection">Appearance</span>
      <ColorField key={camera.id} value={camera.proxyColor} onCommit={(value) => onCameraChange(camera.id, { proxyColor: value })} />
      <button className={`v2-inspector-action${activeCameraId === camera.id ? ' is-active' : ''}`} onClick={() => onSetActiveCamera(camera.id)} disabled={activeCameraId === camera.id} type="button">{activeCameraId === camera.id ? 'Active Camera' : 'Make Active Camera'}</button>
      <PhoneCameraPanel camera={camera} activeCameraId={activeCameraId} phoneCamera={phoneCamera} />
      <div className="v2-inspector-divider" />
      <span className="v2-eyebrow v2-inspector-subsection">Camera Blocking</span>
      <label className="v2-inspector-label">Target<select className="v2-inspector-select" value={camera.targetEntityId ?? ''} onChange={(event) => onCameraChange(camera.id, { targetEntityId: event.target.value || null, ...(event.target.value ? {} : { lockTarget: false }) })}><option value="">None</option>{targetOptions.map((target) => <option key={target.id} value={target.id}>{target.name} · {target.entityType}</option>)}</select></label>
      <label className="v2-inspector-label">Aim Point<select className="v2-inspector-select" value={camera.targetAimPoint ?? 'center'} disabled={!camera.targetEntityId} onChange={(event) => onCameraChange(camera.id, { targetAimPoint: event.target.value as CameraDocument['targetAimPoint'] })}><option value="center">Center</option>{cameraTargets.find((target) => target.id === camera.targetEntityId)?.entityType === 'Actor' ? <><option value="chest">Chest</option><option value="head">Head</option><option value="eyes">Eyes</option></> : null}</select></label>
      <button className="v2-inspector-action" disabled={!camera.targetEntityId} onClick={() => onAimAtTarget(camera.id)} type="button">Aim at Target</button>
      <div className="v2-camera-blocking-readout"><span>Camera → Subject</span><strong>{cameraSubjectDistance === null ? '—' : `${cameraSubjectDistance.toFixed(2)} m`}</strong></div>
      <label className="v2-inspector-checkbox"><input checked={camera.lockTarget === true} disabled={!camera.targetEntityId} onChange={(event) => onCameraChange(camera.id, { lockTarget: event.target.checked })} type="checkbox" /><span>Lock Target</span></label>
      <div className="v2-inspector-divider" />
      <span className="v2-eyebrow v2-inspector-subsection">Camera Path</span>
      <label className="v2-inspector-checkbox"><input checked={cameraPathContext?.visible ?? false} onChange={(event) => cameraPathContext?.onVisibleChange(event.target.checked)} type="checkbox" /><span>Show Path</span></label>
      <div className="v2-camera-path-readout">
        <span>Position keys <strong>{pathKeyframes.length}</strong></span>
        {pathSegments.length > 0 ? <div className="v2-camera-path-segment-list">{pathSegments.map((segment) => { const selection = { cameraId: camera.id, trackId: segment.from.trackId, fromKeyframeId: segment.from.keyframeId, toKeyframeId: segment.to.keyframeId }; const active = selectedPathSegment?.id === segment.id; return <button className={active ? 'is-active' : undefined} key={segment.id} onClick={() => cameraPathContext?.onSegmentSelect(selection)} type="button">Frame {segment.from.frame} → {segment.to.frame}</button> })}</div> : <span className="v2-inspector-note">No camera move position segments yet.</span>}
        {selectedPathSegment && pathDistance !== null && pathDuration !== null ? <><span>Selected Move <strong>Frame {selectedPathSegment.from.frame} → {selectedPathSegment.to.frame}</strong></span><span>Interpolation <strong>{selectedSegmentKeyframe ? timelineEasingMode(selectedSegmentKeyframe) : 'Linear'}</strong></span><div className="v2-camera-path-metrics"><span>Distance <strong>{pathDistance.toFixed(2)} m</strong></span><span>Duration <strong>{pathDuration.toFixed(2)} s</strong></span><span>Average Speed <strong>{pathSpeed === null ? '—' : `${pathSpeed.toFixed(2)} m/s`}</strong></span></div><div className="v2-camera-path-review"><span className="v2-eyebrow">Review</span><div className="v2-camera-path-review-actions"><button className="v2-inspector-action" onClick={() => cameraPathContext?.onReviewPose('start')} type="button">Start</button><button className={`v2-inspector-action${cameraPathContext?.review?.mode === 'preview' ? ' is-active' : ''}`} onClick={() => cameraPathContext?.onReview('preview')} type="button">Preview Move</button><button className="v2-inspector-action" onClick={() => cameraPathContext?.onReviewPose('end')} type="button">End</button><button className="v2-inspector-action" disabled={!cameraPathContext?.review} onClick={cameraPathContext?.onReviewStop} type="button">Stop</button></div><label className="v2-inspector-checkbox"><input checked={cameraPathContext?.review?.mode === 'loop'} onChange={(event) => { if (event.target.checked) cameraPathContext?.onReview('loop'); else cameraPathContext?.onReviewStop() }} type="checkbox" /><span>Loop Move</span></label></div><label className="v2-inspector-label">Retime<select className="v2-inspector-select" value={retimeMode} onChange={(event) => setRetimeMode(event.target.value as CameraRetimeMode)}><option value="moveEnd">Move End</option><option value="rippleFollowing">Ripple Following</option></select></label><label className="v2-inspector-label">Duration <input key={selectedPathSegment.id} className="v2-inspector-input" defaultValue={pathDuration.toFixed(2)} inputMode="decimal" type="number" min="0.01" step="0.01" aria-label="Camera move duration in seconds" /></label><button className="v2-inspector-action" onClick={(event) => { const input = event.currentTarget.previousElementSibling?.querySelector('input') as HTMLInputElement | null; const value = input ? Number(input.value) : NaN; const message = cameraPathContext?.onRetime(cameraPathContext.selectedSegment!, value, retimeMode) ?? null; setRetimeFeedback(message) }} type="button">Apply Duration</button>{retimeFeedback ? <span className="v2-inspector-note">{retimeFeedback}</span> : null}</> : <span className="v2-inspector-note">Select a move segment to inspect timing.</span>}
      </div>
      <span className="v2-eyebrow v2-inspector-subsection">Movement</span>
      <label className="v2-inspector-label">Step<select className="v2-inspector-select" value={cameraStep} onChange={(event) => setCameraStep(Number(event.target.value))}>{[0.05, 0.1, 0.25, 0.5, 1].map((value) => <option key={value} value={value}>{value.toFixed(2)} m</option>)}</select></label>
      <div className="v2-camera-blocking-movement">{(['dolly', 'truck', 'pedestal'] as const).map((move) => <div className="v2-camera-blocking-row" key={move}><span>{move[0].toUpperCase() + move.slice(1)}</span><button aria-label={`${move} back`} onClick={() => onMoveCameraBlocking(camera.id, move, -cameraStep)} type="button">−</button><button aria-label={`${move} forward`} onClick={() => onMoveCameraBlocking(camera.id, move, cameraStep)} type="button">+</button></div>)}</div>
      {cameraTargets.find((target) => target.id === camera.targetEntityId)?.entityType === 'Actor' ? <><span className="v2-eyebrow v2-inspector-subsection">Actor Framing</span><div className="v2-camera-framing-presets">{([['full', 'Full'], ['medium-full', 'Medium Full'], ['medium', 'Medium'], ['mcu', 'MCU'], ['cu', 'CU']] as const).map(([preset, label]) => <button key={preset} title={preset === 'mcu' ? 'Medium Close-Up' : preset === 'cu' ? 'Close-Up' : undefined} onClick={() => onFrameCamera(camera.id, preset)} type="button">{label}</button>)}</div></> : null}
      <div className="v2-inspector-divider" />
      <span className="v2-eyebrow v2-inspector-subsection">Composition</span>
      <div className="v2-camera-composition-grid">
        <label><input type="checkbox" checked={camera.compositionCenter === true} onChange={(event) => onCameraChange(camera.id, { compositionCenter: event.target.checked })} /> Center</label>
        <label><input type="checkbox" checked={camera.compositionThirds === true} onChange={(event) => onCameraChange(camera.id, { compositionThirds: event.target.checked })} /> Thirds</label>
        <label><input type="checkbox" checked={camera.compositionSafeAreas === true} onChange={(event) => onCameraChange(camera.id, { compositionSafeAreas: event.target.checked })} /> Safe Areas</label>
        <label><input type="checkbox" checked={camera.compositionHeadroom === true} disabled={!camera.targetEntityId} onChange={(event) => onCameraChange(camera.id, { compositionHeadroom: event.target.checked })} /> Headroom</label>
      </div>
      <label className="v2-inspector-label">Frame Guide<select className="v2-inspector-select" value={camera.compositionFrameGuideEnabled ? String(camera.compositionFrameGuideAspect ?? 2.39) : ''} onChange={(event) => onCameraChange(camera.id, { compositionFrameGuideEnabled: event.target.value !== '', ...(event.target.value ? { compositionFrameGuideAspect: Number(event.target.value) } : {}) })}><option value="">Off</option>{FRAME_GUIDE_PRESETS.filter((preset) => ['16:9', '1.85:1', '2.00:1', '2.39:1', '4:3', '1:1', '9:16'].includes(preset.name)).map((preset) => <option key={preset.name} value={preset.aspectRatio}>{preset.name}</option>)}</select></label>
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
      <div className="v2-camera-focal-presets"><span className="v2-inspector-field-label">Quick Presets</span><div>{focalPresets.map((value) => <button className={Math.abs(camera.focalLengthMm - value) < 1e-6 ? 'is-active' : ''} key={value} onClick={() => onCameraChange(camera.id, { focalLengthMm: value })} type="button">{value}</button>)}</div></div>
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
        {(['X', 'Y', 'Z'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={camera.position[index]} unit="m" min={-1000} max={1000} step={0.01} disabled={phoneLive} onCommit={(value) => {
          const position = [...camera.position] as [number, number, number]
          position[index] = value
          onCameraChange(camera.id, { position })
        }} />)}
      </div>
      <span className="v2-eyebrow v2-inspector-field-label v2-inspector-keyframe-label">Orientation <KeyframeButton active={hasTimelineKeyframe(timeline, camera.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, camera.id, 'rotation')} onClick={() => onAddKeyframe(camera.id, 'rotation')} label="Add Camera Rotation keyframe" /></span>
      <div className="v2-editable-vector">
        {(['Pitch', 'Heading', 'Roll'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={radiansToDegrees(camera.rotation[index])} unit="°" min={-360} max={360} step={0.1} disabled={phoneLive} onCommit={(value) => {
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

function PhoneCameraPanel({ camera, activeCameraId, phoneCamera }: { camera: CameraDocument; activeCameraId: string | null; phoneCamera: V2DetailsPanelProps['phoneCamera'] }) {
  const [qrState, setQrState] = useState<{ source: string | null; url: string | null }>({ source: null, url: null })
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const isActive = activeCameraId === camera.id
  const state = phoneCamera.state
  useEffect(() => {
    let active = true
    if (!state.pairingUrl) return () => { active = false }
    void QRCode.toDataURL(state.pairingUrl, { width: 190, margin: 1, color: { dark: '#1a2230', light: '#ffffff' } }).then((url) => { if (active) setQrState({ source: state.pairingUrl, url }) }).catch(() => { if (active) setQrState({ source: state.pairingUrl, url: null }) })
    return () => { active = false }
  }, [state.pairingUrl])
  const copyPairingLink = () => {
    const promise = navigator.clipboard?.writeText(state.pairingUrl ?? '')
    if (!promise) {
      setCopyMessage('Copy is unavailable in this window.')
      return
    }
    void promise.then(() => setCopyMessage('Pairing link copied.')).catch(() => setCopyMessage('Copy is unavailable in this window.'))
  }
  const updateChannel = (key: keyof PhoneCameraControlChannels) => phoneCamera.onControlChannels({ ...state.controlChannels, [key]: !state.controlChannels[key] })
  const movementChannels: Array<[keyof PhoneCameraControlChannels, string]> = [['truck', 'Truck'], ['pedestal', 'Pedestal'], ['dolly', 'Dolly']]
  const rotationChannels: Array<[keyof PhoneCameraControlChannels, string]> = [['pan', 'Pan'], ['tilt', 'Tilt'], ['dutch', 'Dutch']]
  return <section className="v2-phone-camera-panel" aria-label="Phone Camera">
    <div className="v2-phone-camera-heading"><span className="v2-eyebrow">Phone Camera</span>{state.status === 'connected' ? <span className="v2-phone-camera-status is-connected">LIVE</span> : null}</div>
    {!phoneCamera.enabled ? <p className="v2-phone-camera-copy">Phone Camera control is available in the desktop app.</p> : state.status === 'connected' && state.activeCameraId === camera.id ? <>
      <p className="v2-phone-camera-copy">{state.orientation === 'portrait' ? 'Rotate your phone sideways to continue Camera control.' : state.requiresRecenter ? 'Recenter to continue.' : `Control: ${phoneCameraChannelSummary(state.controlChannels)}`}</p>
      <label className="v2-inspector-field"><span>Preset</span><select className="v2-inspector-select" value={state.controlPreset} onChange={(event) => { const preset = event.target.value as PhoneCameraControlPreset; if (preset !== 'custom') phoneCamera.onControlChannels(channelsForPreset(preset)) }}><option value="move">Move</option><option value="rotate">Rotate</option><option value="full">Full</option><option value="custom">Custom</option></select></label>
      <span className="v2-eyebrow v2-inspector-subsection">Movement</span>
      <div className="v2-phone-camera-channel-grid">{movementChannels.map(([key, label]) => <button key={key} className={`v2-inspector-action${state.controlChannels[key] ? ' is-active' : ''}`} onClick={() => updateChannel(key)} type="button">{label}</button>)}</div>
      <span className="v2-eyebrow v2-inspector-subsection">Rotation</span>
      <div className="v2-phone-camera-channel-grid">{rotationChannels.map(([key, label]) => <button key={key} className={`v2-inspector-action${state.controlChannels[key] ? ' is-active' : ''}`} onClick={() => updateChannel(key)} type="button">{label}</button>)}</div>
      {state.sourceMode === 'position-rotation' && (state.controlChannels.truck || state.controlChannels.pedestal || state.controlChannels.dolly) ? <label className="v2-phone-camera-slider"><span>Movement Scale <strong>{state.movementScale.toFixed(2)}×</strong></span><input type="range" min="0.1" max="10" step="0.01" value={state.movementScale} onChange={(event) => phoneCamera.onMovementScale(Number(event.target.value))} /></label> : null}
      {state.sourceMode === 'position-rotation' && (state.controlChannels.pan || state.controlChannels.tilt || state.controlChannels.dutch) ? <label className="v2-phone-camera-slider"><span>Rotation Sensitivity <strong>{state.rotationSensitivity.toFixed(2)}×</strong></span><input type="range" min="0.25" max="3" step="0.01" value={state.rotationSensitivity} onChange={(event) => phoneCamera.onRotationSensitivity(Number(event.target.value))} /></label> : null}
      <div className="v2-phone-camera-actions"><button className="v2-inspector-action" onClick={phoneCamera.onRecenter} type="button">Recenter</button><button className="v2-inspector-action" onClick={phoneCamera.onSetCameraKey} type="button">Set Camera Key</button>{state.isRecording ? <button className="v2-inspector-action is-danger" onClick={phoneCamera.onStopRecording} type="button">Stop Recording</button> : <button className="v2-inspector-action" onClick={phoneCamera.onStartRecording} type="button">Record Move</button>}<button className="v2-inspector-action" onClick={phoneCamera.onDisconnect} type="button">Disconnect</button></div>
    </> : state.pairingUrl ? <>
      <p className="v2-phone-camera-copy">Scan this QR code with the phone you want to use as a Camera controller.</p>
      {qrState.source === state.pairingUrl && qrState.url ? <img className="v2-phone-camera-qr" src={qrState.url} alt="Phone Camera pairing QR code" /> : <span className="v2-phone-camera-copy">Preparing pairing code…</span>}
      <button className="v2-inspector-action" onClick={copyPairingLink} type="button">Copy Pairing Link</button>
      {copyMessage ? <span className="v2-phone-camera-status">{copyMessage}</span> : null}
      <span className="v2-phone-camera-status">{state.status === 'error' ? 'Relay connection error.' : 'Waiting for phone…'}</span>
      <button className="v2-inspector-action" onClick={phoneCamera.onDisconnect} type="button">Cancel Pairing</button>
    </> : <>
      <p className="v2-phone-camera-copy">Use a phone as a temporary orientation controller for the active Camera.</p>
      {state.message ? <span className="v2-phone-camera-status">{state.message}</span> : null}
      <button className="v2-inspector-action" onClick={phoneCamera.onPair} disabled={!isActive} type="button">{isActive ? 'Pair Phone Camera' : 'Make Camera Active First'}</button>
    </>}
    {state.status === 'connected' && state.activeCameraId !== camera.id ? <span className="v2-phone-camera-status">Live control is assigned to the active Camera.</span> : null}
  </section>
}

function ActorInspector({ actor, timeline, onActorChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity, renameRequest }: { actor: ActorDocument; timeline: TimelineDocument; onActorChange: V2DetailsPanelProps['onActorChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity']; renameRequest: V2DetailsPanelProps['renameRequest'] }) {
  const selectedPreset = normalizeActorPosePreset(actor.posePreset)
  const visualStyle = actor.visualStyle ?? 'character'
  return <EntityInspector eyebrow="Actor" entityId={actor.id} name={actor.name} renameRequest={renameRequest} onNameCommit={(name) => onActorChange(actor.id, { name })} position={actor.position} rotation={actor.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, actor.id, 'position')} hasTrack={hasTimelineTrack(timeline, actor.id, 'position')} onClick={() => onAddKeyframe(actor.id, 'position')} label="Add Actor Position keyframe" />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, actor.id, 'heading')} hasTrack={hasTimelineTrack(timeline, actor.id, 'heading')} onClick={() => onAddKeyframe(actor.id, 'heading')} label="Add Actor Heading keyframe" />}><span className="v2-eyebrow v2-inspector-subsection">Appearance</span><ColorField key={actor.id} value={actor.appearance.primaryColor} onCommit={(value) => onActorChange(actor.id, { appearance: { ...actor.appearance, primaryColor: value } })} /><label className="v2-inspector-label">Visual Style<select className="v2-inspector-select" value={visualStyle} onChange={(event) => onActorChange(actor.id, { visualStyle: event.target.value as ActorDocument['visualStyle'] })}><option value="mannequin">Mannequin</option><option value="character">Character</option></select></label>{visualStyle === 'mannequin' ? <label className="v2-inspector-label">Body Variant<select className="v2-inspector-select" value={actor.appearance.bodyVariant} onChange={(event) => onActorChange(actor.id, { appearance: { ...actor.appearance, bodyVariant: event.target.value as ActorDocument['appearance']['bodyVariant'] } })}><option value="neutral">Neutral</option><option value="male">Male</option><option value="female">Female</option></select></label> : null}<label className="v2-inspector-label"><span className="v2-eyebrow v2-inspector-subsection">Pose</span><select className="v2-inspector-select" value={selectedPreset} onChange={(event) => { const next = normalizeActorPosePreset(event.target.value); onActorChange(actor.id, { posePreset: next, pose: createActorPoseForPreset(next) }) }}>{ACTOR_POSE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label><EntityActions onDuplicate={() => onDuplicateEntity(actor.id)} onDelete={() => onDeleteEntity(actor.id)} /></EntityInspector>
}

function PropInspector({ prop, timeline, onPropChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity, renameRequest }: { prop: PropDocument; timeline: TimelineDocument; onPropChange: V2DetailsPanelProps['onPropChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity']; renameRequest: V2DetailsPanelProps['renameRequest'] }) {
  const primitive = ['cube', 'sphere', 'cylinder'].includes(prop.propType ?? prop.shape)
  const scale = prop.scale ?? [1, 1, 1]
  return <EntityInspector eyebrow="Prop" entityId={prop.id} name={prop.name} renameRequest={renameRequest} onNameCommit={(name) => onPropChange(prop.id, { name })} position={prop.position} rotation={prop.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, prop.id, 'position')} hasTrack={hasTimelineTrack(timeline, prop.id, 'position')} onClick={() => onAddKeyframe(prop.id, 'position')} label="Add Prop Position keyframe" />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, prop.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, prop.id, 'rotation')} onClick={() => onAddKeyframe(prop.id, 'rotation')} label="Add Prop Rotation keyframe" />}><span className="v2-eyebrow v2-inspector-subsection">Appearance</span><ColorField key={prop.id} value={prop.primaryColor} onCommit={(value) => onPropChange(prop.id, { primaryColor: value })} />{primitive ? <><span className="v2-eyebrow v2-inspector-subsection v2-inspector-keyframe-label">Scale <KeyframeButton active={hasTimelineKeyframe(timeline, prop.id, 'scale')} hasTrack={hasTimelineTrack(timeline, prop.id, 'scale')} onClick={() => onAddKeyframe(prop.id, 'scale')} label="Add Prop Scale keyframe" /></span><div className="v2-editable-vector">{(['X', 'Y', 'Z'] as const).map((label, index) => <NumericCameraInput key={label} label={label} value={scale[index]} unit="×" min={0.05} max={100} step={0.01} onCommit={(value) => { const next = [...scale] as [number, number, number]; next[index] = value; onPropChange(prop.id, { scale: next }) }} />)}</div></> : null}<span className="v2-eyebrow v2-inspector-subsection">Type</span><span className="v2-readonly-value">{prop.propType ?? prop.shape}</span><EntityActions onDuplicate={() => onDuplicateEntity(prop.id)} onDelete={() => onDeleteEntity(prop.id)} /></EntityInspector>
}

function WallInspector({ wall, timeline, onWallChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity, renameRequest }: { wall: WallDocument; timeline: TimelineDocument; onWallChange: V2DetailsPanelProps['onWallChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity']; renameRequest: V2DetailsPanelProps['renameRequest'] }) {
  return <EntityInspector eyebrow="Wall" entityId={wall.id} name={wall.name} renameRequest={renameRequest} onNameCommit={(name) => onWallChange(wall.id, { name })} position={wall.position} rotation={wall.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, wall.id, 'position')} hasTrack={hasTimelineTrack(timeline, wall.id, 'position')} onClick={() => onAddKeyframe(wall.id, 'position')} label="Add Wall Position keyframe" />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, wall.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, wall.id, 'rotation')} onClick={() => onAddKeyframe(wall.id, 'rotation')} label="Add Wall Rotation keyframe" />}><span className="v2-eyebrow v2-inspector-subsection">Appearance</span><ColorField key={wall.id} value={wall.primaryColor} onCommit={(value) => onWallChange(wall.id, { primaryColor: value })} /><span className="v2-eyebrow v2-inspector-subsection">Construction</span><div className="v2-editable-vector"><NumericCameraInput label="Length" value={wall.length} unit="m" min={0.1} max={100} step={0.01} onCommit={(value) => onWallChange(wall.id, { length: value })} /><NumericCameraInput label="Height" value={wall.height} unit="m" min={0.1} max={30} step={0.01} onCommit={(value) => onWallChange(wall.id, { height: value })} /><NumericCameraInput label="Thickness" value={wall.thickness} unit="m" min={0.02} max={5} step={0.01} onCommit={(value) => onWallChange(wall.id, { thickness: value })} /></div><EntityActions onDuplicate={() => onDuplicateEntity(wall.id)} onDelete={() => onDeleteEntity(wall.id)} /><p className="v2-inspector-note">A lightweight scenic wall segment. Openings remain separate scene elements for future refinement.</p></EntityInspector>
}

function OpeningInspector({ opening, timeline, onOpeningChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity, renameRequest }: { opening: OpeningDocument; timeline: TimelineDocument; onOpeningChange: V2DetailsPanelProps['onOpeningChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity']; renameRequest: V2DetailsPanelProps['renameRequest'] }) {
  const wallPlacement = opening.wallId ? `Attached to ${opening.wallId}${opening.offsetAlongWallMeters === undefined ? '' : ` · ${opening.offsetAlongWallMeters.toFixed(2)} m along wall`}` : 'Free-standing opening element'
  const isWindow = opening.openingType === 'window'
  const openAngle = isWindow ? Math.min(90, Math.max(0, opening.openAngle ?? 0)) : opening.openAngle ?? 0
  return <EntityInspector eyebrow={isWindow ? 'Window' : 'Door'} entityId={opening.id} name={opening.name} renameRequest={renameRequest} onNameCommit={(name) => onOpeningChange(opening.id, { name })} position={opening.position} rotation={opening.rotation} positionKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, opening.id, 'position')} hasTrack={hasTimelineTrack(timeline, opening.id, 'position')} onClick={() => onAddKeyframe(opening.id, 'position')} label={`Add ${opening.openingType} Position keyframe`} />} rotationKeyframe={<KeyframeButton active={hasTimelineKeyframe(timeline, opening.id, 'rotation')} hasTrack={hasTimelineTrack(timeline, opening.id, 'rotation')} onClick={() => onAddKeyframe(opening.id, 'rotation')} label={`Add ${opening.openingType} Rotation keyframe`} />}>
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

function SunInspector({ sun, timeline, onSunChange, onAddKeyframe, onDuplicateEntity, onDeleteEntity, renameRequest }: { sun: SunDocument; timeline: TimelineDocument; onSunChange: V2DetailsPanelProps['onSunChange']; onAddKeyframe: V2DetailsPanelProps['onAddKeyframe']; onDuplicateEntity: V2DetailsPanelProps['onDuplicateEntity']; onDeleteEntity: V2DetailsPanelProps['onDeleteEntity']; renameRequest: V2DetailsPanelProps['renameRequest'] }) {
  return <div className="v2-inspector-content"><span className="v2-eyebrow">Sun</span><NameField entityId={sun.id} value={sun.name} renameRequest={renameRequest} onCommit={(name) => onSunChange(sun.id, { name })} /><span className="v2-eyebrow v2-inspector-subsection">Sun Position</span><NumericCameraInput label="Direction" value={sun.azimuth} unit="°" min={-360} max={360} step={1} keyframe={{ active: hasTimelineKeyframe(timeline, sun.id, 'azimuth'), hasTrack: hasTimelineTrack(timeline, sun.id, 'azimuth'), onClick: () => onAddKeyframe(sun.id, 'azimuth') }} onCommit={(value) => onSunChange(sun.id, { azimuth: value })} /><NumericCameraInput label="Height" value={sun.elevation} unit="°" min={-10} max={89} step={1} keyframe={{ active: hasTimelineKeyframe(timeline, sun.id, 'elevation'), hasTrack: hasTimelineTrack(timeline, sun.id, 'elevation'), onClick: () => onAddKeyframe(sun.id, 'elevation') }} onCommit={(value) => onSunChange(sun.id, { elevation: value })} /><span className="v2-eyebrow v2-inspector-subsection">Sunlight</span><NumericCameraInput label="Brightness" value={sun.intensity} unit="×" min={0} max={10} step={0.1} keyframe={{ active: hasTimelineKeyframe(timeline, sun.id, 'intensity'), hasTrack: hasTimelineTrack(timeline, sun.id, 'intensity'), onClick: () => onAddKeyframe(sun.id, 'intensity') }} onCommit={(value) => onSunChange(sun.id, { intensity: value })} /><label className="v2-editable-number"><span className="v2-inspector-keyframe-label">Light Color <KeyframeButton active={hasTimelineKeyframe(timeline, sun.id, 'color')} hasTrack={hasTimelineTrack(timeline, sun.id, 'color')} onClick={() => onAddKeyframe(sun.id, 'color')} label="Add Sun Light Color keyframe" /></span><input type="color" value={sun.color} onChange={(event) => onSunChange(sun.id, { color: event.target.value })} /></label><EntityActions onDuplicate={() => onDuplicateEntity(sun.id)} onDelete={() => onDeleteEntity(sun.id)} /><p className="v2-inspector-note">Drag the Sun helper in Blocking View to set its direction and height. It is excluded from the production image.</p></div>
}

function EntityActions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return <div className="v2-inspector-actions"><button className="v2-inspector-action" onClick={onDuplicate} title="Duplicate (⌘D / Ctrl+D)" type="button">Duplicate <small>⌘D</small></button><button className="v2-inspector-action is-danger" onClick={onDelete} title="Delete (Delete)" type="button">Delete <small>Delete</small></button></div>
}

function EntityInspector({ eyebrow, entityId, name, renameRequest, onNameCommit, position, rotation, positionKeyframe, rotationKeyframe, children }: { eyebrow: string; entityId: string; name: string; renameRequest: V2DetailsPanelProps['renameRequest']; onNameCommit: (name: string) => void; position: [number, number, number]; rotation: [number, number, number]; positionKeyframe?: ReactNode; rotationKeyframe?: ReactNode; children?: ReactNode }) {
  return <div className="v2-inspector-content"><span className="v2-eyebrow">{eyebrow}</span><NameField entityId={entityId} value={name} renameRequest={renameRequest} onCommit={onNameCommit} /><div className="v2-inspector-divider" /><span className="v2-eyebrow v2-inspector-keyframe-label">Position {positionKeyframe}</span><ReadonlyVector values={position} suffix="m" labels={['X', 'Y', 'Z']} /><span className="v2-eyebrow v2-inspector-subsection v2-inspector-keyframe-label">Rotation {rotationKeyframe}</span><ReadonlyVector values={rotation.map((value) => Math.round((value * 180) / Math.PI)) as [number, number, number]} suffix="°" labels={['X', 'Y', 'Z']} />{children}<p className="v2-inspector-note">Scene values for blocking and previs.</p></div>
}

function NameField({ entityId, value, renameRequest, onCommit }: { entityId: string; value: string; renameRequest: V2DetailsPanelProps['renameRequest']; onCommit: (name: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const lastRenameTokenRef = useRef<number | null>(null)
  const skipNextBlurRef = useRef(false)
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  useEffect(() => {
    if (renameRequest?.entityId !== entityId || renameRequest.token === lastRenameTokenRef.current) return
    lastRenameTokenRef.current = renameRequest.token
    setDraft(value)
    setEditing(true)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [entityId, renameRequest, value])
  const cancel = () => {
    skipNextBlurRef.current = true
    setDraft(value)
    setEditing(false)
    inputRef.current?.blur()
  }
  const commit = () => {
    const next = committedEntityName(value, draft)
    if (normalizeEntityName(draft).length === 0) {
      setDraft(value)
      setEditing(false)
      return
    }
    if (next) onCommit(next)
    setDraft(normalizeEntityName(draft))
    setEditing(false)
  }
  return <label className="v2-entity-name-field"><span>Name</span><input ref={inputRef} value={editing ? draft : value} onFocus={() => { setDraft(value); setEditing(true) }} onChange={(event) => { setDraft(event.target.value); setEditing(true) }} onBlur={() => { if (skipNextBlurRef.current) { skipNextBlurRef.current = false; return } commit() }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') { event.preventDefault(); commit() } else if (event.key === 'Escape') { event.preventDefault(); cancel() } }} /></label>
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

function NumericCameraInput({ label, value, unit, min, max, step, keyframe, disabled = false, onCommit }: { label: string; value: number; unit: string; min: number; max: number; step: number; keyframe?: { active: boolean; hasTrack: boolean; onClick: () => void }; disabled?: boolean; onCommit: (value: number) => void }) {
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

  return <label className="v2-editable-number"><span className="v2-inspector-keyframe-label">{label}{keyframe ? <KeyframeButton active={keyframe.active} hasTrack={keyframe.hasTrack} onClick={keyframe.onClick} label={`Add ${label} keyframe`} /> : null}</span><span className="v2-editable-number-field"><input disabled={disabled} type="number" inputMode="decimal" step={step} min={min} max={max} value={editing ? draft : formatCameraNumber(value)} onFocus={() => { setDraft(formatCameraNumber(value)); setEditing(true) }} onChange={(event) => { setEditing(true); setDraft(event.target.value) }} onBlur={commit} onKeyDown={handleKeyDown} /><small>{unit}</small></span></label>
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
