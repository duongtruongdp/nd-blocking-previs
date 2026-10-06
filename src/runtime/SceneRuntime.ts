import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { resolveCharacterDefinition } from '../characters/characterRegistry'
import { getPoseDefinition, type PoseDefinition } from '../characters/poseLibrary'
import { productionPoseIntents } from './anatomicalPose'
import type { ActorDocument, CameraDocument, EulerRotation, Placement, PropDocument } from '../domain/types'
import { attachCharacterInstance, CharacterAssetLoader, computeBlockingBounds, getRigDiagnosticReport, inspectCharacterInstance, isUsableCharacterInstance, removeCharacterInstance, updateActorRuntimeAppearance } from './characterAssets'
import { createBlockingProxy, BlockingAssetLibrary, updateBlockingProxy } from './entityAdapters'
import { RuntimeRegistry } from './RuntimeRegistry'
import { capStagePixelRatio } from './renderPolicy'
import { validatePoseDefinition, type PoseDiagnosticsSnapshot } from './rigDiagnostics'
import { computeCameraViewProjection, computeCameraViewViewport } from '../math/cameraView'
import { isSelectableStageObject, normalizeStagePointer, stagePointerMovedBeyondThreshold, type StagePointerRegion } from './stageInteraction'
import { applyBlockingNavigationState, createBlockingNavigationState, DEFAULT_NAVIGATION_POSITION, DEFAULT_NAVIGATION_TARGET, framingPositionForBounds, isEditableNavigationTarget, navigationSnapshot, orbitBlockingNavigation, panBlockingNavigation, setBlockingNavigationFromPosition, standardViewPosition, synchronizeBlockingInteractionMatrices, zoomBlockingNavigation, type BlockingNavigationState, type NavigationSnapshot, type StageViewDirection } from './navigation'
import type { ViewCubeDirection } from '../components/viewCube'

export type RuntimeTool = 'select' | 'move' | 'rotate'
export type StageViewMode = 'blocking' | 'camera'
export type BlockingEntity = ActorDocument | PropDocument | CameraDocument

export type SceneInteractionHandlers = {
  onSelectionChange: (entityId: string | null) => void
  onTransformCommit: (entityId: string, placement: Placement) => void
  onPoseDiagnosticsChange?: (snapshot: PoseDiagnosticsSnapshot | null) => void
  onViewModeChange?: (viewMode: StageViewMode) => void
  onNavigationChange?: (snapshot: NavigationSnapshot) => void
  onStagePickDebug?: (snapshot: StagePickDebugSnapshot) => void
  onStageAlignmentDebug?: (snapshot: StageAlignmentDebugSnapshot) => void
}

export type StageDebugRect = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export type StageAlignmentDebugSnapshot = {
  rendererCanvasRect: StageDebugRect
  eventCurrentTargetRect: StageDebugRect | null
  eventTargetRect: StageDebugRect | null
  stageRenderSurfaceRect: StageDebugRect
  stageViewportRect: StageDebugRect
  pickRectSource: string
  projectionRect: StageDebugRect
  rendererCanvasElement: string
  eventCurrentTargetElement: string
  eventTargetElement: string
  stageRenderSurfaceElement: string
  stageViewportElement: string
  rendererCanvasIsInteractionCanvas: boolean
  eventCurrentTargetIsRendererCanvas: boolean | null
  eventTargetIsRendererCanvas: boolean | null
  stageRenderSurfaceIsRendererCanvas: boolean
  rendererElementWidth: number
  rendererElementHeight: number
  rendererClientWidth: number
  rendererClientHeight: number
  pixelRatio: number
  rendererSize: [number, number]
  drawingBufferSize: [number, number]
  viewport: [number, number, number, number]
  scissor: [number, number, number, number]
  scissorTest: boolean
  renderCamera: {
    name: string
    type: string
    uuid: string
    aspect: number
    fov: number
    position: [number, number, number]
    aspectWidth: number
    aspectHeight: number
    aspectSource: string
  }
  pickCamera: {
    name: string
    type: string
    uuid: string
  }
  renderCameraIsPickCamera: boolean
  probeWorldCenter: [number, number, number] | null
  probeProjectedBeforeNdc: [number, number] | null
  probeExpectedBeforeClient: [number, number] | null
  probeProjectedNdc: [number, number] | null
  probeExpectedClient: [number, number] | null
  actorProjectedNdc: [number, number] | null
  actorExpectedClient: [number, number] | null
  clickClient: [number, number] | null
  clickDeltaFromProbe: [number, number] | null
  matrixSync: {
    beforeCameraPosition: [number, number, number]
    beforeCameraWorldPosition: [number, number, number]
    beforeCameraMatrixWorldInverse: number[]
    beforeProbePosition: [number, number, number] | null
    beforeProbeWorldPosition: [number, number, number] | null
    afterCameraWorldPosition: [number, number, number]
    afterProbeWorldPosition: [number, number, number] | null
    probeHitBeforeSync: boolean | null
    probeHitAfterSync: boolean | null
  }
}

export type StagePickDebugSnapshot = {
  gesture: 'CLICK' | 'ORBIT' | 'PAN' | 'TRANSFORM' | 'ZOOM'
  button: 'LEFT' | 'RIGHT' | 'WHEEL'
  movePx: number
  clientX: number
  clientY: number
  canvasRect: StagePointerRegion
  ndcX: number
  ndcY: number
  rawHits: number
  selectableHits: number
  entityId: string | null
  productionProbe: ProductionPickProbeSnapshot | null
  selectionRequested: string | null
  selectionCommitted: boolean | null
  currentSelection: string | null
}

export type ProductionPickHitSnapshot = {
  type: string
  name: string
  distance: number
  resolvedEntity: string | null
}

export type ProductionPickObjectSnapshot = {
  hit: boolean
  distance: number | null
  point: [number, number, number] | null
  hits: ProductionPickHitSnapshot[]
}

export type ProductionRegistryRootSnapshot = {
  entityKind: string
  entityId: string
  name: string
  visible: boolean
  childCount: number
}

type StagePickResult = {
  entityId: string | null
  entityKind: string | null
  hitObjectName: string | null
  hitObjectType: string | null
  candidateCount: number
  selectableHitCount: number
  normalizedPointer: { x: number; y: number }
  stageRect: StagePointerRegion
  activeViewport: StagePointerRegion
  point: THREE.Vector3
  probe: ProductionPickProbeSnapshot
}

export type ProductionPickProbeSnapshot = {
  rayOrigin: [number, number, number]
  rayDirection: [number, number, number]
  probe: ProductionPickObjectSnapshot
  ground: ProductionPickObjectSnapshot
  registryRoots: ProductionRegistryRootSnapshot[]
  registryRawHits: ProductionPickHitSnapshot[]
  selectableHits: number
  directRootHits: {
    actor: ProductionPickHitSnapshot[]
    prop: ProductionPickHitSnapshot[]
    camera: ProductionPickHitSnapshot[]
  }
  firstRawHit: ProductionPickHitSnapshot | null
  resolvedEntity: string | null
}

type StagePointerContext = {
  stageRect: StagePointerRegion
  activeViewport: StagePointerRegion
  normalizedPointer: { x: number; y: number } | null
  interactionCamera: THREE.Camera
}

type StageGestureState = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
  button: 'left' | 'right'
  kind: 'pending' | 'orbit' | 'pan' | 'transform'
}

let sceneRuntimeInstanceCounter = 0

/**
 * Owns the non-serializable Blocking View environment.
 *
 * This viewpoint is an editor/navigation camera only. It is deliberately not
 * a CameraDocument and must never cross into the project domain or file model.
 */
export class SceneRuntime {
  private readonly instanceId = ++sceneRuntimeInstanceCounter
  private readonly container: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly navigationCamera: THREE.PerspectiveCamera
  private readonly navigation: BlockingNavigationState
  private readonly transformControls: TransformControls
  private readonly selectionHelper: THREE.Box3Helper
  private readonly registry = new RuntimeRegistry()
  private readonly assets = new BlockingAssetLibrary()
  private readonly characterAssets = new CharacterAssetLoader()
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly resizeObserver: ResizeObserver | null
  private readonly handleWindowResize: () => void
  private readonly handleCanvasPointerDown: (event: PointerEvent) => void
  private readonly handleCanvasPointerMove: (event: PointerEvent) => void
  private readonly handleCanvasPointerUp: (event: PointerEvent) => void
  private readonly handleCanvasPointerCancel: (event: PointerEvent) => void
  private readonly handleCanvasLostPointerCapture: (event: PointerEvent) => void
  private readonly handleCanvasWheel: (event: WheelEvent) => void
  private readonly handleCanvasContextMenu: (event: MouseEvent) => void
  private readonly handleWindowKeyDown: (event: KeyboardEvent) => void
  private readonly navigationPivotMarker: THREE.Mesh | null
  private readonly interactionDebugEnabled: boolean
  private groundMesh: THREE.Mesh | null = null
  private productionProbeMesh: THREE.Mesh | null = null
  private productionProbeRay: THREE.Line | null = null
  private frameRequest: number | null = null
  private continuousRendering = false
  private disposed = false
  private selectedEntityId: string | null = null
  private viewMode: StageViewMode = 'blocking'
  private cameraViewCameraId: string | null = null
  private activeTransformEntityId: string | null = null
  private tool: RuntimeTool = 'select'
  private transformCleanupActive = false
  private debugPickMarker: THREE.Mesh | null = null
  private debugPickMarkerTimeout: number | null = null
  private lastDebugClick: [number, number] | null = null
  private stageGesture: StageGestureState | null = null
  private rigDebugState = { actorId: null as string | null, showRig: false, showJointAxes: false, showContact: false, showPoseTargets: false }
  private diagnosticOverlay: THREE.Group | null = null
  private interactionHandlers: SceneInteractionHandlers = {
    onSelectionChange: () => undefined,
    onTransformCommit: () => undefined,
  }

  constructor(container: HTMLElement) {
    this.container = container
    this.interactionDebugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('interactionDebug') === '1'
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#15191f')

    this.navigationCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    this.navigation = createBlockingNavigationState(DEFAULT_NAVIGATION_POSITION, DEFAULT_NAVIGATION_TARGET)
    this.applyNavigationState()

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(capStagePixelRatio(window.devicePixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.setClearColor('#15191f', 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'stage-render-surface'
    this.renderer.domElement.setAttribute('aria-label', 'Blocking View Stage')

    this.createEnvironment()
    this.container.appendChild(this.renderer.domElement)
    this.createProductionPickingProbe()

    this.navigationPivotMarker = import.meta.env.DEV
      ? new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 12, 8),
          new THREE.MeshBasicMaterial({ color: '#f1ba68', depthTest: false, depthWrite: false }),
        )
      : null
    if (this.navigationPivotMarker) {
      this.navigationPivotMarker.name = 'Navigation Pivot'
      this.navigationPivotMarker.userData.stageSelectable = false
      this.navigationPivotMarker.userData.debugObject = true
      this.navigationPivotMarker.userData.navigationPivot = true
      this.navigationPivotMarker.renderOrder = 10
      this.scene.add(this.navigationPivotMarker)
      this.syncNavigationPivotMarker()
    }

    if (import.meta.env.DEV) {
      console.info(`[ND BLOCKING RUNTIME]
build: 3B.6-blocking-navigation
SceneRuntime: ${this.instanceId}
Navigation: target + distance + azimuth + polar
Blocking View pointer controller: NONE
window.location.href: ${window.location.href}`)
    }

    this.transformControls = new TransformControls(this.navigationCamera, this.renderer.domElement)
    this.transformControls.setSpace('world')
    this.transformControls.setSize(0.7)
    const transformHelper = this.transformControls.getHelper()
    transformHelper.visible = false
    transformHelper.userData.stageSelectable = false
    this.scene.add(transformHelper)
    this.transformControls.addEventListener('dragging-changed', (event) => {
      if (event.value) {
        this.activeTransformEntityId = this.selectedEntityId
        if (this.stageGesture) this.stageGesture.kind = 'transform'
      } else if (this.activeTransformEntityId) {
        const object = this.registry.get(this.activeTransformEntityId)
        if (object) this.interactionHandlers.onTransformCommit(this.activeTransformEntityId, placementFromObject(object))
        this.activeTransformEntityId = null
      }
      this.requestRender()
    })
    this.transformControls.addEventListener('objectChange', () => {
      this.updateSelectionVisual()
      this.requestRender()
    })

    this.selectionHelper = new THREE.Box3Helper(new THREE.Box3(), '#e5bb82')
    this.selectionHelper.visible = false
    this.selectionHelper.userData.stageSelectable = false
    const selectionMaterial = this.selectionHelper.material as THREE.LineBasicMaterial
    selectionMaterial.transparent = true
    selectionMaterial.opacity = 0.8
    this.scene.add(this.selectionHelper)

    this.handleCanvasPointerDown = (event) => this.handleCanvasPointerDownEvent(event)
    this.handleCanvasPointerMove = (event) => this.handleCanvasPointerMoveEvent(event)
    this.handleCanvasPointerUp = (event) => this.handleCanvasPointerUpEvent(event)
    this.handleCanvasPointerCancel = (event) => this.handleCanvasPointerCancelEvent(event)
    this.handleCanvasLostPointerCapture = (event) => this.handleCanvasPointerCancelEvent(event)
    this.handleCanvasWheel = (event) => this.handleCanvasWheelEvent(event)
    this.handleCanvasContextMenu = (event) => event.preventDefault()
    this.handleWindowKeyDown = (event) => this.handleWindowKeyDownEvent(event)
    this.renderer.domElement.addEventListener('pointerdown', this.handleCanvasPointerDown)
    this.renderer.domElement.addEventListener('pointermove', this.handleCanvasPointerMove)
    this.renderer.domElement.addEventListener('pointerup', this.handleCanvasPointerUp)
    this.renderer.domElement.addEventListener('pointercancel', this.handleCanvasPointerCancel)
    this.renderer.domElement.addEventListener('lostpointercapture', this.handleCanvasLostPointerCapture)
    this.renderer.domElement.addEventListener('wheel', this.handleCanvasWheel, { passive: false })
    this.renderer.domElement.addEventListener('contextmenu', this.handleCanvasContextMenu)
    window.addEventListener('keydown', this.handleWindowKeyDown)

    this.handleWindowResize = () => this.updateSize()
    const ResizeObserverClass = (
      window as Window & { ResizeObserver?: typeof ResizeObserver }
    ).ResizeObserver
    if (ResizeObserverClass) {
      this.resizeObserver = new ResizeObserverClass(() => this.updateSize())
      this.resizeObserver.observe(this.container)
    } else {
      this.resizeObserver = null
      window.addEventListener('resize', this.handleWindowResize)
    }

    this.updateSize()
    this.requestRender()
  }

  /** Enable continuous frames for a future playback owner. */
  setContinuousRendering(enabled: boolean): void {
    if (this.disposed) return
    this.continuousRendering = enabled
    if (enabled) this.requestRender()
  }

  setInteractionHandlers(handlers: SceneInteractionHandlers): void {
    this.interactionHandlers = handlers
    this.emitNavigationSnapshot()
    this.emitStageAlignmentDebug(null)
  }

  snapNavigationView(direction: StageViewDirection): void {
    if (this.disposed || this.viewMode !== 'blocking') return
    const position = standardViewPosition(direction, this.navigation.target, this.navigation.distance)
    setBlockingNavigationFromPosition(this.navigation, position)
    this.applyNavigationState()
    this.emitNavigationSnapshot()
    this.requestRender()
  }

  snapNavigationDirection(direction: ViewCubeDirection): void {
    if (this.disposed || this.viewMode !== 'blocking') return
    const distance = this.navigation.distance
    const offset = new THREE.Vector3(direction[0], direction[1], direction[2]).normalize()
    if (Math.abs(offset.x) < 1e-6 && Math.abs(offset.z) < 1e-6) offset.z = offset.y > 0 ? -0.0001 : 0.0001
    const position = this.navigation.target.clone().addScaledVector(offset, distance)
    setBlockingNavigationFromPosition(this.navigation, position)
    this.applyNavigationState()
    this.emitNavigationSnapshot()
    this.requestRender()
  }

  orbitNavigationByPixels(deltaX: number, deltaY: number, viewportHeight = this.renderer.domElement.clientHeight): void {
    if (this.disposed || this.viewMode !== 'blocking') return
    void viewportHeight
    orbitBlockingNavigation(this.navigation, deltaX, deltaY)
    this.applyNavigationState()
    this.emitNavigationSnapshot()
    this.requestRender()
  }

  resetNavigationView(): void {
    this.frameStage()
  }

  frameStage(): void {
    if (this.disposed || this.viewMode !== 'blocking') return
    const bounds = this.getStageContentBounds()
    if (bounds.isEmpty()) {
      const defaultState = createBlockingNavigationState(DEFAULT_NAVIGATION_POSITION, DEFAULT_NAVIGATION_TARGET)
      this.navigation.target.copy(defaultState.target)
      this.navigation.distance = defaultState.distance
      this.navigation.azimuth = defaultState.azimuth
      this.navigation.polar = defaultState.polar
      this.applyNavigationState()
      this.emitNavigationSnapshot()
      this.requestRender()
      return
    }
    this.frameNavigationBounds(bounds)
  }

  frameSelected(): void {
    if (this.disposed || this.viewMode !== 'blocking' || !this.selectedEntityId) return
    this.frameEntity(this.selectedEntityId)
  }

  syncBlockingEntities(actors: ActorDocument[], props: PropDocument[], cameras: CameraDocument[] = []): void {
    const entities: BlockingEntity[] = [...actors, ...props, ...cameras]
    const incomingIds = new Set(entities.map((entity) => entity.id))

    this.registry.rootsList().forEach((root) => {
      const entityId = root.userData.entityId as string | undefined
      if (entityId && !incomingIds.has(entityId)) {
        if (root.userData.entityKind === 'actor') removeCharacterInstance(root as THREE.Group)
        disposeCameraRuntime(root)
        this.scene.remove(this.registry.unregister(entityId) ?? root)
      }
    })

    entities.forEach((entity) => {
      const expectedKind = 'character' in entity ? 'actor' : 'lens' in entity ? 'camera' : 'prop'
      const existing = this.registry.get(entity.id)
      if (existing && existing.userData.entityKind !== expectedKind) {
        if (existing.userData.entityKind === 'actor') removeCharacterInstance(existing as THREE.Group)
        disposeCameraRuntime(existing)
        this.scene.remove(this.registry.unregister(entity.id) ?? existing)
      }

      const current = this.registry.get(entity.id)
      if (current) {
        updateBlockingProxy(current as THREE.Group, entity)
        if ('character' in entity) this.syncCharacterAsset(entity, current as THREE.Group)
      } else {
        const proxy = createBlockingProxy(entity, this.assets)
        this.scene.add(proxy)
        this.registry.register(entity.id, proxy)
        if ('character' in entity) this.syncCharacterAsset(entity, proxy)
      }
    })

    if (this.selectedEntityId) this.updateSelectionVisual()
    this.updateFacingIndicators()
    this.updateCameraGuides()
    this.applyViewMode()
    this.emitStageAlignmentDebug(null)
    this.requestRender()
  }

  setSelectedEntity(entityId: string | null): void {
    this.selectedEntityId = entityId
    this.updateSelectionVisual()
    this.updateFacingIndicators()
    this.updateCameraGuides()
    this.configureTransformControls()
    this.applyViewMode()
    this.requestRender()
  }

  setTool(tool: RuntimeTool): void {
    this.tool = tool
    this.updateFacingIndicators()
    this.configureTransformControls()
    this.applyViewMode()
    this.requestRender()
  }

  setViewMode(viewMode: StageViewMode, cameraId: string | null = null): void {
    this.viewMode = viewMode
    this.cameraViewCameraId = viewMode === 'camera' ? cameraId : null
    this.applyViewMode()
    this.emitStageAlignmentDebug(null)
    this.requestRender()
  }

  setPoseCalibration(actorId: string | null, pose: PoseDefinition | null): void {
    const root = actorId ? this.registry.get(actorId) : undefined
    if (!root || root.userData.entityKind !== 'actor') return
    const actor = root.userData.currentActor as ActorDocument | undefined
    if (!actor) return
    const model = root.getObjectByName('CharacterModel')
    const reconstructed = model?.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
    const generated = reconstructed?.[actor.pose.poseId]
    const calibrationPose = pose && generated ? mergeCalibrationPose(generated, getPoseDefinition(actor.pose.poseId), pose) : pose
    updateActorRuntimeAppearance(root as THREE.Group, actor, calibrationPose ?? undefined)
    if (this.selectedEntityId === actorId) this.updateSelectionVisual()
    this.refreshRigDebugOverlay()
    this.requestRender()
  }

  setRigDebugOverlay(actorId: string | null, options: { showRig: boolean; showJointAxes: boolean; showContact: boolean; showPoseTargets: boolean }): void {
    this.rigDebugState = { actorId, ...options }
    this.updateFacingIndicators()
    this.refreshRigDebugOverlay()
    this.requestRender()
  }

  /** Render one frame without exposing Three.js state to React. */
  requestRender(): void {
    if (this.disposed || this.frameRequest !== null) return
    this.frameRequest = window.requestAnimationFrame(() => {
      this.frameRequest = null
      this.renderStage()

      if (this.continuousRendering) this.requestRender()
    })
  }

  updateSize(): void {
    if (this.disposed) return
    const bounds = this.getCanvasRect()
    const width = Math.max(1, bounds.width || this.container.clientWidth)
    const height = Math.max(1, bounds.height || this.container.clientHeight)
    this.renderer.setPixelRatio(capStagePixelRatio(window.devicePixelRatio))
    this.renderer.setSize(width, height, false)
    this.navigationCamera.aspect = width / height
    this.navigationCamera.updateProjectionMatrix()
    this.configureCameraViewCamera()
    this.configureTransformControls()
    this.emitStageAlignmentDebug(null)
    this.requestRender()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    if (this.frameRequest !== null) {
      window.cancelAnimationFrame(this.frameRequest)
      this.frameRequest = null
    }

    this.renderer.domElement.removeEventListener('pointerdown', this.handleCanvasPointerDown)
    this.renderer.domElement.removeEventListener('pointermove', this.handleCanvasPointerMove)
    this.renderer.domElement.removeEventListener('pointerup', this.handleCanvasPointerUp)
    this.renderer.domElement.removeEventListener('pointercancel', this.handleCanvasPointerCancel)
    this.renderer.domElement.removeEventListener('lostpointercapture', this.handleCanvasLostPointerCapture)
    this.renderer.domElement.removeEventListener('wheel', this.handleCanvasWheel)
    this.renderer.domElement.removeEventListener('contextmenu', this.handleCanvasContextMenu)
    window.removeEventListener('keydown', this.handleWindowKeyDown)
    this.transformControls.detach()
    this.transformControls.dispose()
    this.clearDebugPickMarker()
    if (this.diagnosticOverlay) this.disposeDiagnosticOverlay(this.diagnosticOverlay)
    this.resizeObserver?.disconnect()
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleWindowResize)
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        disposeMaterial(object.material)
      }
    })

    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.registry.clear()
    this.assets.dispose()
    this.characterAssets.dispose()
  }

  private configureTransformControls(): void {
    this.transformControls.detach()
    this.transformControls.enabled = false
    this.transformControls.getHelper().visible = false

    const cameraViewCamera = this.getCameraViewRuntimeCamera()
    this.transformControls.camera = cameraViewCamera?.runtimeCamera ?? this.navigationCamera
    this.transformControls.viewport = cameraViewCamera
      ? new THREE.Vector4(
          cameraViewCamera.viewport.left,
          cameraViewCamera.viewport.containerHeight - cameraViewCamera.viewport.top - cameraViewCamera.viewport.height,
          cameraViewCamera.viewport.width,
          cameraViewCamera.viewport.height,
        )
      : null

    if (this.tool === 'select' || !this.selectedEntityId) return
    const object = this.registry.get(this.selectedEntityId)
    if (!object) return
    if (this.viewMode === 'camera' && object.userData.entityKind !== 'actor' && object.userData.entityKind !== 'prop') return

    this.transformControls.setMode(this.tool === 'move' ? 'translate' : 'rotate')
    this.transformControls.attach(object)
    this.transformControls.enabled = true
    this.transformControls.getHelper().visible = true
  }

  private getCanvasRect(): DOMRect {
    return this.renderer.domElement.getBoundingClientRect()
  }

  /**
   * Authoritative Blocking View transform boundary. Navigation state derives
   * the camera pose here, then both the scene graph and camera world matrices
   * are current before interaction helpers or the renderer consume them.
   */
  private applyNavigationState(): void {
    applyBlockingNavigationState(this.navigationCamera, this.navigation)
    this.synchronizeBlockingInteractionMatrices()
  }

  private synchronizeBlockingInteractionMatrices(): void {
    synchronizeBlockingInteractionMatrices(this.scene, this.navigationCamera)
  }

  private getStageInteractionCamera(): THREE.PerspectiveCamera {
    return this.getCameraViewRuntimeCamera()?.runtimeCamera ?? this.navigationCamera
  }

  private getDebugRect(element: Element | null): StageDebugRect | null {
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    }
  }

  private describeDebugElement(element: EventTarget | null): string {
    if (!element) return 'NONE'
    if (element === this.renderer.domElement) return 'renderer.domElement <canvas.stage-render-surface>'
    if (element === this.container) return 'stage viewport <div.stage-viewport>'
    if (element instanceof Element) {
      const className = typeof element.className === 'string' && element.className ? `.${element.className.split(/\s+/).join('.')}` : ''
      return `${element.tagName.toLowerCase()}${className}`
    }
    return element.constructor?.name || 'unknown EventTarget'
  }

  private isRendererElement(element: EventTarget | null): boolean | null {
    if (!element) return null
    return element === this.renderer.domElement
  }

  private getProjectionRect(): StageDebugRect {
    const canvasRect = this.getDebugRect(this.renderer.domElement)
    if (!canvasRect) throw new Error('Renderer canvas rect is unavailable.')
    const cameraViewCamera = this.getCameraViewRuntimeCamera()
    if (!cameraViewCamera) return canvasRect
    const viewport = cameraViewCamera.viewport
    return {
      left: canvasRect.left + viewport.left,
      top: canvasRect.top + viewport.top,
      right: canvasRect.left + viewport.left + viewport.width,
      bottom: canvasRect.top + viewport.top + viewport.height,
      width: viewport.width,
      height: viewport.height,
    }
  }

  private getDebugActorCenter(): THREE.Vector3 | null {
    const actorRoot = this.registry.rootsList().find((root) => root.userData.entityKind === 'actor')
    if (!actorRoot) return null
    const bounds = computeBlockingBounds(actorRoot)
    return bounds.isEmpty() ? null : bounds.getCenter(new THREE.Vector3())
  }

  private projectDebugPoint(point: THREE.Vector3 | null, camera: THREE.Camera, rect: StageDebugRect): {
    ndc: [number, number] | null
    client: [number, number] | null
  } {
    if (!point) return { ndc: null, client: null }
    const projected = point.clone().project(camera)
    return {
      ndc: [projected.x, projected.y],
      client: [
        rect.left + ((projected.x + 1) / 2) * rect.width,
        rect.top + ((1 - projected.y) / 2) * rect.height,
      ],
    }
  }

  private emitStageAlignmentDebug(event: PointerEvent | null): void {
    if (!import.meta.env.DEV || !this.interactionDebugEnabled) return
    const rendererElement = this.renderer.domElement
    const rendererCanvasRect = this.getDebugRect(rendererElement)
    const stageRenderSurfaceRect = this.getDebugRect(rendererElement)
    const stageViewportRect = this.getDebugRect(this.container)
    if (!rendererCanvasRect || !stageRenderSurfaceRect || !stageViewportRect) return

    const renderCamera = this.getStageInteractionCamera()
    const pickCamera = this.getStageInteractionCamera()
    const projectionRect = this.getProjectionRect()
    const pointerContext = event ? this.getStagePointerContext(event) : null
    const probeWorldCenterBefore = this.productionProbeMesh?.getWorldPosition(new THREE.Vector3()) ?? null
    const probeProjectionBefore = this.projectDebugPoint(probeWorldCenterBefore, renderCamera, projectionRect)
    const beforeCameraWorldPosition = new THREE.Vector3().setFromMatrixPosition(renderCamera.matrixWorld)
    const beforeProbePosition = this.productionProbeMesh?.position ?? null
    const beforeProbeWorldPosition = probeWorldCenterBefore
    let probeHitBeforeSync: boolean | null = null
    if (pointerContext?.normalizedPointer && this.productionProbeMesh) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(pointerContext.normalizedPointer.x, pointerContext.normalizedPointer.y),
        renderCamera,
      )
      probeHitBeforeSync = this.raycaster.intersectObject(this.productionProbeMesh, true).length > 0
    }

    this.scene.updateMatrixWorld(true)
    renderCamera.updateMatrixWorld(true)

    const probeWorldCenter = this.productionProbeMesh?.getWorldPosition(new THREE.Vector3()) ?? null
    const probeProjection = this.projectDebugPoint(probeWorldCenter, renderCamera, projectionRect)
    const actorProjection = this.projectDebugPoint(this.getDebugActorCenter(), renderCamera, projectionRect)
    const afterCameraWorldPosition = new THREE.Vector3().setFromMatrixPosition(renderCamera.matrixWorld)
    const afterProbeWorldPosition = probeWorldCenter
    let probeHitAfterSync: boolean | null = null
    if (pointerContext?.normalizedPointer && this.productionProbeMesh) {
      this.raycaster.setFromCamera(
        new THREE.Vector2(pointerContext.normalizedPointer.x, pointerContext.normalizedPointer.y),
        renderCamera,
      )
      probeHitAfterSync = this.raycaster.intersectObject(this.productionProbeMesh, true).length > 0
    }
    const clickClient = this.lastDebugClick
    const clickDeltaFromProbe = clickClient && probeProjection.client
      ? [clickClient[0] - probeProjection.client[0], clickClient[1] - probeProjection.client[1]] as [number, number]
      : null
    const rendererSize = new THREE.Vector2()
    const drawingBufferSize = new THREE.Vector2()
    const viewport = new THREE.Vector4()
    const scissor = new THREE.Vector4()
    this.renderer.getSize(rendererSize)
    this.renderer.getDrawingBufferSize(drawingBufferSize)
    this.renderer.getViewport(viewport)
    this.renderer.getScissor(scissor)
    const eventCurrentTarget = event?.currentTarget ?? null
    const eventTarget = event?.target ?? null
    const aspectWidth = this.viewMode === 'blocking' ? rendererCanvasRect.width : renderCamera.aspect
    const aspectHeight = this.viewMode === 'blocking' ? rendererCanvasRect.height : 1

    this.interactionHandlers.onStageAlignmentDebug?.({
      rendererCanvasRect,
      eventCurrentTargetRect: this.getDebugRect(eventCurrentTarget instanceof Element ? eventCurrentTarget : null),
      eventTargetRect: this.getDebugRect(eventTarget instanceof Element ? eventTarget : null),
      stageRenderSurfaceRect,
      stageViewportRect,
      pickRectSource: 'renderer.domElement.getBoundingClientRect()',
      projectionRect,
      rendererCanvasElement: this.describeDebugElement(rendererElement),
      eventCurrentTargetElement: this.describeDebugElement(eventCurrentTarget),
      eventTargetElement: this.describeDebugElement(eventTarget),
      stageRenderSurfaceElement: this.describeDebugElement(rendererElement),
      stageViewportElement: this.describeDebugElement(this.container),
      rendererCanvasIsInteractionCanvas: true,
      eventCurrentTargetIsRendererCanvas: this.isRendererElement(eventCurrentTarget),
      eventTargetIsRendererCanvas: this.isRendererElement(eventTarget),
      stageRenderSurfaceIsRendererCanvas: true,
      rendererElementWidth: rendererElement.width,
      rendererElementHeight: rendererElement.height,
      rendererClientWidth: rendererElement.clientWidth,
      rendererClientHeight: rendererElement.clientHeight,
      pixelRatio: this.renderer.getPixelRatio(),
      rendererSize: [rendererSize.x, rendererSize.y],
      drawingBufferSize: [drawingBufferSize.x, drawingBufferSize.y],
      viewport: [viewport.x, viewport.y, viewport.z, viewport.w],
      scissor: [scissor.x, scissor.y, scissor.z, scissor.w],
      scissorTest: this.renderer.getScissorTest(),
      renderCamera: {
        name: renderCamera.name || '(unnamed)',
        type: renderCamera.type,
        uuid: renderCamera.uuid,
        aspect: renderCamera instanceof THREE.PerspectiveCamera ? renderCamera.aspect : 0,
        fov: renderCamera instanceof THREE.PerspectiveCamera ? renderCamera.fov : 0,
        position: [renderCamera.position.x, renderCamera.position.y, renderCamera.position.z],
        aspectWidth,
        aspectHeight,
        aspectSource: this.viewMode === 'blocking'
          ? 'updateSize(): renderer.domElement.getBoundingClientRect().width / height'
          : 'computeCameraViewProjection(camera).displayAspectRatio',
      },
      pickCamera: { name: pickCamera.name || '(unnamed)', type: pickCamera.type, uuid: pickCamera.uuid },
      renderCameraIsPickCamera: renderCamera === pickCamera,
      probeWorldCenter: probeWorldCenter ? [probeWorldCenter.x, probeWorldCenter.y, probeWorldCenter.z] : null,
      probeProjectedBeforeNdc: probeProjectionBefore.ndc,
      probeExpectedBeforeClient: probeProjectionBefore.client,
      probeProjectedNdc: probeProjection.ndc,
      probeExpectedClient: probeProjection.client,
      actorProjectedNdc: actorProjection.ndc,
      actorExpectedClient: actorProjection.client,
      clickClient,
      clickDeltaFromProbe,
      matrixSync: {
        beforeCameraPosition: [renderCamera.position.x, renderCamera.position.y, renderCamera.position.z],
        beforeCameraWorldPosition: [beforeCameraWorldPosition.x, beforeCameraWorldPosition.y, beforeCameraWorldPosition.z],
        beforeCameraMatrixWorldInverse: [...renderCamera.matrixWorldInverse.elements],
        beforeProbePosition: beforeProbePosition ? [beforeProbePosition.x, beforeProbePosition.y, beforeProbePosition.z] : null,
        beforeProbeWorldPosition: beforeProbeWorldPosition ? [beforeProbeWorldPosition.x, beforeProbeWorldPosition.y, beforeProbeWorldPosition.z] : null,
        afterCameraWorldPosition: [afterCameraWorldPosition.x, afterCameraWorldPosition.y, afterCameraWorldPosition.z],
        afterProbeWorldPosition: afterProbeWorldPosition ? [afterProbeWorldPosition.x, afterProbeWorldPosition.y, afterProbeWorldPosition.z] : null,
        probeHitBeforeSync,
        probeHitAfterSync,
      },
    })
  }

  private emitNavigationSnapshot(): void {
    this.syncNavigationPivotMarker()
    this.interactionHandlers.onNavigationChange?.(navigationSnapshot(this.navigationCamera, this.navigation.target))
  }

  private syncNavigationPivotMarker(): void {
    this.navigationPivotMarker?.position.copy(this.navigation.target)
  }

  private getStageContentBounds(): THREE.Box3 {
    const bounds = new THREE.Box3()
    this.registry.rootsList().forEach((root) => {
      const entityKind = root.userData.entityKind
      if (entityKind !== 'actor' && entityKind !== 'prop' && entityKind !== 'camera') return
      const entityBounds = computeBlockingBounds(root)
      if (!entityBounds.isEmpty()) bounds.union(entityBounds)
    })
    return bounds
  }

  private frameEntity(entityId: string): void {
    const root = this.registry.get(entityId)
    if (!root) return
    const bounds = computeBlockingBounds(root)
    if (bounds.isEmpty()) return
    this.frameNavigationBounds(bounds)
  }

  private frameNavigationBounds(bounds: THREE.Box3): void {
    const framed = framingPositionForBounds(bounds, this.navigationCamera, this.navigation.target, this.navigationCamera.position)
    this.navigation.target.copy(framed.center)
    this.navigation.distance = framed.distance
    this.applyNavigationState()
    this.emitNavigationSnapshot()
    this.requestRender()
  }

  private getCameraViewRuntimeCamera(): {
    runtimeCamera: THREE.PerspectiveCamera
    viewport: ReturnType<typeof computeCameraViewViewport> & { containerHeight: number }
  } | null {
    if (this.viewMode !== 'camera' || !this.cameraViewCameraId) return null
    const root = this.registry.get(this.cameraViewCameraId)
    const camera = root?.userData.currentCamera as CameraDocument | undefined
    const runtimeCamera = root?.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera | undefined
    if (!camera || !runtimeCamera) return null
    const bounds = this.getCanvasRect()
    const width = Math.max(1, bounds.width || this.container.clientWidth)
    const height = Math.max(1, bounds.height || this.container.clientHeight)
    const projection = computeCameraViewProjection(camera)
    return { runtimeCamera, viewport: { ...computeCameraViewViewport(width, height, projection.displayAspectRatio), containerHeight: height } }
  }

  private applyViewMode(): void {
    const cameraViewActive = this.viewMode === 'camera'
    const cameraRoot = cameraViewActive && this.cameraViewCameraId ? this.registry.get(this.cameraViewCameraId) : undefined
    const runtimeCamera = cameraRoot?.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera | undefined

    if (cameraViewActive && (!cameraRoot || cameraRoot.userData.entityKind !== 'camera' || !runtimeCamera)) {
      this.viewMode = 'blocking'
      this.cameraViewCameraId = null
      this.interactionHandlers.onViewModeChange?.('blocking')
    }

    const activeCameraId = this.viewMode === 'camera' ? this.cameraViewCameraId : null
    const cameraViewCamera = this.getCameraViewRuntimeCamera()
    const canTransformSubjectInCameraView = this.viewMode === 'camera'
      && (this.registry.get(this.selectedEntityId ?? '')?.userData.entityKind === 'actor'
        || this.registry.get(this.selectedEntityId ?? '')?.userData.entityKind === 'prop')
      && this.tool !== 'select'
    if (this.viewMode === 'camera') {
      this.selectionHelper.visible = false
      if (canTransformSubjectInCameraView && cameraViewCamera) this.configureTransformControls()
      else {
        this.transformControls.detach()
        this.transformControls.enabled = false
        this.transformControls.getHelper().visible = false
      }
    }

    this.registry.rootsList().forEach((root) => {
      const isActiveCamera = root.userData.entityKind === 'camera' && root.userData.entityId === activeCameraId
      root.traverse((object) => {
        if (object.userData.cameraFrustum === true || object.userData.cameraDirection === true) object.visible = false
        if (object.userData.facingIndicator === true || object.userData.diagnosticOverlay === true) {
          object.visible = this.viewMode === 'blocking' && object.userData.facingIndicator !== true
        }
        if (root.userData.entityKind === 'camera' && object instanceof THREE.Mesh) {
          object.visible = !(isActiveCamera && this.viewMode === 'camera')
        }
      })
    })

    if (this.diagnosticOverlay && this.viewMode === 'blocking') this.diagnosticOverlay.visible = true
    this.updateCameraGuides()
    if (this.viewMode === 'camera') this.configureCameraViewCamera()
    else {
      this.restoreBlockingCameraProjections()
      this.configureTransformControls()
    }
  }

  private configureCameraViewCamera(): void {
    if (this.viewMode !== 'camera' || !this.cameraViewCameraId) return
    const root = this.registry.get(this.cameraViewCameraId)
    const camera = root?.userData.currentCamera as CameraDocument | undefined
    const runtimeCamera = root?.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera | undefined
    if (!camera || !runtimeCamera) return
    const projection = computeCameraViewProjection(camera)
    runtimeCamera.fov = projection.verticalFovRadians * (180 / Math.PI)
    runtimeCamera.aspect = projection.displayAspectRatio
    runtimeCamera.near = 0.05
    runtimeCamera.far = Math.max(20, camera.lens.focusDistanceM * 4)
    runtimeCamera.updateProjectionMatrix()
  }

  private restoreBlockingCameraProjections(): void {
    this.registry.rootsList().forEach((root) => {
      if (root.userData.entityKind !== 'camera') return
      const camera = root.userData.currentCamera as CameraDocument | undefined
      const runtimeCamera = root.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera | undefined
      if (!camera || !runtimeCamera) return
      runtimeCamera.aspect = camera.resolvedCapture.activeWidthMm / camera.resolvedCapture.activeHeightMm
      runtimeCamera.updateProjectionMatrix()
    })
  }

  private renderStage(): void {
    const root = this.viewMode === 'camera' && this.cameraViewCameraId ? this.registry.get(this.cameraViewCameraId) : undefined
    const runtimeCamera = root?.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera | undefined
    if (this.viewMode !== 'camera' || !runtimeCamera) {
      this.renderer.setScissorTest(false)
      this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height)
      this.renderer.render(this.scene, this.navigationCamera)
      this.emitStageAlignmentDebug(null)
      return
    }

    const bounds = this.getCanvasRect()
    const width = Math.max(1, bounds.width || this.container.clientWidth)
    const height = Math.max(1, bounds.height || this.container.clientHeight)
    const camera = root?.userData.currentCamera as CameraDocument | undefined
    if (!camera) return
    const projection = computeCameraViewProjection(camera)
    const viewport = computeCameraViewViewport(width, height, projection.displayAspectRatio)
    const pixelRatio = this.renderer.getPixelRatio()
    const left = Math.round(viewport.left * pixelRatio)
    const bottom = Math.round((height - viewport.top - viewport.height) * pixelRatio)
    const viewportWidth = Math.max(1, Math.round(viewport.width * pixelRatio))
    const viewportHeight = Math.max(1, Math.round(viewport.height * pixelRatio))

    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, this.renderer.domElement.width, this.renderer.domElement.height)
    this.renderer.clear(true, true, true)
    this.renderer.setScissorTest(true)
    this.renderer.setViewport(left, bottom, viewportWidth, viewportHeight)
    this.renderer.setScissor(left, bottom, viewportWidth, viewportHeight)
    this.renderer.render(this.scene, runtimeCamera)
    this.renderer.setScissorTest(false)
    this.emitStageAlignmentDebug(null)
  }

  private updateSelectionVisual(): void {
    const object = this.selectedEntityId ? this.registry.get(this.selectedEntityId) : undefined
    if (!object) {
      this.selectionHelper.visible = false
      this.transformControls.detach()
      return
    }
    const bounds = computeBlockingBounds(object)
    if (bounds.isEmpty()) {
      this.selectionHelper.visible = false
      return
    }
    this.selectionHelper.box.copy(bounds)
    this.selectionHelper.visible = true
  }

  private updateFacingIndicators(): void {
    const visible = (this.tool === 'rotate' || this.selectedEntityId !== null) && this.rigDebugState.actorId === null
    this.registry.rootsList().forEach((root) => {
      root.traverse((object) => {
        if (object.userData.facingIndicator === true) object.visible = visible
      })
    })
  }

  private updateCameraGuides(): void {
    this.registry.rootsList().forEach((root) => {
      if (root.userData.entityKind !== 'camera') return
      const guide = root.getObjectByName('CameraFrustumGuide')
      if (guide) guide.visible = this.viewMode === 'blocking' && root.userData.entityId === this.selectedEntityId
    })
  }

  private refreshRigDebugOverlay(): void {
    if (this.diagnosticOverlay) {
      this.disposeDiagnosticOverlay(this.diagnosticOverlay)
      this.diagnosticOverlay.parent?.remove(this.diagnosticOverlay)
      this.diagnosticOverlay = null
    }

    const { actorId, showRig, showJointAxes, showContact, showPoseTargets } = this.rigDebugState
    if (!actorId) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const actorRoot = this.registry.get(actorId)
    const model = actorRoot?.getObjectByName('CharacterModel')
    if (!actorRoot || !model) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const report = getRigDiagnosticReport(model)
    const actor = actorRoot.userData.currentActor as ActorDocument | undefined
    if (!report || !actor) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const reconstructed = model.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
    const pose = reconstructed?.[actor.pose.poseId] ?? getPoseDefinition(actor.pose.poseId)
    if (!pose) {
      this.interactionHandlers.onPoseDiagnosticsChange?.(null)
      return
    }
    const validation = validatePoseDefinition(model, actor, pose)
    const preContactBounds = computeBlockingBounds(model).getSize(new THREE.Vector3())
    const contactMode = pose.grounding.type === 'seat' ? 'Seat + Feet' : pose.grounding.type === 'back' ? 'Back' : 'Feet'
    const supportOrientation = pose.grounding.type !== 'back' || !pose.grounding.supportFrame
      ? 'Posterior'
      : pose.grounding.supportFrame === 'posterior'
        ? 'Posterior'
        : pose.grounding.supportFrame === 'anterior'
          ? 'Anterior'
          : pose.grounding.supportFrame === 'left-lateral'
            ? 'Left Lateral'
            : pose.grounding.supportFrame === 'right-lateral'
              ? 'Right Lateral'
              : pose.grounding.supportFrame === 'posterior-inclined'
                ? 'Posterior Inclined'
                : 'Lateral'
    const torsoOrientation = validation.metrics.torsoVerticality > 0.75
      ? pose.category === 'sitting' ? 'Seated' : 'Vertical'
      : 'Horizontal'
    const hasOverlay = showRig || showJointAxes || showContact || showPoseTargets
    if (!hasOverlay) {
      updateActorRuntimeAppearance(actorRoot as THREE.Group, actor)
      const postContactBounds = computeBlockingBounds(actorRoot).getSize(new THREE.Vector3())
      this.interactionHandlers.onPoseDiagnosticsChange?.({
        poseId: pose.id,
        validation,
        preContactBounds: [preContactBounds.x, preContactBounds.y, preContactBounds.z],
        postContactBounds: [postContactBounds.x, postContactBounds.y, postContactBounds.z],
        contactMode,
        supportOrientation,
        torsoOrientation,
      })
      return
    }

    const overlay = new THREE.Group()
    overlay.name = 'RigDiagnosticOverlay'
    overlay.userData.diagnosticOverlay = true
    overlay.userData.stageSelectable = false
    const actorInverse = actorRoot.matrixWorld.clone().invert()
    const positionInActor = (object: THREE.Object3D): THREE.Vector3 => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(actorInverse)

    if (showRig) {
      const jointGeometry = new THREE.SphereGeometry(0.018, 8, 6)
      const pointMaterial = new THREE.MeshBasicMaterial({ color: '#77c8ff', depthTest: false, transparent: true, opacity: 0.9 })
      const lineMaterial = new THREE.LineBasicMaterial({ color: '#77c8ff', depthTest: false, transparent: true, opacity: 0.85 })
      Object.values(report.joints).forEach((diagnostic) => {
        if (!diagnostic) return
        const object = model.getObjectByName(diagnostic.bone)
        if (!object) return
        const point = new THREE.Mesh(jointGeometry, pointMaterial)
        point.position.copy(positionInActor(object))
        point.userData.diagnosticOverlay = true
        overlay.add(point)
        const child = diagnostic.primaryChildBone ? model.getObjectByName(diagnostic.primaryChildBone) : undefined
        if (child) {
          const geometry = new THREE.BufferGeometry().setFromPoints([positionInActor(object), positionInActor(child)])
          const line = new THREE.Line(geometry, lineMaterial)
          line.userData.diagnosticOverlay = true
          overlay.add(line)
        }
      })
    }

    if (showJointAxes) {
      Object.values(report.joints).forEach((diagnostic) => {
        if (!diagnostic) return
        const object = model.getObjectByName(diagnostic.bone)
        if (!object) return
        const axes = new THREE.AxesHelper(0.12)
        axes.position.copy(positionInActor(object))
        axes.quaternion.copy(actorRoot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(object.getWorldQuaternion(new THREE.Quaternion())))
        axes.userData.diagnosticOverlay = true
        overlay.add(axes)
      })
    }

    if (showPoseTargets) {
      const actor = actorRoot.userData.currentActor as ActorDocument | undefined
      const intent = actor ? productionPoseIntents().find((entry) => entry.id === actor.pose.poseId) : undefined
      if (intent) {
        const reconstructed = model.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
        const pose = reconstructed?.[intent.id] ?? getPoseDefinition(intent.id)
        if (!pose) return
        const targetMaterial = new THREE.LineBasicMaterial({ color: '#f1ba68', depthTest: false, transparent: true, opacity: 0.9 })
        const targetPointMaterial = new THREE.MeshBasicMaterial({ color: '#f1ba68', depthTest: false, transparent: true, opacity: 0.95 })
        const anatomyMaterial = new THREE.LineBasicMaterial({ color: '#86d5b3', depthTest: false, transparent: true, opacity: 0.85 })
        const referenceMaterial = new THREE.LineBasicMaterial({ color: '#7c8da3', depthTest: false, transparent: true, opacity: 0.7 })
        const targetGeometry = new THREE.SphereGeometry(0.014, 8, 6)
        const modelRotation = actorRoot.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(model.getWorldQuaternion(new THREE.Quaternion()))
        const modelWorldScale = model.getWorldScale(new THREE.Vector3())
        const actorWorldScale = actorRoot.getWorldScale(new THREE.Vector3())
        const modelScaleInActor = modelWorldScale.x / Math.max(0.0001, actorWorldScale.x)
        const directionInActor = (joint: keyof typeof intent.joints): THREE.Vector3 | undefined => {
          const target = intent.joints[joint]?.targetDirection
          if (!target) return undefined
          return new THREE.Vector3()
            .addScaledVector(new THREE.Vector3(...report.characterAxes.right), target.characterRight)
            .addScaledVector(new THREE.Vector3(...report.characterAxes.up), target.characterUp)
            .addScaledVector(new THREE.Vector3(...report.characterAxes.forward), target.characterForward)
            .normalize()
            .applyQuaternion(modelRotation)
        }
        const boneObject = (joint: keyof typeof report.joints): THREE.Object3D | undefined => {
          const diagnostic = report.joints[joint]
          return diagnostic ? model.getObjectByName(diagnostic.bone) : undefined
        }
        const restLength = (joint: keyof typeof report.joints): number => {
          const diagnostic = report.joints[joint]
          const childJoint = diagnostic?.primaryChildJoint
          const child = childJoint ? report.joints[childJoint] : undefined
          return diagnostic && child
            ? new THREE.Vector3(...diagnostic.restWorldPosition).distanceTo(new THREE.Vector3(...child.restWorldPosition)) * modelScaleInActor
            : 0.28
        }
        const addPoint = (position: THREE.Vector3) => {
          const point = new THREE.Mesh(targetGeometry, targetPointMaterial)
          point.position.copy(position)
          point.userData.diagnosticOverlay = true
          overlay.add(point)
        }
        const addLine = (start: THREE.Vector3, end: THREE.Vector3) => {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), targetMaterial)
          line.userData.diagnosticOverlay = true
          overlay.add(line)
        }
        const addReferenceLine = (start: THREE.Vector3, end: THREE.Vector3, material: THREE.LineBasicMaterial = referenceMaterial) => {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), material)
          line.userData.diagnosticOverlay = true
          overlay.add(line)
        }
        const addPlane = (height: number, color: string, name: string) => {
          const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.8),
            new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.45, depthTest: false }),
          )
          plane.name = name
          plane.rotation.x = -Math.PI / 2
          plane.position.y = height
          plane.userData.diagnosticOverlay = true
          overlay.add(plane)
        }

        // Upper-body guides are deliberately built as a chain: clavicle origin
        // -> shoulder socket -> elbow target -> wrist target. The clavicle is
        // not reused as an arm-direction control.
        (['L', 'R'] as const).forEach((side) => {
          const shoulder = boneObject(`shoulder.${side}`)
          const socket = boneObject(`upperArm.${side}`)
          const upperDirection = directionInActor(`upperArm.${side}`)
          const lowerDirection = directionInActor(`lowerArm.${side}`)
          if (!shoulder || !socket || !upperDirection || !lowerDirection) return
          const shoulderOrigin = positionInActor(shoulder)
          const socketOrigin = positionInActor(socket)
          const elbowTarget = socketOrigin.clone().addScaledVector(upperDirection, restLength(`upperArm.${side}`))
          const wristTarget = elbowTarget.clone().addScaledVector(lowerDirection, restLength(`lowerArm.${side}`))
          addPoint(shoulderOrigin)
          addPoint(socketOrigin)
          addPoint(elbowTarget)
          addPoint(wristTarget)
          addLine(shoulderOrigin, socketOrigin)
          addLine(socketOrigin, elbowTarget)
          addLine(elbowTarget, wristTarget)
          const hipsReference = boneObject('hips')
          const chestReference = boneObject('chest')
          const bodyCenter = hipsReference && chestReference
            ? positionInActor(hipsReference).add(positionInActor(chestReference)).multiplyScalar(0.5)
            : new THREE.Vector3(0, socketOrigin.y, socketOrigin.z)
          const oppositeShoulder = positionInActor(boneObject(`shoulder.${side === 'L' ? 'R' : 'L'}`) ?? shoulder)
          const lateral = shoulderOrigin.clone().sub(oppositeShoulder).normalize()
          const signedLateral = socketOrigin.clone().sub(bodyCenter).dot(lateral)
          const centerlinePoint = socketOrigin.clone().addScaledVector(lateral, -signedLateral)
          addReferenceLine(socketOrigin.clone().add(elbowTarget).multiplyScalar(0.5), centerlinePoint, anatomyMaterial)
        })

        const hips = boneObject('hips')
        const chest = boneObject('chest')
        const head = boneObject('head')
        if (hips && chest && head) {
          const hipsPoint = positionInActor(hips)
          const chestPoint = positionInActor(chest)
          const headPoint = positionInActor(head)
          addReferenceLine(hipsPoint, headPoint)
          const leftShoulder = boneObject('shoulder.L')
          const rightShoulder = boneObject('shoulder.R')
          if (leftShoulder && rightShoulder) addReferenceLine(positionInActor(leftShoulder), positionInActor(rightShoulder), anatomyMaterial)
          const center = hipsPoint.clone().add(chestPoint).multiplyScalar(0.5)
          const ribWidth = leftShoulder && rightShoulder ? positionInActor(leftShoulder).distanceTo(positionInActor(rightShoulder)) * 2.6 : 0.4
          const ribBounds = new THREE.Box3(
            new THREE.Vector3(center.x - ribWidth * 0.5, Math.min(hipsPoint.y, chestPoint.y) - 0.08, center.z - 0.16),
            new THREE.Vector3(center.x + ribWidth * 0.5, Math.max(hipsPoint.y, chestPoint.y) + 0.08, center.z + 0.16),
          )
          const ribGuide = new THREE.Box3Helper(ribBounds, '#7c8da3')
          ribGuide.userData.diagnosticOverlay = true
          overlay.add(ribGuide)
        }

        if (intent.id === 'sitting-neutral') {
          const seatGrounding = pose.grounding.type === 'seat' ? pose.grounding : undefined
          const seatHeight = seatGrounding ? seatGrounding.referenceHeight * modelScaleInActor : 0
          addPlane(0, '#8ea4b8', 'PoseTargetFloor')
          addPlane(seatHeight, '#f0bd67', 'PoseTargetSeat')
          const pelvis = boneObject('hips')
          if (pelvis) {
            const pelvisTarget = positionInActor(pelvis)
            pelvisTarget.y = seatHeight
            addPoint(pelvisTarget)
          }
          (['L', 'R'] as const).forEach((side) => {
            const hip = boneObject(`upperLeg.${side}`)
            const kneeDirection = directionInActor(`upperLeg.${side}`)
            const ankleDirection = directionInActor(`lowerLeg.${side}`)
            const foot = boneObject(`foot.${side}`)
            if (!hip || !kneeDirection || !ankleDirection || !foot) return
            const hipOrigin = positionInActor(hip)
            const kneeTarget = hipOrigin.clone().addScaledVector(kneeDirection, restLength(`upperLeg.${side}`))
            const ankleTarget = kneeTarget.clone().addScaledVector(ankleDirection, restLength(`lowerLeg.${side}`))
            const footTarget = positionInActor(foot)
            const supportOffset = seatGrounding
              ? seatGrounding.secondaryContact?.supportOffsets?.[`foot.${side}`] ?? 0
              : 0
            footTarget.y = supportOffset * modelScaleInActor
            addPoint(hipOrigin)
            addPoint(kneeTarget)
            addPoint(ankleTarget)
            addPoint(footTarget)
            addLine(hipOrigin, kneeTarget)
            addLine(kneeTarget, ankleTarget)
            addLine(ankleTarget, footTarget)
          })
        }

        if (intent.category === 'lying') {
          addPlane(0, '#8ea4b8', 'PoseTargetFloor')
          const hips = boneObject('hips')
          const head = boneObject('head')
          const chest = boneObject('chest')
          if (hips && head) {
            const origin = positionInActor(hips)
            const bodyDirection = new THREE.Vector3(...report.characterAxes.up).applyQuaternion(modelRotation).normalize()
            const bodyTarget = origin.clone().addScaledVector(bodyDirection, origin.distanceTo(positionInActor(head)))
            addPoint(origin)
            addPoint(bodyTarget)
            addLine(origin, bodyTarget)
          }
          if (chest) {
            const origin = positionInActor(chest)
            const frontDirection = new THREE.Vector3(...report.characterAxes.forward).applyQuaternion(modelRotation).normalize()
            const frontTarget = origin.clone().addScaledVector(frontDirection, 0.22)
            addPoint(frontTarget)
            addLine(origin, frontTarget)
          }
          const support = boneObject('spine')
          if (support && pose.grounding.type === 'back') {
            const supportTarget = positionInActor(support)
            supportTarget.y = pose.grounding.contactOffset * modelScaleInActor
            addPoint(supportTarget)
          }
        }
      }
    }

    // Target and rig guides are built from the pre-contact skeleton. Restore
    // the final grounded character before adding the contact overlay.
    updateActorRuntimeAppearance(actorRoot as THREE.Group, actor)
    const postContactBounds = computeBlockingBounds(actorRoot).getSize(new THREE.Vector3())
    this.interactionHandlers.onPoseDiagnosticsChange?.({
      poseId: pose.id,
      validation,
      preContactBounds: [preContactBounds.x, preContactBounds.y, preContactBounds.z],
      postContactBounds: [postContactBounds.x, postContactBounds.y, postContactBounds.z],
      contactMode,
      supportOrientation,
      torsoOrientation,
    })

    if (showContact) {
      const contact = getContactDebugObject(model, actorRoot, report)
      if (contact) overlay.add(contact)
    }

    actorRoot.add(overlay)
    this.diagnosticOverlay = overlay
  }

  private disposeDiagnosticOverlay(overlay: THREE.Group): void {
    overlay.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
        object.geometry.dispose()
        disposeMaterial(object.material)
      }
    })
  }

  private syncCharacterAsset(actor: ActorDocument, root: THREE.Group): void {
    const definition = resolveCharacterDefinition(actor.character.characterId)
    root.userData.currentActor = actor

    const loadedCharacterId = root.userData.loadedCharacterId as string | undefined
    if (loadedCharacterId && loadedCharacterId !== definition.id) {
      removeCharacterInstance(root)
      root.userData.loadedCharacterId = undefined
      root.userData.characterLoadAttempted = undefined
      const fallback = root.getObjectByName('ActorFallback')
      if (fallback) fallback.visible = true
    }

    if (root.userData.loadedCharacterId === definition.id || root.userData.characterLoadAttempted === definition.id) return
    root.userData.characterLoadAttempted = definition.id

      void this.characterAssets.loadInstance(definition).then((instance) => {
      if (this.disposed || this.registry.get(actor.id) !== root) return
      const currentActor = root.userData.currentActor as ActorDocument | undefined
      if (!currentActor || currentActor.character.characterId !== definition.id) return
      if (!instance) {
        this.reportCharacterFallback(root, currentActor, definition.id, this.characterAssets.failureReason(definition.id) ?? 'Character asset did not produce a runtime instance.')
        return
      }
      if (!isUsableCharacterInstance(instance)) {
        this.reportCharacterFallback(root, currentActor, definition.id, 'Character asset is missing required humanoid joints.')
        return
      }
      root.userData.loadedCharacterId = definition.id
      attachCharacterInstance(root, instance, currentActor, definition.referenceHeightM)
      const inspection = inspectCharacterInstance(instance)
      console.info('[Character]', {
        actor: currentActor.name,
        character: definition.id,
        asset: definition.assetPath,
        load: 'success',
        skinnedMesh: inspection.skinnedMesh,
        skeleton: `${inspection.skeletonBones} bones`,
        meshCount: inspection.meshCount,
        visibleMesh: inspection.visibleMesh,
        deformation: inspection.deformation,
        rigWarnings: (getRigDiagnosticReport(instance)?.warnings ?? []).length,
        rigProfile: definition.rigProfile,
        fallback: false,
      })
      this.refreshRigDebugOverlay()
      this.requestRender()
    })
  }

  private reportCharacterFallback(root: THREE.Group, actor: ActorDocument, characterId: string, reason: string): void {
    root.userData.characterFallbackReason = reason
    console.warn('[Character]', {
      actor: actor.name,
      character: characterId,
      fallback: true,
      reason,
    })
  }

  private handleCanvasPointerDownEvent(event: PointerEvent): void {
    if (this.viewMode !== 'blocking') return
    if (event.button !== 0 && event.button !== 2) return
    const transformOwnsGesture = event.button === 0 && this.transformControls.dragging
    this.stageGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
      button: event.button === 0 ? 'left' : 'right',
      kind: transformOwnsGesture ? 'transform' : 'pending',
    }
    this.renderer.domElement.setPointerCapture?.(event.pointerId)
  }

  private handleCanvasPointerMoveEvent(event: PointerEvent): void {
    const gesture = this.stageGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (this.transformControls.dragging || this.activeTransformEntityId) gesture.kind = 'transform'
    if (gesture.kind === 'pending' && stagePointerMovedBeyondThreshold(gesture.startX, gesture.startY, event.clientX, event.clientY)) {
      gesture.kind = gesture.button === 'left' ? 'orbit' : 'pan'
      gesture.moved = true
      gesture.lastX = event.clientX
      gesture.lastY = event.clientY
      return
    }
    if (gesture.kind !== 'orbit' && gesture.kind !== 'pan') return
    const deltaX = event.clientX - gesture.lastX
    const deltaY = event.clientY - gesture.lastY
    gesture.lastX = event.clientX
    gesture.lastY = event.clientY
    if (deltaX === 0 && deltaY === 0) return
    if (gesture.kind === 'orbit') {
      orbitBlockingNavigation(this.navigation, deltaX, deltaY)
    } else {
      panBlockingNavigation(this.navigation, this.navigationCamera, deltaX, deltaY)
    }
    this.applyNavigationState()
    this.emitNavigationSnapshot()
    this.requestRender()
  }

  private handleCanvasPointerUpEvent(event: PointerEvent): void {
    const gesture = this.stageGesture
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const movePx = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
    const gestureKind: StagePickDebugSnapshot['gesture'] = gesture.kind === 'transform' || this.transformControls.dragging || Boolean(this.activeTransformEntityId)
      ? 'TRANSFORM'
      : gesture.kind === 'orbit'
        ? 'ORBIT'
        : gesture.kind === 'pan'
          ? 'PAN'
          : 'CLICK'
    if (gestureKind === 'CLICK' && gesture.button === 'left') {
      this.lastDebugClick = [event.clientX, event.clientY]
      const pick = this.pickStageEntity(event)
      const selectionRequested = pick?.entityId ?? null
      const selectionCommitted = this.selectStageEntity(selectionRequested)
      this.emitStagePickDebug(event, pick, 'CLICK', 'LEFT', movePx, selectionRequested, selectionCommitted)
    } else {
      this.emitStageNavigationDebug(gestureKind, gesture.button === 'left' ? 'LEFT' : 'RIGHT', event, movePx)
    }
    this.stageGesture = null
    if (this.renderer.domElement.hasPointerCapture?.(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId)
  }

  private handleCanvasPointerCancelEvent(event: PointerEvent): void {
    if (this.stageGesture?.pointerId === event.pointerId) {
      this.stageGesture = null
    }
    if (this.transformControls.dragging || this.activeTransformEntityId) this.cancelTransformInteraction(event.pointerId)
  }

  private handleCanvasWheelEvent(event: WheelEvent): void {
    if (this.viewMode !== 'blocking') return
    event.preventDefault()
    zoomBlockingNavigation(this.navigation, event.deltaY)
    this.applyNavigationState()
    this.emitNavigationSnapshot()
    this.emitStageNavigationDebug('ZOOM', 'WHEEL', event, Math.abs(event.deltaY))
    this.requestRender()
  }

  private handleWindowKeyDownEvent(event: KeyboardEvent): void {
    if (event.key.toLowerCase() !== 'f' || event.defaultPrevented || this.viewMode !== 'blocking' || !this.selectedEntityId) return
    const target = event.target as { tagName?: string; isContentEditable?: boolean } | null
    if (isEditableNavigationTarget(target)) return
    event.preventDefault()
    this.frameSelected()
  }

  private cancelTransformInteraction(pointerId: number): void {
    if (this.transformCleanupActive || (!this.transformControls.dragging && !this.activeTransformEntityId)) return
    this.transformCleanupActive = true
    try {
      this.transformControls.disconnect()
      if (this.renderer.domElement.hasPointerCapture?.(pointerId)) this.renderer.domElement.releasePointerCapture(pointerId)
      this.transformControls.pointerUp(null)
      this.transformControls.connect(this.renderer.domElement)
    } finally {
      this.transformCleanupActive = false
    }
    this.requestRender()
  }

  private describeProductionPickHits(intersections: THREE.Intersection[]): ProductionPickHitSnapshot[] {
    return intersections.slice(0, 5).map((intersection) => ({
      type: intersection.object.type,
      name: intersection.object.name || '(unnamed)',
      distance: intersection.distance,
      resolvedEntity: this.registry.resolveHit(intersection.object) ?? null,
    }))
  }

  private measureProductionPickObject(object: THREE.Object3D | null): ProductionPickObjectSnapshot {
    if (!object) return { hit: false, distance: null, point: null, hits: [] }
    const intersections = this.raycaster.intersectObject(object, true)
    const first = intersections[0]
    return {
      hit: Boolean(first),
      distance: first?.distance ?? null,
      point: first ? [first.point.x, first.point.y, first.point.z] : null,
      hits: this.describeProductionPickHits(intersections),
    }
  }

  private measureProductionPickRay(registryRoots: THREE.Object3D[]): ProductionPickProbeSnapshot {
    const ray = this.raycaster.ray
    const registryIntersections = this.raycaster.intersectObjects(registryRoots, true)
    const registryRawHits = this.describeProductionPickHits(registryIntersections)
    const rootsByKind = {
      actor: registryRoots.filter((root) => root.userData.entityKind === 'actor'),
      prop: registryRoots.filter((root) => root.userData.entityKind === 'prop'),
      camera: registryRoots.filter((root) => root.userData.entityKind === 'camera'),
    }
    const registryRootsSnapshot = registryRoots.map((root) => ({
      entityKind: String(root.userData.entityKind ?? 'unknown'),
      entityId: String(root.userData.entityId ?? 'unknown'),
      name: root.name || '(unnamed)',
      visible: root.visible,
      childCount: root.children.length,
    }))

    return {
      rayOrigin: [ray.origin.x, ray.origin.y, ray.origin.z],
      rayDirection: [ray.direction.x, ray.direction.y, ray.direction.z],
      probe: this.measureProductionPickObject(this.productionProbeMesh),
      ground: this.measureProductionPickObject(this.groundMesh),
      registryRoots: registryRootsSnapshot,
      registryRawHits,
      selectableHits: registryIntersections.filter((intersection) => isSelectableStageObject(intersection.object)).length,
      directRootHits: {
        actor: rootsByKind.actor.flatMap((root) => this.describeProductionPickHits(this.raycaster.intersectObject(root, true))),
        prop: rootsByKind.prop.flatMap((root) => this.describeProductionPickHits(this.raycaster.intersectObject(root, true))),
        camera: rootsByKind.camera.flatMap((root) => this.describeProductionPickHits(this.raycaster.intersectObject(root, true))),
      },
      firstRawHit: registryRawHits[0] ?? null,
      resolvedEntity: registryRawHits[0]?.resolvedEntity ?? null,
    }
  }

  private pickStageEntity(event: Pick<PointerEvent, 'clientX' | 'clientY'>): StagePickResult | null {
    const { stageRect, activeViewport, normalizedPointer, interactionCamera } = this.getStagePointerContext(event)
    if (!normalizedPointer) {
      this.showDebugPickMarker(undefined)
      if (this.productionProbeRay) this.productionProbeRay.visible = false
      return null
    }
    if (this.interactionDebugEnabled) this.emitStageAlignmentDebug(event as PointerEvent)
    this.scene.updateMatrixWorld(true)
    interactionCamera.updateMatrixWorld(true)
    this.pointer.set(normalizedPointer.x, normalizedPointer.y)
    this.raycaster.setFromCamera(this.pointer, interactionCamera)
    const registryRoots = this.registry.rootsList()
    const probe = this.interactionDebugEnabled
      ? this.measureProductionPickRay(registryRoots)
      : null
    if (probe) this.updateProductionPickingRay(this.raycaster.ray)
    const intersections = this.raycaster.intersectObjects(registryRoots, true)
    const firstHit = intersections[0]
    const hit = intersections.find((intersection) => isSelectableStageObject(intersection.object))
    const entityId = this.registry.resolveHit(hit?.object)
    const owner = entityId ? this.registry.get(entityId) : undefined
    const result: StagePickResult = {
      entityId: entityId ?? null,
      entityKind: owner?.userData.entityKind as string | null ?? null,
      hitObjectName: hit?.object.name || null,
      hitObjectType: hit?.object.type || null,
      candidateCount: intersections.length,
      selectableHitCount: intersections.filter((intersection) => isSelectableStageObject(intersection.object)).length,
      normalizedPointer,
      stageRect,
      activeViewport,
      point: firstHit?.point.clone() ?? new THREE.Vector3(),
      probe: probe ?? {
        rayOrigin: [0, 0, 0],
        rayDirection: [0, 0, -1],
        probe: { hit: false, distance: null, point: null, hits: [] },
        ground: { hit: false, distance: null, point: null, hits: [] },
        registryRoots: [],
        registryRawHits: [],
        selectableHits: 0,
        directRootHits: { actor: [], prop: [], camera: [] },
        firstRawHit: null,
        resolvedEntity: null,
      },
    }
    this.showDebugPickMarker(firstHit ? result.point : undefined)
    return result
  }

  private getStagePointerContext(event: Pick<PointerEvent, 'clientX' | 'clientY'>): StagePointerContext {
    const bounds = this.getCanvasRect()
    const stageRect: StagePointerRegion = { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
    const cameraViewCamera = this.getCameraViewRuntimeCamera()
    const activeViewport = cameraViewCamera
      ? {
          left: bounds.left + cameraViewCamera.viewport.left,
          top: bounds.top + cameraViewCamera.viewport.top,
          width: cameraViewCamera.viewport.width,
          height: cameraViewCamera.viewport.height,
        }
      : stageRect
    return {
      stageRect,
      activeViewport,
      normalizedPointer: normalizeStagePointer(event.clientX, event.clientY, stageRect, activeViewport),
      interactionCamera: this.getStageInteractionCamera(),
    }
  }

  private selectStageEntity(entityId: string | null): boolean {
    // Keep the runtime in sync immediately so Move/Rotate can attach in the
    // same pointer gesture that selected the visible child mesh. React/store
    // state still receives the authoritative selection callback afterward.
    this.setSelectedEntity(entityId)
    this.interactionHandlers.onSelectionChange(entityId)
    return true
  }

  private emitStagePickDebug(
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    pick: StagePickResult | null,
    gesture: StagePickDebugSnapshot['gesture'],
    button: StagePickDebugSnapshot['button'],
    movePx: number,
    selectionRequested: string | null = null,
    selectionCommitted: boolean | null = null,
  ): void {
    if (!import.meta.env.DEV) return
    if (gesture === 'CLICK') this.lastDebugClick = [event.clientX, event.clientY]
    this.emitStageAlignmentDebug(event as PointerEvent)
    const { normalizedPointer, stageRect } = this.getStagePointerContext(event)
    this.interactionHandlers.onStagePickDebug?.({
      gesture,
      button,
      movePx,
      clientX: event.clientX,
      clientY: event.clientY,
      canvasRect: stageRect,
      ndcX: normalizedPointer?.x ?? 0,
      ndcY: normalizedPointer?.y ?? 0,
      rawHits: pick?.candidateCount ?? 0,
      selectableHits: pick?.selectableHitCount ?? 0,
      entityId: pick?.entityId ?? null,
      productionProbe: pick?.probe ?? null,
      selectionRequested,
      selectionCommitted,
      currentSelection: this.selectedEntityId,
    })
  }

  private emitStageNavigationDebug(
    gesture: StagePickDebugSnapshot['gesture'],
    button: StagePickDebugSnapshot['button'],
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    movePx: number,
  ): void {
    this.emitStagePickDebug(event, null, gesture, button, movePx)
  }

  private showDebugPickMarker(point: THREE.Vector3 | undefined): void {
    if (!import.meta.env.DEV) return
    this.clearDebugPickMarker()
    if (!point) return
    this.debugPickMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#f1ba68', depthTest: false }),
    )
    this.debugPickMarker.position.copy(point)
    this.debugPickMarker.userData.stageSelectable = false
    this.debugPickMarker.userData.debugObject = true
    this.scene.add(this.debugPickMarker)
    this.debugPickMarkerTimeout = window.setTimeout(() => {
      this.debugPickMarkerTimeout = null
      this.clearDebugPickMarker()
      this.requestRender()
    }, new URLSearchParams(window.location.search).get('interactionDebug') === '1' ? 3000 : 1000)
  }

  private clearDebugPickMarker(): void {
    if (this.debugPickMarkerTimeout !== null) {
      window.clearTimeout(this.debugPickMarkerTimeout)
      this.debugPickMarkerTimeout = null
    }
    if (this.debugPickMarker) {
      this.debugPickMarker.geometry.dispose()
      ;(this.debugPickMarker.material as THREE.Material).dispose()
      this.scene.remove(this.debugPickMarker)
      this.debugPickMarker = null
    }
  }

  private createProductionPickingProbe(): void {
    if (!this.interactionDebugEnabled) return

    this.productionProbeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: '#f0a032' }),
    )
    this.productionProbeMesh.name = 'Production Probe Cube'
    this.productionProbeMesh.position.set(0.8, 0.35, 0)
    this.productionProbeMesh.userData.stageSelectable = false
    this.productionProbeMesh.userData.debugObject = true
    this.productionProbeMesh.userData.productionPickingProbe = true
    this.scene.add(this.productionProbeMesh)

    const rayGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -100),
    ])
    const rayMaterial = new THREE.LineBasicMaterial({ color: '#f0a032', depthTest: false, transparent: true, opacity: 0.9 })
    this.productionProbeRay = new THREE.Line(rayGeometry, rayMaterial)
    this.productionProbeRay.name = 'Production Picking Ray'
    this.productionProbeRay.visible = false
    this.productionProbeRay.renderOrder = 20
    this.productionProbeRay.userData.stageSelectable = false
    this.productionProbeRay.userData.debugObject = true
    this.productionProbeRay.userData.productionPickingProbe = true
    this.scene.add(this.productionProbeRay)
  }

  private updateProductionPickingRay(ray: THREE.Ray): void {
    if (!this.productionProbeRay) return
    const geometry = this.productionProbeRay.geometry as THREE.BufferGeometry
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute
    const end = ray.origin.clone().addScaledVector(ray.direction, 100)
    positions.setXYZ(0, ray.origin.x, ray.origin.y, ray.origin.z)
    positions.setXYZ(1, end.x, end.y, end.z)
    positions.needsUpdate = true
    this.productionProbeRay.visible = true
  }

  private createEnvironment(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({
        color: '#242a31',
        roughness: 0.92,
        metalness: 0,
      }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.015
    ground.receiveShadow = true
    this.groundMesh = ground
    this.scene.add(ground)

    const grid = new THREE.GridHelper(20, 20, '#4d5864', '#303841')
    grid.position.y = 0
    const gridMaterial = grid.material as THREE.LineBasicMaterial
    gridMaterial.transparent = true
    gridMaterial.opacity = 0.5
    this.scene.add(grid)

    const hemisphere = new THREE.HemisphereLight('#dbe4ee', '#101317', 1.7)
    this.scene.add(hemisphere)

    const key = new THREE.DirectionalLight('#ffffff', 1.25)
    key.position.set(4, 8, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 30
    key.shadow.camera.left = -10
    key.shadow.camera.right = 10
    key.shadow.camera.top = 10
    key.shadow.camera.bottom = -10
    this.scene.add(key)
  }
}

function placementFromObject(object: THREE.Object3D): Placement {
  const rotation: EulerRotation = {
    order: 'XYZ',
    radians: [object.rotation.x, object.rotation.y, object.rotation.z],
  }
  return {
    position: [object.position.x, object.position.y, object.position.z],
    rotation,
  }
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach((entry) => entry.dispose())
}

function disposeCameraRuntime(root: THREE.Object3D): void {
  const guide = root.getObjectByName('CameraFrustumGuide')
  guide?.traverse((object) => {
    if (object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      disposeMaterial(object.material)
    }
  })
}

function getContactDebugObject(model: THREE.Object3D, actorRoot: THREE.Object3D, report: ReturnType<typeof getRigDiagnosticReport>): THREE.Group | null {
  if (!report) return null
  const actor = actorRoot.userData.currentActor as ActorDocument | undefined
  if (!actor) return null
  const reconstructed = model.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
    const pose = reconstructed?.[actor.pose.poseId] ?? getPoseDefinition(actor.pose.poseId)
  if (!pose) return null

  const contact = new THREE.Group()
  contact.name = 'ContactDebug'
  contact.userData.diagnosticOverlay = true
  const actorInverse = actorRoot.matrixWorld.clone().invert()
  const actorScaleY = Math.abs(actorRoot.getWorldScale(new THREE.Vector3()).y) || 1
  const modelScaleInActor = Math.abs(model.getWorldScale(new THREE.Vector3()).y) / actorScaleY || 1
  const positionInActor = (object: THREE.Object3D): THREE.Vector3 => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(actorInverse)
  const addPlane = (height: number, color: string, name: string): void => {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.6, depthTest: false }),
    )
    plane.name = name
    plane.rotation.x = -Math.PI / 2
    plane.position.y = height
    plane.userData.diagnosticOverlay = true
    contact.add(plane)
  }
  const addTarget = (object: THREE.Object3D, height: number): void => {
    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 8, 6),
      new THREE.MeshBasicMaterial({ color: '#f0bd67', depthTest: false }),
    )
    point.position.copy(positionInActor(object))
    point.position.y = height
    point.userData.diagnosticOverlay = true
    contact.add(point)
  }

  addPlane(0, '#8ea4b8', 'FloorContactPlane')
  if (pose.grounding.type === 'seat') {
    const seatGrounding = pose.grounding
    const seatHeight = seatGrounding.referenceHeight * modelScaleInActor
    addPlane(seatHeight, '#f0bd67', 'SeatContactPlane')
    const pelvis = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (pelvis) addTarget(pelvis, seatHeight)
    seatGrounding.secondaryContact?.referenceJoints.forEach((joint) => {
      const foot = model.getObjectByName(report.joints[joint]?.bone ?? '')
      if (foot) {
        const supportOffset = seatGrounding.secondaryContact?.supportOffsets?.[joint] ?? 0
        addTarget(foot, (seatGrounding.secondaryContact?.floorHeight ?? 0) + supportOffset * modelScaleInActor)
      }
    })
  } else if (pose.grounding.type === 'back') {
    const reference = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (reference) addTarget(reference, pose.grounding.contactOffset * modelScaleInActor)
  } else if (pose.grounding.type === 'feet') {
    const reference = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (reference) addTarget(reference, 0)
  } else {
    const reference = model.getObjectByName(report.joints[pose.grounding.referenceJoint]?.bone ?? '')
    if (reference) addTarget(reference, 0)
  }
  return contact
}

function mergeCalibrationPose(generated: PoseDefinition, source: PoseDefinition | undefined, edited: PoseDefinition): PoseDefinition {
  if (!source) return edited
  const bones = { ...generated.bones }
  Object.entries(edited.bones).forEach(([joint, transform]) => {
    const sourceTransform = source.bones[joint as keyof typeof source.bones]
    if (JSON.stringify(transform) !== JSON.stringify(sourceTransform)) {
      bones[joint as keyof typeof bones] = transform
    }
  })
  return {
    ...generated,
    bones,
    ...(edited.rootOffset ? { rootOffset: edited.rootOffset } : {}),
    ...(edited.rootRotationQuaternion && JSON.stringify(edited.rootRotationQuaternion) !== JSON.stringify(source.rootRotationQuaternion)
      ? { rootRotationQuaternion: edited.rootRotationQuaternion }
      : {}),
  }
}
