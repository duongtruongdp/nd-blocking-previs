import * as THREE from 'three'
import type { PropDocument } from '../core/sceneDocument'
import { classifyWheelInput } from '../runtime/inputNormalization'
import { constrainStageDeltaToAxis, dominantStageAxis, snapStagePosition, snapStageValue, stageApplyRotation, stageCameraSpaceDepth, stageIsometricAngles, stageLocalAxis, stageMarqueeRect, stageMarqueeSelection, stageMovedBeyondThreshold, stageNdcFromEvent, stageOrbitAfterPointerDelta, stageOrbitAnglesFromDirection, stagePointerDeltaAlongAxis, stageProjectedBoundsIntersectMarquee, stageProjectWorldAxisToScreen, stageRotationAxis, stageToolForKey, stageTransformAxis, stageTransformSpace, stageViewDirection, stageViewModeIsOrthographic, stageWorldAxis, stageWorldUnitsPerPixelAlongAxis, stageWorldUnitsPerPixelAtDepth, stageZoomDistance, type StageAxisName, type StageCanvasRect, type StageGizmoSpace, type StageIsometricCorner, type StageMarqueeSelectionMode, type StagePointerMode, type StageTool, type StageViewMode, type StageViewSelection } from './stageEngineMath'
import { scaleFromPointer, type ScaleAxis } from './stageEngineScaleMath'
import { distributeOffsets, snapAngle } from './arrangeMath'
import { expandSelectionVisualIds, normalizeSelection, toggleSelection } from './selectionMath'
import type { CameraPathKeyframe, CameraPathSegmentSelection } from '../timeline/cameraPath'
import { registerWebGLRenderer } from '../runtime/webglDiagnostics'

const MAX_PIXEL_RATIO = 2
const SELECTION_COLOR = '#f0a032'
const MARQUEE_PREVIEW_COLOR = '#4d8ff0'
const GIZMO_HOVER_COLOR = 0xffe066
const GIZMO_AXIS_COLORS = { x: 0xe5484d, y: 0x62d16e, z: 0x4d8ff0 } as const

type AxisName = StageAxisName

export type StageEntityType = 'Prop' | 'Actor' | 'Camera' | 'Wall' | 'Opening' | 'Sun'

export type StageEntity = {
  id: string
  sceneId?: string
  name: string
  type: StageEntityType
  root: THREE.Group
  /** Renderable bounds used for marquee selection, framing, and selection outlines. */
  selectionBounds?: THREE.Object3D
  mesh?: THREE.Mesh
  material?: THREE.MeshStandardMaterial
  /** Optional world-space pivot for direct manipulation. */
  getTransformPivot?: () => THREE.Vector3
  /** Optional document-facing transform snapshot for runtime-owned roots. */
  getTransformSnapshot?: () => Pick<StageTransform, 'position' | 'rotation' | 'scale'>
  /** Optional absolute transform application for runtime-owned roots. */
  applyTransform?: (transform: Pick<StageTransform, 'position' | 'rotation' | 'scale'>) => void
  setSelected?: (selected: boolean, primary?: boolean) => void
  setSnapPreview?: (active: boolean) => void
  dispose?: () => void
  transformable?: boolean
  groupTransformable?: boolean
  scalable?: boolean
}

export type StagePropDefinition = Pick<PropDocument, 'id' | 'name' | 'shape' | 'position' | 'rotation' | 'primaryColor' | 'scale'>

export type StageTransform = {
  entityId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: [number, number, number]
  /** The gizmo operation that authored this snapshot. Kept optional for old integrations. */
  mode?: 'move' | 'rotate' | 'scale'
}

export type StageTransformBatch = {
  changes: StageTransform[]
  primaryEntityId: string | null
}

export type StageSelection = {
  ids: string[]
  primaryId: string | null
}

export type StageViewOrientation = readonly [number, number, number, number]

export type StageCameraPathOverlay = {
  samples: readonly ActorVector3Like[]
  segments: readonly { id: string; samples: readonly ActorVector3Like[]; selection: CameraPathSegmentSelection }[]
  keyframes: readonly CameraPathKeyframe[]
  selectedKeyframeId: string | null
  selectedSegmentId: string | null
  visible: boolean
}

type ActorVector3Like = [number, number, number]

type StageGizmoHandle = {
  mode: 'move' | 'rotate' | 'scale'
  kind: 'axis' | 'plane' | 'uniform'
  axis: AxisName | null
  visible: THREE.Mesh[]
}

export type StageAxisDragDebug = {
  handle: string
  screenAxisX: number
  screenAxisY: number
  pointerDeltaX: number
  pointerDeltaY: number
  pixelsAlongAxis: number
  worldUnitsPerPixel: number
  worldDistance: number
  resultPosition: [number, number, number]
}

export type StageScaleDragDebug = {
  handle: string
  startScale: [number, number, number]
  shiftConstrained: boolean
  pixelsAlongAxis: number
  factor: number
  resultScale: [number, number, number]
}

type StageDrag = {
  pointerId: number
  button: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
  emptySpaceClick: boolean
  transformStarted: boolean
  mode: Exclude<StagePointerMode, 'idle'>
  marqueeMode: StageMarqueeSelectionMode
  entity: StageEntity | null
  groupEntities: StageEntity[]
  groupPivot: THREE.Vector3 | null
  startGroupPositions: Map<string, THREE.Vector3>
  startGroupQuaternions: Map<string, THREE.Quaternion>
  handle: StageGizmoHandle | null
  origin: THREE.Vector3 | null
  axis: THREE.Vector3 | null
  plane: THREE.Plane | null
  startPoint: THREE.Vector3 | null
  startPosition: THREE.Vector3 | null
  startScale: THREE.Vector3 | null
  startQuaternion: THREE.Quaternion | null
  localRotationAxis: THREE.Vector3 | null
  startAngle: number | null
  verticalMove: boolean
  shiftActive: boolean
  shiftAxis: StageAxisName | null
  gizmoScale: number | null
  screenAxis: THREE.Vector2 | null
  worldUnitsPerPixel: number | null
  rotationSnapDelta: number | null
  gizmoSpace: StageGizmoSpace
  selectionChangedOnDown: boolean
  pathKeyframe: CameraPathKeyframe | null
  pathSegmentId: string | null
  permissionGranted: boolean
  permissionPending: boolean
}

export type StageEngineDebugSnapshot = {
  stageRuntimeInstance: string
  stageCameraInstance: string
  eventOrigin: string
  tool: StageTool
  pointerMode: StagePointerMode
  ndc: string
  rayHits: string
  selectedId: string
  selectedIds: string[]
  selectionOutlineTargetIds: string[]
  selectionOutlineCount: number
  lastSelectionEvent: string
  lastNavigationEvent: string
  lastPointerEvent: string
  lastEmptyClickEvent: string
  lastSelectionCallbackPayload: string
  lastDeselectionCallback: string
  marqueePreviewActive: boolean
  marqueePreviewIds: string[]
  marqueeFinalHitIds: string[]
  marqueePreviousSelectedIds: string[]
  marqueeNextSelectedIds: string[]
  marqueeCallbackPayload: string
  recentInteractionEvents: string[]
  entityReconciliationCount: number
  lastEntityReconciliation: string
  pointerCaptureOwner: string
  axisDrag: StageAxisDragDebug | null
  scaleDrag?: StageScaleDragDebug | null
}

export type StageEngineOptions = {
  onToolChanged?: (tool: StageTool) => void
  onTransformStart?: (change: StageTransform) => void
  onTransformEnd?: (change: StageTransform) => void
  onTransformPreview?: (change: StageTransform) => void
  onTransformBatchStart?: (batch: StageTransformBatch) => void
  onTransformBatchEnd?: (batch: StageTransformBatch) => void
  onTransformBatchPreview?: (batch: StageTransformBatch) => void
  canTransformEntity?: (entityId: string) => boolean
  canTransformGroup?: (entityIds: readonly string[]) => boolean
  onTransformPermissionRequest?: (entityId: string) => boolean | Promise<boolean>
  onDebug?: (snapshot: StageEngineDebugSnapshot) => void
  debugEnabled?: boolean
  toolShortcuts?: Partial<Record<StageTool, string>>
  frameSelectedShortcut?: string
  onAxisLockChange?: (axis: StageAxisName | null) => void
  /** Called for a primary-button double click on a rendered entity. */
  onEntityDoubleClick?: (entityId: string) => void
  /** Gives the host a chance to consume Escape before selection is cleared. */
  onEscape?: () => boolean
  onContextMenu?: (entityId: string | null, point: { clientX: number; clientY: number }) => void
  onViewChanged?: (selection: StageViewSelection) => void
  onViewOrientationChanged?: (orientation: StageViewOrientation) => void
  /** Select-mode left-drag on empty Stage space; Space+left remains orbit. */
  onMarqueeChange?: (rect: { left: number; top: number; width: number; height: number; additive: boolean; subtractive: boolean } | null) => void
  onMarqueeSelection?: (selection: StageSelection) => void
  resolveSelectionId?: (entityId: string) => string
  /** Maps canonical selections (including collapsed groups) to visible entity IDs. */
  resolveSelectionVisualIds?: (entityId: string) => readonly string[]
  onCameraPathKeyframeSelect?: (keyframe: CameraPathKeyframe) => void
  onCameraPathSegmentSelect?: (segment: CameraPathSegmentSelection) => void
  onCameraPathPointMoveStart?: (keyframe: CameraPathKeyframe, position: ActorVector3Like) => void
  onCameraPathPointMovePreview?: (keyframe: CameraPathKeyframe, position: ActorVector3Like) => void
  onCameraPathPointMoveEnd?: (keyframe: CameraPathKeyframe, position: ActorVector3Like) => void
}

type SelectionListener = (selection: StageSelection) => void

export class StageEngine {
  private static nextInstanceId = 1
  readonly canvas: HTMLCanvasElement

  private readonly container: HTMLElement
  private readonly scene: THREE.Scene
  private readonly perspectiveCamera: THREE.PerspectiveCamera
  private readonly orthographicCamera: THREE.OrthographicCamera
  private editorCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly webglDiagnosticsDispose: () => void
  private readonly raycaster = new THREE.Raycaster()
  private readonly orbitTarget = new THREE.Vector3(0, 1, 0)
  private readonly selectableRoots: THREE.Group[] = []
  private readonly entities = new Map<string, StageEntity>()
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture> = []
  private readonly gizmoRoot = new THREE.Group()
  private readonly gizmoMove = new THREE.Group()
  private readonly gizmoRotate = new THREE.Group()
  private readonly gizmoScaleHandles = new THREE.Group()
  private readonly gizmoHandles: Array<{ pick: THREE.Mesh; handle: StageGizmoHandle }> = []
  private readonly cameraPathRoot = new THREE.Group()
  private readonly cameraPathMarkerMeshes: THREE.Mesh[] = []
  private readonly cameraPathSegmentLines: THREE.Line[] = []
  private cameraPathMarkerGeometry: THREE.SphereGeometry | null = null
  private cameraPathMarkerMaterial: THREE.MeshBasicMaterial | null = null
  private cameraPathSelectedMaterial: THREE.MeshBasicMaterial | null = null
  private cameraPathPlayhead: THREE.Mesh | null = null
  private cameraPathKeyframes: CameraPathKeyframe[] = []
  private cameraPathSegments: Array<{ id: string; selection: CameraPathSegmentSelection }> = []
  private cameraPathSegmentMaterial: THREE.LineBasicMaterial | null = null
  private cameraPathSelectedSegmentMaterial: THREE.LineBasicMaterial | null = null
  private cameraPathHoveredSegmentId: string | null = null
  private cameraPathVisible = false
  private readonly orbit = { radius: 15, theta: 0.62, phi: 1.13 }
  private savedPerspectiveOrbit: { radius: number; theta: number; phi: number; target: THREE.Vector3 } | null = null
  private readonly orthographicViewStates = new Map<Exclude<StageViewMode, 'perspective'>, { target: THREE.Vector3; halfHeight: number }>()
  private readonly options: StageEngineOptions
  private debugEnabled: boolean
  private readonly stageRuntimeInstance = `stage-engine-${StageEngine.nextInstanceId++}`
  private selectionListener: SelectionListener | null = null
  private frameRequest: number | null = null
  private resizeObserver: ResizeObserver | null = null
  private disposed = false
  private lastRenderSucceeded = false
  private selectedId: string | null = null
  private selectedIds: string[] = []
  private marqueePreviewActive = false
  private marqueePreviewIds: string[] = []
  private marqueePreviewPrimaryId: string | null = null
  private readonly selectionOutlines = new Map<string, THREE.BoxHelper>()
  private entityReconciliationDepth = 0
  private tool: StageTool = 'select'
  private toolShortcuts: Partial<Record<StageTool, string>>
  private frameSelectedShortcut: string
  private drag: StageDrag | null = null
  private hoverHandle: StageGizmoHandle | null = null
  private pointerMode: StagePointerMode = 'idle'
  private lastNdc = '—'
  private lastRayHits = '—'
  private lastAxisDragDebug: StageAxisDragDebug | null = null
  private lastScaleDragDebug: StageScaleDragDebug | null = null
  private lastDebugEventOrigin = 'init'
  private lastSelectionEvent = 'NONE'
  private lastNavigationEvent = 'NONE'
  private lastPointerEvent = 'NONE'
  private lastEmptyClickEvent = 'NONE'
  private lastSelectionCallbackPayload = 'NONE'
  private lastDeselectionCallback = 'NONE'
  private lastMarqueeFinalHitIds: string[] = []
  private lastMarqueePreviousSelectedIds: string[] = []
  private lastMarqueeNextSelectedIds: string[] = []
  private lastMarqueeCallbackPayload = 'NONE'
  private recentInteractionEvents: string[] = []
  private entityReconciliationCount = 0
  private lastEntityReconciliation = 'NONE'
  private viewMode: StageViewMode = 'perspective'
  private isometricCorner: StageIsometricCorner | null = null
  private orthographicHalfHeight = 8
  private shiftKeyActive = false
  private spaceKeyActive = false
  private snapEnabled = false
  private snapGridSize = 0.1
  private rotationSnapEnabled = false
  private rotationSnapRadians = THREE.MathUtils.degToRad(15)

  constructor(container: HTMLElement, options: StageEngineOptions = {}) {
    this.container = container
    this.options = options
    this.toolShortcuts = options.toolShortcuts ?? {}
    this.frameSelectedShortcut = options.frameSelectedShortcut ?? 'f'
    this.debugEnabled = options.debugEnabled ?? false
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#d9deef')
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.05, 500)
    this.orthographicCamera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.05, 500)
    this.editorCamera = this.perspectiveCamera
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'v2-stage-canvas'
    this.canvas.setAttribute('aria-label', 'V2 Blocking Stage')
    this.canvas.dataset.stageOwnership = 'v2-stage-engine'
    this.canvas.dataset.webglIdentity = 'stage'
    this.canvas.tabIndex = 0
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setClearColor('#d9deef', 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.webglDiagnosticsDispose = registerWebGLRenderer(this.renderer, 'interactive:stage')
    container.appendChild(this.canvas)

    this.createStageEnvironment()
    this.cameraPathRoot.name = 'Camera Path Helpers'
    this.cameraPathRoot.renderOrder = 998
    this.scene.add(this.cameraPathRoot)
    this.createProps()
    this.createGizmo()
    this.installInput()
    this.applyViewCamera()

    const ResizeObserverClass = window.ResizeObserver
    if (ResizeObserverClass) {
      this.resizeObserver = new ResizeObserverClass(() => this.resize())
      this.resizeObserver.observe(container)
    } else {
      window.addEventListener('resize', this.handleWindowResize)
    }
    this.resize()
  }

  setTool(tool: StageTool): void {
    this.tool = tool
    this.updateGizmo()
    this.options.onToolChanged?.(tool)
    this.emitDebug()
    this.requestRender()
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled
    if (enabled) this.emitDebug(true, 'diagnostics-enabled')
  }

  setShortcutBindings(toolShortcuts: Partial<Record<StageTool, string>>, frameSelectedShortcut = 'f'): void {
    this.toolShortcuts = toolShortcuts
    this.frameSelectedShortcut = frameSelectedShortcut
  }

  setSnapSettings(enabled: boolean, gridSize: number): void {
    this.snapEnabled = enabled
    this.snapGridSize = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 0.1
    this.requestRender()
  }

  setRotationSnapSettings(enabled: boolean, degrees: number): void {
    this.rotationSnapEnabled = enabled
    this.rotationSnapRadians = THREE.MathUtils.degToRad(Number.isFinite(degrees) && degrees > 0 ? degrees : 15)
    this.requestRender()
  }

  setCameraPathOverlay(overlay: StageCameraPathOverlay): void {
    this.clearCameraPathOverlay()
    this.cameraPathVisible = overlay.visible
    if (!overlay.visible) return
    this.cameraPathKeyframes = overlay.keyframes.map((keyframe) => ({ ...keyframe, position: [...keyframe.position] as ActorVector3Like }))
    this.cameraPathSegmentMaterial = new THREE.LineBasicMaterial({ color: '#4d8ff0', transparent: true, opacity: 0.62, depthTest: false })
    this.cameraPathSelectedSegmentMaterial = new THREE.LineBasicMaterial({ color: '#f0a032', transparent: true, opacity: 0.98, depthTest: false })
    overlay.segments.forEach((segment) => {
      if (segment.samples.length < 2) return
      const geometry = new THREE.BufferGeometry().setFromPoints(segment.samples.map((point) => new THREE.Vector3(...point)))
      const line = new THREE.Line(geometry, segment.id === overlay.selectedSegmentId ? this.cameraPathSelectedSegmentMaterial! : this.cameraPathSegmentMaterial!)
      line.renderOrder = 998
      line.userData.cameraPathSegmentId = segment.id
      line.userData.cameraPathSelected = segment.id === overlay.selectedSegmentId
      this.cameraPathSegmentLines.push(line)
      this.cameraPathRoot.add(line)
    })
    this.cameraPathSegments = overlay.segments.map((segment) => ({ id: segment.id, selection: segment.selection }))
    this.cameraPathMarkerGeometry = new THREE.SphereGeometry(0.085, 12, 8)
    this.cameraPathMarkerMaterial = new THREE.MeshBasicMaterial({ color: '#75a8f5', transparent: true, opacity: 0.82, depthTest: false })
    this.cameraPathSelectedMaterial = new THREE.MeshBasicMaterial({ color: '#f0a032', transparent: true, opacity: 1, depthTest: false })
    this.cameraPathKeyframes.forEach((keyframe) => {
      const marker = new THREE.Mesh(this.cameraPathMarkerGeometry!, keyframe.keyframeId === overlay.selectedKeyframeId ? this.cameraPathSelectedMaterial! : this.cameraPathMarkerMaterial!)
      marker.position.set(...keyframe.position)
      marker.renderOrder = 999
      marker.userData.cameraPathKeyframeId = keyframe.keyframeId
      this.cameraPathMarkerMeshes.push(marker)
      this.cameraPathRoot.add(marker)
    })
    if (overlay.keyframes.length > 0) {
      this.cameraPathPlayhead = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false }))
      this.cameraPathPlayhead.renderOrder = 1000
      this.cameraPathRoot.add(this.cameraPathPlayhead)
    }
    this.requestRender()
  }

  setCameraPathPlayhead(position: ActorVector3Like | null): void {
    if (!this.cameraPathPlayhead || !position) return
    this.cameraPathPlayhead.position.set(...position)
    this.requestRender()
  }

  setCameraPathSelectedKeyframe(keyframeId: string | null): void {
    this.cameraPathMarkerMeshes.forEach((marker) => {
      const selected = marker.userData.cameraPathKeyframeId === keyframeId
      marker.material = selected ? this.cameraPathSelectedMaterial! : this.cameraPathMarkerMaterial!
    })
    this.requestRender()
  }

  setCameraPathSelectedSegment(segmentId: string | null): void {
    this.cameraPathSegmentLines.forEach((line) => {
      const selected = line.userData.cameraPathSegmentId === segmentId
      line.userData.cameraPathSelected = selected
      line.material = selected ? this.cameraPathSelectedSegmentMaterial! : this.cameraPathSegmentMaterial!
    })
    this.requestRender()
  }

  private clearCameraPathOverlay(): void {
    this.cameraPathSegmentLines.forEach((line) => {
      line.removeFromParent()
      line.geometry.dispose()
    })
    this.cameraPathSegmentLines.length = 0
    this.cameraPathSegmentMaterial?.dispose()
    this.cameraPathSelectedSegmentMaterial?.dispose()
    this.cameraPathSegmentMaterial = null
    this.cameraPathSelectedSegmentMaterial = null
    this.cameraPathSegments = []
    this.cameraPathHoveredSegmentId = null
    this.cameraPathMarkerMeshes.forEach((marker) => marker.removeFromParent())
    this.cameraPathMarkerMeshes.length = 0
    this.cameraPathPlayhead?.removeFromParent()
    this.cameraPathPlayhead?.geometry.dispose()
    ;(this.cameraPathPlayhead?.material as THREE.Material | undefined)?.dispose()
    this.cameraPathPlayhead = null
    this.cameraPathMarkerGeometry?.dispose()
    this.cameraPathMarkerMaterial?.dispose()
    this.cameraPathSelectedMaterial?.dispose()
    this.cameraPathMarkerGeometry = null
    this.cameraPathMarkerMaterial = null
    this.cameraPathSelectedMaterial = null
    this.cameraPathKeyframes = []
    this.cameraPathRoot.clear()
  }

  frameSelected(): void {
    const selected = this.selectedEntities
    const bounds = selected.length > 0 ? this.boundsForEntities(selected) : this.relevantBounds()
    const center = bounds.getCenter(new THREE.Vector3())
    const boundsSize = bounds.getSize(new THREE.Vector3())
    const size = boundsSize.length()
    this.orbitTarget.copy(center)
    if (stageViewModeIsOrthographic(this.viewMode)) {
      const rect = this.getCanvasRect()
      this.orthographicHalfHeight = THREE.MathUtils.clamp(Math.max(boundsSize.y * 0.7, boundsSize.x / Math.max(0.1, rect.width / Math.max(1, rect.height)) * 0.7, boundsSize.z * 0.7, 1.5), 1, 100)
      this.saveOrthographicViewState()
    } else {
      this.orbit.radius = Math.max(2.5, size * 1.8)
    }
    this.applyViewCamera()
    this.lastNavigationEvent = 'frame-selected'
    this.emitDebug(true, 'navigation:frame-selected')
  }

  getViewMode(): StageViewMode {
    return this.viewMode
  }

  getViewSelection(): StageViewSelection {
    return this.isometricCorner ?? this.viewMode
  }

  setViewMode(mode: StageViewMode): void {
    if (mode === 'perspective') {
      if (this.viewMode === 'perspective' && !this.isometricCorner && !this.savedPerspectiveOrbit) return
      if (this.savedPerspectiveOrbit) {
        const { target, ...orbit } = this.savedPerspectiveOrbit
        Object.assign(this.orbit, orbit)
        this.orbitTarget.copy(target)
        this.savedPerspectiveOrbit = null
      }
      this.isometricCorner = null
      this.viewMode = mode
      this.editorCamera = this.perspectiveCamera
      this.applyViewCamera()
      this.lastNavigationEvent = 'view-perspective'
      this.emitDebug(true, 'navigation:view-perspective')
      this.options.onViewChanged?.('perspective')
      return
    }
    if (mode === this.viewMode && !this.isometricCorner) return
    this.isometricCorner = null
    const saved = this.orthographicViewStates.get(mode)
    if (saved) {
      this.orbitTarget.copy(saved.target)
      this.orthographicHalfHeight = saved.halfHeight
    } else {
      const bounds = this.relevantBounds()
      this.orbitTarget.copy(bounds.getCenter(new THREE.Vector3()))
      const size = bounds.getSize(new THREE.Vector3())
      const rect = this.getCanvasRect()
      const aspect = rect.width / Math.max(1, rect.height)
      this.orthographicHalfHeight = THREE.MathUtils.clamp(Math.max(size.y * 0.65, size.x / Math.max(0.1, aspect) * 0.65, size.z * 0.65, 2), 1, 100)
      this.orthographicViewStates.set(mode, { target: this.orbitTarget.clone(), halfHeight: this.orthographicHalfHeight })
    }
    this.viewMode = mode
    this.editorCamera = this.orthographicCamera
    this.applyViewCamera()
    this.lastNavigationEvent = `view-${mode}`
    this.emitDebug(true, `navigation:view-${mode}`)
    this.options.onViewChanged?.(mode)
  }

  setIsometricView(corner: StageIsometricCorner): void {
    if (!this.savedPerspectiveOrbit) this.savedPerspectiveOrbit = { ...this.orbit, target: this.orbitTarget.clone() }
    const angles = stageIsometricAngles(corner)
    this.orbit.theta = angles.theta
    this.orbit.phi = angles.phi
    this.isometricCorner = corner
    this.viewMode = 'perspective'
    this.editorCamera = this.perspectiveCamera
    this.applyViewCamera()
    this.lastNavigationEvent = `view-isometric-${corner}`
    this.emitDebug(true, `navigation:view-isometric-${corner}`)
    this.options.onViewChanged?.(corner)
  }

  restorePerspectiveView(): void {
    this.setViewMode('perspective')
  }

  orbitFromViewCube(deltaX: number, deltaY: number): void {
    if (this.disposed) return
    if (stageViewModeIsOrthographic(this.viewMode)) {
      const angles = stageOrbitAnglesFromDirection(stageViewDirection(this.viewMode).direction, this.orbit.theta)
      this.orbit.radius = Math.max(2.5, this.orthographicHalfHeight * 2.4)
      this.orbit.theta = angles.theta
      this.orbit.phi = angles.phi
      this.viewMode = 'perspective'
      this.editorCamera = this.perspectiveCamera
    }
    if (this.isometricCorner) {
      this.isometricCorner = null
      this.savedPerspectiveOrbit = null
    }
    Object.assign(this.orbit, stageOrbitAfterPointerDelta(this.orbit, deltaX, deltaY))
    this.options.onViewChanged?.('perspective')
    this.applyViewCamera()
    this.lastNavigationEvent = 'view-cube-orbit'
    this.emitDebug(true, 'navigation:view-cube-orbit')
  }

  addEntity(entity: { id: string; sceneId?: string; type: StageEntityType; root: THREE.Group; selectionBounds?: THREE.Object3D; name?: string; getTransformPivot?: () => THREE.Vector3; getTransformSnapshot?: () => Pick<StageTransform, 'position' | 'rotation' | 'scale'>; applyTransform?: (transform: Pick<StageTransform, 'position' | 'rotation' | 'scale'>) => void; setSelected?: (selected: boolean, primary?: boolean) => void; setSnapPreview?: (active: boolean) => void; dispose?: () => void; transformable?: boolean; groupTransformable?: boolean; scalable?: boolean }): void {
    this.removeEntity(entity.id)
    const registered: StageEntity = { ...entity, name: entity.name ?? entity.id }
    registered.root.userData.entityId = registered.id
    registered.root.userData.sceneId = registered.sceneId
    this.entities.set(entity.id, registered)
    this.selectableRoots.push(entity.root)
    this.scene.add(entity.root)
    this.applySelectionVisuals()
    this.updateGizmo()
    this.requestRender()
  }

  /**
   * Apply a runtime entity reconciliation as one selection transaction.
   * Runtime replacement is common when a visual proxy changes shape. During
   * that short window the old entity is removed before the replacement is
   * registered; selection must not be reported as cleared in between.
   */
  reconcileEntities(reconcile: () => void): void {
    this.entityReconciliationDepth += 1
    let thrown: unknown
    let didThrow = false
    try {
      reconcile()
    } catch (error) {
      didThrow = true
      thrown = error
      this.lastEntityReconciliation = 'failed'
    }
    this.entityReconciliationDepth -= 1
    if (this.entityReconciliationDepth === 0) {
      this.entityReconciliationCount += 1
      if (!didThrow) this.lastEntityReconciliation = 'completed'
      const resolveSelectionId = this.options.resolveSelectionId ?? ((entityId: string) => entityId)
      const normalized = normalizeSelection(this.selectedIds.map(resolveSelectionId), this.selectedId ? resolveSelectionId(this.selectedId) : null, new Set(this.entities.keys()))
      const selectionChanged = normalized.primaryId !== this.selectedId || normalized.ids.length !== this.selectedIds.length || normalized.ids.some((id, index) => id !== this.selectedIds[index])
      if (selectionChanged) this.select(normalized.ids, normalized.primaryId)
      else {
        this.applySelectionVisuals()
        this.updateGizmo()
        this.requestRender()
      }
    }
    if (didThrow) throw thrown
  }

  removeEntity(entityId: string): void {
    const entity = this.entities.get(entityId)
    if (!entity) return
    if (this.selectedIds.includes(entityId) && this.entityReconciliationDepth === 0) this.select(this.selectedIds.filter((id) => id !== entityId), this.selectedId === entityId ? null : this.selectedId)
    entity.root.removeFromParent()
    entity.dispose?.()
    this.entities.delete(entityId)
    this.marqueePreviewIds = this.marqueePreviewIds.filter((id) => id !== entityId)
    this.applySelectionVisuals()
    this.selectableRoots.splice(0, this.selectableRoots.length, ...this.selectableRoots.filter((root) => root !== entity.root))
    this.requestRender()
  }

  clearEntities(): void {
    Array.from(this.entities.keys()).forEach((entityId) => this.removeEntity(entityId))
    this.select(null)
  }

  setSelected(entityId: string | null | readonly string[]): void {
    if (Array.isArray(entityId)) this.select(entityId, entityId[entityId.length - 1] ?? null)
    else if (typeof entityId === 'string') this.select(entityId, entityId)
    else this.select(null)
  }

  setSelection(ids: readonly string[], primaryId: string | null = ids[ids.length - 1] ?? null): void {
    this.select(ids, primaryId)
  }

  getSelection(): StageSelection {
    return { ids: [...this.selectedIds], primaryId: this.selectedId }
  }

  alignSelection(axis: AxisName, edge: 'min' | 'center' | 'max'): void {
    const entities = this.transformEntities(this.selectedEntities)
    if (entities.length < 2) return
    const before = this.snapshotEntities(entities)
    const bounds = entities.map((entity) => this.entityBounds(entity))
    const coordinate = (item: THREE.Box3, edgeName: 'min' | 'center' | 'max'): number => {
      const min = axis === 'x' ? item.min.x : axis === 'y' ? item.min.y : item.min.z
      const max = axis === 'x' ? item.max.x : axis === 'y' ? item.max.y : item.max.z
      return edgeName === 'min' ? min : edgeName === 'max' ? max : (min + max) * 0.5
    }
    const combined = this.boundsForEntities(entities)
    const target = coordinate(combined, edge)
    this.options.onTransformBatchStart?.({ changes: before, primaryEntityId: this.selectedId })
    entities.forEach((entity, index) => {
      const item = bounds[index]
      entity.root.position[axis] += target - coordinate(item, edge)
    })
    this.updateGizmo()
    this.options.onTransformBatchEnd?.({ changes: this.snapshotEntities(entities), primaryEntityId: this.selectedId })
    this.requestRender()
  }

  distributeSelection(axis: AxisName): void {
    const entities = this.transformEntities(this.selectedEntities)
    if (entities.length < 3) return
    const before = this.snapshotEntities(entities)
    this.options.onTransformBatchStart?.({ changes: before, primaryEntityId: this.selectedId })
    const offsets = distributeOffsets(entities.map((entity) => {
      const bounds = this.entityBounds(entity)
      return { id: entity.id, min: [bounds.min.x, bounds.min.y, bounds.min.z], max: [bounds.max.x, bounds.max.y, bounds.max.z] }
    }), axis)
    entities.forEach((entity) => { entity.root.position[axis] += offsets.get(entity.id) ?? 0 })
    this.updateGizmo()
    this.options.onTransformBatchEnd?.({ changes: this.snapshotEntities(entities), primaryEntityId: this.selectedId })
    this.requestRender()
  }

  setSnapPreview(entityId: string | null): void {
    this.entities.forEach((entity) => entity.setSnapPreview?.(entity.id === entityId))
    this.requestRender()
  }

  addOverlay(root: THREE.Object3D): void {
    this.scene.add(root)
    this.requestRender()
  }

  removeOverlay(root: THREE.Object3D): void {
    root.removeFromParent()
    this.requestRender()
  }

  groundPointFromClient(clientX: number, clientY: number): [number, number, number] | null {
    const ray = this.pointerRay({ clientX, clientY })
    const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3())
    return point ? [point.x, 0, point.z] : null
  }

  setEntityTransform(entityId: string, transform: Pick<StageTransform, 'position' | 'rotation' | 'scale'>): void {
    const entity = this.entities.get(entityId)
    if (!entity) return
    if (entity.applyTransform) entity.applyTransform(transform)
    else {
      entity.root.position.set(...transform.position)
      entity.root.rotation.set(...transform.rotation)
      if (transform.scale) entity.root.scale.set(...transform.scale)
      if (entity.type === 'Actor') entity.root.position.y = 0
    }
    this.updateGizmo()
    this.requestRender()
  }

  /** Refresh selection/gizmo presentation after a runtime-owned transform. */
  refreshEntityTransform(entityId: string): void {
    if (!this.entities.has(entityId)) return
    this.updateGizmo()
    this.requestRender()
  }

  setProps(definitions: readonly StagePropDefinition[]): void {
    const ids = new Set(definitions.map((definition) => definition.id))
    Array.from(this.entities.values()).forEach((entity) => {
      if (entity.type === 'Prop' && !ids.has(entity.id)) this.removeEntity(entity.id)
    })
    definitions.forEach((definition) => {
      const entity = this.entities.get(definition.id)
      if (entity?.type === 'Prop') {
        entity.root.position.set(...definition.position)
        entity.root.rotation.set(...definition.rotation)
        if (definition.scale) entity.root.scale.set(...definition.scale)
        return
      }
      this.createProp(definition)
    })
    this.updateGizmo()
    this.requestRender()
  }

  onSelectionChanged(listener: SelectionListener): () => void {
    this.selectionListener = listener
    return () => {
      if (this.selectionListener === listener) this.selectionListener = null
    }
  }

  resize(): void {
    if (this.disposed) return
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setSize(width, height, false)
    this.perspectiveCamera.aspect = width / height
    this.perspectiveCamera.updateProjectionMatrix()
    this.configureOrthographicCamera(width / height)
    this.applyViewCamera()
    this.lastNavigationEvent = 'resize'
    this.emitDebug(true, 'navigation:resize')
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest)
    this.resizeObserver?.disconnect()
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleWindowResize)
    this.removeInput()
    this.entities.forEach((entity) => entity.dispose?.())
    this.clearSelectionOutlines()
    this.clearCameraPathOverlay()
    this.resources.forEach((resource) => resource.dispose())
    this.renderer.dispose()
    this.webglDiagnosticsDispose()
    this.canvas.remove()
  }

  private readonly handleWindowResize = () => this.resize()

  private installInput(): void {
    this.canvas.addEventListener('contextmenu', this.handleContextMenu)
    this.canvas.addEventListener('pointerdown', this.handlePointerDown)
    this.canvas.addEventListener('pointermove', this.handlePointerMove)
    this.canvas.addEventListener('pointerup', this.handlePointerUp)
    this.canvas.addEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.addEventListener('lostpointercapture', this.handlePointerCancel)
    this.canvas.addEventListener('dblclick', this.handleDoubleClick)
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
  }

  private removeInput(): void {
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.handlePointerCancel)
    this.canvas.removeEventListener('dblclick', this.handleDoubleClick)
    this.canvas.removeEventListener('wheel', this.handleWheel)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
  }

  private readonly handleContextMenu = (event: MouseEvent) => {
    event.preventDefault()
    if (this.drag?.button === 2) this.releasePointer(this.drag.pointerId)
    const hit = this.pick(event)
    const logicalHit = this.logicalEntity(hit)
    if (logicalHit && this.selectedIds.length > 1 && this.selectedIds.includes(logicalHit.id)) return
    if (logicalHit) this.select(logicalHit.id)
    this.options.onContextMenu?.(logicalHit?.id ?? null, { clientX: event.clientX, clientY: event.clientY })
  }

  private readonly handleDoubleClick = (event: MouseEvent) => {
    if (this.disposed || event.button !== 0) return
    const hit = this.pick(event)
    if (!hit) return
    event.preventDefault()
    this.options.onEntityDoubleClick?.(hit.id)
  }

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (this.disposed || this.drag) return
    this.canvas.focus({ preventScroll: true })
    this.canvas.setPointerCapture(event.pointerId)
    const base = {
      pointerId: event.pointerId,
      button: event.button,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      emptySpaceClick: false,
      marqueeMode: (event.altKey ? 'subtract' : event.shiftKey ? 'add' : 'replace') as StageDrag['marqueeMode'],
      transformStarted: false,
      entity: null,
      handle: null,
      origin: null,
      axis: null,
      plane: null,
      startPoint: null,
      startPosition: null,
      startScale: null,
      startQuaternion: null,
      localRotationAxis: null,
      startAngle: null,
      groupEntities: [],
      groupPivot: null,
      startGroupPositions: new Map<string, THREE.Vector3>(),
      startGroupQuaternions: new Map<string, THREE.Quaternion>(),
      verticalMove: event.shiftKey,
      shiftActive: event.shiftKey || this.shiftKeyActive,
      shiftAxis: null,
      gizmoScale: null,
      screenAxis: null,
      worldUnitsPerPixel: null,
      rotationSnapDelta: null,
      gizmoSpace: 'world' as StageGizmoSpace,
      selectionChangedOnDown: false,
      pathKeyframe: null,
      pathSegmentId: null,
      permissionGranted: false,
      permissionPending: false,
    }

    const marqueeModifier = event.metaKey || event.ctrlKey
    // Resolve the hit for every left-button gesture before choosing the
    // interaction mode. Empty-space selection is a Stage gesture, not a
    // transform-tool gesture: Move/Rotate/Scale must not turn an empty drag
    // into orbit simply because the toolbar still has that tool active.
    // Entity and gizmo hits continue through their existing tool-specific
    // branches below.
    const marqueeHit = event.button === 0 ? this.pick(event) : null
    const marqueeEmpty = event.button === 0 && !marqueeHit && !this.pickGizmo(event) && !this.pickCameraPathKeyframe(event) && !this.pickCameraPathSegment(event)
    const selectModeMarquee = !this.spaceKeyActive && !event.altKey && !event.shiftKey && !marqueeModifier
    const modifierMarquee = !this.spaceKeyActive && !(event.altKey && event.shiftKey) && (marqueeModifier || event.shiftKey || event.altKey)
    if (marqueeEmpty && (selectModeMarquee || modifierMarquee)) {
      this.drag = { ...base, mode: 'marquee', emptySpaceClick: true }
      this.pointerMode = 'marquee'
      // Keep the committed selection visible while the gesture is still a
      // pending click. Only a drag beyond the movement threshold becomes a
      // marquee preview; this prevents navigation/cancellation from making a
      // valid selection appear to disappear before a selection is committed.
      this.marqueePreviewActive = false
      this.marqueePreviewIds = []
      this.marqueePreviewPrimaryId = null
      this.lastEmptyClickEvent = 'pending-empty-click'
      this.options.onMarqueeChange?.({ left: event.clientX, top: event.clientY, width: 0, height: 0, additive: base.marqueeMode === 'add', subtractive: base.marqueeMode === 'subtract' })
    } else if (event.button === 2 || event.button === 1 || (event.button === 0 && event.altKey && event.shiftKey)) {
      this.drag = { ...base, mode: 'pan' }
      this.pointerMode = 'pan'
    } else {
      const pathKeyframe = event.button === 0 ? this.pickCameraPathKeyframe(event) : null
      if (pathKeyframe) {
        this.options.onCameraPathKeyframeSelect?.(pathKeyframe)
        if (this.tool === 'move') {
          const pathDrag = this.beginCameraPathMove(event, base, pathKeyframe)
          this.drag = pathDrag
          this.pointerMode = 'move'
        } else {
          this.drag = { ...base, mode: 'orbit', pathKeyframe }
          this.pointerMode = 'orbit'
        }
      } else {
      const pathSegment = event.button === 0 ? this.pickCameraPathSegment(event) : null
      if (pathSegment) {
        this.options.onCameraPathSegmentSelect?.(pathSegment.selection)
        this.drag = { ...base, mode: 'orbit', pathSegmentId: pathSegment.id }
        this.pointerMode = 'orbit'
      } else {
      const gizmoHandle = event.button === 0 ? this.pickGizmo(event) : null
      if (gizmoHandle && this.selectedEntity && this.selectedEntity.transformable !== false && this.options.canTransformEntity?.(this.selectedEntity.id) !== false && this.options.canTransformGroup?.(this.selectedIds) !== false && this.tool !== 'select' && (this.tool !== 'scale' || (this.selectedEntities.length === 1 && this.selectedEntity.scalable === true))) {
        this.drag = this.beginGizmoDrag(event, base, gizmoHandle)
        this.pointerMode = 'gizmo'
      } else {
        const hit = event.button === 0 ? this.pick(event) : null
        const logicalHit = this.logicalEntity(hit)
        if (logicalHit && this.tool === 'move' && logicalHit.transformable !== false && this.options.canTransformEntity?.(logicalHit.id) !== false && this.options.canTransformGroup?.(this.selectedIds.includes(logicalHit.id) ? this.selectedIds : [logicalHit.id]) !== false) {
          if (!this.selectedIds.includes(logicalHit.id)) {
            this.select(logicalHit.id, null, event.shiftKey)
            base.selectionChangedOnDown = true
          }
          this.drag = this.beginDirectMove(event, base, logicalHit)
          this.pointerMode = 'move'
        } else {
          this.drag = { ...base, mode: 'orbit' }
          this.pointerMode = 'orbit'
        }
      }
      }
      }
    }
    this.recordInteractionEvent(`pointerdown:${this.pointerMode}`)
    event.preventDefault()
    this.lastPointerEvent = 'pointerdown'
    this.emitDebug(false, 'pointerdown')
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const drag = this.drag
    if (this.disposed || !drag || drag.pointerId !== event.pointerId) {
      if (!this.disposed && !drag) this.updateCameraPathHover(event)
      return
    }
    const deltaX = event.clientX - drag.lastX
    const deltaY = event.clientY - drag.lastY
    if (!drag.moved && !stageMovedBeyondThreshold(drag.startX, drag.startY, event.clientX, event.clientY)) return
    if ((drag.mode === 'move' || drag.mode === 'gizmo') && drag.entity && !drag.permissionGranted) {
      this.requestTransformPermission(drag)
      return
    }
    const gestureStarted = !drag.moved
    drag.moved = true
    drag.lastX = event.clientX
    drag.lastY = event.clientY

    if (drag.mode === 'move' && drag.pathKeyframe && !drag.transformStarted) {
      this.options.onCameraPathPointMoveStart?.(drag.pathKeyframe, this.pathDragPosition(drag))
      drag.transformStarted = true
    } else if ((drag.mode === 'move' || drag.mode === 'gizmo') && drag.entity && !drag.transformStarted) {
      this.beginTransform(drag)
      drag.transformStarted = true
    }

    if (drag.mode === 'orbit') {
      if (gestureStarted) this.recordInteractionEvent('gesture:start:orbit')
      this.lastNavigationEvent = 'pointermove-orbit'
      if (!stageViewModeIsOrthographic(this.viewMode)) {
        if (this.isometricCorner) {
          this.isometricCorner = null
          this.savedPerspectiveOrbit = null
          this.options.onViewChanged?.('perspective')
        }
        this.orbit.theta -= deltaX * 0.006
        this.orbit.phi = THREE.MathUtils.clamp(this.orbit.phi - deltaY * 0.006, 0.05, 3.1)
        this.applyViewCamera()
      }
    } else if (drag.mode === 'marquee') {
      if (drag.emptySpaceClick) this.lastEmptyClickEvent = 'marquee-selection'
      if (!this.marqueePreviewActive) {
        this.marqueePreviewActive = true
        this.marqueePreviewIds = []
        this.marqueePreviewPrimaryId = null
        this.recordInteractionEvent('gesture:start:marquee')
        this.recordInteractionEvent('marquee:preview')
      }
      const rect = this.marqueeRect(drag, event)
      this.updateMarqueePreview(drag, rect)
      this.options.onMarqueeChange?.(rect)
    } else if (drag.mode === 'pan') {
      if (gestureStarted) this.recordInteractionEvent('gesture:start:pan')
      this.lastNavigationEvent = 'pointermove-pan'
      this.pan(deltaX, deltaY)
    } else if (drag.mode === 'move') {
      const shiftHeld = event.shiftKey || this.shiftKeyActive
      if (shiftHeld !== drag.shiftActive) {
        drag.shiftActive = shiftHeld
        if (!shiftHeld) {
          drag.shiftAxis = null
          this.options.onAxisLockChange?.(null)
        }
      }
      if (drag.pathKeyframe) this.applyCameraPathMove(event, drag)
      else this.applyDirectMove(event, drag)
    } else if (drag.mode === 'gizmo') {
      this.applyGizmoDrag(event, drag)
    }
    if (drag.transformStarted && drag.entity) this.emitTransformPreview(drag)
    event.preventDefault()
    this.lastPointerEvent = 'pointermove'
    this.emitDebug(false, 'pointermove')
    this.requestRender()
  }

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.disposed || !this.drag || this.drag.pointerId !== event.pointerId) return
    const drag = this.drag
    if (drag.button === 0 && drag.moved && drag.mode === 'marquee') {
      this.finishMarquee(drag, event)
    } else if (!drag.moved && drag.button === 0) {
      const hit = this.pick(event)
      if (drag.pathKeyframe || drag.pathSegmentId) {
        // Marker selection is already handled on pointerdown; it must never
        // fall through to entity selection.
      } else if (drag.mode === 'move') {
        // A Shift-click on an already selected object is a toggle, not a
        // zero-distance move. Unmodified clicks retain the current group.
        const logicalHit = this.logicalEntity(hit)
        if (!drag.selectionChangedOnDown && event.shiftKey && logicalHit && this.selectedIds.includes(logicalHit.id)) this.select(logicalHit.id, null, true)
      } else if (drag.mode === 'marquee') {
        if (drag.emptySpaceClick && drag.marqueeMode === 'replace') {
          this.lastEmptyClickEvent = 'empty-click-cleared'
          this.select(null)
        }
      } else if (drag.mode !== 'gizmo') {
        const logicalHit = this.logicalEntity(hit)
        if (!logicalHit && !event.shiftKey) this.lastEmptyClickEvent = 'empty-click-cleared'
        this.select(logicalHit?.id ?? null, null, event.shiftKey)
      }
    }
    this.recordInteractionEvent(`pointerup:${drag.mode}`)
    if (drag.moved && drag.transformStarted && drag.mode === 'move' && drag.pathKeyframe) {
      this.options.onCameraPathPointMoveEnd?.(drag.pathKeyframe, this.pathDragPosition(drag))
      this.requestRender()
    } else if (drag.moved && drag.transformStarted && (drag.mode === 'move' || drag.mode === 'gizmo') && drag.entity) {
      this.endTransform(drag)
      this.updateGizmo()
      this.requestRender()
    }
    this.releasePointer(event.pointerId)
    event.preventDefault()
    this.lastPointerEvent = 'pointerup'
    this.emitDebug(true, 'pointerup')
  }

  private marqueeRect(drag: StageDrag, event: PointerEvent) {
    return stageMarqueeRect(drag.startX, drag.startY, event.clientX, event.clientY, drag.marqueeMode)
  }

  private finishMarquee(drag: StageDrag, event: PointerEvent): void {
    const rect = this.marqueeRect(drag, event)
    const hits = this.marqueeHitIds(rect)
    this.lastMarqueeFinalHitIds = [...hits]
    this.lastMarqueePreviousSelectedIds = [...this.selectedIds]
    const selection = stageMarqueeSelection(this.selectedIds, hits, this.selectedId, drag.marqueeMode)
    this.lastMarqueeNextSelectedIds = [...selection.ids]
    this.select(selection.ids, selection.primaryId)
    this.lastMarqueeCallbackPayload = JSON.stringify(this.getSelection())
    this.recordInteractionEvent(`marquee:commit:${hits.length}→${selection.ids.length}`)
    this.clearMarqueePreview()
    this.options.onMarqueeSelection?.(this.getSelection())
    this.options.onMarqueeChange?.(null)
  }

  private readonly handlePointerCancel = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return
    this.releasePointer(event.pointerId)
    this.lastPointerEvent = 'pointercancel'
    this.emitDebug(true, 'pointercancel')
  }

  private readonly handleWheel = (event: WheelEvent) => {
    if (this.disposed) return
    // A wheel/trackpad gesture is navigation, never the completion of a
    // pointer selection gesture. Clear only navigation/marquee drags so a
    // delayed pointerup cannot commit an empty-click selection after zoom.
    if (this.drag && (this.drag.mode === 'marquee' || this.drag.mode === 'orbit' || this.drag.mode === 'pan')) {
      this.releasePointer(this.drag.pointerId)
    }
    const input = classifyWheelInput(event)
    this.lastNavigationEvent = `wheel:${input}`
    if (input === 'trackpad-pan') this.pan(event.deltaX, event.deltaY)
    else if (stageViewModeIsOrthographic(this.viewMode)) {
      this.orthographicHalfHeight = THREE.MathUtils.clamp(stageZoomDistance(this.orthographicHalfHeight, event.deltaY), 1, 100)
      this.saveOrthographicViewState()
    } else this.orbit.radius = stageZoomDistance(this.orbit.radius, event.deltaY)
    this.applyViewCamera()
    event.preventDefault()
    this.lastPointerEvent = 'wheel'
    this.emitDebug(true, 'wheel')
    this.requestRender()
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      if (this.isTypingTarget(event.target)) return
      this.spaceKeyActive = true
      event.preventDefault()
      return
    }
    if (event.key === 'Escape') {
      if (this.drag?.mode === 'marquee') {
        this.releasePointer(this.drag.pointerId)
        event.preventDefault()
        this.emitDebug()
        return
      }
      if (event.target === this.canvas && !this.isTypingTarget(event.target) && this.options.onEscape?.()) {
        event.preventDefault()
        this.emitDebug(true, 'escape:handled')
        return
      }
      if (event.target === this.canvas && !this.isTypingTarget(event.target) && (this.selectedIds.length > 0 || this.selectedId !== null)) {
        this.select(null)
        event.preventDefault()
        return
      }
    }
    if (event.key === 'Shift') {
      this.shiftKeyActive = true
      return
    }
    if (this.isTypingTarget(event.target)) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const configuredTool = Object.entries(this.toolShortcuts).find(([, key]) => key?.toLowerCase() === event.key.toLowerCase())?.[0] as StageTool | undefined
    const tool = configuredTool ?? stageToolForKey(event.key)
    if (tool) {
      this.setTool(tool)
      event.preventDefault()
      return
    }
    if (event.key.toLowerCase() === this.frameSelectedShortcut.toLowerCase()) {
      this.frameSelected()
      event.preventDefault()
    } else if (event.key === 'Home' || event.key.toLowerCase() === 'h') {
      this.orbitTarget.set(0, 1, 0)
      if (stageViewModeIsOrthographic(this.viewMode)) {
        this.orthographicHalfHeight = 8
        this.saveOrthographicViewState()
      } else {
        this.orbit.radius = 15
        this.orbit.theta = 0.62
        this.orbit.phi = 1.13
      }
      this.applyViewCamera()
      event.preventDefault()
    }
    this.emitDebug()
  }

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') {
      this.spaceKeyActive = false
      return
    }
    if (event.key !== 'Shift') return
    this.shiftKeyActive = false
    if (this.drag?.mode === 'move') {
      this.drag.shiftActive = false
      this.drag.shiftAxis = null
      this.options.onAxisLockChange?.(null)
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
  }

  private releasePointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId)
    this.drag = null
    this.pointerMode = 'idle'
    this.options.onAxisLockChange?.(null)
    this.setHover(null)
    this.clearMarqueePreview()
    this.options.onMarqueeChange?.(null)
  }

  private get selectedEntity(): StageEntity | null {
    return this.selectedId ? this.entities.get(this.selectedId) ?? null : null
  }

  private get selectedEntities(): StageEntity[] {
    return this.selectedIds.map((id) => this.entities.get(id)).filter((entity): entity is StageEntity => Boolean(entity))
  }

  private select(entityOrIds: string | readonly string[] | null, primaryId: string | null = null, additive = false): void {
    if (additive && entityOrIds === null) return
    let nextSelection
    const resolveSelectionId = this.options.resolveSelectionId ?? ((entityId: string) => entityId)
    if (additive && typeof entityOrIds === 'string') {
      nextSelection = toggleSelection({ ids: this.selectedIds, primaryId: this.selectedId }, resolveSelectionId(entityOrIds), new Set(this.entities.keys()))
    } else {
      const ids = (typeof entityOrIds === 'string' ? [entityOrIds] : entityOrIds ? [...entityOrIds] : []).map(resolveSelectionId)
      const resolvedPrimary = primaryId ? resolveSelectionId(primaryId) : typeof entityOrIds === 'string' ? resolveSelectionId(entityOrIds) : null
      nextSelection = normalizeSelection(ids, resolvedPrimary, new Set(this.entities.keys()))
    }
    const ids = nextSelection.ids
    primaryId = nextSelection.primaryId
    if (primaryId === this.selectedId && ids.length === this.selectedIds.length && ids.every((id, index) => id === this.selectedIds[index])) {
      this.applySelectionVisuals()
      return
    }
    this.selectedIds = ids
    this.selectedId = primaryId
    this.applySelectionVisuals()
    this.selectedEntity?.root.updateMatrixWorld(true)
    this.updateGizmo()
    const callbackPayload = { ids: [...this.selectedIds], primaryId: this.selectedId }
    this.lastSelectionEvent = this.selectedIds.length === 0 ? 'cleared' : 'committed'
    this.lastSelectionCallbackPayload = JSON.stringify(callbackPayload)
    if (this.selectedIds.length === 0) this.lastDeselectionCallback = 'selection-callback:cleared'
    this.selectionListener?.(callbackPayload)
    this.emitDebug(true, 'selection-commit')
    this.requestRender()
  }

  private marqueeHitIds(rect: { left: number; top: number; width: number; height: number }): string[] {
    const canvasRect = this.getCanvasRect()
    const resolveSelectionId = this.options.resolveSelectionId ?? ((entityId: string) => entityId)
    return Array.from(this.entities.values()).filter((entity) => {
      if (!entity.root.visible) return false
      entity.root.updateMatrixWorld(true)
      return stageProjectedBoundsIntersectMarquee(this.selectionBoundsObject(entity), this.editorCamera, canvasRect, rect)
    }).map((entity) => resolveSelectionId(entity.id)).filter((id, index, all) => all.indexOf(id) === index)
  }

  private updateMarqueePreview(drag: StageDrag, rect: { left: number; top: number; width: number; height: number; additive: boolean; subtractive: boolean }): void {
    const hits = this.marqueeHitIds(rect)
    const preview = stageMarqueeSelection(this.selectedIds, hits, this.selectedId, drag.marqueeMode)
    this.marqueePreviewIds = preview.ids
    this.marqueePreviewPrimaryId = preview.primaryId
    this.applySelectionVisuals()
  }

  private recordInteractionEvent(event: string): void {
    this.recentInteractionEvents = [...this.recentInteractionEvents, event].slice(-16)
  }

  private clearMarqueePreview(): void {
    if (!this.marqueePreviewActive && this.marqueePreviewIds.length === 0) return
    this.marqueePreviewActive = false
    this.marqueePreviewIds = []
    this.marqueePreviewPrimaryId = null
    this.applySelectionVisuals()
  }

  private applySelectionVisuals(): void {
    const canonicalIds = this.marqueePreviewActive ? this.marqueePreviewIds : this.selectedIds
    const visualIds = new Set(expandSelectionVisualIds(canonicalIds, this.options.resolveSelectionVisualIds))
    const primaryVisualIds = new Set(expandSelectionVisualIds(this.marqueePreviewActive ? (this.marqueePreviewPrimaryId ? [this.marqueePreviewPrimaryId] : []) : (this.selectedId ? [this.selectedId] : []), this.options.resolveSelectionVisualIds))
    this.entities.forEach((entity) => {
      const selected = visualIds.has(entity.id)
      const primary = primaryVisualIds.has(entity.id)
      const color = this.marqueePreviewActive ? MARQUEE_PREVIEW_COLOR : SELECTION_COLOR
      entity.setSelected?.(selected, primary)
      entity.material?.emissive.set(selected ? color : '#000000')
      if (entity.material) entity.material.emissiveIntensity = selected ? (primary ? 0.5 : 0.34) : 0
      entity.root.userData.stageSelected = selected
      entity.root.userData.stagePrimary = primary
      entity.root.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.emissive.set(selected ? color : '#000000')
          object.material.emissiveIntensity = selected ? (primary ? 0.5 : 0.34) : 0
        }
      })
    })
    this.updateSelectionOutlines(visualIds)
  }

  private refreshSelectionOutlines(): void {
    const visibleSelection = this.marqueePreviewActive ? this.marqueePreviewIds : this.selectedIds
    this.updateSelectionOutlines(new Set(expandSelectionVisualIds(visibleSelection, this.options.resolveSelectionVisualIds)))
  }

  private updateSelectionOutlines(visualIds: ReadonlySet<string>): void {
    this.selectionOutlines.forEach((helper, id) => {
      if (!this.entities.has(id)) {
        helper.removeFromParent()
        helper.geometry.dispose()
        ;(helper.material as THREE.Material).dispose()
        this.selectionOutlines.delete(id)
        return
      }
      if (visualIds.has(id) && this.entities.get(id)?.root.visible) {
        this.entities.get(id)?.root.updateMatrixWorld(true)
        helper.update()
        helper.visible = true
      } else {
        helper.visible = false
      }
    })
    visualIds.forEach((id) => {
      const entity = this.entities.get(id)
      if (!entity || !entity.root.visible) return
      let helper = this.selectionOutlines.get(id)
      if (!helper) {
        helper = new THREE.BoxHelper(this.selectionBoundsObject(entity), MARQUEE_PREVIEW_COLOR)
        helper.name = `Selection Outline: ${id}`
        helper.renderOrder = 1001
        helper.frustumCulled = false
        helper.userData.stageSelectionHelper = true
        helper.raycast = () => undefined
        const material = helper.material as THREE.LineBasicMaterial
        material.transparent = true
        material.opacity = 0.95
        material.depthTest = false
        material.depthWrite = false
        this.selectionOutlines.set(id, helper)
        this.scene.add(helper)
      }
      entity.root.updateMatrixWorld(true)
      helper.update()
      helper.visible = true
      ;(helper.material as THREE.LineBasicMaterial).color.set(this.marqueePreviewActive ? MARQUEE_PREVIEW_COLOR : SELECTION_COLOR)
    })
  }

  private clearSelectionOutlines(): void {
    this.selectionOutlines.forEach((helper) => {
      helper.removeFromParent()
      helper.geometry.dispose()
      ;(helper.material as THREE.Material).dispose()
    })
    this.selectionOutlines.clear()
  }

  private beginTransform(drag: StageDrag): void {
    if (drag.groupEntities.length > 1) this.options.onTransformBatchStart?.(this.batchSnapshot(drag))
    else if (drag.entity) this.options.onTransformStart?.(this.transformSnapshot(drag.entity, drag))
  }

  private requestTransformPermission(drag: StageDrag): void {
    if (drag.permissionPending || drag.permissionGranted || !drag.entity) return
    const request = this.options.onTransformPermissionRequest
    if (!request) {
      drag.permissionGranted = true
      return
    }
    const result = request(drag.entity.id)
    if (typeof result === 'boolean') {
      if (result) drag.permissionGranted = true
      else this.releasePointer(drag.pointerId)
      return
    }
    drag.permissionPending = true
    void result.then((granted) => {
      if (this.drag !== drag || this.disposed) return
      drag.permissionPending = false
      if (granted) {
        drag.permissionGranted = true
        this.requestRender()
      } else this.releasePointer(drag.pointerId)
    }).catch(() => {
      if (this.drag !== drag || this.disposed) return
      this.releasePointer(drag.pointerId)
    })
  }

  private endTransform(drag: StageDrag): void {
    if (drag.groupEntities.length > 1) this.options.onTransformBatchEnd?.(this.batchSnapshot(drag))
    else if (drag.entity) this.options.onTransformEnd?.(this.transformSnapshot(drag.entity, drag))
  }

  private emitTransformPreview(drag: StageDrag): void {
    if (drag.groupEntities.length > 1) this.options.onTransformBatchPreview?.(this.batchSnapshot(drag))
    else if (drag.entity) this.options.onTransformPreview?.(this.transformSnapshot(drag.entity, drag))
  }

  private transformSnapshot(entity: StageEntity, drag: StageDrag | null = this.drag): StageTransform {
    const snapshot = entity.getTransformSnapshot?.()
    if (snapshot) {
      return {
        entityId: entity.id,
        position: snapshot.position,
        rotation: snapshot.rotation,
        scale: snapshot.scale ?? [entity.root.scale.x, entity.root.scale.y, entity.root.scale.z],
        mode: drag?.mode === 'gizmo' ? drag.handle?.mode ?? 'move' : 'move',
      }
    }
    return {
      entityId: entity.id,
      position: [entity.root.position.x, entity.root.position.y, entity.root.position.z],
      rotation: [entity.root.rotation.x, entity.root.rotation.y, entity.root.rotation.z],
      scale: [entity.root.scale.x, entity.root.scale.y, entity.root.scale.z],
      mode: drag?.mode === 'gizmo' ? drag.handle?.mode ?? 'move' : 'move',
    }
  }

  private batchSnapshot(drag: StageDrag): StageTransformBatch {
    return { changes: drag.groupEntities.map((entity) => this.transformSnapshot(entity, drag)), primaryEntityId: this.selectedId }
  }

  private snapshotEntities(entities: readonly StageEntity[]): StageTransform[] {
    return entities.map((entity) => this.transformSnapshot(entity))
  }

  private transformEntities(entities: readonly StageEntity[]): StageEntity[] {
    return entities.filter((entity) => entity.transformable !== false && entity.groupTransformable !== false)
  }

  private entityBounds(entity: StageEntity): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.selectionBoundsObject(entity))
  }

  private selectionBoundsObject(entity: StageEntity): THREE.Object3D {
    return entity.selectionBounds ?? entity.root
  }

  private transformPivot(entity: StageEntity): THREE.Vector3 {
    entity.root.updateMatrixWorld(true)
    return entity.getTransformPivot?.() ?? entity.root.getWorldPosition(new THREE.Vector3())
  }

  private boundsForEntities(entities: readonly StageEntity[]): THREE.Box3 {
    const bounds = new THREE.Box3()
    entities.forEach((entity) => bounds.union(this.entityBounds(entity)))
    return bounds.isEmpty() ? this.relevantBounds() : bounds
  }

  private getCanvasRect(): StageCanvasRect {
    const rect = this.canvas.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }

  private ndc(event: StagePointerPointLike): THREE.Vector2 {
    const ndc = stageNdcFromEvent(event, this.getCanvasRect())
    this.lastNdc = `${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)}`
    return ndc
  }

  private pointerRay(event: StagePointerPointLike, synchronizeScene = true): THREE.Raycaster {
    if (synchronizeScene) {
      this.scene.updateMatrixWorld(true)
      this.editorCamera.updateMatrixWorld(true)
    }
    this.raycaster.setFromCamera(this.ndc(event), this.editorCamera)
    return this.raycaster
  }

  private pick(event: { clientX: number; clientY: number }): StageEntity | null {
    const raycaster = this.pointerRay(event)
    const hits = raycaster.intersectObjects(this.selectableRoots, true)
    this.lastRayHits = String(hits.length)
    const hit = hits[0]
    if (!hit) return null
    let current: THREE.Object3D | null = hit.object
    while (current && !this.selectableRoots.includes(current as THREE.Group)) current = current.parent
    return current ? this.entities.get(current.userData.entityId as string) ?? null : null
  }

  private logicalEntity(entity: StageEntity | null): StageEntity | null {
    if (!entity) return null
    const logicalId = this.options.resolveSelectionId?.(entity.id) ?? entity.id
    return this.entities.get(logicalId) ?? entity
  }

  private pickCameraPathKeyframe(event: { clientX: number; clientY: number }): CameraPathKeyframe | null {
    if (!this.cameraPathVisible || this.cameraPathMarkerMeshes.length === 0) return null
    const hit = this.pointerRay(event).intersectObjects(this.cameraPathMarkerMeshes, false)[0]
    const keyframeId = hit?.object.userData.cameraPathKeyframeId as string | undefined
    return keyframeId ? this.cameraPathKeyframes.find((keyframe) => keyframe.keyframeId === keyframeId) ?? null : null
  }

  private pickCameraPathSegment(event: { clientX: number; clientY: number }): { id: string; selection: CameraPathSegmentSelection } | null {
    if (!this.cameraPathVisible || this.cameraPathSegmentLines.length === 0) return null
    this.raycaster.params.Line.threshold = 0.14
    const hit = this.pointerRay(event).intersectObjects(this.cameraPathSegmentLines, false)[0]
    const id = hit?.object.userData.cameraPathSegmentId as string | undefined
    return id ? this.cameraPathSegments.find((segment) => segment.id === id) ?? null : null
  }

  private updateCameraPathHover(event: { clientX: number; clientY: number }): void {
    const segment = this.pickCameraPathSegment(event)
    const nextId = segment?.id ?? null
    if (nextId === this.cameraPathHoveredSegmentId) return
    this.cameraPathHoveredSegmentId = nextId
    this.cameraPathSegmentLines.forEach((line) => {
      const hovered = line.userData.cameraPathSegmentId === nextId
      const selected = line.userData.cameraPathSelected === true
      line.userData.cameraPathHovered = hovered
      line.material = selected ? this.cameraPathSelectedSegmentMaterial! : hovered ? this.cameraPathSelectedSegmentMaterial! : this.cameraPathSegmentMaterial!
    })
    this.requestRender()
  }

  private beginCameraPathMove(event: PointerEvent, base: Omit<StageDrag, 'mode'>, keyframe: CameraPathKeyframe): StageDrag {
    const startPosition = new THREE.Vector3(...keyframe.position)
    const planeNormal = stageViewModeIsOrthographic(this.viewMode) ? stageViewDirection(this.viewMode).direction : new THREE.Vector3(0, 1, 0)
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, startPosition)
    const startPoint = this.pointerRay(event).ray.intersectPlane(plane, new THREE.Vector3()) ?? startPosition.clone()
    return { ...base, mode: 'move', pathKeyframe: keyframe, plane, startPoint, startPosition, groupPivot: startPosition.clone() }
  }

  private pathDragPosition(drag: StageDrag): ActorVector3Like {
    const marker = drag.pathKeyframe ? this.cameraPathMarkerMeshes.find((candidate) => candidate.userData.cameraPathKeyframeId === drag.pathKeyframe?.keyframeId) : null
    const position = marker?.position ?? (drag.startPosition ?? new THREE.Vector3())
    return [position.x, position.y, position.z]
  }

  private applyCameraPathMove(event: PointerEvent, drag: StageDrag): void {
    if (!drag.pathKeyframe || !drag.plane || !drag.startPoint || !drag.startPosition) return
    const point = this.pointerRay(event).ray.intersectPlane(drag.plane, new THREE.Vector3())
    if (!point) return
    const delta = point.sub(drag.startPoint)
    if (!stageViewModeIsOrthographic(this.viewMode)) delta.y = 0
    const shiftHeld = event.shiftKey || this.shiftKeyActive
    if (shiftHeld !== drag.shiftActive) {
      drag.shiftActive = shiftHeld
      if (!shiftHeld) {
        drag.shiftAxis = null
        this.options.onAxisLockChange?.(null)
      }
    }
    if (shiftHeld) {
      if (!drag.shiftAxis) {
        const verticalIntent = -(event.clientY - drag.startY) * stageWorldUnitsPerPixelAtDepth(this.editorCamera, stageCameraSpaceDepth(this.editorCamera, drag.startPosition), this.getCanvasRect().height)
        drag.shiftAxis = dominantStageAxis(new THREE.Vector3(delta.x, verticalIntent, delta.z))
        this.options.onAxisLockChange?.(drag.shiftAxis)
      }
      if (drag.shiftAxis === 'y') delta.set(0, -(event.clientY - drag.startY) * stageWorldUnitsPerPixelAtDepth(this.editorCamera, stageCameraSpaceDepth(this.editorCamera, drag.startPosition), this.getCanvasRect().height), 0)
      else delta.copy(constrainStageDeltaToAxis(delta, drag.shiftAxis))
    }
    const desired = drag.startPosition.clone().add(delta)
    const snapped = this.snapPosition(desired, shiftHeld && drag.shiftAxis ? [drag.shiftAxis] : this.freeMoveSnapAxes(delta))
    const marker = this.cameraPathMarkerMeshes.find((candidate) => candidate.userData.cameraPathKeyframeId === drag.pathKeyframe?.keyframeId)
    marker?.position.copy(snapped)
    this.options.onCameraPathPointMovePreview?.(drag.pathKeyframe, [snapped.x, snapped.y, snapped.z])
  }

  private pickGizmo(event: PointerEvent): StageGizmoHandle | null {
    if (!this.gizmoRoot.visible || this.gizmoHandles.length === 0) return null
    this.scene.updateMatrixWorld(true)
    this.editorCamera.updateMatrixWorld(true)
    this.raycaster.setFromCamera(this.ndc(event), this.editorCamera)
    const hit = this.raycaster.intersectObjects(this.gizmoHandles.filter((entry) => entry.pick.visible && entry.pick.parent?.visible).map((entry) => entry.pick), false)[0]
    return hit?.object.userData.stageGizmoHandle as StageGizmoHandle | null
  }

  private beginDirectMove(event: PointerEvent, base: Omit<StageDrag, 'mode'>, entity: StageEntity): StageDrag {
    const groupEntities = this.transformEntities(this.selectedEntities)
    const activeEntities = groupEntities.length > 0 ? groupEntities : [entity]
    const groupPivot = activeEntities.length === 1 ? this.transformPivot(activeEntities[0]) : this.boundsForEntities(activeEntities).getCenter(new THREE.Vector3())
    const planeNormal = stageViewModeIsOrthographic(this.viewMode) ? stageViewDirection(this.viewMode).direction : new THREE.Vector3(0, 1, 0)
    const movePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, groupPivot)
    const hit = this.pointerRay(event).ray.intersectPlane(movePlane, new THREE.Vector3())
    const startPoint = hit ?? groupPivot.clone()
    return { ...base, mode: 'move', entity, groupEntities: activeEntities, groupPivot, startGroupPositions: new Map(activeEntities.map((item) => [item.id, item.root.position.clone()])), startGroupQuaternions: new Map(activeEntities.map((item) => [item.id, item.root.quaternion.clone()])), plane: movePlane, startPoint, startPosition: entity.root.position.clone(), gizmoScale: this.gizmoScale(groupPivot) }
  }

  private beginGizmoDrag(event: PointerEvent, base: Omit<StageDrag, 'mode'>, handle: StageGizmoHandle): StageDrag {
    const entity = this.selectedEntity
    if (!entity) return { ...base, mode: 'orbit' }
    const groupEntities = this.transformEntities(this.selectedEntities)
    const activeEntities = groupEntities.length > 0 ? groupEntities : [entity]
    const groupPivot = activeEntities.length === 1 ? this.transformPivot(activeEntities[0]) : this.boundsForEntities(activeEntities).getCenter(new THREE.Vector3())
    const origin = groupPivot.clone()
    const gizmoSpace = entity.groupTransformable === false
      ? 'world'
      : stageTransformSpace(entity.type === 'Camera' ? 'camera' : 'default', handle.mode, this.selectedEntities.length)
    const axis = handle.axis
      ? handle.mode === 'rotate'
          ? entity.groupTransformable === false && entity.type !== 'Camera'
            ? stageRotationAxis([entity.root.rotation.x, entity.root.rotation.y, entity.root.rotation.z], handle.axis)
            : stageTransformAxis(entity.type === 'Camera' ? 'camera' : 'default', handle.mode, [entity.root.rotation.x, entity.root.rotation.y, entity.root.rotation.z], handle.axis, this.selectedEntities.length)
        : gizmoSpace === 'local'
          ? stageLocalAxis([entity.root.rotation.x, entity.root.rotation.y, entity.root.rotation.z], handle.axis)
          : stageWorldAxis(handle.axis)
      : null
    const plane = handle.kind === 'plane' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -origin.y) : null
    const startPoint = plane ? this.pointerRay(event).ray.intersectPlane(plane, new THREE.Vector3()) : null
    const screenAxis = (handle.mode === 'move' || handle.mode === 'scale') && handle.kind === 'axis' && axis ? stageProjectWorldAxisToScreen(this.editorCamera, origin, axis, this.getCanvasRect()) : null
    const worldUnitsPerPixel = handle.mode === 'move' && handle.kind === 'axis' && axis ? stageWorldUnitsPerPixelAlongAxis(this.editorCamera, origin, axis, this.getCanvasRect()) : null
    this.lastAxisDragDebug = handle.mode === 'move' && handle.kind === 'axis' ? {
      handle: handle.axis ?? 'axis',
      screenAxisX: screenAxis?.x ?? 0,
      screenAxisY: screenAxis?.y ?? 0,
      pointerDeltaX: 0,
      pointerDeltaY: 0,
      pixelsAlongAxis: 0,
      worldUnitsPerPixel: worldUnitsPerPixel ?? 0,
      worldDistance: 0,
      resultPosition: [entity.root.position.x, entity.root.position.y, entity.root.position.z],
    } : null
    return {
      ...base,
      mode: 'gizmo',
      entity,
      handle,
      origin,
      axis,
      gizmoSpace,
      plane,
      startPoint,
      startPosition: entity.root.position.clone(),
      startScale: entity.root.scale.clone(),
      startQuaternion: entity.root.quaternion.clone(),
      localRotationAxis: handle.mode === 'rotate' && handle.axis && gizmoSpace === 'local' ? stageWorldAxis(handle.axis) : null,
      startAngle: handle.mode === 'rotate' && axis ? this.ringAngle(event, origin, axis) : null,
      gizmoScale: this.gizmoScale(origin),
      screenAxis,
      worldUnitsPerPixel,
      groupEntities: activeEntities,
      groupPivot,
      startGroupPositions: new Map(activeEntities.map((item) => [item.id, item.root.position.clone()])),
      startGroupQuaternions: new Map(activeEntities.map((item) => [item.id, item.root.quaternion.clone()])),
    }
  }

  private applyDirectMove(event: PointerEvent, drag: StageDrag): void {
    if (!drag.entity || !drag.plane || !drag.startPoint || !drag.startPosition) return
    const point = this.pointerRay(event).ray.intersectPlane(drag.plane, new THREE.Vector3())
    if (!point) return
    const delta = point.sub(drag.startPoint)
    if (!stageViewModeIsOrthographic(this.viewMode)) delta.y = 0
    if (drag.shiftActive) {
      if (!drag.shiftAxis) {
        const depth = stageCameraSpaceDepth(this.editorCamera, drag.entity.root.position)
        const verticalIntent = -(event.clientY - drag.startY) * stageWorldUnitsPerPixelAtDepth(this.editorCamera, depth, this.getCanvasRect().height)
        drag.shiftAxis = dominantStageAxis(new THREE.Vector3(delta.x, verticalIntent, delta.z))
        this.options.onAxisLockChange?.(drag.shiftAxis)
      }
      if (drag.shiftAxis === 'y') {
        delta.set(0, -(event.clientY - drag.startY) * stageWorldUnitsPerPixelAtDepth(this.editorCamera, stageCameraSpaceDepth(this.editorCamera, drag.entity.root.position), this.getCanvasRect().height), 0)
      } else {
        const constrained = constrainStageDeltaToAxis(delta, drag.shiftAxis)
        delta.copy(constrained)
      }
    }
    const pivot = drag.groupPivot ?? drag.startPosition
    const desiredPosition = pivot.clone().add(delta)
    const snapAxes = drag.shiftActive && drag.shiftAxis ? [drag.shiftAxis] : this.freeMoveSnapAxes(delta)
    const snappedPivot = this.snapPosition(desiredPosition, snapAxes)
    const groupDelta = snappedPivot.sub(pivot)
    drag.groupEntities.forEach((entity) => {
      const start = drag.startGroupPositions.get(entity.id) ?? entity.root.position
      entity.root.position.copy(start).add(groupDelta)
      if (drag.groupEntities.length === 1 && entity.type === 'Actor') entity.root.position.y = 0
    })
    this.updateGizmo(drag)
  }

  private snapPosition(position: THREE.Vector3, axes: readonly StageAxisName[]): THREE.Vector3 {
    return this.snapEnabled ? snapStagePosition(position, axes, this.snapGridSize) : position
  }

  private freeMoveSnapAxes(delta: THREE.Vector3): StageAxisName[] {
    if (!stageViewModeIsOrthographic(this.viewMode)) return ['x', 'z']
    const direction = stageViewDirection(this.viewMode).direction
    const candidateAxes: StageAxisName[] = (['x', 'y', 'z'] as const).filter((axis) => Math.abs(direction[axis]) < 0.5)
    const movedAxes = candidateAxes.filter((axis) => Math.abs(delta[axis]) > 0.000001)
    return movedAxes.length > 0 ? movedAxes : candidateAxes.slice()
  }

  private applyGizmoDrag(event: PointerEvent, drag: StageDrag): void {
    if (!drag.entity || !drag.handle || !drag.origin) return
    if (drag.handle.mode === 'scale') {
      if (drag.groupEntities.length > 1) return
      if (!drag.startScale) return
      const axis = drag.handle.axis ?? 'uniform'
      const axisVector = drag.axis
      const screenAxis = drag.screenAxis ?? new THREE.Vector2(0, -1)
      const pixelsAlongAxis = axisVector && drag.handle.kind === 'axis'
        ? stagePointerDeltaAlongAxis(drag.startX, drag.startY, event.clientX, event.clientY, screenAxis)
        : -(event.clientY - drag.startY)
      const result = scaleFromPointer([drag.startScale.x, drag.startScale.y, drag.startScale.z], axis as ScaleAxis, pixelsAlongAxis, drag.handle.kind === 'uniform' || drag.verticalMove)
      drag.entity.root.scale.set(...result.scale)
      this.lastScaleDragDebug = {
        handle: axis,
        startScale: [drag.startScale.x, drag.startScale.y, drag.startScale.z],
        shiftConstrained: drag.handle.kind === 'uniform' || drag.verticalMove,
        pixelsAlongAxis,
        factor: result.factor,
        resultScale: result.scale,
      }
    } else if (drag.handle.mode === 'rotate') {
      if (!drag.axis || !drag.startQuaternion || drag.startAngle === null) return
      const angle = this.ringAngle(event, drag.origin, drag.axis)
      if (angle === null) return
      let delta = angle - drag.startAngle
      if (delta > Math.PI) delta -= Math.PI * 2
      if (delta < -Math.PI) delta += Math.PI * 2
      if (this.rotationSnapEnabled && this.snapEnabled) delta = snapAngle(delta, this.rotationSnapRadians)
      drag.rotationSnapDelta = delta
      const rotation = new THREE.Quaternion().setFromAxisAngle(drag.axis, delta)
      const pivot = drag.groupPivot ?? drag.origin
      drag.groupEntities.forEach((entity) => {
        const startPosition = drag.startGroupPositions.get(entity.id) ?? entity.root.position
        const startQuaternion = drag.startGroupQuaternions.get(entity.id) ?? entity.root.quaternion
        entity.root.position.copy(startPosition).sub(pivot).applyQuaternion(rotation).add(pivot)
        entity.root.quaternion.copy(stageApplyRotation(startQuaternion, drag.localRotationAxis ?? drag.axis!, delta, drag.gizmoSpace))
      })
    } else {
      if (!drag.startPosition) return
      if (drag.handle.kind === 'plane') {
        if (!drag.plane || !drag.startPoint) return
        const point = this.pointerRay(event, false).ray.intersectPlane(drag.plane, new THREE.Vector3())
        if (!point) return
        const delta = point.sub(drag.startPoint)
        delta.y = 0
        const pivot = drag.groupPivot ?? drag.startPosition
        const target = this.snapPosition(pivot.clone().add(delta), ['x', 'z'])
        const translation = target.sub(pivot)
        drag.groupEntities.forEach((entity) => entity.root.position.copy(drag.startGroupPositions.get(entity.id) ?? entity.root.position).add(translation))
      } else if (drag.axis && drag.screenAxis && drag.worldUnitsPerPixel !== null) {
        const pointerDeltaX = event.clientX - drag.startX
        const pointerDeltaY = event.clientY - drag.startY
        const pixelsAlongAxis = stagePointerDeltaAlongAxis(drag.startX, drag.startY, event.clientX, event.clientY, drag.screenAxis)
        const worldDistance = pixelsAlongAxis * drag.worldUnitsPerPixel
        const pivot = drag.groupPivot ?? drag.startPosition
        const travel = drag.gizmoSpace === 'local' && drag.handle.axis && this.snapEnabled
          ? snapStageValue(worldDistance, this.snapGridSize)
          : worldDistance
        const desiredPosition = pivot.clone().addScaledVector(drag.axis, travel)
        const target = drag.gizmoSpace === 'local' && drag.handle.axis
          ? desiredPosition
          : this.snapPosition(desiredPosition, drag.handle.axis ? [drag.handle.axis] : [])
        const translation = target.sub(pivot)
        drag.groupEntities.forEach((entity) => entity.root.position.copy(drag.startGroupPositions.get(entity.id) ?? entity.root.position).add(translation))
        this.lastAxisDragDebug = {
          handle: drag.handle.axis ?? 'axis',
          screenAxisX: drag.screenAxis.x,
          screenAxisY: drag.screenAxis.y,
          pointerDeltaX,
          pointerDeltaY,
          pixelsAlongAxis,
          worldUnitsPerPixel: drag.worldUnitsPerPixel,
          worldDistance,
          resultPosition: [drag.entity.root.position.x, drag.entity.root.position.y, drag.entity.root.position.z],
        }
      }
      if (drag.groupEntities.length === 1 && drag.entity.type === 'Actor') drag.entity.root.position.y = 0
    }
    this.updateGizmo(drag)
  }

  private ringAngle(event: PointerEvent, origin: THREE.Vector3, axis: THREE.Vector3): number | null {
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, origin)
    const point = this.pointerRay(event).ray.intersectPlane(plane, new THREE.Vector3())
    if (!point) return null
    const vector = point.sub(origin)
    const basisU = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(axis).normalize() : new THREE.Vector3(1, 0, 0).cross(axis).normalize()
    const basisW = new THREE.Vector3().crossVectors(axis, basisU)
    return Math.atan2(vector.dot(basisW), vector.dot(basisU))
  }

  private pan(deltaX: number, deltaY: number): void {
    this.editorCamera.updateMatrixWorld(true)
    const right = new THREE.Vector3().setFromMatrixColumn(this.editorCamera.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(this.editorCamera.matrixWorld, 1)
    const scale = stageViewModeIsOrthographic(this.viewMode)
      ? (2 * this.orthographicHalfHeight) / Math.max(1, this.getCanvasRect().height)
      : this.orbit.radius * 0.0014
    this.orbitTarget.addScaledVector(right, -deltaX * scale)
    this.orbitTarget.addScaledVector(up, deltaY * scale)
    this.applyViewCamera()
  }

  private applyViewCamera(): void {
    if (stageViewModeIsOrthographic(this.viewMode)) {
      this.editorCamera = this.orthographicCamera
      const { direction, up } = stageViewDirection(this.viewMode)
      const distance = Math.max(20, this.orthographicHalfHeight * 4)
      this.configureOrthographicCamera(this.getCanvasRect().width / Math.max(1, this.getCanvasRect().height))
      this.editorCamera.position.copy(this.orbitTarget).addScaledVector(direction, distance)
      this.editorCamera.up.copy(up)
      this.editorCamera.lookAt(this.orbitTarget)
    } else {
      this.editorCamera = this.perspectiveCamera
      const { radius, theta, phi } = this.orbit
      this.editorCamera.position.set(
        this.orbitTarget.x + radius * Math.sin(phi) * Math.sin(theta),
        this.orbitTarget.y + radius * Math.cos(phi),
        this.orbitTarget.z + radius * Math.sin(phi) * Math.cos(theta),
      )
      this.editorCamera.up.set(0, 1, 0)
      this.editorCamera.lookAt(this.orbitTarget)
    }
    this.editorCamera.updateMatrixWorld(true)
    this.refreshSelectionOutlines()
    this.options.onViewOrientationChanged?.([
      this.editorCamera.quaternion.x,
      this.editorCamera.quaternion.y,
      this.editorCamera.quaternion.z,
      this.editorCamera.quaternion.w,
    ])
    this.updateGizmo()
    this.requestRender()
  }

  private gizmoScale(position: THREE.Vector3): number {
    if (this.editorCamera instanceof THREE.OrthographicCamera) return this.orthographicHalfHeight * 0.3
    return this.editorCamera.position.distanceTo(position) * Math.tan(THREE.MathUtils.degToRad(this.editorCamera.fov) / 2) * 0.3
  }

  private configureOrthographicCamera(aspect: number): void {
    this.orthographicCamera.left = -this.orthographicHalfHeight * aspect
    this.orthographicCamera.right = this.orthographicHalfHeight * aspect
    this.orthographicCamera.top = this.orthographicHalfHeight
    this.orthographicCamera.bottom = -this.orthographicHalfHeight
    this.orthographicCamera.updateProjectionMatrix()
  }

  private saveOrthographicViewState(): void {
    if (!stageViewModeIsOrthographic(this.viewMode)) return
    this.orthographicViewStates.set(this.viewMode, { target: this.orbitTarget.clone(), halfHeight: this.orthographicHalfHeight })
  }

  private relevantBounds(): THREE.Box3 {
    const bounds = new THREE.Box3()
    const entities = this.entities.size > 0 ? Array.from(this.entities.values()) : []
    entities.forEach((entity) => bounds.union(this.entityBounds(entity)))
    if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(4, 2, 4))
    return bounds
  }

  private updateGizmo(drag: StageDrag | null = null): void {
    const entity = this.selectedEntity
    const entities = this.transformEntities(this.selectedEntities)
    const gizmoSpace = entity?.groupTransformable === false
      ? 'world'
      : entity
        ? stageTransformSpace(entity.type === 'Camera' ? 'camera' : 'default', this.tool, this.selectedEntities.length)
        : 'world'
    const activeTransform = !!drag?.moved && (drag.mode === 'move' || drag.mode === 'gizmo')
    const visible = !!entity && (this.tool === 'move' || this.tool === 'rotate' || this.tool === 'scale')
    if (!activeTransform) {
      this.gizmoRoot.visible = visible
      this.gizmoMove.visible = visible && this.tool === 'move'
      this.gizmoRotate.visible = visible && this.tool === 'rotate'
      this.gizmoScaleHandles.visible = visible && this.tool === 'scale' && entity?.scalable === true
      this.gizmoHandles.forEach(({ pick, handle }) => {
        if (handle.mode === 'rotate' && handle.axis && entity) {
          const axis = entity.groupTransformable === false && entity.type !== 'Camera'
            ? stageRotationAxis([entity.root.rotation.x, entity.root.rotation.y, entity.root.rotation.z], handle.axis)
            : stageTransformAxis(entity.type === 'Camera' ? 'camera' : 'default', handle.mode, [entity.root.rotation.x, entity.root.rotation.y, entity.root.rotation.z], handle.axis, this.selectedEntities.length)
          // Ring meshes are children of gizmoRoot. For a local Camera gizmo,
          // keep each ring in the canonical local axis basis and let the root
          // carry the camera orientation. This keeps the visual basis and the
          // local quaternion composition in agreement instead of applying the
          // camera orientation twice.
          const ringAxis = entity.type === 'Camera' && gizmoSpace === 'local' ? stageWorldAxis(handle.axis) : axis
          const ringQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), ringAxis)
          pick.quaternion.copy(ringQuaternion)
          handle.visible.forEach((mesh) => mesh.quaternion.copy(ringQuaternion))
        }
        const actorYMove = entity?.type === 'Actor' && this.tool === 'move' && handle.axis === 'y'
        const actorZRotate = entity?.type === 'Actor' && this.tool === 'rotate' && handle.axis === 'z'
        const axisVisible = !((handle.mode === 'move' || handle.mode === 'scale') && handle.kind === 'axis' && handle.axis) || !!stageProjectWorldAxisToScreen(
          this.editorCamera,
          entity?.root.position ?? new THREE.Vector3(),
          handle.axis && gizmoSpace === 'local'
            ? stageLocalAxis([entity?.root.rotation.x ?? 0, entity?.root.rotation.y ?? 0, entity?.root.rotation.z ?? 0], handle.axis)
            : new THREE.Vector3(handle.axis === 'x' ? 1 : 0, handle.axis === 'y' ? 1 : 0, handle.axis === 'z' ? 1 : 0),
          this.getCanvasRect(),
        )
        const handleVisible = !actorYMove && !actorZRotate && axisVisible && (handle.mode !== 'scale' || (this.tool === 'scale' && entity?.scalable === true))
        pick.visible = handleVisible
        handle.visible.forEach((mesh) => { mesh.visible = handleVisible })
      })
    }
    if (!entity) return
    const origin = entities.length > 1 ? this.boundsForEntities(entities).getCenter(new THREE.Vector3()) : this.transformPivot(entity)
    this.gizmoRoot.position.copy(origin)
    this.gizmoRoot.quaternion.copy(gizmoSpace === 'local' ? entity.root.quaternion : new THREE.Quaternion())
    this.gizmoRoot.scale.setScalar(activeTransform && drag?.gizmoScale !== null ? drag.gizmoScale : this.gizmoScale(origin))
    if (!activeTransform) this.gizmoRoot.updateMatrixWorld(true)
  }

  private setHover(handle: StageGizmoHandle | null): void {
    this.hoverHandle = handle
    this.gizmoHandles.forEach(({ handle: candidate }) => {
      candidate.visible.forEach((mesh) => {
        const material = mesh.material as THREE.MeshBasicMaterial
        material.color.set(candidate === handle ? GIZMO_HOVER_COLOR : mesh.userData.stageGizmoBaseColor as number)
      })
    })
  }

  private emitDebug(force = false, eventOrigin = 'state'): void {
    const drag = this.drag
    if (!force && !this.debugEnabled && drag?.moved && (drag.mode === 'move' || drag.mode === 'gizmo')) return
    this.lastDebugEventOrigin = eventOrigin
    this.options.onDebug?.({
      stageRuntimeInstance: this.stageRuntimeInstance,
      stageCameraInstance: `${this.editorCamera.type}:${this.editorCamera.uuid}`,
      eventOrigin: this.lastDebugEventOrigin,
      tool: this.tool,
      pointerMode: this.pointerMode,
      ndc: this.lastNdc,
      rayHits: this.lastRayHits,
      selectedId: this.selectedId ?? 'NONE',
      selectedIds: [...this.selectedIds],
      selectionOutlineTargetIds: Array.from(this.selectionOutlines.entries()).filter(([, helper]) => helper.visible).map(([id]) => id).sort(),
      selectionOutlineCount: Array.from(this.selectionOutlines.values()).filter((helper) => helper.visible).length,
      lastSelectionEvent: this.lastSelectionEvent,
      lastNavigationEvent: this.lastNavigationEvent,
      lastPointerEvent: this.lastPointerEvent,
      lastEmptyClickEvent: this.lastEmptyClickEvent,
      lastSelectionCallbackPayload: this.lastSelectionCallbackPayload,
      lastDeselectionCallback: this.lastDeselectionCallback,
      marqueePreviewActive: this.marqueePreviewActive,
      marqueePreviewIds: [...this.marqueePreviewIds],
      marqueeFinalHitIds: [...this.lastMarqueeFinalHitIds],
      marqueePreviousSelectedIds: [...this.lastMarqueePreviousSelectedIds],
      marqueeNextSelectedIds: [...this.lastMarqueeNextSelectedIds],
      marqueeCallbackPayload: this.lastMarqueeCallbackPayload,
      recentInteractionEvents: [...this.recentInteractionEvents],
      entityReconciliationCount: this.entityReconciliationCount,
      lastEntityReconciliation: this.lastEntityReconciliation,
      pointerCaptureOwner: this.drag ? String(this.drag.pointerId) : 'NONE',
      axisDrag: this.lastAxisDragDebug ? { ...this.lastAxisDragDebug, resultPosition: [...this.lastAxisDragDebug.resultPosition] } : null,
      scaleDrag: this.lastScaleDragDebug ? { ...this.lastScaleDragDebug, startScale: [...this.lastScaleDragDebug.startScale], resultScale: [...this.lastScaleDragDebug.resultScale] } : null,
    })
  }

  requestRender(): void {
    if (this.disposed || this.frameRequest !== null) return
    this.frameRequest = window.requestAnimationFrame(() => {
      this.frameRequest = null
      try {
        this.refreshSelectionOutlines()
        this.renderer.render(this.scene, this.editorCamera)
        this.lastRenderSucceeded = true
      } catch (error) {
        this.lastRenderSucceeded = false
        if (import.meta.env.DEV) console.error('[webgl diagnostics] interactive Stage render failed', error)
      }
    })
  }

  beginRendererRecovery(): void {
    this.lastRenderSucceeded = false
    this.requestRender()
  }

  isRendererAvailable(): boolean {
    return !this.disposed && this.lastRenderSucceeded && !this.renderer.getContext().isContextLost()
  }

  private createStageEnvironment(): void {
    const groundGeometry = this.track(new THREE.PlaneGeometry(40, 40))
    const groundMaterial = this.track(new THREE.MeshStandardMaterial({ color: '#c5cbdd', roughness: 0.92 }))
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.name = 'Ground'
    this.scene.add(ground)

    const grid = new THREE.GridHelper(40, 40, '#aab2c8', '#c5cbdd')
    grid.position.y = 0.002
    grid.name = 'Grid'
    this.scene.add(grid)
    this.track(grid.geometry)
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
    gridMaterials.forEach((material) => this.track(material))

    const hemi = new THREE.HemisphereLight('#ffffff', '#8790a6', 1.15)
    const key = new THREE.DirectionalLight('#ffffff', 2.1)
    key.position.set(5, 9, 6)
    this.scene.add(hemi, key)
  }

  private createProps(): void {
    this.createProp({ id: 'prop-cube', name: 'Cube', shape: 'cube', position: [-2.2, 1, 0], rotation: [0, 0, 0], primaryColor: '#9b91df' })
    this.createProp({ id: 'prop-sphere', name: 'Sphere', shape: 'sphere', position: [0, 1, 0], rotation: [0, 0, 0], primaryColor: '#86b7c8' })
    this.createProp({ id: 'prop-cylinder', name: 'Cylinder', shape: 'cylinder', position: [2.2, 1, 0], rotation: [0, 0, 0], primaryColor: '#d5a47f' })
  }

  private createProp(definition: StagePropDefinition): void {
    const root = new THREE.Group()
    root.name = definition.name
    root.userData.entityId = definition.id
    root.position.set(...definition.position)
    root.rotation.set(...definition.rotation)
    const geometry = definition.shape === 'sphere' ? new THREE.SphereGeometry(0.9, 48, 28) : definition.shape === 'cylinder' ? new THREE.CylinderGeometry(0.78, 0.78, 2, 48) : new THREE.BoxGeometry(1.6, 2, 1.6)
    const material = new THREE.MeshStandardMaterial({ color: definition.primaryColor, roughness: 0.78, metalness: 0 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = definition.name
    mesh.userData.entityId = definition.id
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    this.scene.add(root)
    this.entities.set(definition.id, {
      id: definition.id,
      name: definition.name,
      type: 'Prop',
      root,
      mesh,
      material,
      scalable: true,
      dispose: () => {
        geometry.dispose()
        material.dispose()
      },
    })
    this.selectableRoots.push(root)
  }

  private createGizmo(): void {
    this.gizmoRoot.name = 'StageEngineGizmo'
    this.gizmoRoot.visible = false
    this.gizmoRoot.renderOrder = 999
    this.gizmoRoot.add(this.gizmoMove, this.gizmoRotate, this.gizmoScaleHandles)
    this.scene.add(this.gizmoRoot)

    const up = new THREE.Vector3(0, 1, 0)
    const zForward = new THREE.Vector3(0, 0, 1)
    ;(['x', 'y', 'z'] as const).forEach((axis) => {
      const direction = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
      const color = GIZMO_AXIS_COLORS[axis]
      const upQuaternion = new THREE.Quaternion().setFromUnitVectors(up, direction)
      const moveLine = this.gizmoMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.78, 8), color)
      moveLine.position.copy(direction).multiplyScalar(0.39)
      moveLine.quaternion.copy(upQuaternion)
      const moveArrow = this.gizmoMesh(new THREE.ConeGeometry(0.055, 0.2, 18), color)
      moveArrow.position.copy(direction).multiplyScalar(0.88)
      moveArrow.quaternion.copy(upQuaternion)
      const movePick = this.gizmoMesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 8), 0xffffff, true)
      movePick.position.copy(direction).multiplyScalar(0.5)
      movePick.quaternion.copy(upQuaternion)
      this.addGizmoHandle(this.gizmoMove, { mode: 'move', kind: 'axis', axis, visible: [moveLine, moveArrow] }, movePick)

      const ringQuaternion = new THREE.Quaternion().setFromUnitVectors(zForward, direction)
      const ring = this.gizmoMesh(new THREE.TorusGeometry(0.78, 0.012, 6, 72), color)
      ring.quaternion.copy(ringQuaternion)
      const ringPick = this.gizmoMesh(new THREE.TorusGeometry(0.78, 0.07, 6, 48), 0xffffff, true)
      ringPick.quaternion.copy(ringQuaternion)
      this.addGizmoHandle(this.gizmoRotate, { mode: 'rotate', kind: 'axis', axis, visible: [ring] }, ringPick)
    })

    const plane = this.gizmoMesh(new THREE.PlaneGeometry(0.22, 0.22), 0xf0a032, false, 0.55)
    plane.rotation.x = -Math.PI / 2
    plane.position.set(0.26, 0, 0.26)
    const planePick = this.gizmoMesh(new THREE.PlaneGeometry(0.3, 0.3), 0xffffff, true)
    planePick.rotation.x = -Math.PI / 2
    planePick.position.copy(plane.position)
    this.addGizmoHandle(this.gizmoMove, { mode: 'move', kind: 'plane', axis: null, visible: [plane] }, planePick)

    ;(['x', 'y', 'z'] as const).forEach((axis) => {
      const direction = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
      const color = GIZMO_AXIS_COLORS[axis]
      const size = 0.72
      const thickness = 0.09
      const dimensions: [number, number, number] = axis === 'x' ? [size, thickness, thickness] : axis === 'y' ? [thickness, size, thickness] : [thickness, thickness, size]
      const visible = this.gizmoMesh(new THREE.BoxGeometry(...dimensions), color)
      visible.position.copy(direction).multiplyScalar(size / 2)
      const pick = this.gizmoMesh(new THREE.BoxGeometry(...dimensions.map((value, index) => index === (axis === 'x' ? 0 : axis === 'y' ? 1 : 2) ? value + 0.22 : value + 0.18) as [number, number, number]), color, true)
      pick.position.copy(visible.position)
      this.addGizmoHandle(this.gizmoScaleHandles, { mode: 'scale', kind: 'axis', axis, visible: [visible] }, pick)
    })
    const uniform = this.gizmoMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), 0xf0a032)
    const uniformPick = this.gizmoMesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), 0xf0a032, true)
    this.addGizmoHandle(this.gizmoScaleHandles, { mode: 'scale', kind: 'uniform', axis: null, visible: [uniform] }, uniformPick)
  }

  private gizmoMesh(geometry: THREE.BufferGeometry, color: number, pick = false, opacity = 1): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: opacity < 1 || pick, opacity: pick ? 0.001 : opacity, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = 999
    mesh.userData.stageGizmoBaseColor = color
    this.resources.push(geometry, material)
    return mesh
  }

  private addGizmoHandle(group: THREE.Group, handle: StageGizmoHandle, pick: THREE.Mesh): void {
    handle.visible.forEach((mesh) => group.add(mesh))
    pick.userData.stageGizmoHandle = handle
    group.add(pick)
    this.gizmoHandles.push({ pick, handle })
  }

  private track<T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(resource: T): T {
    this.resources.push(resource)
    return resource
  }
}

type StagePointerPointLike = { clientX: number; clientY: number }
