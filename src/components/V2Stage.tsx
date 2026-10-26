import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import * as THREE from 'three'
import type { ActorDocument, ActorVector3, CameraDocument, OpeningDocument, PropDocument, SceneDocument, SceneGroup, SunDocument, WallDocument } from '../core/sceneDocument'
import { evaluateGroupTransforms, groupSelectionIdForEdit } from '../core/groupMath'
import { evaluateSceneFrame } from '../core/sceneFrameEvaluation'
import { cameraDisplayAspect, cameraProjectionForDocument, letterboxRect } from '../runtime/cameraMath'
import { deliveryAspectValue, fitAspectInsideSource, insetFrameGuideRect } from '../runtime/frameGuideMath'
import type { FrameGuide } from '../core/sceneDocument'
import { CameraViewRuntime } from '../runtime/cameraViewRuntime'
import { actorVisualStyle, createActorRuntime, type ActorRuntime } from '../runtime/actor/actorRuntime'
import { arrangePopoverPosition, STAGE_ROTATION_SNAP_PRESETS, STAGE_SNAP_GRID_PRESETS, StageEngine, stageViewSelectionIsIsometric, type StageAxisName, type StageEngineDebugSnapshot, type StageSelection, type StageTool, type StageTransform, type StageTransformBatch, type StageViewOrientation, type StageViewSelection } from '../stage-engine'
import { StageViewCube } from './StageViewCube'
import { ProceduralCameraRuntime } from '../runtime/cameraRuntime'
import { cameraDocumentWithTimelineEvaluation, evaluateTimeline, timelinePropertyIsAuthored, type EvaluatedEntityState } from '../timeline/timelineEvaluator'
import type { TimelineDocument } from '../core/sceneDocument'
import { shouldApplyTimelineEvaluation, shouldApplyTimelinePropertyEvaluation, type SuspendedTimelineProperties } from '../timeline/transformOwnership'
import { createScenicVisual, scenicGeometrySignature, type ScenicDefinition, type ScenicVisual } from '../runtime/scenicRuntime'
import { WallDrawingController, type WallDrawingState } from '../architecture/wallDrawing'
import { resolveOpeningAgainstWalls } from '../architecture/wallMath'
import { STILL_CAPTURE_WIDTHS, type StillCaptureOptions, type StillCaptureWidth } from '../runtime/stillCapture'
import { cameraOverlayMode, compactPreviewOverlayPolicy, fullCameraInfoLines, layoutOverlayLabels, type OverlayLabelPlacement, type OverlayRect } from '../runtime/cameraOverlayLayout'
import type { ShortcutBinding } from '../core/shortcutRegistry'
import { createCameraPoseSnapshot, type CameraPose, type CameraPoseSnapshot, type PhoneCameraLiveLayer } from '../phoneCamera/cameraPoseComposition'
import { CameraCompositionOverlay } from './CameraCompositionOverlay'
import { cameraPathModel, cameraPathPlayheadPosition, type CameraPathKeyframe, type CameraPathSegmentSelection } from '../timeline/cameraPath'
import type { MasterPreviewContext } from '../core/masterPreview'
import { graphicsScaleFromPointerDelta, imageTransformForAsset } from '../core/masterGraphics'
import { SHOT_THUMBNAIL_RENDER_WIDTH } from '../core/shotDocument'
import type { LiveReviewPointer } from '../liveReview/protocol'
import { formatWebGLDiagnostics, recordWebGLDiagnosticEvent, webGLDiagnosticsAvailable } from '../runtime/webglDiagnostics'
import { buildIdentity, interactionDiagnosticsCanBeActivated, interactionDiagnosticsFromLocation, SELECTION_DIAGNOSTICS_TOGGLE_EVENT } from '../runtime/buildIdentity'

export type V2TransformDebugState = {
  entityId: string
  runtimeFinal: string
  baseDocumentFinal: string
  timelineEvaluated: string
  valueAppliedAfterTransform: string
}

type V2StageProps = {
  view: 'blocking' | 'camera'
  activeSceneId: string
  sceneScopeId: string
  actors: readonly ActorDocument[]
  props: readonly PropDocument[]
  walls: readonly WallDocument[]
  openings: readonly OpeningDocument[]
  lights: readonly SunDocument[]
  cameras: readonly CameraDocument[]
  groups: readonly SceneGroup[]
  activeCameraId: string | null
  groupEditGroupId: string | null
  selectedEntityId: string | null
  selectedEntityIds: readonly string[]
  tool: StageTool
  onSelectionChange: (selection: StageSelection) => void
  onEnterGroupEdit: (groupId: string, childId: string) => void
  onExitGroupEdit: () => void
  onMarqueeChange?: (rect: { left: number; top: number; width: number; height: number; additive: boolean; subtractive: boolean } | null) => void
  onBeginEntityRename: (entityId: string) => void
  onToolChange: (tool: StageTool) => void
  onTransformStart: (change: StageTransform) => void
  onTransformEnd: (change: StageTransform) => void
  onTransformPreview: (change: StageTransform) => void
  onTransformBatchStart: (batch: StageTransformBatch) => void
  onTransformBatchEnd: (batch: StageTransformBatch) => void
  onTransformBatchPreview: (batch: StageTransformBatch) => void
  canTransformEntity?: (entityId: string) => boolean
  canTransformGroup?: (entityIds: readonly string[]) => boolean
  onTransformPermissionRequest?: (entityId: string) => boolean | Promise<boolean>
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
  sceneRevision: string
  isPlaying: boolean
  transformingEntityId: string | null
  suspendedTimelineEntityIds: ReadonlySet<string>
  suspendedTimelineProperties: SuspendedTimelineProperties
  runtimeSceneRef: MutableRefObject<SceneDocument>
  timeline: TimelineDocument
  isScrubbing: boolean
  lastTransformDebug: V2TransformDebugState | null
  selectedFrameGuideId: string | null
  selectedTimelineKeyframes: readonly { trackId: string; keyframeId: string }[]
  cameraPathVisible: boolean
  onCameraPathKeyframeSelect: (keyframe: CameraPathKeyframe) => void
  selectedCameraPathSegment: CameraPathSegmentSelection | null
  onCameraPathSegmentSelect: (segment: CameraPathSegmentSelection) => void
  onCameraPathPointMoveStart: (keyframe: CameraPathKeyframe, position: [number, number, number]) => void
  onCameraPathPointMovePreview: (keyframe: CameraPathKeyframe, position: [number, number, number]) => void
  onCameraPathPointMoveEnd: (keyframe: CameraPathKeyframe, position: [number, number, number]) => void
  thumbnailCaptureRef: MutableRefObject<(() => Promise<Blob | null>) | null>
  phoneCameraLiveApplyRef: MutableRefObject<((layer: PhoneCameraLiveLayer | null) => void) | null>
  phoneCameraLive: boolean
  shortcutBindings: Partial<Record<'select' | 'move' | 'rotate' | 'scale' | 'frameSelected', ShortcutBinding>>
  masterPreview: MasterPreviewContext | null
  masterImageUrls?: Readonly<Record<string, string>>
  activeMasterImageClipId?: string | null
  onMasterImageSelect?: (clipId: string) => void
  onMasterImageChange?: (patch: { positionX?: number; positionY?: number; scale?: number; rotation?: number }) => void
  readOnly?: boolean
  livePointer?: LiveReviewPointer | null
  livePointerActive?: boolean
  onLivePointerMove?: (point: { x: number; y: number; visible: boolean }) => void
}

function syncActors(engine: StageEngine, sceneId: string, actors: readonly ActorDocument[], runtimes: Map<string, ActorRuntime>): void {
  const actorIds = new Set(actors.map((actor) => actor.id))
  Array.from(runtimes.keys()).forEach((actorId) => {
    if (!actorIds.has(actorId)) {
      engine.removeEntity(actorId)
      runtimes.delete(actorId)
    }
  })
  actors.forEach((actor) => {
    let runtime = runtimes.get(actor.id)
    if (runtime && runtime.visualStyle !== actorVisualStyle(actor)) {
      engine.removeEntity(actor.id)
      runtimes.delete(actor.id)
      runtime = undefined
    }
    if (!runtime) {
      runtime = createActorRuntime(actor)
      runtimes.set(actor.id, runtime)
      engine.addEntity({ id: actor.id, sceneId, type: 'Actor', name: actor.name, root: runtime.root, setSelected: (selected) => runtime?.setSelected(selected), dispose: () => runtime?.dispose() })
    } else {
      runtime.applyDocument(actor)
    }
    engine.setEntityTransform(actor.id, { position: actor.position, rotation: actor.rotation })
  })
}

function syncCameras(engine: StageEngine, sceneId: string, cameras: readonly CameraDocument[], runtimes: Map<string, ProceduralCameraRuntime>): void {
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
      engine.addEntity({
        id: camera.id,
        sceneId,
        type: 'Camera',
        name: camera.name,
        root: runtime.root,
        selectionBounds: runtime.proxyRoot,
        getTransformPivot: () => runtime?.getTransformPivot() ?? runtime!.root.position.clone(),
        getTransformSnapshot: () => runtime?.getDocumentTransform() ?? { position: camera.position, rotation: camera.rotation },
        applyTransform: (transform) => runtime?.applyDocumentPose(transform.position, transform.rotation),
        setSelected: (selected) => runtime?.setSelected(selected),
        dispose: () => runtime?.dispose(),
      })
    } else {
      runtime.applyDocumentSettings(camera)
    }
  })
}

function syncScenic(engine: StageEngine, sceneId: string, definitions: readonly ScenicDefinition[], runtimes: Map<string, ScenicVisual>): void {
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
    engine.addEntity({ id: definition.id, sceneId, type: definition.type, name: definition.name, root: visual.root, setSelected: visual.setSelected, setSnapPreview: visual.setSnapPreview, dispose: visual.dispose, transformable: true, groupTransformable: definition.type !== 'Opening' || !definition.wallId, scalable })
  })
}

function syncGroupEntities(engine: StageEngine, sceneId: string, groups: readonly SceneGroup[], roots: Map<string, THREE.Group>): void {
  const ids = new Set(groups.map((group) => group.id))
  Array.from(roots.keys()).forEach((groupId) => {
    if (!ids.has(groupId)) {
      engine.removeEntity(groupId)
      roots.delete(groupId)
    }
  })
  groups.forEach((group) => {
    let root = roots.get(group.id)
    if (!root) {
      root = new THREE.Group()
      root.visible = false
      root.userData.stageGroup = true
      roots.set(group.id, root)
      engine.addEntity({
        id: group.id,
        sceneId,
        type: 'Prop',
        name: group.name,
        root,
        getTransformPivot: () => new THREE.Vector3(...group.pivot).add(root!.position),
        getTransformSnapshot: () => ({ position: [root!.position.x, root!.position.y, root!.position.z], rotation: [root!.rotation.x, root!.rotation.y, root!.rotation.z] }),
        applyTransform: (transform) => { root!.position.set(...transform.position); root!.rotation.set(...transform.rotation) },
        transformable: true,
        groupTransformable: true,
      })
    }
    root.position.set(...group.position)
    root.rotation.set(...group.rotation)
  })
}

function deliveryAspect(camera: CameraDocument): number {
  return deliveryAspectValue(camera.deliveryAspectRatio, cameraDisplayAspect(camera))
}

export function V2Stage({ view, activeSceneId, sceneScopeId, actors, props, walls, openings, lights, cameras, groups, activeCameraId, groupEditGroupId, selectedEntityId, selectedEntityIds, tool, onSelectionChange, onEnterGroupEdit, onExitGroupEdit, onMarqueeChange, onBeginEntityRename, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onTransformBatchStart, onTransformBatchEnd, onTransformBatchPreview, canTransformEntity, canTransformGroup, onTransformPermissionRequest, onCaptureFrameReady, cameraPreview, onCameraPreviewChange, onOpenCameraView, wallDrawing, wallDrawState, onWallDrawCommit, onWallDrawState, onWallDrawExit, snapPreviewWallId, evaluatedEntities, sceneRevision, isPlaying, transformingEntityId, suspendedTimelineEntityIds, suspendedTimelineProperties, runtimeSceneRef, timeline, isScrubbing, lastTransformDebug, selectedFrameGuideId, selectedTimelineKeyframes, cameraPathVisible, onCameraPathKeyframeSelect, selectedCameraPathSegment, onCameraPathSegmentSelect, onCameraPathPointMoveStart, onCameraPathPointMovePreview, onCameraPathPointMoveEnd, thumbnailCaptureRef, phoneCameraLiveApplyRef, phoneCameraLive, shortcutBindings, masterPreview, masterImageUrls = {}, activeMasterImageClipId = null, onMasterImageSelect = () => {}, onMasterImageChange = () => {}, readOnly = false, livePointer = null, livePointerActive = false, onLivePointerMove }: V2StageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<StageEngine | null>(null)
  const cameraViewRef = useRef<CameraViewRuntime | null>(null)
  const actorRuntimesRef = useRef(new Map<string, ActorRuntime>())
  const cameraRuntimesRef = useRef(new Map<string, ProceduralCameraRuntime>())
  const scenicRuntimesRef = useRef(new Map<string, ScenicVisual>())
  const groupRootsRef = useRef(new Map<string, THREE.Group>())
  const groupsRef = useRef(groups)
  const groupEditGroupIdRef = useRef<string | null>(groupEditGroupId)
  const groupPreviewRef = useRef<{ groups: readonly SceneGroup[]; actors: readonly ActorDocument[]; props: readonly PropDocument[]; walls: readonly WallDocument[]; cameras: readonly CameraDocument[] }>({ groups: [], actors: [], props: [], walls: [], cameras: [] })
  const applyGroupPreviewRef = useRef<(groupId: string) => void>(() => {})
  const baseCameraPosesRef = useRef(new Map<string, CameraPose>())
  const phoneLiveLayerRef = useRef<PhoneCameraLiveLayer | null>(null)
  const lastPhoneCameraIdRef = useRef<string | null>(null)
  const activeCameraIdRef = useRef(activeCameraId)
  const masterPreviewRef = useRef(masterPreview)
  const composeCameraRef = useRef<((cameraId: string) => void) | null>(null)
  const composeFrameRef = useRef<number | null>(null)
  const cameraRuntimeFrameRef = useRef<number | null>(null)
  const dirtyCameraIdsRef = useRef(new Set<string>())
  const composeDiagnosticsRef = useRef({ startedAt: 0, composeCount: 0, cameraApplyCount: 0, cameraViewRenderCount: 0, phoneLayerUpdateCount: 0, baseFrameMismatchCount: 0 })
  const basePoseVersionsRef = useRef(new Map<string, number>())
  const basePoseSignaturesRef = useRef(new Map<string, string>())
  const phoneLayerVersionRef = useRef(0)
  const finalPoseVersionRef = useRef(0)
  const finalPoseSnapshotRef = useRef<CameraPoseSnapshot | null>(null)
  const finalApplyDiagnosticsRef = useRef<Array<Record<string, unknown>>>([])
  const lastDiscontinuityLogAtRef = useRef(0)
  const suspendedTimelinePropertiesRef = useRef(suspendedTimelineProperties)
  const timelineRef = useRef(timeline)
  const isPlayingRef = useRef(isPlaying)
  const wallDrawingRef = useRef<WallDrawingController | null>(null)
  const initialStageRef = useRef({ activeSceneId, sceneScopeId, actors, props, walls, openings, lights, cameras, groups, selectedEntityId, selectedEntityIds, tool })
  const stageSceneScopeRef = useRef(sceneScopeId)
  const initialShortcutBindingsRef = useRef(shortcutBindings)
  const initialToolRef = useRef(tool)
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 })
  const [captureWidth, setCaptureWidth] = useState<StillCaptureWidth>(1920)
  const [includeCaptureGuides, setIncludeCaptureGuides] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [graphicsContextMessage, setGraphicsContextMessage] = useState<string | null>(null)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const [selectionDiagnosticsCopied, setSelectionDiagnosticsCopied] = useState(false)
  const [marqueeRect, setMarqueeRect] = useState<{ left: number; top: number; width: number; height: number; additive: boolean; subtractive: boolean } | null>(null)
  const [stageContextMenu, setStageContextMenu] = useState<{ entityId: string; x: number; y: number } | null>(null)
  const [stageViewSelection, setStageViewSelection] = useState<StageViewSelection>('perspective')
  const [stageViewOrientation, setStageViewOrientation] = useState<StageViewOrientation>([0, 0, 0, 1])
  const [axisLock, setAxisLock] = useState<StageAxisName | null>(null)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [snapGridSize, setSnapGridSize] = useState(0.1)
  const [rotationSnapDegrees, setRotationSnapDegrees] = useState(15)
  const [arrangeContext, setArrangeContext] = useState<{ sceneId: string; selectionKey: string } | null>(null)
  const arrangeContainerRef = useRef<HTMLDivElement>(null)
  const arrangeButtonRef = useRef<HTMLButtonElement>(null)
  const arrangeMenuRef = useRef<HTMLDivElement>(null)
  const [arrangeMenuPosition, setArrangeMenuPosition] = useState<CSSProperties | null>(null)
  const [stageDebug, setStageDebug] = useState<StageEngineDebugSnapshot | null>(null)
  const selectionKey = selectedEntityIds.join('\u0000')
  const arrangeableSelectionCount = selectedEntityIds.filter((entityId) => !openings.some((opening) => opening.id === entityId && Boolean(opening.wallId))).length
  const arrangeIsOpen = arrangeContext?.sceneId === activeSceneId && arrangeContext.selectionKey === selectionKey && arrangeableSelectionCount >= 2
  const callbacksRef = useRef({ onSelectionChange, onEnterGroupEdit, onExitGroupEdit, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onTransformBatchStart, onTransformBatchEnd, onTransformBatchPreview, canTransformEntity, canTransformGroup, onTransformPermissionRequest, onWallDrawCommit, onWallDrawState, onWallDrawExit, onCameraPathKeyframeSelect, onCameraPathSegmentSelect, onCameraPathPointMoveStart, onCameraPathPointMovePreview, onCameraPathPointMoveEnd })
  const phoneCameraLiveRef = useRef(phoneCameraLive)
  const diagnosticsActivationAvailable = interactionDiagnosticsCanBeActivated()
  const [interactionDiagnosticsEnabled, setInteractionDiagnosticsEnabled] = useState(interactionDiagnosticsFromLocation)
  const debugEnabled = diagnosticsActivationAvailable && interactionDiagnosticsEnabled
  const debugEnabledRef = useRef(debugEnabled)

  useEffect(() => {
    if (!diagnosticsActivationAvailable) return
    const toggleDiagnostics = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || !event.altKey || !event.shiftKey || event.key.toLowerCase() !== 'd') return
      event.preventDefault()
      setInteractionDiagnosticsEnabled((enabled) => !enabled)
    }
    window.addEventListener('keydown', toggleDiagnostics)
    return () => window.removeEventListener('keydown', toggleDiagnostics)
  }, [diagnosticsActivationAvailable])
  useEffect(() => {
    if (!diagnosticsActivationAvailable) return
    const toggleDiagnostics = () => setInteractionDiagnosticsEnabled((enabled) => !enabled)
    window.addEventListener(SELECTION_DIAGNOSTICS_TOGGLE_EVENT, toggleDiagnostics)
    return () => window.removeEventListener(SELECTION_DIAGNOSTICS_TOGGLE_EVENT, toggleDiagnostics)
  }, [diagnosticsActivationAvailable])
  useEffect(() => {
    debugEnabledRef.current = debugEnabled
    engineRef.current?.setDebugEnabled(debugEnabled)
  }, [debugEnabled])
  useEffect(() => {
    groupsRef.current = groups
  }, [groups])
  useEffect(() => {
    groupEditGroupIdRef.current = groupEditGroupId
  }, [groupEditGroupId])

  const masterPreviewData = useMemo(() => {
    const scene = masterPreview?.scene ?? null
    const evaluation = masterPreview?.evaluatedEntities ?? (scene && masterPreview?.sourceFrame !== null && masterPreview?.sourceFrame !== undefined ? evaluateTimeline(scene, masterPreview.sourceFrame) : null)
    const evaluatedScene = scene && evaluation && masterPreview?.sourceFrame !== null && masterPreview?.sourceFrame !== undefined
      ? evaluateSceneFrame(scene, masterPreview.sourceFrame, evaluation)
      : null
    return {
      actors: evaluatedScene?.actors ?? [],
      props: evaluatedScene?.props ?? [],
      walls: evaluatedScene?.walls ?? [],
      openings: evaluatedScene?.openings ?? [],
      lights: evaluatedScene?.lights ?? [],
      camera: masterPreview?.cameraId ? evaluatedScene?.cameras.find((camera) => camera.id === masterPreview.cameraId) ?? null : null,
    }
  }, [masterPreview])
  const masterPreviewActors = masterPreviewData.actors
  const masterPreviewProps = masterPreviewData.props
  const masterPreviewWalls = masterPreviewData.walls
  const masterPreviewOpenings = masterPreviewData.openings
  const masterPreviewLights = masterPreviewData.lights
  const masterPreviewCamera = masterPreviewData.camera

  const cameraPose = (camera: CameraDocument): CameraPose => ({ position: [...camera.position], rotation: [...camera.rotation] })
  const scheduleCameraComposition = (cameraIds: readonly string[] = []) => {
    if (isPlayingRef.current || phoneCameraLiveRef.current) return
    const fallbackCameraId = phoneLiveLayerRef.current?.cameraId ?? lastPhoneCameraIdRef.current ?? activeCameraIdRef.current
    const requestedCameraIds = cameraIds.length > 0 ? cameraIds : fallbackCameraId ? [fallbackCameraId] : []
    requestedCameraIds.forEach((cameraId) => dirtyCameraIdsRef.current.add(cameraId))
    if (composeFrameRef.current !== null) return
    composeFrameRef.current = window.requestAnimationFrame(() => {
      try {
        const cameraIdsToCompose = Array.from(dirtyCameraIdsRef.current)
        dirtyCameraIdsRef.current.clear()
        cameraIdsToCompose.forEach((cameraId) => composeCameraRef.current?.(cameraId))
      } finally {
        composeFrameRef.current = null
      }
    })
  }

  useEffect(() => {
    activeCameraIdRef.current = activeCameraId
  }, [activeCameraId])

  useEffect(() => {
    masterPreviewRef.current = masterPreview
  }, [masterPreview])

  useEffect(() => {
    suspendedTimelinePropertiesRef.current = suspendedTimelineProperties
  }, [suspendedTimelineProperties])

  useEffect(() => {
    timelineRef.current = timeline
    isPlayingRef.current = isPlaying
  }, [timeline, isPlaying])

  useEffect(() => {
    composeCameraRef.current = (cameraId) => {
      if (masterPreviewRef.current) return
      const fallback = baseCameraPosesRef.current.get(cameraId)
      const runtime = cameraRuntimesRef.current.get(cameraId)
      if (!fallback || !runtime) return
      const runtimeScene = runtimeSceneRef.current
      const runtimeCamera = runtimeScene.cameras.find((camera) => camera.id === cameraId)
      const runtimeEvaluation = runtimeCamera ? evaluateTimeline(runtimeScene, runtimeScene.timeline.currentFrame) : null
      const runtimeEvaluated = runtimeEvaluation?.[cameraId]
      const suspended = suspendedTimelinePropertiesRef.current[cameraId]
      const canApplyPosition = !(suspended?.has('position') ?? false)
      const canApplyRotation = !(suspended?.has('rotation') ?? false)
      const base: CameraPose = {
        position: canApplyPosition && runtimeEvaluated && timelinePropertyIsAuthored(runtimeEvaluated, 'position') ? [...runtimeEvaluated.position] : [...fallback.position],
        rotation: canApplyRotation && runtimeEvaluated && timelinePropertyIsAuthored(runtimeEvaluated, 'rotation') ? [...runtimeEvaluated.rotation] : [...fallback.rotation],
      }
      const evaluatedGroups = runtimeScene.groups.map((group) => {
        const evaluatedGroup = runtimeEvaluation?.[group.id]
        return evaluatedGroup ? { ...group, position: [...evaluatedGroup.position] as ActorVector3, rotation: [...evaluatedGroup.rotation] as ActorVector3 } : group
      })
      const groupedCamera = runtimeCamera ? evaluateGroupTransforms([{ ...runtimeCamera, position: [...base.position], rotation: [...base.rotation] }], evaluatedGroups)[0] : null
      if (groupedCamera) {
        base.position = [...groupedCamera.position]
        base.rotation = [...groupedCamera.rotation]
      }
      const layer = phoneLiveLayerRef.current?.cameraId === cameraId ? phoneLiveLayerRef.current : null
      const baseSignature = `${base.position.join(',')}|${base.rotation.join(',')}`
      const previousBaseSignature = basePoseSignaturesRef.current.get(cameraId)
      if (previousBaseSignature !== baseSignature) {
        basePoseSignaturesRef.current.set(cameraId, baseSignature)
        basePoseVersionsRef.current.set(cameraId, (basePoseVersionsRef.current.get(cameraId) ?? 0) + 1)
      }
      const basePoseVersion = basePoseVersionsRef.current.get(cameraId) ?? 0
      const finalPoseVersion = finalPoseVersionRef.current + 1
      finalPoseVersionRef.current = finalPoseVersion
      const finalSnapshot = createCameraPoseSnapshot(base, layer, {
        playbackFrame: runtimeScene.timeline.currentFrame,
        basePoseVersion,
        phoneLayerVersion: phoneLayerVersionRef.current,
        finalPoseVersion,
      })
      const final = finalSnapshot
      finalPoseSnapshotRef.current = finalSnapshot
      engineRef.current?.setEntityTransform(cameraId, { position: final.position, rotation: final.rotation })
      cameraViewRef.current?.applyComposedCameraPose(cameraId, finalSnapshot)
      if (import.meta.env.DEV) {
        const diagnostics = composeDiagnosticsRef.current
        if (diagnostics.startedAt === 0) diagnostics.startedAt = Date.now()
        diagnostics.composeCount += 1
        diagnostics.cameraApplyCount += 1
        const playbackFrame = runtimeScene.timeline.currentFrame
        const reactFrame = timelineRef.current.currentFrame
        if (playbackFrame !== reactFrame) diagnostics.baseFrameMismatchCount += 1
        const previous = finalApplyDiagnosticsRef.current[finalApplyDiagnosticsRef.current.length - 1]
        const previousPosition = previous?.position as [number, number, number] | undefined
        const previousRotation = previous?.rotation as [number, number, number] | undefined
        const positionJump = previousPosition ? Math.hypot(final.position[0] - previousPosition[0], final.position[1] - previousPosition[1], final.position[2] - previousPosition[2]) : 0
        const rotationJump = previousRotation ? Math.hypot(final.rotation[0] - previousRotation[0], final.rotation[1] - previousRotation[1], final.rotation[2] - previousRotation[2]) : 0
        const diagnosticEntry = {
          sourceTrigger: 'cameraRuntimeTick',
          canonicalPlaybackFrame: playbackFrame,
          basePoseVersion,
          phoneLayerVersion: phoneLayerVersionRef.current,
          finalPoseVersion,
          position: [...final.position],
          rotation: [...final.rotation],
          positionJump,
          rotationJump,
        }
        finalApplyDiagnosticsRef.current.push(diagnosticEntry)
        if (finalApplyDiagnosticsRef.current.length > 120) finalApplyDiagnosticsRef.current.shift()
        if ((positionJump > 0.75 || rotationJump > 0.75) && Date.now() - lastDiscontinuityLogAtRef.current > 250) {
          lastDiscontinuityLogAtRef.current = Date.now()
          console.warn('[Phone Camera Pose Discontinuity]', { previous, current: diagnosticEntry, recent: [...finalApplyDiagnosticsRef.current] })
        }
        if (layer && layer.positionDelta.every((value) => Math.abs(value) <= 1e-12)) {
          const positionError = Math.hypot(final.position[0] - base.position[0], final.position[1] - base.position[1], final.position[2] - base.position[2])
          if (positionError > 1e-6) console.error('[Phone Camera Invariant] Pan-only composition changed Position', { base, final, layer, finalPoseVersion })
        }
        const now = Date.now()
        const elapsed = now - diagnostics.startedAt
        if (elapsed >= 1000) {
          const seconds = elapsed / 1000
          console.debug('[Phone Camera Diagnostics]', {
            playbackFps: isPlayingRef.current ? Number((diagnostics.composeCount / seconds).toFixed(1)) : 0,
            playbackFrame,
            baseFrame: playbackFrame,
            cameraBaseEvaluatedFrame: playbackFrame,
            finalComposedFrame: playbackFrame,
            finalApplyHz: Number((diagnostics.cameraApplyCount / seconds).toFixed(1)),
            CameraViewRenderHz: Number((diagnostics.cameraViewRenderCount / seconds).toFixed(1)),
            phoneLayerUpdateHz: Number((diagnostics.phoneLayerUpdateCount / seconds).toFixed(1)),
            baseFrameMismatchCount: diagnostics.baseFrameMismatchCount,
            composeFramePending: composeFrameRef.current !== null,
          })
          diagnostics.startedAt = now
          diagnostics.composeCount = 0
          diagnostics.cameraApplyCount = 0
          diagnostics.cameraViewRenderCount = 0
          diagnostics.phoneLayerUpdateCount = 0
          diagnostics.baseFrameMismatchCount = 0
        }
      }
    }
    return () => {
      composeCameraRef.current = null
    }
  }, [runtimeSceneRef])

  useEffect(() => {
    if (!isPlaying && !phoneCameraLive) return
    const tick = () => {
      if (!isPlayingRef.current && !phoneCameraLiveRef.current) {
        cameraRuntimeFrameRef.current = null
        return
      }
      const cameraId = activeCameraIdRef.current
      if (cameraId) composeCameraRef.current?.(cameraId)
      cameraRuntimeFrameRef.current = window.requestAnimationFrame(tick)
    }
    if (cameraRuntimeFrameRef.current === null) cameraRuntimeFrameRef.current = window.requestAnimationFrame(tick)
    return () => {
      if (cameraRuntimeFrameRef.current !== null) window.cancelAnimationFrame(cameraRuntimeFrameRef.current)
      cameraRuntimeFrameRef.current = null
    }
  }, [isPlaying, phoneCameraLive])

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onEnterGroupEdit, onExitGroupEdit, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onTransformBatchStart, onTransformBatchEnd, onTransformBatchPreview, canTransformEntity, canTransformGroup, onTransformPermissionRequest, onWallDrawCommit, onWallDrawState, onWallDrawExit, onCameraPathKeyframeSelect, onCameraPathSegmentSelect, onCameraPathPointMoveStart, onCameraPathPointMovePreview, onCameraPathPointMoveEnd }
  }, [onSelectionChange, onEnterGroupEdit, onExitGroupEdit, onToolChange, onTransformStart, onTransformEnd, onTransformPreview, onTransformBatchStart, onTransformBatchEnd, onTransformBatchPreview, canTransformEntity, canTransformGroup, onTransformPermissionRequest, onWallDrawCommit, onWallDrawState, onWallDrawExit, onCameraPathKeyframeSelect, onCameraPathSegmentSelect, onCameraPathPointMoveStart, onCameraPathPointMovePreview, onCameraPathPointMoveEnd])

  useEffect(() => {
    const wasLive = phoneCameraLiveRef.current
    phoneCameraLiveRef.current = phoneCameraLive
    if (phoneCameraLive && (tool === 'move' || tool === 'rotate')) callbacksRef.current.onToolChange('select')
    if (wasLive && !phoneCameraLive) scheduleCameraComposition()
  }, [phoneCameraLive, tool])

  useEffect(() => {
    const stageElement = stageRef.current
    if (!stageElement) return
    const liveApplyRef = phoneCameraLiveApplyRef
    const captureRef = thumbnailCaptureRef
    const baseCameraPoses = baseCameraPosesRef.current
    const dirtyCameraIds = dirtyCameraIdsRef.current
    const actorRuntimes = actorRuntimesRef.current
    const cameraRuntimes = cameraRuntimesRef.current
    const scenicRuntimes = scenicRuntimesRef.current
    const engine = new StageEngine(stageElement, {
      onToolChanged: (nextTool) => callbacksRef.current.onToolChange(phoneCameraLiveRef.current && (nextTool === 'move' || nextTool === 'rotate') ? 'select' : nextTool),
      onTransformStart: (change) => callbacksRef.current.onTransformStart(change),
      onTransformEnd: (change) => { applyGroupPreviewRef.current(change.entityId); callbacksRef.current.onTransformEnd(change) },
      onTransformPreview: (change) => {
        applyGroupPreviewRef.current(change.entityId)
        cameraViewRef.current?.previewTransform(change)
        callbacksRef.current.onTransformPreview(change)
      },
      onTransformBatchStart: (batch) => callbacksRef.current.onTransformBatchStart(batch),
      onTransformBatchEnd: (batch) => callbacksRef.current.onTransformBatchEnd(batch),
      onTransformBatchPreview: (batch) => {
        const primary = batch.changes.find((change) => change.entityId === batch.primaryEntityId)
        if (primary) cameraViewRef.current?.previewTransform(primary)
        callbacksRef.current.onTransformBatchPreview(batch)
      },
      onEntityDoubleClick: (entityId) => {
        const group = groupsRef.current.find((candidate) => candidate.childIds.includes(entityId))
        if (!group) return
        callbacksRef.current.onEnterGroupEdit(group.id, entityId)
        callbacksRef.current.onSelectionChange({ ids: [entityId], primaryId: entityId })
      },
      onEscape: () => {
        const groupId = groupEditGroupIdRef.current
        if (!groupId) return false
        callbacksRef.current.onExitGroupEdit()
        callbacksRef.current.onSelectionChange({ ids: [groupId], primaryId: groupId })
        return true
      },
      canTransformEntity: (entityId) => callbacksRef.current.canTransformEntity?.(entityId) ?? true,
      canTransformGroup: (entityIds) => callbacksRef.current.canTransformGroup?.(entityIds) ?? true,
      onTransformPermissionRequest: (entityId) => callbacksRef.current.onTransformPermissionRequest?.(entityId) ?? true,
      onAxisLockChange: setAxisLock,
      onContextMenu: (entityId, point) => setStageContextMenu(entityId ? { entityId, x: point.clientX, y: point.clientY } : null),
      onViewChanged: setStageViewSelection,
      onViewOrientationChanged: setStageViewOrientation,
      onMarqueeChange: (rect) => {
        const bounds = stageElement.getBoundingClientRect()
        setMarqueeRect(rect ? { ...rect, left: rect.left - bounds.left, top: rect.top - bounds.top } : null)
        onMarqueeChange?.(rect)
      },
      resolveSelectionId: (entityId) => {
        return groupSelectionIdForEdit(entityId, groupsRef.current, groupEditGroupIdRef.current)
      },
      resolveSelectionVisualIds: (entityId) => {
        const editingGroup = groupsRef.current.find((group) => group.id === groupEditGroupIdRef.current)
        if (editingGroup?.childIds.includes(entityId)) return [entityId]
        return groupsRef.current.find((group) => group.id === entityId)?.childIds ?? [entityId]
      },
      onCameraPathKeyframeSelect: (keyframe) => callbacksRef.current.onCameraPathKeyframeSelect(keyframe),
      onCameraPathSegmentSelect: (segment) => callbacksRef.current.onCameraPathSegmentSelect(segment),
      onCameraPathPointMoveStart: (keyframe, position) => callbacksRef.current.onCameraPathPointMoveStart(keyframe, position),
      onCameraPathPointMovePreview: (keyframe, position) => callbacksRef.current.onCameraPathPointMovePreview(keyframe, position),
      onCameraPathPointMoveEnd: (keyframe, position) => callbacksRef.current.onCameraPathPointMoveEnd(keyframe, position),
      onDebug: (snapshot) => {
        if (debugEnabledRef.current) setStageDebug(snapshot)
      },
      debugEnabled: debugEnabledRef.current,
      toolShortcuts: Object.fromEntries((['select', 'move', 'rotate', 'scale'] as const).map((key) => [key, initialShortcutBindingsRef.current[key]?.key ?? ({ select: 'e', move: 'q', rotate: 'r', scale: 's' }[key])])),
      frameSelectedShortcut: initialShortcutBindingsRef.current.frameSelected?.key ?? 'f',
    })
    const wallDrawingController = new WallDrawingController(engine, {
      onCommit: (start, end) => callbacksRef.current.onWallDrawCommit(start, end),
      onState: (state) => callbacksRef.current.onWallDrawState(state),
      onExit: () => callbacksRef.current.onWallDrawExit(),
    })
    wallDrawingRef.current = wallDrawingController
    const cameraView = new CameraViewRuntime(stageElement, {
      onRender: () => { if (import.meta.env.DEV) composeDiagnosticsRef.current.cameraViewRenderCount += 1 },
    })
    cameraViewRef.current = cameraView
    let recoveryFrame: number | null = null
    const handleContextLost = (event: Event) => {
      const identity = (event.target as HTMLCanvasElement | null)?.dataset.webglIdentity
      if (identity !== 'stage' && identity !== 'camera-view' && identity !== 'camera-preview') return
      event.preventDefault()
      if (recoveryFrame !== null) window.cancelAnimationFrame(recoveryFrame)
      recoveryFrame = null
      setGraphicsContextMessage('The graphics context was lost. Reload the app to continue safely.')
    }
    const handleContextRestored = (event: Event) => {
      const identity = (event.target as HTMLCanvasElement | null)?.dataset.webglIdentity
      if (identity !== 'stage' && identity !== 'camera-view' && identity !== 'camera-preview') return
      setGraphicsContextMessage('Graphics were restored. Verifying the Stage…')
      engine.beginRendererRecovery()
      cameraView.beginRendererRecovery()
      cameraView.render()
      // Three.js rebuilds its GPU state during restoration. Wait for the
      // scheduled Stage render to run before clearing the recovery warning.
      const verify = (remainingFrames: number): void => {
        recoveryFrame = window.requestAnimationFrame(() => {
          if (remainingFrames > 1) {
            verify(remainingFrames - 1)
            return
          }
          recoveryFrame = null
          if (engine.isRendererAvailable() && cameraView.isRendererAvailable()) {
            recordWebGLDiagnosticEvent({ type: 'interactive-render-resumed', renderer: identity, canRenderAfterRestoration: true })
            setGraphicsContextMessage(null)
          } else setGraphicsContextMessage('The graphics context could not be restored. Reload the app to continue safely.')
        })
      }
      verify(2)
    }
    stageElement.addEventListener('webglcontextlost', handleContextLost, true)
    stageElement.addEventListener('webglcontextrestored', handleContextRestored, true)
    const removeSelectionListener = engine.onSelectionChanged((selection) => {
      const editingGroup = groupsRef.current.find((group) => group.id === groupEditGroupIdRef.current)
      if (editingGroup && selection.ids.some((id) => !editingGroup.childIds.includes(id))) callbacksRef.current.onExitGroupEdit()
      callbacksRef.current.onSelectionChange(selection)
    })
    const initial = initialStageRef.current
    engine.reconcileEntities(() => {
      syncActors(engine, initial.activeSceneId, initial.actors, actorRuntimes)
      syncCameras(engine, initial.activeSceneId, initial.cameras, cameraRuntimes)
      engine.setProps([])
      syncScenic(engine, initial.activeSceneId, [...initial.props, ...initial.walls, ...initial.openings.map((opening) => resolveOpeningAgainstWalls(opening, initial.walls)), ...initial.lights], scenicRuntimes)
      syncGroupEntities(engine, initial.activeSceneId, initial.groups, groupRootsRef.current)
    })
    engine.setTool(initialToolRef.current)
    engine.setSelected(initial.selectedEntityIds)
    engineRef.current = engine
    liveApplyRef.current = (layer) => {
      phoneLiveLayerRef.current = layer
      if (layer) lastPhoneCameraIdRef.current = layer.cameraId
      phoneLayerVersionRef.current += 1
      if (import.meta.env.DEV) composeDiagnosticsRef.current.phoneLayerUpdateCount += 1
      // Phone packets publish the latest semantic layer only. The active
      // runtime loop samples it on its next tick and owns final application.
    }
    captureRef.current = () => cameraViewRef.current?.captureStill({ width: SHOT_THUMBNAIL_RENDER_WIDTH, includeGuides: false }) ?? Promise.resolve(null)
    return () => {
      captureRef.current = null
      liveApplyRef.current = null
      phoneLiveLayerRef.current = null
      dirtyCameraIds.clear()
      baseCameraPoses.clear()
      if (composeFrameRef.current !== null) window.cancelAnimationFrame(composeFrameRef.current)
      composeFrameRef.current = null
      if (recoveryFrame !== null) window.cancelAnimationFrame(recoveryFrame)
      recoveryFrame = null
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
      groupRootsRef.current.clear()
      groupPreviewRef.current = { groups: [], actors: [], props: [], walls: [], cameras: [] }
      applyGroupPreviewRef.current = () => {}
    }
  }, [phoneCameraLiveApplyRef, thumbnailCaptureRef])

  const copyGraphicsDiagnostics = async (): Promise<void> => {
    const text = formatWebGLDiagnostics()
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setDiagnosticsCopied(true)
      window.setTimeout(() => setDiagnosticsCopied(false), 1600)
    } catch {
      setDiagnosticsCopied(false)
    }
  }

  const copySelectionDiagnostics = async (): Promise<void> => {
    const report = {
      build: buildIdentity,
      capturedAt: new Date().toISOString(),
      sceneId: activeSceneId,
      appSelectedIds: [...selectedEntityIds],
      engineSelectedIds: stageDebug?.selectedIds ?? [],
      outlineTargetIds: stageDebug?.selectionOutlineTargetIds ?? [],
      outlineCount: stageDebug?.selectionOutlineCount ?? 0,
      runtimeInstance: stageDebug?.stageRuntimeInstance ?? 'NONE',
      cameraInstance: stageDebug?.stageCameraInstance ?? 'NONE',
      lastPointerEvent: stageDebug?.lastPointerEvent ?? 'NONE',
      lastSelectionEvent: stageDebug?.lastSelectionEvent ?? 'NONE',
      lastNavigationEvent: stageDebug?.lastNavigationEvent ?? 'NONE',
      lastEmptyClickEvent: stageDebug?.lastEmptyClickEvent ?? 'NONE',
      lastDeselectionCallback: stageDebug?.lastDeselectionCallback ?? 'NONE',
      lastSelectionCallbackPayload: stageDebug?.lastSelectionCallbackPayload ?? 'NONE',
      marqueePreviewActive: stageDebug?.marqueePreviewActive ?? false,
      marqueePreviewIds: stageDebug?.marqueePreviewIds ?? [],
      marqueeFinalHitIds: stageDebug?.marqueeFinalHitIds ?? [],
      marqueePreviousSelectedIds: stageDebug?.marqueePreviousSelectedIds ?? [],
      marqueeNextSelectedIds: stageDebug?.marqueeNextSelectedIds ?? [],
      marqueeCallbackPayload: stageDebug?.marqueeCallbackPayload ?? 'NONE',
      recentInteractionEvents: stageDebug?.recentInteractionEvents ?? [],
      gesture: stageDebug?.pointerMode ?? 'NONE',
      pointerCaptureOwner: stageDebug?.pointerCaptureOwner ?? 'NONE',
      entityReconciliationCount: stageDebug?.entityReconciliationCount ?? 0,
      lastEntityReconciliation: stageDebug?.lastEntityReconciliation ?? 'NONE',
    }
    const text = JSON.stringify(report, null, 2)
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
      else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setSelectionDiagnosticsCopied(true)
      window.setTimeout(() => setSelectionDiagnosticsCopied(false), 1600)
    } catch {
      setSelectionDiagnosticsCopied(false)
    }
  }

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
    engineRef.current?.setSnapSettings(snapEnabled, snapGridSize)
  }, [snapEnabled, snapGridSize])

  useEffect(() => {
    engineRef.current?.setRotationSnapSettings(snapEnabled, rotationSnapDegrees)
  }, [snapEnabled, rotationSnapDegrees])

  useEffect(() => {
    if (!stageContextMenu) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.v2-entity-context-menu')) return
      setStageContextMenu(null)
    }
    window.addEventListener('pointerdown', dismiss)
    return () => window.removeEventListener('pointerdown', dismiss)
  }, [stageContextMenu])

  const updateArrangeMenuPosition = useCallback(() => {
    const trigger = arrangeButtonRef.current?.getBoundingClientRect()
    const menu = arrangeMenuRef.current
    const viewport = stageRef.current?.getBoundingClientRect()
    if (!trigger || !viewport) return
    const size = menu ? { width: menu.getBoundingClientRect().width, height: menu.getBoundingClientRect().height } : { width: 320, height: 210 }
    const position = arrangePopoverPosition(trigger, size, viewport)
    setArrangeMenuPosition({ left: position.left, top: position.top })
  }, [])

  useEffect(() => {
    if (!arrangeIsOpen) return
    const update = () => updateArrangeMenuPosition()
    update()
    const frame = window.requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [arrangeIsOpen, updateArrangeMenuPosition])

  useEffect(() => {
    if (!arrangeIsOpen) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && (arrangeContainerRef.current?.contains(event.target) || arrangeMenuRef.current?.contains(event.target))) return
      setArrangeContext(null)
      setArrangeMenuPosition(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setArrangeContext(null)
      setArrangeMenuPosition(null)
      arrangeButtonRef.current?.focus()
      event.preventDefault()
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', escape)
    return () => {
      window.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('keydown', escape)
    }
  }, [arrangeIsOpen])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (stageViewSelectionIsIsometric(stageViewSelection)) engine.setIsometricView(stageViewSelection)
    else engine.setViewMode(stageViewSelection)
  }, [stageViewSelection])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || stageSceneScopeRef.current === sceneScopeId) return
    engine.clearEntities()
    actorRuntimesRef.current.clear()
    cameraRuntimesRef.current.clear()
    scenicRuntimesRef.current.clear()
    baseCameraPosesRef.current.clear()
    dirtyCameraIdsRef.current.clear()
    phoneLiveLayerRef.current = null
    lastPhoneCameraIdRef.current = null
    if (composeFrameRef.current !== null) window.cancelAnimationFrame(composeFrameRef.current)
    composeFrameRef.current = null
    setAxisLock(null)
    stageSceneScopeRef.current = sceneScopeId
  }, [sceneScopeId])

  useEffect(() => {
    engineRef.current?.setShortcutBindings(Object.fromEntries((['select', 'move', 'rotate', 'scale'] as const).map((key) => [key, shortcutBindings[key]?.key ?? ({ select: 'e', move: 'q', rotate: 'r', scale: 's' }[key])])), shortcutBindings.frameSelected?.key ?? 'f')
  }, [shortcutBindings])

  useEffect(() => {
    wallDrawingRef.current?.setActive(wallDrawing)
  }, [wallDrawing])

  useEffect(() => {
    engineRef.current?.setSnapPreview(snapPreviewWallId)
  }, [snapPreviewWallId])

  const selectedPathCamera = selectedEntityIds.length === 1 ? cameras.find((camera) => camera.id === selectedEntityIds[0]) ?? null : null
  const selectedPathKeyframeId = selectedTimelineKeyframes.length === 1 ? selectedTimelineKeyframes[0].keyframeId : null
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || view !== 'blocking' || !selectedPathCamera) {
      engine?.setCameraPathOverlay({ samples: [], segments: [], keyframes: [], selectedKeyframeId: null, selectedSegmentId: null, visible: false })
      return
    }
    const pathScene: SceneDocument = { ...runtimeSceneRef.current, cameras: [...cameras], timeline }
    const path = cameraPathModel(pathScene, selectedPathCamera.id)
    engine.setCameraPathOverlay({ samples: path.samples, segments: path.segments.map((segment) => ({ id: segment.id, samples: segment.samples, selection: { cameraId: selectedPathCamera.id, trackId: segment.from.trackId, fromKeyframeId: segment.from.keyframeId, toKeyframeId: segment.to.keyframeId } })), keyframes: path.keyframes, selectedKeyframeId: selectedPathKeyframeId, selectedSegmentId: selectedCameraPathSegment ? `${selectedCameraPathSegment.cameraId}:${selectedCameraPathSegment.fromKeyframeId}:${selectedCameraPathSegment.toKeyframeId}` : null, visible: cameraPathVisible })
  }, [activeSceneId, cameras, cameraPathVisible, runtimeSceneRef, selectedCameraPathSegment, selectedPathCamera, selectedPathKeyframeId, timeline, view])

  useEffect(() => {
    engineRef.current?.setCameraPathSelectedKeyframe(selectedPathKeyframeId)
  }, [selectedPathKeyframeId])

  useEffect(() => {
    engineRef.current?.setCameraPathSelectedSegment(selectedCameraPathSegment ? `${selectedCameraPathSegment.cameraId}:${selectedCameraPathSegment.fromKeyframeId}:${selectedCameraPathSegment.toKeyframeId}` : null)
  }, [selectedCameraPathSegment])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine || view !== 'blocking' || !selectedPathCamera) return
    const pathScene: SceneDocument = { ...runtimeSceneRef.current, cameras: [...cameras], timeline }
    engine.setCameraPathPlayhead(cameraPathPlayheadPosition(pathScene, selectedPathCamera.id, timeline.currentFrame))
  }, [cameras, evaluatedEntities, runtimeSceneRef, selectedPathCamera, timeline, view])

  useEffect(() => {
    if (engineRef.current) engineRef.current.reconcileEntities(() => syncActors(engineRef.current!, activeSceneId, actors, actorRuntimesRef.current))
  }, [activeSceneId, actors])

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.reconcileEntities(() => syncCameras(engineRef.current!, activeSceneId, cameras, cameraRuntimesRef.current))
      cameras.forEach((camera) => {
        const base = cameraPose(camera)
        baseCameraPosesRef.current.set(camera.id, base)
      })
      scheduleCameraComposition(cameras.map((camera) => camera.id))
    }
  }, [activeSceneId, cameras])

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
      if (!evaluated || !(evaluated.authoredProperties?.length)) return
      const previous = baseCameraPosesRef.current.get(camera.id) ?? cameraPose(camera)
      const base: CameraPose = {
        position: shouldApplyTimelinePropertyEvaluation(camera.id, 'position', transformingEntityId, suspendedTimelineEntityIds, suspendedTimelineProperties) && timelinePropertyIsAuthored(evaluated, 'position') ? [...evaluated.position] : [...previous.position],
        rotation: shouldApplyTimelinePropertyEvaluation(camera.id, 'rotation', transformingEntityId, suspendedTimelineEntityIds, suspendedTimelineProperties) && timelinePropertyIsAuthored(evaluated, 'rotation') ? [...evaluated.rotation] : [...previous.rotation],
      }
      baseCameraPosesRef.current.set(camera.id, base)
      dirtyCameraIdsRef.current.add(camera.id)
    })
    scheduleCameraComposition()
  }, [actors, cameras, evaluatedEntities, suspendedTimelineEntityIds, suspendedTimelineProperties, transformingEntityId])

  useEffect(() => {
    engineRef.current?.setSelected(selectedEntityIds)
  }, [selectedEntityIds])

  useEffect(() => {
    const evaluatedActors = actors.map((actor) => shouldApplyTimelineEvaluation(actor.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[actor.id] ? { ...actor, ...evaluatedEntities[actor.id] } : actor)
    const evaluatedProps = props.map((prop) => shouldApplyTimelineEvaluation(prop.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[prop.id] ? { ...prop, ...evaluatedEntities[prop.id] } : prop)
    const evaluatedWalls = walls.map((wall) => shouldApplyTimelineEvaluation(wall.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[wall.id] ? { ...wall, ...evaluatedEntities[wall.id] } : wall)
    const evaluatedOpenings = openings.map((opening) => shouldApplyTimelineEvaluation(opening.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[opening.id] ? { ...opening, ...evaluatedEntities[opening.id], openAngle: evaluatedEntities[opening.id].openAngle ?? opening.openAngle } : opening)
    const resolvedOpenings = evaluatedOpenings.map((opening) => resolveOpeningAgainstWalls(opening, evaluatedWalls))
    const evaluatedLights = lights.map((light) => shouldApplyTimelineEvaluation(light.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[light.id] ? { ...light, ...evaluatedEntities[light.id], azimuth: evaluatedEntities[light.id].azimuth ?? light.azimuth, elevation: evaluatedEntities[light.id].elevation ?? light.elevation, intensity: evaluatedEntities[light.id].intensity ?? light.intensity, color: evaluatedEntities[light.id].color ?? light.color } : light)
    const evaluatedGroups = groups.map((group) => shouldApplyTimelineEvaluation(group.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[group.id] ? { ...group, position: [...evaluatedEntities[group.id].position] as ActorVector3, rotation: [...evaluatedEntities[group.id].rotation] as ActorVector3 } : group)
    const evaluatedCameras = cameras.map((camera) => {
      if (!shouldApplyTimelineEvaluation(camera.id, transformingEntityId, suspendedTimelineEntityIds)) return camera
      const evaluated = evaluatedEntities[camera.id]
      const evaluatedCamera = cameraDocumentWithTimelineEvaluation(camera, evaluated)
      const basePose = baseCameraPosesRef.current.get(camera.id)
      const canApplyPosition = shouldApplyTimelinePropertyEvaluation(camera.id, 'position', transformingEntityId, suspendedTimelineEntityIds, suspendedTimelineProperties)
      const canApplyRotation = shouldApplyTimelinePropertyEvaluation(camera.id, 'rotation', transformingEntityId, suspendedTimelineEntityIds, suspendedTimelineProperties)
      return basePose ? {
        ...evaluatedCamera,
        ...(!canApplyPosition || !timelinePropertyIsAuthored(evaluated, 'position') ? { position: [...basePose.position] as ActorVector3 } : {}),
        ...(!canApplyRotation || !timelinePropertyIsAuthored(evaluated, 'rotation') ? { rotation: [...basePose.rotation] as ActorVector3 } : {}),
      } : evaluatedCamera
    })
    const groupedActors = evaluateGroupTransforms(evaluatedActors, evaluatedGroups)
    const groupedProps = evaluateGroupTransforms(evaluatedProps, evaluatedGroups)
    const groupedWalls = evaluateGroupTransforms(evaluatedWalls, evaluatedGroups)
    const groupedCameras = evaluateGroupTransforms(evaluatedCameras, evaluatedGroups)
    const activeCamera = groupedCameras.find((camera) => camera.id === activeCameraId) ?? null
    groupPreviewRef.current = { groups: evaluatedGroups, actors: evaluatedActors, props: evaluatedProps, walls: evaluatedWalls, cameras: evaluatedCameras }
    applyGroupPreviewRef.current = (groupId) => {
      const groupRoot = groupRootsRef.current.get(groupId)
      const group = groupPreviewRef.current.groups.find((candidate) => candidate.id === groupId)
      if (!groupRoot || !group) return
      const previewGroup = { ...group, position: [groupRoot.position.x, groupRoot.position.y, groupRoot.position.z] as ActorVector3, rotation: [groupRoot.rotation.x, groupRoot.rotation.y, groupRoot.rotation.z] as ActorVector3 }
      const childIds = new Set(group.childIds)
      const children = [
        ...groupPreviewRef.current.actors,
        ...groupPreviewRef.current.props,
        ...groupPreviewRef.current.walls,
        ...groupPreviewRef.current.cameras,
      ].filter((entity) => childIds.has(entity.id))
      children.forEach((child) => {
        const transformed = evaluateGroupTransforms([child], [previewGroup])[0]
        engineRef.current?.setEntityTransform(child.id, { position: transformed.position, rotation: transformed.rotation, ...('scale' in transformed && transformed.scale ? { scale: transformed.scale } : {}) })
      })
    }
    if (engineRef.current) {
      // Groups are represented as persistent world-space deltas. Keep actor
      // runtimes on the same evaluated/group-composed path as props, walls,
      // and cameras; the raw actor sync above only maintains the base
      // document/runtime and must not be the final transform writer.
      engineRef.current.reconcileEntities(() => {
        syncActors(engineRef.current!, activeSceneId, groupedActors, actorRuntimesRef.current)
        syncCameras(engineRef.current!, activeSceneId, groupedCameras, cameraRuntimesRef.current)
        syncScenic(engineRef.current!, activeSceneId, [...groupedProps, ...groupedWalls, ...resolvedOpenings, ...evaluatedLights], scenicRuntimesRef.current)
        syncGroupEntities(engineRef.current!, activeSceneId, evaluatedGroups, groupRootsRef.current)
        engineRef.current!.setSelected(selectedEntityIds)
      })
    }
    const masterMode = masterPreview !== null
    const previewActors = masterMode ? masterPreviewActors : groupedActors
    const previewProps = masterMode ? masterPreviewProps : groupedProps
    const previewWalls = masterMode ? masterPreviewWalls : groupedWalls
    const previewOpenings = masterMode ? masterPreviewOpenings : evaluatedOpenings
    const previewLights = masterMode ? masterPreviewLights : evaluatedLights
    const previewCamera = masterMode ? masterPreviewCamera : activeCamera
    cameraViewRef.current?.reconcileScene({
      sceneId: masterMode ? (masterPreview?.sceneScopeId ?? `${sceneScopeId}:master`) : sceneScopeId,
      revision: masterMode ? `master:${masterPreview?.masterFrame}:${masterPreview?.clipId ?? 'none'}:${masterPreview?.sourceFrame ?? 'none'}` : sceneRevision,
      actors: previewActors,
      props: previewProps,
      walls: previewWalls,
      openings: previewOpenings,
      lights: previewLights,
      camera: previewCamera,
      // Render from the reconciled semantic set immediately so a deleted
      // entity cannot remain as stale pixels in Camera Preview.
      render: true,
    })
    cameraViewRef.current?.setPreviewAspect(previewCamera ? deliveryAspect(previewCamera) : 16 / 9)
    cameraViewRef.current?.setDisplayMode(view === 'camera' && previewCamera ? 'full' : cameraPreview && previewCamera ? 'preview' : 'hidden')
    if (!masterMode) scheduleCameraComposition(activeCamera ? [activeCamera.id] : [])
  }, [view, cameraPreview, activeSceneId, sceneScopeId, actors, props, walls, openings, lights, cameras, groups, activeCameraId, selectedEntityIds, evaluatedEntities, suspendedTimelineEntityIds, suspendedTimelineProperties, transformingEntityId, sceneRevision, masterPreview, masterPreviewActors, masterPreviewProps, masterPreviewWalls, masterPreviewOpenings, masterPreviewLights, masterPreviewCamera])

  const activeCameraBase = cameras.find((camera) => camera.id === activeCameraId) ?? null
  const activeCamera = activeCameraBase && shouldApplyTimelineEvaluation(activeCameraBase.id, transformingEntityId, suspendedTimelineEntityIds) && evaluatedEntities[activeCameraBase.id]
    ? (() => {
      const evaluated = evaluatedEntities[activeCameraBase.id]
      const evaluatedCamera = cameraDocumentWithTimelineEvaluation(activeCameraBase, evaluated)
      const canApplyPosition = shouldApplyTimelinePropertyEvaluation(activeCameraBase.id, 'position', transformingEntityId, suspendedTimelineEntityIds, suspendedTimelineProperties)
      const canApplyRotation = shouldApplyTimelinePropertyEvaluation(activeCameraBase.id, 'rotation', transformingEntityId, suspendedTimelineEntityIds, suspendedTimelineProperties)
      return {
        ...evaluatedCamera,
        ...(!canApplyPosition || !timelinePropertyIsAuthored(evaluated, 'position') ? { position: [...activeCameraBase.position] as ActorVector3 } : {}),
        ...(!canApplyRotation || !timelinePropertyIsAuthored(evaluated, 'rotation') ? { rotation: [...activeCameraBase.rotation] as ActorVector3 } : {}),
      }
    })()
    : activeCameraBase
  const displayCamera = masterPreview !== null ? masterPreviewCamera : activeCamera
  const displayActors = masterPreview !== null ? masterPreviewActors : actors
  const renderCamera = view === 'camera' && displayCamera ? 'PRODUCTION' : 'EDITOR'
  const imageAspect = displayCamera ? cameraDisplayAspect(displayCamera) : 16 / 9
  const imageRect = letterboxRect(viewportSize.width, viewportSize.height, imageAspect)
  const imageStyle = { left: `${(imageRect.x / viewportSize.width) * 100}%`, top: `${(imageRect.y / viewportSize.height) * 100}%`, width: `${(imageRect.width / viewportSize.width) * 100}%`, height: `${(imageRect.height / viewportSize.height) * 100}%` }
  const captureFrame = () => {
    const runtime = cameraViewRef.current
    if (!runtime) return
    setCaptureError(null)
    void runtime.captureStill({ width: captureWidth, includeGuides: includeCaptureGuides }).then((blob) => {
      if (blob) onCaptureFrameReady(blob, { width: captureWidth, includeGuides: includeCaptureGuides })
      else setCaptureError('Still capture is unavailable for this Camera. Try again or reload the app.')
    }).catch(() => setCaptureError('Still capture failed. Try again or reload the app.'))
  }
  const handleStageViewSelect = (selection: StageViewSelection) => {
    setStageViewSelection(selection)
    const engine = engineRef.current
    if (!engine) return
    if (stageViewSelectionIsIsometric(selection)) engine.setIsometricView(selection)
    else engine.setViewMode(selection)
  }
  const frameSelectedShortcut = (shortcutBindings.frameSelected?.key ?? 'f').toUpperCase()
  const emitLivePointer = (event: ReactPointerEvent<HTMLDivElement>, visible: boolean) => {
    if (!livePointerActive || !onLivePointerMove) return
    const rect = event.currentTarget.getBoundingClientRect()
    onLivePointerMove({ x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))), visible })
  }
  const arrangePopover = arrangeIsOpen && typeof document !== 'undefined' ? createPortal(
    <div
      className="v2-stage-arrange-menu"
      id="v2-stage-arrange-menu"
      ref={arrangeMenuRef}
      role="menu"
      style={arrangeMenuPosition ?? { visibility: 'hidden' }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <strong>Align</strong>
      <div className="v2-stage-arrange-row"><span>Horizontal</span><div><button aria-label="Align left" onClick={() => engineRef.current?.alignSelection('x', 'min')} type="button">Left</button><button aria-label="Align horizontal center" onClick={() => engineRef.current?.alignSelection('x', 'center')} type="button">Center</button><button aria-label="Align right" onClick={() => engineRef.current?.alignSelection('x', 'max')} type="button">Right</button></div></div>
      <div className="v2-stage-arrange-row"><span>Depth</span><div><button aria-label="Align front" onClick={() => engineRef.current?.alignSelection('z', 'min')} type="button">Front</button><button aria-label="Align depth center" onClick={() => engineRef.current?.alignSelection('z', 'center')} type="button">Center</button><button aria-label="Align back" onClick={() => engineRef.current?.alignSelection('z', 'max')} type="button">Back</button></div></div>
      <div className="v2-stage-arrange-row"><span>Vertical</span><div><button aria-label="Align bottom" onClick={() => engineRef.current?.alignSelection('y', 'min')} type="button">Bottom</button><button aria-label="Align vertical middle" onClick={() => engineRef.current?.alignSelection('y', 'center')} type="button">Middle</button><button aria-label="Align top" onClick={() => engineRef.current?.alignSelection('y', 'max')} type="button">Top</button></div></div>
      {arrangeableSelectionCount >= 3 ? <><strong>Distribute</strong><div className="v2-stage-arrange-row"><span>Axis</span><div><button aria-label="Distribute on X" onClick={() => engineRef.current?.distributeSelection('x')} type="button">X</button><button aria-label="Distribute on Z" onClick={() => engineRef.current?.distributeSelection('z')} type="button">Z</button></div></div></> : null}
    </div>,
    document.body,
  ) : null

  return (
    <section className="v2-stage-panel" aria-label="Stage">
      <div className={`v2-stage-viewport v2-view-${view}`} ref={stageRef} onPointerMove={(event) => emitLivePointer(event, true)} onPointerLeave={(event) => emitLivePointer(event, false)}>
        {marqueeRect ? <div className={`v2-stage-marquee${marqueeRect.additive ? ' is-additive' : ''}${marqueeRect.subtractive ? ' is-subtractive' : ''}`} style={{ left: `${marqueeRect.left}px`, top: `${marqueeRect.top}px`, width: `${marqueeRect.width}px`, height: `${marqueeRect.height}px` }} aria-hidden="true" /> : null}
        {graphicsContextMessage ? <div className="v2-runtime-notice" role="alert"><strong>Graphics unavailable</strong><span>{graphicsContextMessage}</span><div className="v2-runtime-notice-actions">{webGLDiagnosticsAvailable() ? <button className="v2-button" onClick={() => void copyGraphicsDiagnostics()} type="button">{diagnosticsCopied ? 'Diagnostics Copied' : 'Copy Diagnostics'}</button> : null}<button className="v2-button v2-button-primary" onClick={() => window.location.reload()} type="button">Reload App</button></div></div> : null}
        {view === 'blocking' ? <div className="v2-stage-header">
          <button className={`v2-camera-preview-toggle${cameraPreview ? ' is-active' : ''}`} onClick={() => onCameraPreviewChange(!cameraPreview)} type="button">{cameraPreview ? 'Hide Camera Preview' : 'Camera Preview'}</button>
          <span>Stage</span>
        </div> : null}
        {view === 'blocking' ? (
          <>
            <div className="v2-stage-tools" aria-label="Stage tools">
              <div className="v2-stage-tool-group v2-stage-transform-group" aria-label="Transform Tools">
                <span className="v2-stage-group-label">Transform</span>
                <div className="v2-stage-transform-segmented">
                  {(['select', 'move', 'rotate', 'scale'] as const).map((item) => {
                    const selectedProp = props.find((prop) => prop.id === selectedEntityId)
                    const scaleAvailable = selectedEntityIds.length <= 1 && Boolean(selectedProp && ['cube', 'sphere', 'cylinder'].includes(selectedProp.propType ?? selectedProp.shape))
                    const shortcut = shortcutBindings[item]?.key ?? ({ select: 'e', move: 'q', rotate: 'r', scale: 's' }[item])
                    const label = item[0].toUpperCase() + item.slice(1)
                    return <button aria-label={label} className={tool === item ? 'is-active' : ''} key={item} disabled={readOnly || isPlaying || (phoneCameraLive && item === 'rotate') || (item === 'scale' && !scaleAvailable)} onClick={() => onToolChange(item)} title={`${label} tool${shortcut ? ` (${shortcut.toUpperCase()})` : ''}`} type="button">
                      <span>{shortcut.toUpperCase()}</span>{label}
                    </button>
                  })}
                </div>
              </div>
              <div className="v2-stage-tool-group v2-stage-precision-group" aria-label="Precision">
                <span className="v2-stage-group-label">Precision</span>
                <div className="v2-stage-precision-controls">
                  <button className={`v2-stage-snap${snapEnabled ? ' is-active' : ''}`} aria-label={tool === 'rotate' ? 'Enable rotation snapping' : 'Enable grid snapping'} aria-pressed={snapEnabled} disabled={readOnly} onClick={() => setSnapEnabled((value) => !value)} title={tool === 'rotate' ? 'Enable rotation snapping' : 'Enable grid snapping'} type="button"><span>⌁</span>{tool === 'rotate' ? 'Angle' : 'Snap'}</button>
                  <select aria-label={tool === 'rotate' ? 'Rotation snap step' : 'Snap step'} className="v2-stage-snap-size" disabled={readOnly || !snapEnabled} title={tool === 'rotate' ? 'Rotation snap step' : 'Snap step'} value={tool === 'rotate' ? rotationSnapDegrees : snapGridSize} onChange={(event) => tool === 'rotate' ? setRotationSnapDegrees(Number(event.target.value)) : setSnapGridSize(Number(event.target.value))}>{(tool === 'rotate' ? STAGE_ROTATION_SNAP_PRESETS : STAGE_SNAP_GRID_PRESETS).map((size) => <option key={size} value={size}>{tool === 'rotate' ? `${size}°` : `${size.toFixed(2)} m`}</option>)}</select>
                </div>
              </div>
              <div className="v2-stage-tool-group v2-stage-view-group" aria-label="View Action">
                <span className="v2-stage-group-label">View</span>
                <div className="v2-stage-view-actions">
                  <button aria-label="Frame selected object" className="v2-stage-frame" disabled={isPlaying || selectedEntityIds.length === 0} onClick={() => engineRef.current?.frameSelected()} title="Frame selected object" type="button"><span>{frameSelectedShortcut}</span>Frame</button>
                  <div className="v2-stage-arrange" ref={arrangeContainerRef} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                    <button aria-controls="v2-stage-arrange-menu" aria-expanded={arrangeIsOpen} aria-label="Arrange selected objects" className={arrangeIsOpen ? 'is-active' : ''} disabled={readOnly || isPlaying || arrangeableSelectionCount < 2} onClick={() => { setArrangeMenuPosition(null); setArrangeContext(arrangeIsOpen ? null : { sceneId: activeSceneId, selectionKey }) }} ref={arrangeButtonRef} title="Align or distribute selected objects" type="button">Arrange</button>
                  </div>
                </div>
              </div>
            </div>
            {arrangePopover}
            <div className="v2-stage-hint">E Select · Q Move · R Rotate · S Scale · {frameSelectedShortcut} Frame · Select drag box · Space + drag orbit · Right drag pan · Shift move axis lock · ⌘G Group · ⌘⇧G Ungroup</div>
            <StageViewCube selection={stageViewSelection} orientation={stageViewOrientation} onSelect={handleStageViewSelect} onOrbitDrag={(deltaX, deltaY) => engineRef.current?.orbitFromViewCube(deltaX, deltaY)} />
            {stageContextMenu ? <div className="v2-entity-context-menu v2-stage-entity-context-menu" role="menu" style={{ left: stageContextMenu.x, top: stageContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}><button onClick={() => { onBeginEntityRename(stageContextMenu.entityId); setStageContextMenu(null) }} type="button">Rename</button></div> : null}
            {axisLock ? <div className="v2-stage-axis-lock" aria-live="polite">Axis Lock · {axisLock.toUpperCase()}</div> : null}
            {wallDrawing ? <div className="v2-wall-draw-status"><strong>DRAW WALL</strong><span>{wallDrawState.start ? wallDrawState.end ? `${wallDrawState.length.toFixed(2)} m · Click to commit next segment` : 'Move to set wall length' : 'Click a ground point to start'}</span><small>Shift 45° · Ctrl/Cmd grid · Esc cancel</small></div> : null}
            {cameraPreview ? <CameraPreviewOverlay displayCamera={displayCamera} displayActors={displayActors} imageAspect={imageAspect} masterPreview={masterPreview} masterImageUrls={masterImageUrls} activeMasterImageClipId={activeMasterImageClipId} readOnly={readOnly} onMasterImageSelect={onMasterImageSelect} onMasterImageChange={onMasterImageChange} onOpenCameraView={onOpenCameraView} onCameraPreviewChange={onCameraPreviewChange} /> : null}
          </>
        ) : displayCamera ? (
          <div className="v2-camera-view-overlay">
            <CameraStatus camera={displayCamera} compact={cameraOverlayMode(viewportSize.width) === 'compact'} />
            <div className="v2-camera-image-area" style={imageStyle}>
              <CameraCompositionOverlay camera={displayCamera} sourceAspect={imageAspect} actor={displayActors.find((actor) => actor.id === displayCamera.targetEntityId) ?? null} />
              <CameraFrameOverlays camera={displayCamera} sourceAspect={imageAspect} imageRect={imageRect} selectedFrameGuideId={selectedFrameGuideId} compact={cameraOverlayMode(viewportSize.width) === 'compact'} />
              {masterPreview ? <MasterGraphicsOverlay preview={masterPreview} imageUrls={masterImageUrls} aspect={imageAspect} activeClipId={activeMasterImageClipId} editable={!readOnly} onSelect={onMasterImageSelect} onChange={onMasterImageChange} /> : null}
            </div>
            <div className="v2-camera-view-controls" aria-label="Camera View controls">
              <label>Still <select className="v2-select" value={captureWidth} onChange={(event) => setCaptureWidth(Number(event.target.value) as StillCaptureWidth)}>{STILL_CAPTURE_WIDTHS.map((width) => <option key={width} value={width}>{width}px</option>)}</select></label>
              <label><input type="checkbox" checked={includeCaptureGuides} onChange={(event) => setIncludeCaptureGuides(event.target.checked)} /> Include Guides</label>
              <button onClick={captureFrame} type="button">Capture Frame</button>
            </div>
            {captureError ? <div className="v2-capture-error" role="alert">{captureError}</div> : null}
          </div>
        ) : masterPreview?.status === 'empty' ? (
          <div className="v2-camera-view-overlay v2-master-gap-view" aria-label="Empty Master Timeline gap">
            <div className="v2-camera-image-area v2-master-gap-frame" style={imageStyle}>
              <MasterGraphicsOverlay preview={masterPreview} imageUrls={masterImageUrls} aspect={16 / 9} activeClipId={activeMasterImageClipId} editable={!readOnly} onSelect={onMasterImageSelect} onChange={onMasterImageChange} />
            </div>
          </div>
        ) : (
          <div className="v2-stage-empty"><div className="v2-stage-empty-mark">◇</div><strong>{masterPreview?.status === 'missing-shot' ? 'Missing Shot' : masterPreview?.status === 'missing-scene' ? 'Missing Scene' : masterPreview?.status === 'missing-camera' ? 'Missing Camera' : 'No active Camera'}</strong><span>{masterPreview ? 'The current Master frame has no valid production Camera source.' : 'Add a Camera and set it active to view the shot.'}</span></div>
        )}
        {isPlaying ? <div className="v2-playback-shield" aria-hidden="true" /> : null}
        {livePointer && livePointer.visible && view === 'blocking' ? <div className="v2-live-pointer" style={{ left: `${livePointer.x * 100}%`, top: `${livePointer.y * 100}%` }} aria-hidden="true"><span /> <b>{livePointer.displayName}</b></div> : null}
        {debugEnabled ? (
          <div className="v2-interaction-debug" role="dialog" aria-label="Selection Diagnostics">
            <div className="v2-interaction-debug-header"><strong>Selection Diagnostics</strong><button className="v2-interaction-debug-close" aria-label="Close Selection Diagnostics" onClick={() => setInteractionDiagnosticsEnabled(false)} type="button">×</button></div>
            <span>BUILD {buildIdentity.id}</span>
            <span>BUILD TIME {buildIdentity.timestamp}</span>
            <span>APP VERSION {buildIdentity.version}</span>
            <span>STAGE ENGINE v2-stage-engine</span>
            <span>ENTITIES {actors.length + props.length + cameras.length}</span>
            <span>SELECTED COUNT {selectedEntityIds.length}</span>
            <span>SELECTED ID {selectedEntityId ?? 'NONE'}</span>
            <span>REACT IDS {selectedEntityIds.length > 0 ? selectedEntityIds.join(', ') : 'NONE'}</span>
            <span>ENGINE IDS {stageDebug?.selectedIds.length ? stageDebug.selectedIds.join(', ') : 'NONE'}</span>
            <span>OUTLINE TARGETS {stageDebug?.selectionOutlineTargetIds.length ? stageDebug.selectionOutlineTargetIds.join(', ') : 'NONE'}</span>
            <span>SELECTION EVENT {stageDebug?.lastSelectionEvent ?? '—'}</span>
            <span>NAVIGATION EVENT {stageDebug?.lastNavigationEvent ?? '—'}</span>
            <span>POINTER EVENT {stageDebug?.lastPointerEvent ?? '—'}</span>
            <span>EMPTY CLICK {stageDebug?.lastEmptyClickEvent ?? '—'}</span>
            <span>DESELECTION CALLBACK {stageDebug?.lastDeselectionCallback ?? '—'}</span>
            <span>CALLBACK {stageDebug?.lastSelectionCallbackPayload ?? '—'}</span>
            <span>MARQUEE PREVIEW {stageDebug?.marqueePreviewActive ? stageDebug.marqueePreviewIds.join(', ') || 'NONE' : 'INACTIVE'}</span>
            <span>MARQUEE FINAL HITS {stageDebug?.marqueeFinalHitIds.length ? stageDebug.marqueeFinalHitIds.join(', ') : 'NONE'}</span>
            <span>MARQUEE PREVIOUS {stageDebug?.marqueePreviousSelectedIds.length ? stageDebug.marqueePreviousSelectedIds.join(', ') : 'NONE'}</span>
            <span>MARQUEE NEXT {stageDebug?.marqueeNextSelectedIds.length ? stageDebug.marqueeNextSelectedIds.join(', ') : 'NONE'}</span>
            <span>MARQUEE CALLBACK {stageDebug?.marqueeCallbackPayload ?? '—'}</span>
            <span>RECENT EVENTS {stageDebug?.recentInteractionEvents.length ? stageDebug.recentInteractionEvents.join(' · ') : '—'}</span>
            <span>GESTURE {stageDebug?.pointerMode ?? '—'} · CAPTURE {stageDebug?.pointerCaptureOwner ?? '—'}</span>
            <span>STAGE INSTANCE {stageDebug?.stageRuntimeInstance ?? '—'}</span>
            <span>CAMERA INSTANCE {stageDebug?.stageCameraInstance ?? '—'}</span>
            <span>OUTLINES {stageDebug?.selectionOutlineCount ?? '—'}</span>
            <span>RECONCILIATIONS {stageDebug?.entityReconciliationCount ?? '—'} · {stageDebug?.lastEntityReconciliation ?? '—'}</span>
            <span>ACTIVE CAMERA {displayCamera?.id ?? 'NONE'}</span>
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
            <button className="v2-button v2-interaction-debug-copy" onClick={() => void copySelectionDiagnostics()} type="button">{selectionDiagnosticsCopied ? 'Diagnostics Copied' : 'Copy Selection Diagnostics'}</button>
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

export function CameraPreviewOverlay({ displayCamera, displayActors, imageAspect, masterPreview, masterImageUrls, activeMasterImageClipId, readOnly, onMasterImageSelect = () => {}, onMasterImageChange = () => {}, onOpenCameraView, onCameraPreviewChange }: { displayCamera: CameraDocument | null; displayActors: readonly ActorDocument[]; imageAspect: number; masterPreview: MasterPreviewContext | null; masterImageUrls: Readonly<Record<string, string>>; activeMasterImageClipId: string | null; readOnly: boolean; onMasterImageSelect?: (clipId: string) => void; onMasterImageChange?: (patch: { positionX?: number; positionY?: number; scale?: number; rotation?: number }) => void; onOpenCameraView: () => void; onCameraPreviewChange: (visible: boolean) => void }) {
  const previewAspect = displayCamera ? deliveryAspect(displayCamera) : 16 / 9
  return <div className="v2-camera-preview-ui" style={{ aspectRatio: previewAspect }} onClick={() => { if (displayCamera) onOpenCameraView() }} role={displayCamera ? 'button' : undefined} tabIndex={displayCamera ? 0 : undefined}>
    {displayCamera ? <>
      <button className="v2-camera-preview-close" onClick={(event) => { event.stopPropagation(); onCameraPreviewChange(false) }} type="button" aria-label="Close Camera Preview">×</button>
      <div className="v2-camera-preview-guides" aria-hidden="true">
        <CameraPreviewOverlays camera={displayCamera} sourceAspect={imageAspect} actor={displayActors.find((actor) => actor.id === displayCamera.targetEntityId) ?? null} />
      </div>
      {masterPreview ? <MasterGraphicsOverlay preview={masterPreview} imageUrls={masterImageUrls} aspect={previewAspect} activeClipId={activeMasterImageClipId} editable={!readOnly} onSelect={onMasterImageSelect} onChange={onMasterImageChange} /> : null}
    </> : masterPreview?.status === 'empty' ? <div className="v2-camera-preview-empty v2-camera-preview-gap" aria-label="Empty Master Timeline gap"><MasterGraphicsOverlay preview={masterPreview} imageUrls={masterImageUrls} aspect={previewAspect} activeClipId={activeMasterImageClipId} editable={!readOnly} onSelect={onMasterImageSelect} onChange={onMasterImageChange} /><button className="v2-camera-preview-close" onClick={(event) => { event.stopPropagation(); onCameraPreviewChange(false) }} type="button" aria-label="Close Camera Preview">×</button></div> : <div className="v2-camera-preview-empty">{masterPreview?.status === 'missing-shot' ? 'Missing Shot' : masterPreview?.status === 'missing-scene' ? 'Missing Scene' : masterPreview?.status === 'missing-camera' ? 'Missing Camera' : 'No active camera'}<button className="v2-camera-preview-close" onClick={(event) => { event.stopPropagation(); onCameraPreviewChange(false) }} type="button" aria-label="Close Camera Preview">×</button></div>}
  </div>
}

function MasterGraphicsOverlay({ preview, imageUrls, aspect, activeClipId, editable, onSelect = () => {}, onChange }: { preview: MasterPreviewContext; imageUrls: Readonly<Record<string, string>>; aspect: number; activeClipId: string | null; editable: boolean; onSelect?: (clipId: string) => void; onChange: (patch: { positionX?: number; positionY?: number; scale?: number; rotation?: number }) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [drafts, setDrafts] = useState<Record<string, { positionX?: number; positionY?: number; scale?: number; rotation?: number }>>({})
  const dragRef = useRef<{ mode: 'move' | 'scale' | 'rotate'; clipId: string; pointerId: number; startX: number; startY: number; startPositionX: number; startPositionY: number; startScale: number; startRotation: number; centerX: number; centerY: number; startAngle: number; moved: boolean } | null>(null)
  const begin = (event: ReactPointerEvent<HTMLElement>, clipId: string, mode: 'move' | 'scale' | 'rotate', clip: MasterPreviewContext['graphics'][number]['clip']) => {
    if (!editable) return
    event.stopPropagation()
    onSelect(clipId)
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!bounds) return
    const transform = imageTransformForAsset(clip, preview.graphics.find((item) => item.clip.id === clipId)?.asset ?? { id: '', fileName: '', mimeType: '', sizeBytes: 0, lastModified: null, width: 1, height: 1 }, aspect)
    const centerX = bounds.left + transform.x * bounds.width
    const centerY = bounds.top + transform.y * bounds.height
    dragRef.current = { mode, clipId, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startPositionX: clip.positionX, startPositionY: clip.positionY, startScale: clip.scale, startRotation: clip.rotation, centerX, centerY, startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX), moved: false }
    containerRef.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const bounds = containerRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !bounds) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return
    drag.moved = true
    if (drag.mode === 'move') setDrafts((current) => ({ ...current, [drag.clipId]: { positionX: Math.max(0, Math.min(1, drag.startPositionX + deltaX / bounds.width)), positionY: Math.max(0, Math.min(1, drag.startPositionY + deltaY / bounds.height)) } }))
    if (drag.mode === 'scale') setDrafts((current) => ({ ...current, [drag.clipId]: { scale: graphicsScaleFromPointerDelta({ startScale: drag.startScale, deltaX, deltaY, viewportWidth: bounds.width, viewportHeight: bounds.height }) } }))
    if (drag.mode === 'rotate') setDrafts((current) => ({ ...current, [drag.clipId]: { rotation: drag.startRotation + (Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) - drag.startAngle) * 180 / Math.PI } }))
  }
  const end = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; if (!cancelled && drag.moved) onChange(drafts[drag.clipId] ?? {}); if (containerRef.current?.hasPointerCapture(event.pointerId)) containerRef.current.releasePointerCapture(event.pointerId); setDrafts((current) => { const next = { ...current }; delete next[drag.clipId]; return next }); dragRef.current = null }
  const cancel = () => { const drag = dragRef.current; if (!drag) return; if (containerRef.current?.hasPointerCapture(drag.pointerId)) containerRef.current.releasePointerCapture(drag.pointerId); setDrafts((current) => { const next = { ...current }; delete next[drag.clipId]; return next }); dragRef.current = null }
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('keydown', handleKeyDown)
    return () => { window.removeEventListener('keydown', handleKeyDown); cancel() }
  }, [])
  useEffect(() => { if (dragRef.current && !preview.graphics.some((item) => item.clip.id === dragRef.current?.clipId)) cancel() }, [preview.graphics])
  return <div className="v2-master-graphics-overlay" ref={containerRef} aria-label="Master Graphics" onPointerMove={move} onPointerUp={(event) => end(event)} onPointerCancel={(event) => end(event, true)} onLostPointerCapture={(event) => end(event, true)} style={{ pointerEvents: editable ? 'auto' : 'none' }}>{preview.graphics.map(({ clip, asset, opacity }) => {
    const displayClip = { ...clip, ...(drafts[clip.id] ?? {}) }
    const transform = imageTransformForAsset(displayClip, asset, aspect)
    const selected = clip.id === activeClipId
    const url = imageUrls[asset.id]
    return <div key={clip.id} className={`v2-master-graphics-image${selected ? ' is-selected' : ''}${url ? '' : ' is-missing-media'}`} onPointerDown={(event) => begin(event, clip.id, 'move', clip)} style={{ left: `${transform.x * 100}%`, top: `${transform.y * 100}%`, width: `${transform.width * 100}%`, height: `${transform.height * 100}%`, opacity, transform: `translate(-50%, -50%) rotate(${transform.rotation}deg)` }}>{url ? <img src={url} alt="" draggable={false} /> : <span className="v2-master-graphics-missing">MISSING IMAGE<small>{asset.fileName}</small></span>}<>{selected ? <><span className="v2-master-graphics-handle is-scale" onPointerDown={(event) => begin(event, clip.id, 'scale', clip)} /><span className="v2-master-graphics-handle is-rotate" onPointerDown={(event) => begin(event, clip.id, 'rotate', clip)} /></> : null}</></div>
  })}</div>
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

function CameraPreviewOverlays({ camera, sourceAspect, actor }: { camera: CameraDocument; sourceAspect: number; actor: ActorDocument | null }) {
  const policy = compactPreviewOverlayPolicy()
  const displayDeliveryAspect = deliveryAspect(camera)
  const deliveryRect = fitAspectInsideSource(sourceAspect, displayDeliveryAspect)
  const enabledGuides = camera.frameGuides.filter((guide) => guide.enabled)
  const guideData = enabledGuides.map((guide) => {
    const sourceRect = insetFrameGuideRect(fitAspectInsideSource(sourceAspect, guide.aspectRatio), guide.safeMarginPercent)
    return { guide, rect: { x: (sourceRect.x - deliveryRect.x) / deliveryRect.width, y: (sourceRect.y - deliveryRect.y) / deliveryRect.height, width: sourceRect.width / deliveryRect.width, height: sourceRect.height / deliveryRect.height } }
  })
  return <>
    <CameraCompositionOverlay camera={camera} sourceAspect={sourceAspect} displayAspect={displayDeliveryAspect} actor={actor} />
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
