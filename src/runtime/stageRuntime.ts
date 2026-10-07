import * as THREE from 'three'
import type { ActorDocument, PropDocument } from '../core/sceneDocument'
import { ProceduralActorRuntime } from './actor/proceduralActor'
import { V2TestEntities, createV2TestGeometry } from '../scene/testEntities'
import {
  applyV2NavigationState,
  createV2NavigationState,
  framingDistanceForV2Bounds,
  orbitV2Navigation,
  panV2Navigation,
  resetV2Navigation,
  synchronizeV2StageMatrices,
  type V2NavigationState,
  zoomV2Navigation,
} from './navigationState'
import { v2ToolForShortcut } from './interactionMath'

const MAX_PIXEL_RATIO = 2
const SELECTION_COLOR = '#f0b866'

type V2DragMode = 'orbit' | 'pan'

type V2Drag = {
  mode: V2DragMode
  pointerId: number
  button: number
  lastX: number
  lastY: number
  startX: number
  startY: number
  moved: boolean
}

export type V2StageDebugSnapshot = {
  pointerUpReceived: string
  canvasRect: string
  ndc: string
  rayHitCount: string
  nearestObject: string
  selectedId: string
}

export type V2TransformTool = 'select' | 'move' | 'rotate'
export type V2StageView = 'blocking' | 'camera'

export type V2TransformEvent = V2TransformEnd & {
  phase: 'transformStart' | 'transformChange' | 'transformEnd'
}

export type V2TransformEnd = {
  entityId: string
  position: [number, number, number]
  rotation: [number, number, number]
}

export type V2StageRuntimeOptions = {
  selectedEntityId?: string | null
  actors?: readonly ActorDocument[]
  props?: readonly PropDocument[]
  tool?: V2TransformTool
  onSelectionChange?: (entityId: string | null) => void
  onToolChange?: (tool: V2TransformTool) => void
  onTransformEvent?: (event: V2TransformEvent) => void
  onTransformEnd?: (change: V2TransformEnd) => void
  onRuntimeReconciled?: (change: V2TransformEnd) => void
  onDebug?: (snapshot: V2StageDebugSnapshot) => void
}

type V2RuntimeEntity = {
  id: string
  name: string
  type: 'Actor' | 'Prop' | 'Camera'
  root: THREE.Group
  setSelected: (selected: boolean) => void
  dispose: () => void
}

export class V2StageRuntime {
  private readonly container: HTMLElement
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly navigation: V2NavigationState
  private readonly resizeObserver: ResizeObserver | null
  private readonly options: V2StageRuntimeOptions
  private readonly raycaster = new THREE.Raycaster()
  private readonly entities = new Map<string, V2RuntimeEntity>()
  private readonly actorRuntimes = new Map<string, ProceduralActorRuntime>()
  private readonly selectable: THREE.Group[] = []
  private readonly selectableMeshes: THREE.Mesh[] = []
  private readonly stageResourceDisposers = new Set<() => void>()
  private frameRequest: number | null = null
  private disposed = false
  private selectedEntityId: string | null = null
  private drag: V2Drag | null = null
  private transformTool: V2TransformTool = 'select'
  private readonly interactionDebugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('interactionDebug') === '1'
  private lastPointerUpReceived = 'NO'
  private lastCanvasRect = '—'
  private lastNdc = '—'
  private lastRootHitCount = '—'
  private lastFlatHitCount = '—'
  private lastNearestObject = 'NONE'
  private lastSelectedId = 'NONE'

  constructor(container: HTMLElement, options: V2StageRuntimeOptions = {}) {
    this.container = container
    this.options = options
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#d9deef')
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    this.navigation = createV2NavigationState()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setClearColor('#d9deef', 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.className = 'v2-stage-canvas'
    this.renderer.domElement.setAttribute('aria-label', 'V2 Blocking Stage')
    this.renderer.domElement.dataset.stageOwnership = 'v2-runtime'
    this.renderer.domElement.tabIndex = 0
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu)
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove)
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp)
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerCancel)
    this.renderer.domElement.addEventListener('lostpointercapture', this.handlePointerCancel)
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false })
    window.addEventListener('keydown', this.handleKeyDown)
    container.appendChild(this.renderer.domElement)

    this.createStageEnvironment()
    this.createProps(options.props ?? V2TestEntities)
    this.setActors(options.actors ?? [])
    this.setTool(options.tool ?? 'select')
    this.applyNavigationState()
    this.setSelectedEntity(options.selectedEntityId ?? null)

    const ResizeObserverClass = window.ResizeObserver
    if (ResizeObserverClass) {
      this.resizeObserver = new ResizeObserverClass(() => this.updateSize())
      this.resizeObserver.observe(container)
    } else {
      this.resizeObserver = null
      window.addEventListener('resize', this.handleWindowResize)
    }

    this.updateSize()
    this.requestRender()
  }

  setSelectedEntity(entityId: string | null): void {
    if (entityId !== null && !this.entities.has(entityId)) return
    this.selectedEntityId = entityId
    this.entities.forEach((visual, id) => visual.setSelected(id === entityId))
    this.requestRender()
  }

  setTool(tool: V2TransformTool): void {
    this.transformTool = tool
    this.options.onToolChange?.(tool)
    this.requestRender()
  }

  setActors(actors: readonly ActorDocument[]): void {
    const actorIds = new Set(actors.map((actor) => actor.id))
    this.actorRuntimes.forEach((_, id) => {
      if (actorIds.has(id)) return
      const entity = this.entities.get(id)
      entity?.root.removeFromParent()
      entity?.dispose()
      this.entities.delete(id)
      this.actorRuntimes.delete(id)
    })
    actors.forEach((actor) => {
      const existing = this.actorRuntimes.get(actor.id)
      if (existing) {
        existing.applyDocument(actor)
        return
      }
      const runtime = new ProceduralActorRuntime(actor)
      this.actorRuntimes.set(actor.id, runtime)
      this.scene.add(runtime.root)
      this.entities.set(actor.id, {
        id: actor.id,
        name: actor.name,
        type: 'Actor',
        root: runtime.root,
        setSelected: (selected) => runtime.setSelected(selected),
        dispose: () => runtime.dispose(),
      })
    })
    this.setSelectedEntity(this.selectedEntityId)
    this.requestRender()
  }

  setProps(props: readonly PropDocument[]): void {
    const propIds = new Set(props.map((prop) => prop.id))
    Array.from(this.entities.entries()).forEach(([id, entity]) => {
      if (entity.type !== 'Prop' || propIds.has(id)) return
      entity.root.removeFromParent()
      entity.dispose()
      this.entities.delete(id)
      this.removePropFromPicking(id)
    })
    props.forEach((prop) => {
      const entity = this.entities.get(prop.id)
      if (entity?.type === 'Prop') {
        entity.root.position.set(...prop.position)
        entity.root.rotation.set(...prop.rotation)
        return
      }
      this.createPropRuntime(prop)
    })
    this.setSelectedEntity(this.selectedEntityId)
    this.requestRender()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest)
    this.resizeObserver?.disconnect()
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleWindowResize)
    const canvas = this.renderer.domElement
    canvas.removeEventListener('contextmenu', this.handleContextMenu)
    canvas.removeEventListener('pointerdown', this.handlePointerDown)
    canvas.removeEventListener('pointermove', this.handlePointerMove)
    canvas.removeEventListener('pointerup', this.handlePointerUp)
    canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    canvas.removeEventListener('lostpointercapture', this.handlePointerCancel)
    canvas.removeEventListener('wheel', this.handleWheel)
    window.removeEventListener('keydown', this.handleKeyDown)
    this.entities.forEach((entity) => entity.dispose())
    this.stageResourceDisposers.forEach((dispose) => dispose())
    this.renderer.dispose()
    canvas.remove()
  }

  private readonly handleWindowResize = () => this.updateSize()

  private readonly handleContextMenu = (event: MouseEvent) => event.preventDefault()

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (this.disposed || this.drag) return
    this.renderer.domElement.focus({ preventScroll: true })
    this.renderer.domElement.setPointerCapture(event.pointerId)

    const base = {
      pointerId: event.pointerId,
      button: event.button,
      lastX: event.clientX,
      lastY: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    } satisfies Omit<V2Drag, 'mode'>

    if (event.button === 2 || event.button === 1 || (event.button === 0 && event.altKey && event.shiftKey)) {
      this.drag = { ...base, mode: 'pan' }
    } else {
      this.drag = { ...base, mode: 'orbit' }
    }
    event.preventDefault()
    this.emitDebug(event, 'pointerdown')
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const drag = this.drag
    if (this.disposed || !drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3) return
    if (!drag.moved) drag.moved = true

    const deltaX = event.clientX - drag.lastX
    const deltaY = event.clientY - drag.lastY
    if (drag.mode === 'orbit') {
      orbitV2Navigation(this.navigation, deltaX, deltaY)
      this.applyNavigationState()
    } else {
      panV2Navigation(this.navigation, this.camera, deltaX, deltaY)
      this.applyNavigationState()
    }
    drag.lastX = event.clientX
    drag.lastY = event.clientY
    event.preventDefault()
    this.emitDebug(event, 'pointermove')
  }

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.disposed || !this.drag || this.drag.pointerId !== event.pointerId) return
    const drag = this.drag
    if (!drag.moved && drag.button === 0) this.commitSelection(this.pickProp(event))
    this.lastPointerUpReceived = 'YES'
    event.preventDefault()
    this.emitDebug(event, 'pointerup')
    this.releasePointer(event.pointerId)
  }

  private readonly handlePointerCancel = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return
    this.releasePointer(event.pointerId)
  }

  private readonly handleWheel = (event: WheelEvent) => {
    if (this.disposed) return
    zoomV2Navigation(this.navigation, event.deltaY)
    this.applyNavigationState()
    event.preventDefault()
    this.emitDebug(null, 'wheel')
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.isTypingTarget(event.target)) return
    const shortcut = event.key.toLowerCase()
    const tool = v2ToolForShortcut(shortcut)
    if (tool) {
      this.setTool(tool)
      event.preventDefault()
    } else if (shortcut === 'f') {
      if (this.selectedEntityId) this.frameSelection()
      event.preventDefault()
    } else if (event.key.toLowerCase() === 'h' || event.key === 'Home') {
      resetV2Navigation(this.navigation)
      this.applyNavigationState()
      event.preventDefault()
    }
    this.emitDebug(null, 'key')
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable
  }

  private releasePointer(pointerId: number): void {
    if (this.renderer.domElement.hasPointerCapture(pointerId)) this.renderer.domElement.releasePointerCapture(pointerId)
    this.drag = null
  }

  private commitSelection(entityId: string | null): void {
    this.setSelectedEntity(entityId)
    this.options.onSelectionChange?.(entityId)
  }

  private ndc(event: PointerEvent): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.lastCanvasRect = `${rect.left.toFixed(1)}, ${rect.top.toFixed(1)}, ${rect.width.toFixed(1)} × ${rect.height.toFixed(1)}`
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.lastNdc = `${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)}`
    return ndc
  }

  private pickProp(event: PointerEvent): string | null {
    this.scene.updateMatrixWorld(true)
    this.camera.updateMatrixWorld(true)
    const ndc = this.ndc(event)
    this.raycaster.setFromCamera(ndc, this.camera)

    const rootHits = this.raycaster.intersectObjects(this.selectable, true)
    this.lastRootHitCount = String(rootHits.length)
    const flatHits = this.raycaster.intersectObjects(this.selectableMeshes, false)
    this.lastFlatHitCount = String(flatHits.length)

    const hit = rootHits[0]
    this.lastNearestObject = hit?.object.name ?? 'NONE'
    if (!hit) {
      this.lastSelectedId = 'NONE'
      return null
    }

    let current: THREE.Object3D | null = hit.object
    while (current && !this.selectable.includes(current as THREE.Group)) current = current.parent
    const root = current as THREE.Group | null
    const entityId = root?.userData.entityId as string | undefined
    this.lastSelectedId = entityId ?? 'NONE'
    return entityId ?? null
  }

  private createStageEnvironment(): void {
    const groundGeometry = new THREE.PlaneGeometry(30, 30)
    const groundMaterial = new THREE.MeshStandardMaterial({ color: '#c5cbdd', roughness: 0.92, metalness: 0 })
    const ground = new THREE.Mesh(
      groundGeometry,
      groundMaterial,
    )
    ground.rotation.x = -Math.PI / 2
    ground.name = 'Stage Ground'
    this.scene.add(ground)
    this.stageResourceDisposers.add(() => {
      groundGeometry.dispose()
      groundMaterial.dispose()
    })

    const grid = new THREE.GridHelper(30, 30, '#aab2c8', '#c5cbdd')
    grid.position.y = 0.01
    grid.name = 'Stage Grid'
    this.scene.add(grid)
    this.stageResourceDisposers.add(() => {
      grid.geometry.dispose()
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
      materials.forEach((material) => material.dispose())
    })

    const key = new THREE.DirectionalLight('#ffffff', 2.1)
    key.position.set(5, 9, 6)
    this.scene.add(key)
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#8790a6', 1.15))
  }

  private createProps(props: readonly PropDocument[]): void {
    props.forEach((definition) => this.createPropRuntime(definition))
  }

  private createPropRuntime(definition: PropDocument): void {
    const root = new THREE.Group()
    root.name = definition.name
    root.userData.entityId = definition.id
    root.position.set(...definition.position)
    root.rotation.set(...definition.rotation)
    const material = new THREE.MeshStandardMaterial({ color: definition.primaryColor, roughness: 0.68, metalness: 0.04 })
    const mesh = new THREE.Mesh(createV2TestGeometry(definition.shape), material)
    mesh.name = definition.name
    mesh.userData.entityId = definition.id
    root.add(mesh)
    this.scene.add(root)
    let disposed = false
    this.entities.set(definition.id, {
      id: definition.id,
      name: definition.name,
      type: 'Prop',
      root,
      setSelected: (selected) => {
        material.emissive.set(selected ? SELECTION_COLOR : '#000000')
        material.emissiveIntensity = selected ? 0.42 : 0
      },
      dispose: () => {
        if (disposed) return
        disposed = true
        mesh.geometry.dispose()
        material.dispose()
      },
    })
    this.selectable.push(root)
    this.selectableMeshes.push(mesh)
  }

  private removePropFromPicking(entityId: string): void {
    this.selectable.splice(0, this.selectable.length, ...this.selectable.filter((root) => root.userData.entityId !== entityId))
    this.selectableMeshes.splice(0, this.selectableMeshes.length, ...this.selectableMeshes.filter((mesh) => mesh.userData.entityId !== entityId))
  }

  private applyNavigationState(): void {
    applyV2NavigationState(this.camera, this.navigation)
    synchronizeV2StageMatrices(this.scene, this.camera)
    this.requestRender()
  }

  private frameSelection(): void {
    const visual = this.selectedEntityId ? this.entities.get(this.selectedEntityId) : null
    if (!visual) return
    const bounds = new THREE.Box3().setFromObject(visual.root)
    this.navigation.target.copy(bounds.getCenter(new THREE.Vector3()))
    this.navigation.distance = framingDistanceForV2Bounds(bounds, this.camera)
    this.applyNavigationState()
  }

  private updateSize(): void {
    if (this.disposed) return
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.applyNavigationState()
  }

  private emitDebug(_event: PointerEvent | null, _move: string): void {
    if (!this.interactionDebugEnabled || !this.options.onDebug) return
    this.options.onDebug({
      pointerUpReceived: this.lastPointerUpReceived,
      canvasRect: this.lastCanvasRect,
      ndc: this.lastNdc,
      rayHitCount: `roots ${this.lastRootHitCount} · flat ${this.lastFlatHitCount}`,
      nearestObject: this.lastNearestObject,
      selectedId: this.selectedEntityId ?? this.lastSelectedId,
    })
  }

  private requestRender(): void {
    if (this.disposed || this.frameRequest !== null) return
    this.frameRequest = window.requestAnimationFrame(() => {
      this.frameRequest = null
      this.renderStage()
    })
  }

  private renderStage(): void {
    const width = this.renderer.domElement.width
    const height = this.renderer.domElement.height
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, width, height)
    this.renderer.setClearColor('#d9deef', 1)
    this.renderer.render(this.scene, this.camera)
  }

}
