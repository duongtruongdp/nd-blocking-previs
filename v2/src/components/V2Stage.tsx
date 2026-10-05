import { useEffect, useRef } from 'react'
import type { ActorDocument, CameraDocument, PropDocument } from '../core/sceneDocument'
import { cameraDisplayAspect } from '../runtime/cameraMath'
import { CameraViewRuntime } from '../runtime/cameraViewRuntime'
import { ProceduralActorRuntime } from '../runtime/actor/proceduralActor'
import { StageEngine, type StagePropDefinition, type StageTool, type StageTransform } from '../stage-engine'
import { ProceduralCameraRuntime } from '../runtime/cameraRuntime'
import type { EvaluatedEntityState } from '../timeline/timelineEvaluator'
import type { TimelineDocument } from '../core/sceneDocument'
import { shouldApplyTimelineEvaluation } from '../timeline/transformOwnership'

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
  cameras: readonly CameraDocument[]
  activeCameraId: string | null
  selectedEntityId: string | null
  tool: StageTool
  onSelectionChange: (entityId: string | null) => void
  onToolChange: (tool: StageTool) => void
  onTransformStart: (change: StageTransform) => void
  onTransformEnd: (change: StageTransform) => void
  evaluatedEntities: Readonly<Record<string, EvaluatedEntityState>>
  isPlaying: boolean
  transformingEntityId: string | null
  suspendedTimelineEntityIds: ReadonlySet<string>
  timeline: TimelineDocument
  isScrubbing: boolean
  lastTransformDebug: V2TransformDebugState | null
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

function deliveryAspect(camera: CameraDocument): number {
  if (camera.deliveryAspectRatio === 'sensor') return cameraDisplayAspect(camera)
  return Number(camera.deliveryAspectRatio)
}

export function V2Stage({ view, actors, props, cameras, activeCameraId, selectedEntityId, tool, onSelectionChange, onToolChange, onTransformStart, onTransformEnd, evaluatedEntities, isPlaying, transformingEntityId, suspendedTimelineEntityIds, timeline, isScrubbing, lastTransformDebug }: V2StageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<StageEngine | null>(null)
  const cameraViewRef = useRef<CameraViewRuntime | null>(null)
  const actorRuntimesRef = useRef(new Map<string, ProceduralActorRuntime>())
  const cameraRuntimesRef = useRef(new Map<string, ProceduralCameraRuntime>())
  const initialStageRef = useRef({ actors, props, cameras, selectedEntityId, tool })
  const initialToolRef = useRef(tool)
  const callbacksRef = useRef({ onSelectionChange, onToolChange, onTransformStart, onTransformEnd })
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('interactionDebug') === '1'

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onToolChange, onTransformStart, onTransformEnd }
  }, [onSelectionChange, onToolChange, onTransformStart, onTransformEnd])

  useEffect(() => {
    if (!stageRef.current) return
    const actorRuntimes = actorRuntimesRef.current
    const cameraRuntimes = cameraRuntimesRef.current
    const engine = new StageEngine(stageRef.current, {
      onToolChanged: (nextTool) => callbacksRef.current.onToolChange(nextTool),
      onTransformStart: (change) => callbacksRef.current.onTransformStart(change),
      onTransformEnd: (change) => callbacksRef.current.onTransformEnd(change),
      debugEnabled: false,
    })
    const cameraView = new CameraViewRuntime(stageRef.current)
    cameraViewRef.current = cameraView
    const removeSelectionListener = engine.onSelectionChanged((entityId) => callbacksRef.current.onSelectionChange(entityId))
    const initial = initialStageRef.current
    syncActors(engine, initial.actors, actorRuntimes)
    syncCameras(engine, initial.cameras, cameraRuntimes)
    engine.setProps(initial.props as readonly StagePropDefinition[])
    engine.setTool(initialToolRef.current)
    engine.setSelected(initial.selectedEntityId)
    engineRef.current = engine
    return () => {
      removeSelectionListener()
      engineRef.current = null
      cameraViewRef.current = null
      cameraView.dispose()
      engine.dispose()
      actorRuntimes.clear()
      cameraRuntimes.clear()
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setTool(tool)
  }, [tool])

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
    engineRef.current?.setProps(props as readonly StagePropDefinition[])
  }, [props])

  useEffect(() => {
    engineRef.current?.setSelected(selectedEntityId)
  }, [selectedEntityId])

  useEffect(() => {
    const evaluatedActors = actors.map((actor) => shouldApplyTimelineEvaluation(actor.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[actor.id] ? { ...actor, ...evaluatedEntities[actor.id] } : actor)
    const evaluatedCameras = cameras.map((camera) => shouldApplyTimelineEvaluation(camera.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[camera.id] ? { ...camera, ...evaluatedEntities[camera.id], focalLengthMm: evaluatedEntities[camera.id].focalLengthMm ?? camera.focalLengthMm } : camera)
    const activeCamera = evaluatedCameras.find((camera) => camera.id === activeCameraId) ?? null
    cameraViewRef.current?.setDocuments(evaluatedActors, props, activeCamera)
    cameraViewRef.current?.setVisible(view === 'camera' && activeCamera !== null)
  }, [view, actors, props, cameras, activeCameraId, evaluatedEntities, suspendedTimelineEntityIds, transformingEntityId])

  const activeCameraBase = cameras.find((camera) => camera.id === activeCameraId) ?? null
  const activeCamera = activeCameraBase && shouldApplyTimelineEvaluation(activeCameraBase.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[activeCameraBase.id]
    ? { ...activeCameraBase, ...evaluatedEntities[activeCameraBase.id], focalLengthMm: evaluatedEntities[activeCameraBase.id].focalLengthMm ?? activeCameraBase.focalLengthMm }
    : activeCameraBase
  const renderCamera = view === 'camera' && activeCamera ? 'PRODUCTION' : 'EDITOR'

  return (
    <section className="v2-stage-panel" aria-label="Stage">
      <div className={`v2-stage-viewport v2-view-${view}`} ref={stageRef}>
        <div className="v2-stage-header">
          <span className="v2-stage-pill">{view === 'blocking' ? 'Blocking View' : 'Camera View'}</span>
          <span>{view === 'blocking' ? 'Stage' : activeCamera?.name ?? 'No Active Camera'}</span>
        </div>
        {view === 'blocking' ? (
          <>
            <div className="v2-stage-tools" aria-label="Transform tools">
              {(['select', 'move', 'rotate'] as const).map((item) => (
                <button className={tool === item ? 'is-active' : ''} key={item} disabled={isPlaying} onClick={() => onToolChange(item)} type="button">
                  <span>{item === 'select' ? 'E' : item === 'move' ? 'Q' : 'R'}</span>{item[0].toUpperCase() + item.slice(1)}
                </button>
              ))}
            </div>
            <div className="v2-stage-hint">E Select · Q Move · R Rotate · Left drag orbit · Right drag pan · Two-finger scroll pan · Pinch zoom</div>
          </>
        ) : activeCamera ? (
          <div className="v2-camera-view-overlay" aria-hidden="true">
            <div className="v2-camera-view-readout"><strong>{activeCamera.name}</strong><span>{activeCamera.focalLengthMm}mm · {activeCamera.deliveryAspectRatio === 'sensor' ? 'Sensor / Native' : activeCamera.deliveryAspectRatio}</span></div>
            <div className="v2-camera-frame-guide" style={{ aspectRatio: String(deliveryAspect(activeCamera)) }} />
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
