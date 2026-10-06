import { useEffect, useRef, useState } from 'react'
import type { ActorDocument, ActorVector3, CameraDocument, OpeningDocument, PropDocument, SunDocument, WallDocument } from '../core/sceneDocument'
import { cameraDisplayAspect, cameraProjectionForDocument, letterboxRect } from '../runtime/cameraMath'
import { deliveryAspectValue, fitAspectInsideSource, insetFrameGuideRect } from '../runtime/frameGuideMath'
import type { FrameGuide } from '../core/sceneDocument'
import { CameraViewRuntime } from '../runtime/cameraViewRuntime'
import { ProceduralActorRuntime } from '../runtime/actor/proceduralActor'
import { StageEngine, type StageTool, type StageTransform } from '../stage-engine'
import { ProceduralCameraRuntime } from '../runtime/cameraRuntime'
import type { EvaluatedEntityState } from '../timeline/timelineEvaluator'
import type { TimelineDocument } from '../core/sceneDocument'
import { shouldApplyTimelineEvaluation } from '../timeline/transformOwnership'
import { createScenicVisual, scenicGeometrySignature, type ScenicDefinition, type ScenicVisual } from '../runtime/scenicRuntime'
import { WallDrawingController, type WallDrawingState } from '../architecture/wallDrawing'
import { resolveOpeningAgainstWalls } from '../architecture/wallMath'
import { STILL_CAPTURE_WIDTHS, type StillCaptureOptions, type StillCaptureWidth } from '../runtime/stillCapture'
import { cameraOverlayMode, compactPreviewOverlayPolicy, fullCameraInfoLines, layoutOverlayLabels, previewCameraLabel, type OverlayLabelPlacement, type OverlayRect } from '../runtime/cameraOverlayLayout'

export type V2TransformDebugState = {
  entityId: string
  runtimeFinal: string
  baseDocumentFinal: string
  timelineEvaluated: string
  valueAppliedAfterTransform: string
}

type V2StageProps = {
  view: 'blocking' | 'camera'
  actors: readonly ActorDocument[]
  props: readonly PropDocument[]
  walls: readonly WallDocument[]
  openings: readonly OpeningDocument[]
  lights: readonly SunDocument[]
  cameras: readonly CameraDocument[]
  activeCameraId: string | null
  selectedEntityId: string | null
  tool: StageTool
  onSelectionChange: (entityId: string | null) => void
  onToolChange: (tool: StageTool) => void
  onTransformStart: (change: StageTransform) => void
  onTransformEnd: (change: StageTransform) => void
  onTransformPreview: (change: StageTransform) => void
  onCaptureFrameReady: (blob: Blob, options: StillCaptureOptions) => void
  cameraPreview: boolean
  onCameraPreviewChange: (visible: boolean) => void
  onOpenCameraView: () => void
  wallDrawing: boolean
  wallDrawState: WallDrawingState
  onWallDrawCommit: (start: ActorVector3, end: ActorVector3) => void
  onWallDrawState: (state: WallDrawingState) => void
  onWallDrawExit: () => void
  snapPreviewWallId: string | null
  evaluatedEntities: Readonly<Record<string, EvaluatedEntityState>>
  isPlaying: boolean
  transformingEntityId: string | null
  suspendedTimelineEntityIds: ReadonlySet<string>
  timeline: TimelineDocument
  isScrubbing: boolean
  lastTransformDebug: V2TransformDebugState | null
  selectedFrameGuideId: string | null
}

function syncActors(engine: StageEngine, actors: readonly ActorDocument[], runtimes: Map<string, ProceduralActorRuntime>): void {
  const actorIds = new Set(actors.map((actor) => actor.id))
  Array.from(runtimes.keys()).forEach((actorId) => {
    if (!actorIds.has(actorId)) {
      engine.removeEntity(actorId)
      runtimes.delete(actorId)
    }
  })
  actors.forEach((actor) => {
    let runtime = runtimes.get(actor.id)
    if (!runtime) {
      runtime = new ProceduralActorRuntime(actor)
      runtimes.set(actor.id, runtime)
      engine.addEntity({ id: actor.id, type: 'Actor', name: actor.name, root: runtime.root, setSelected: (selected) => runtime?.setSelected(selected), dispose: () => runtime?.dispose() })
    } else {
      runtime.applyDocument(actor)
    }
    engine.setEntityTransform(actor.id, { position: actor.position, rotation: actor.rotation })
  })
}

function syncCameras(engine: StageEngine, cameras: readonly CameraDocument[], runtimes: Map<string, ProceduralCameraRuntime>): void {
  const cameraIds = new Set(cameras.map((camera) => camera.id))
  Array.from(runtimes.keys()).forEach((cameraId) => {
    if (!cameraIds.has(cameraId)) {
      engine.removeEntity(cameraId)
      runtimes.delete(cameraId)
    }
  })
  cameras.forEach((camera) => {
    let runtime = runtimes.get(camera.id)
    if (!runtime) {
      runtime = new ProceduralCameraRuntime(camera)
      runtimes.set(camera.id, runtime)
      engine.addEntity({ id: camera.id, type: 'Camera', name: camera.name, root: runtime.root, setSelected: (selected) => runtime?.setSelected(selected), dispose: () => runtime?.dispose() })
    } else {
      runtime.applyDocument(camera)
    }
    engine.setEntityTransform(camera.id, { position: camera.position, rotation: camera.rotation })
  })
}

function syncScenic(engine: StageEngine, definitions: readonly ScenicDefinition[], runtimes: Map<string, ScenicVisual>, selectedEntityId: string | null): void {
  const ids = new Set(definitions.map((definition) => definition.id))
  Array.from(runtimes.entries()).forEach(([id]) => {
    if (!ids.has(id)) {
      engine.removeEntity(id)
      runtimes.delete(id)
    }
  })
  definitions.forEach((definition) => {
    const wallOpenings = definition.type === 'Wall' ? definitions.filter((candidate): candidate is OpeningDocument => candidate.type === 'Opening' && candidate.wallId === definition.id) : []
    const signature = scenicGeometrySignature(definition, wallOpenings)
    const existing = runtimes.get(definition.id)
    if (existing && existing.root.userData.scenicSignature !== signature) {
      engine.removeEntity(definition.id)
      runtimes.delete(definition.id)
    }
    const runtime = runtimes.get(definition.id)
    if (runtime) {
      runtime.applyDocument(definition)
      return
    }
    const visual = createScenicVisual(definition, { wallOpenings })
    visual.root.userData.scenicSignature = signature
    runtimes.set(definition.id, visual)
    const scalable = definition.type === 'Prop' && ['cube', 'sphere', 'cylinder'].includes(definition.propType ?? definition.shape)
    engine.addEntity({ id: definition.id, type: definition.type, name: definition.name, root: visual.root, setSelected: visual.setSelected, setSnapPreview: visual.setSnapPreview, dispose: visual.dispose, transformable: true, scalable })
  })
  engine.setSelected(selectedEntityId)
}

function deliveryAspect(camera: CameraDocument): number {
  return deliveryAspectValue(camera.deliveryAspectRatio, cameraDisplayAspect(camera))
}

export function V2Stage({ view, actors, props, walls, openings, lights, cameras, activeCameraId, selectedEntityId, tool, onSelectionChange, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onCaptureFrameReady, cameraPreview, onCameraPreviewChange, onOpenCameraView, wallDrawing, wallDrawState, onWallDrawCommit, onWallDrawState, onWallDrawExit, snapPreviewWallId, evaluatedEntities, isPlaying, transformingEntityId, suspendedTimelineEntityIds, timeline, isScrubbing, lastTransformDebug, selectedFrameGuideId }: V2StageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<StageEngine | null>(null)
  const cameraViewRef = useRef<CameraViewRuntime | null>(null)
  const actorRuntimesRef = useRef(new Map<string, ProceduralActorRuntime>())
  const cameraRuntimesRef = useRef(new Map<string, ProceduralCameraRuntime>())
  const scenicRuntimesRef = useRef(new Map<string, ScenicVisual>())
  const wallDrawingRef = useRef<WallDrawingController | null>(null)
  const initialStageRef = useRef({ actors, props, walls, openings, lights, cameras, selectedEntityId, tool })
  const initialToolRef = useRef(tool)
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 })
  const [captureWidth, setCaptureWidth] = useState<StillCaptureWidth>(1920)
  const [includeCaptureGuides, setIncludeCaptureGuides] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [graphicsContextMessage, setGraphicsContextMessage] = useState<string | null>(null)
  const callbacksRef = useRef({ onSelectionChange, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onWallDrawCommit, onWallDrawState, onWallDrawExit })
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('interactionDebug') === '1'

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onWallDrawCommit, onWallDrawState, onWallDrawExit }
  }, [onSelectionChange, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onWallDrawCommit, onWallDrawState, onWallDrawExit])

  useEffect(() => {
    const stageElement = stageRef.current
    if (!stageElement) return
    const actorRuntimes = actorRuntimesRef.current
    const cameraRuntimes = cameraRuntimesRef.current
    const scenicRuntimes = scenicRuntimesRef.current
    const engine = new StageEngine(stageElement, {
      onToolChanged: (nextTool) => callbacksRef.current.onToolChange(nextTool),
      onTransformStart: (change) => callbacksRef.current.onTransformStart(change),
      onTransformEnd: (change) => callbacksRef.current.onTransformEnd(change),
      onTransformPreview: (change) => {
        cameraViewRef.current?.previewTransform(change)
        callbacksRef.current.onTransformPreview(change)
      },
      debugEnabled: false,
    })
    const wallDrawingController = new WallDrawingController(engine, {
      onCommit: (start, end) => callbacksRef.current.onWallDrawCommit(start, end),
      onState: (state) => callbacksRef.current.onWallDrawState(state),
      onExit: () => callbacksRef.current.onWallDrawExit(),
    })
    wallDrawingRef.current = wallDrawingController
    const cameraView = new CameraViewRuntime(stageElement)
    cameraViewRef.current = cameraView
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      setGraphicsContextMessage('The graphics context was lost. Reload the app to continue safely.')
    }
    const handleContextRestored = () => setGraphicsContextMessage('Graphics were restored. Reload the app before continuing.')
    stageElement.addEventListener('webglcontextlost', handleContextLost, true)
    stageElement.addEventListener('webglcontextrestored', handleContextRestored, true)
    const removeSelectionListener = engine.onSelectionChanged((entityId) => callbacksRef.current.onSelectionChange(entityId))
    const initial = initialStageRef.current
    syncActors(engine, initial.actors, actorRuntimes)
    syncCameras(engine, initial.cameras, cameraRuntimes)
    engine.setProps([])
    syncScenic(engine, [...initial.props, ...initial.walls, ...initial.openings.map((opening) => resolveOpeningAgainstWalls(opening, initial.walls)), ...initial.lights], scenicRuntimes, initial.selectedEntityId)
    engine.setTool(initialToolRef.current)
    engine.setSelected(initial.selectedEntityId)
    engineRef.current = engine
    return () => {
      removeSelectionListener()
      engineRef.current = null
      cameraViewRef.current = null
      wallDrawingRef.current = null
      stageElement.removeEventListener('webglcontextlost', handleContextLost, true)
      stageElement.removeEventListener('webglcontextrestored', handleContextRestored, true)
      wallDrawingController.dispose()
      cameraView.dispose()
      engine.dispose()
      actorRuntimes.clear()
      cameraRuntimes.clear()
      scenicRuntimes.clear()
    }
  }, [])

  useEffect(() => {
    const updateSize = () => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (rect) setViewportSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    }
    updateSize()
    const ResizeObserverClass = window.ResizeObserver
    if (ResizeObserverClass && stageRef.current) {
      const observer = new ResizeObserverClass(updateSize)
      observer.observe(stageRef.current)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  useEffect(() => {
    engineRef.current?.setTool(tool)
  }, [tool])

  useEffect(() => {
    wallDrawingRef.current?.setActive(wallDrawing)
  }, [wallDrawing])

  useEffect(() => {
    engineRef.current?.setSnapPreview(snapPreviewWallId)
  }, [snapPreviewWallId])

  useEffect(() => {
    if (engineRef.current) syncActors(engineRef.current, actors, actorRuntimesRef.current)
  }, [actors])

  useEffect(() => {
    if (engineRef.current) syncCameras(engineRef.current, cameras, cameraRuntimesRef.current)
  }, [cameras])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    actors.forEach((actor) => {
      if (!shouldApplyTimelineEvaluation(actor.id, transformingEntityId, suspendedTimelineEntityIds)) return
      const evaluated = evaluatedEntities[actor.id]
      if (evaluated) engine.setEntityTransform(actor.id, { position: evaluated.position, rotation: evaluated.rotation })
    })
    cameras.forEach((camera) => {
      if (!shouldApplyTimelineEvaluation(camera.id, transformingEntityId, suspendedTimelineEntityIds)) return
      const evaluated = evaluatedEntities[camera.id]
      if (!evaluated) return
      const runtime = cameraRuntimesRef.current.get(camera.id)
      runtime?.applyDocument({ ...camera, position: evaluated.position, rotation: evaluated.rotation, focalLengthMm: evaluated.focalLengthMm ?? camera.focalLengthMm })
      engine.setEntityTransform(camera.id, { position: evaluated.position, rotation: evaluated.rotation })
    })
  }, [actors, cameras, evaluatedEntities, suspendedTimelineEntityIds, transformingEntityId])

  useEffect(() => {
    engineRef.current?.setSelected(selectedEntityId)
  }, [selectedEntityId])

  useEffect(() => {
    const evaluatedActors = actors.map((actor) => shouldApplyTimelineEvaluation(actor.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[actor.id] ? { ...actor, ...evaluatedEntities[actor.id] } : actor)
    const evaluatedProps = props.map((prop) => shouldApplyTimelineEvaluation(prop.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[prop.id] ? { ...prop, ...evaluatedEntities[prop.id] } : prop)
    const evaluatedWalls = walls.map((wall) => shouldApplyTimelineEvaluation(wall.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[wall.id] ? { ...wall, ...evaluatedEntities[wall.id] } : wall)
    const evaluatedOpenings = openings.map((opening) => shouldApplyTimelineEvaluation(opening.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[opening.id] ? { ...opening, ...evaluatedEntities[opening.id], openAngle: evaluatedEntities[opening.id].openAngle ?? opening.openAngle } : opening)
    const resolvedOpenings = evaluatedOpenings.map((opening) => resolveOpeningAgainstWalls(opening, evaluatedWalls))
    const evaluatedLights = lights.map((light) => shouldApplyTimelineEvaluation(light.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[light.id] ? { ...light, ...evaluatedEntities[light.id], azimuth: evaluatedEntities[light.id].azimuth ?? light.azimuth, elevation: evaluatedEntities[light.id].elevation ?? light.elevation, intensity: evaluatedEntities[light.id].intensity ?? light.intensity, color: evaluatedEntities[light.id].color ?? light.color } : light)
    const evaluatedCameras = cameras.map((camera) => shouldApplyTimelineEvaluation(camera.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[camera.id] ? { ...camera, ...evaluatedEntities[camera.id], focalLengthMm: evaluatedEntities[camera.id].focalLengthMm ?? camera.focalLengthMm } : camera)
    const activeCamera = evaluatedCameras.find((camera) => camera.id === activeCameraId) ?? null
    if (engineRef.current) syncScenic(engineRef.current, [...evaluatedProps, ...evaluatedWalls, ...resolvedOpenings, ...evaluatedLights], scenicRuntimesRef.current, selectedEntityId)
    cameraViewRef.current?.setDocuments(evaluatedActors, evaluatedProps, evaluatedWalls, resolvedOpenings, evaluatedLights, activeCamera)
    cameraViewRef.current?.setPreviewAspect(activeCamera ? deliveryAspect(activeCamera) : 16 / 9)
    cameraViewRef.current?.setDisplayMode(view === 'camera' && activeCamera ? 'full' : cameraPreview && activeCamera ? 'preview' : 'hidden')
  }, [view, cameraPreview, actors, props, walls, openings, lights, cameras, activeCameraId, selectedEntityId, evaluatedEntities, suspendedTimelineEntityIds, transformingEntityId])

  const activeCameraBase = cameras.find((camera) => camera.id === activeCameraId) ?? null
  const activeCamera = activeCameraBase && shouldApplyTimelineEvaluation(activeCameraBase.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[activeCameraBase.id]
    ? { ...activeCameraBase, ...evaluatedEntities[activeCameraBase.id], focalLengthMm: evaluatedEntities[activeCameraBase.id].focalLengthMm ?? activeCameraBase.focalLengthMm }
    : activeCameraBase
  const renderCamera = view === 'camera' && activeCamera ? 'PRODUCTION' : 'EDITOR'
  const imageAspect = activeCamera ? cameraDisplayAspect(activeCamera) : 16 / 9
  const imageRect = letterboxRect(viewportSize.width, viewportSize.height, imageAspect)
  const imageStyle = { left: `${(imageRect.x / viewportSize.width) * 100}%`, top: `${(imageRect.y / viewportSize.height) * 100}%`, width: `${(imageRect.width / viewportSize.width) * 100}%`, height: `${(imageRect.height / viewportSize.height) * 100}%` }
  const previewWidth = Math.min(Math.max(260, viewportSize.width * 0.3), 420)
  const captureFrame = () => {
    const runtime = cameraViewRef.current
    if (!runtime) return
    setCaptureError(null)
    void runtime.captureStill({ width: captureWidth, includeGuides: includeCaptureGuides }).then((blob) => {
      if (blob) onCaptureFrameReady(blob, { width: captureWidth, includeGuides: includeCaptureGuides })
      else setCaptureError('Still capture is unavailable for this Camera. Try again or reload the app.')
    }).catch(() => setCaptureError('Still capture failed. Try again or reload the app.'))
  }

  return (
    <section className="v2-stage-panel" aria-label="Stage">
      <div className={`v2-stage-viewport v2-view-${view}`} ref={stageRef}>
        {graphicsContextMessage ? <div className="v2-runtime-notice" role="alert"><strong>Graphics unavailable</strong><span>{graphicsContextMessage}</span><button className="v2-button v2-button-primary" onClick={() => window.location.reload()} type="button">Reload App</button></div> : null}
        {view === 'blocking' ? <div className="v2-stage-header">
          <span className="v2-stage-pill">Blocking View</span>
          <span>Stage</span>
        </div> : null}
        {view === 'blocking' ? (
          <>
            <div className="v2-stage-tools" aria-label="Transform tools">
              {(['select', 'move', 'rotate', 'scale'] as const).map((item) => {
                const selectedProp = props.find((prop) => prop.id === selectedEntityId)
                const scaleAvailable = Boolean(selectedProp && ['cube', 'sphere', 'cylinder'].includes(selectedProp.propType ?? selectedProp.shape))
                return <button className={tool === item ? 'is-active' : ''} key={item} disabled={isPlaying || (item === 'scale' && !scaleAvailable)} onClick={() => onToolChange(item)} type="button">
                  <span>{item === 'select' ? 'E' : item === 'move' ? 'Q' : item === 'rotate' ? 'R' : 'S'}</span>{item[0].toUpperCase() + item.slice(1)}
                </button>
              })}
            </div>
            <div className="v2-stage-hint">E Select · Q Move · R Rotate · S Scale · Left drag orbit · Right drag pan · Two-finger scroll pan · Pinch zoom</div>
            {wallDrawing ? <div className="v2-wall-draw-status"><strong>DRAW WALL</strong><span>{wallDrawState.start ? wallDrawState.end ? `${wallDrawState.length.toFixed(2)} m · Click to commit next segment` : 'Move to set wall length' : 'Click a ground point to start'}</span><small>Shift 45° · Ctrl/Cmd grid · Esc cancel</small></div> : null}
            <button className={`v2-camera-preview-toggle${cameraPreview ? ' is-active' : ''}`} onClick={() => onCameraPreviewChange(!cameraPreview)} type="button">{cameraPreview ? 'Hide Camera Preview' : 'Camera Preview'}</button>
            {cameraPreview ? <div className="v2-camera-preview-ui" style={{ aspectRatio: activeCamera ? deliveryAspect(activeCamera) : 16 / 9 }} onClick={() => { if (activeCamera) onOpenCameraView() }} role={activeCamera ? 'button' : undefined} tabIndex={activeCamera ? 0 : undefined}>
              {activeCamera ? <>
                <div className="v2-camera-preview-label" aria-label={previewCameraLabel(activeCamera.name, activeCamera.focalLengthMm, previewWidth)}><strong>{previewCameraLabel(activeCamera.name, activeCamera.focalLengthMm, previewWidth)}</strong></div>
                <button className="v2-camera-preview-close" onClick={(event) => { event.stopPropagation(); onCameraPreviewChange(false) }} type="button" aria-label="Close Camera Preview">×</button>
                <div className="v2-camera-preview-guides" aria-hidden="true">
                  <CameraPreviewOverlays camera={activeCamera} sourceAspect={imageAspect} />
                </div>
              </> : <div className="v2-camera-preview-empty">No active camera<button className="v2-camera-preview-close" onClick={(event) => { event.stopPropagation(); onCameraPreviewChange(false) }} type="button" aria-label="Close Camera Preview">×</button></div>}
            </div> : null}
          </>
        ) : activeCamera ? (
          <div className="v2-camera-view-overlay">
            <CameraStatus camera={activeCamera} compact={cameraOverlayMode(viewportSize.width) === 'compact'} />
            <div className="v2-camera-image-area" style={imageStyle}>
              <CameraFrameOverlays camera={activeCamera} sourceAspect={imageAspect} imageRect={imageRect} selectedFrameGuideId={selectedFrameGuideId} compact={cameraOverlayMode(viewportSize.width) === 'compact'} />
            </div>
            <div className="v2-camera-view-controls" aria-label="Camera View controls">
              <label>Still <select value={captureWidth} onChange={(event) => setCaptureWidth(Number(event.target.value) as StillCaptureWidth)}>{STILL_CAPTURE_WIDTHS.map((width) => <option key={width} value={width}>{width}px</option>)}</select></label>
              <label><input type="checkbox" checked={includeCaptureGuides} onChange={(event) => setIncludeCaptureGuides(event.target.checked)} /> Include Guides</label>
              <button onClick={captureFrame} type="button">Capture Frame</button>
            </div>
            {captureError ? <div className="v2-capture-error" role="alert">{captureError}</div> : null}
          </div>
        ) : (
          <div className="v2-stage-empty"><div className="v2-stage-empty-mark">◇</div><strong>No active Camera</strong><span>Add a Camera and set it active to view the shot.</span></div>
        )}
        {isPlaying ? <div className="v2-playback-shield" aria-hidden="true" /> : null}
        {debugEnabled ? (
          <div className="v2-interaction-debug" aria-hidden="true">
            <strong>TIMELINE / TRANSFORM AUDIT</strong>
            <span>STAGE ENGINE v2-stage-engine</span>
            <span>ENTITIES {actors.length + props.length + cameras.length}</span>
            <span>SELECTED ID {selectedEntityId ?? 'NONE'}</span>
            <span>ACTIVE CAMERA {activeCameraId ?? 'NONE'}</span>
            <span>VIEW {view.toUpperCase()}</span>
            <span>RENDER CAMERA {renderCamera}</span>
            <span>PLAYING {String(isPlaying).toUpperCase()}</span>
            <span>SCRUBBING {String(isScrubbing).toUpperCase()}</span>
            <span>TRANSFORMING ENTITY {transformingEntityId ?? 'NONE'}</span>
            <span>CURRENT FRAME {timeline.currentFrame}</span>
            <span>HAS POSITION TRACK {transformingEntityId && timeline.tracks.some((track) => track.entityId === transformingEntityId && track.property === 'position') ? 'YES' : 'NO'}</span>
            <span>HAS KEYFRAME AT FRAME {transformingEntityId && timeline.tracks.some((track) => track.entityId === transformingEntityId && track.property === 'position' && track.keyframes.some((keyframe) => keyframe.frame === timeline.currentFrame)) ? 'YES' : 'NO'}</span>
            <span>RUNTIME FINAL {lastTransformDebug?.runtimeFinal ?? '—'}</span>
            <span>BASE DOCUMENT FINAL {lastTransformDebug?.baseDocumentFinal ?? '—'}</span>
            <span>TIMELINE EVALUATED {lastTransformDebug?.timelineEvaluated ?? '—'}</span>
            <span>VALUE APPLIED AFTER TRANSFORM {lastTransformDebug?.valueAppliedAfterTransform ?? '—'}</span>
          </div>
        ) : null}
        <div className="v2-stage-footer">
          <span>{view === 'blocking' ? 'Stage interaction foundation' : 'Read-only capture preview'}</span>
          <span>Meters</span>
        </div>
      </div>
    </section>
  )
}

function CameraStatus({ camera, compact }: { camera: CameraDocument; compact: boolean }) {
  const projection = cameraProjectionForDocument(camera)
  const [primary, secondary] = fullCameraInfoLines(camera.focalLengthMm, projection?.definition.model, projection?.captureMode.name)
  return <div className={`v2-camera-view-readout${compact ? ' is-compact' : ''}`}>
    <strong>{primary}</strong>
    <span>{secondary}</span>
  </div>
}

function CameraFrameOverlays({ camera, sourceAspect, imageRect, selectedFrameGuideId, compact }: { camera: CameraDocument; sourceAspect: number; imageRect: { x: number; y: number; width: number; height: number }; selectedFrameGuideId: string | null; compact: boolean }) {
  const displayDeliveryAspect = deliveryAspect(camera)
  const deliveryRect = fitAspectInsideSource(sourceAspect, displayDeliveryAspect)
  const enabledGuides = camera.frameGuides.filter((guide) => guide.enabled)
  const statusRect = { x: 20 - imageRect.x, y: 18 - imageRect.y, width: compact ? 170 : 250, height: compact ? 38 : 60 }
  const guideRequests = enabledGuides.map((guide) => ({ id: guide.id, text: guide.name, rect: insetFrameGuideRect(fitAspectInsideSource(sourceAspect, guide.aspectRatio), guide.safeMarginPercent) }))
  const deliveryRequests = camera.deliveryAspectRatio === 'sensor' ? [] : [{ id: 'delivery', text: `DELIVERY · ${camera.deliveryAspectRatio}`, rect: deliveryRect }]
  const placements = layoutOverlayLabels([...deliveryRequests, ...guideRequests], { width: imageRect.width, height: imageRect.height, statusRect })
  const placement = (id: string): OverlayLabelPlacement | undefined => placements.find((item) => item.id === id)
  return <>
    {camera.deliveryAspectRatio !== 'sensor' ? <FrameOverlay label={`DELIVERY · ${camera.deliveryAspectRatio}`} labelPlacement={placement('delivery')} aspectRatio={displayDeliveryAspect} sourceAspect={sourceAspect} delivery /> : null}
    {enabledGuides.map((guide) => <FrameOverlay key={guide.id} guide={guide} selected={guide.id === selectedFrameGuideId} labelPlacement={placement(guide.id)} sourceAspect={sourceAspect} />)}
  </>
}

function CameraPreviewOverlays({ camera, sourceAspect }: { camera: CameraDocument; sourceAspect: number }) {
  const policy = compactPreviewOverlayPolicy()
  const displayDeliveryAspect = deliveryAspect(camera)
  const deliveryRect = fitAspectInsideSource(sourceAspect, displayDeliveryAspect)
  const enabledGuides = camera.frameGuides.filter((guide) => guide.enabled)
  const guideData = enabledGuides.map((guide) => {
    const sourceRect = insetFrameGuideRect(fitAspectInsideSource(sourceAspect, guide.aspectRatio), guide.safeMarginPercent)
    return { guide, rect: { x: (sourceRect.x - deliveryRect.x) / deliveryRect.width, y: (sourceRect.y - deliveryRect.y) / deliveryRect.height, width: sourceRect.width / deliveryRect.width, height: sourceRect.height / deliveryRect.height } }
  })
  return <>
    <div className="v2-camera-preview-delivery" />
    {policy.showDeliveryLabel && camera.deliveryAspectRatio !== 'sensor' ? <div className="v2-camera-preview-delivery-label">DELIVERY · {camera.deliveryAspectRatio}</div> : null}
    {guideData.map(({ guide, rect }) => <PreviewGuide key={guide.id} guide={guide} rect={rect} />)}
  </>
}

function PreviewGuide({ guide, rect }: { guide: FrameGuide; rect: OverlayRect }) {
  return <div className={`v2-camera-preview-guide ${guide.lineStyle === 'dashed' ? 'is-dashed' : ''}`} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, borderColor: guide.color, opacity: guide.opacity, borderWidth: `${guide.lineWeight}px` }} />
}

function FrameOverlay({ guide, aspectRatio, sourceAspect, selected = false, delivery = false, label, labelPlacement }: { guide?: FrameGuide; aspectRatio?: number; sourceAspect?: number; selected?: boolean; delivery?: boolean; label?: string; labelPlacement?: OverlayLabelPlacement }) {
  const actualAspect = guide?.aspectRatio ?? aspectRatio ?? 16 / 9
  const rect = insetFrameGuideRect(fitAspectInsideSource(sourceAspect ?? 16 / 9, actualAspect), guide?.safeMarginPercent ?? 0)
  const color = delivery ? 'delivery' : 'custom'
  const lineStyle = guide?.lineStyle ?? 'solid'
  const opacity = delivery ? 0.92 : guide?.opacity ?? 0.82
  const lineWeight = delivery ? 2 : selected ? Math.max(guide?.lineWeight ?? 1, 2) : guide?.lineWeight ?? 1
  const shade = selected && guide?.shadeOutside ? { boxShadow: `0 0 0 9999px rgba(10, 14, 22, ${guide.shadeOpacity})` } : undefined
  const customColor = delivery ? undefined : guide?.color
  const labelStyle = labelPlacement ? { top: `${labelPlacement.topOffset}px`, ...(labelPlacement.side === 'right' ? { left: 'auto', right: '6px' } : { left: '6px' }) } : undefined
  return <div className={`v2-frame-overlay v2-frame-overlay-${color} v2-frame-overlay-${lineStyle}${selected ? ' is-selected' : ''}${delivery ? ' is-delivery' : ''}`} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, borderWidth: `${lineWeight}px`, borderColor: customColor, color: customColor, opacity, ...shade }}>{label || guide?.name ? <span style={labelStyle}>{label ?? guide?.name}</span> : null}</div>
}
