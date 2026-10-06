import * as THREE from 'three'
import type { PropDocument } from '../core/sceneDocument'
import { classifyWheelInput } from '../runtime/inputNormalization'
import { stageMovedBeyondThreshold, stageNdcFromEvent, stagePointerDeltaAlongAxis, stageProjectWorldAxisToScreen, stageToolForKey, stageWorldUnitsPerPixelAlongAxis, stageZoomDistance, type StageCanvasRect, type StagePointerMode, type StageTool } from './stageEngineMath'
import { scaleFromPointer, type ScaleAxis } from './stageEngineScaleMath'

const MAX_PIXEL_RATIO = 2
const SELECTION_COLOR = '#f0a032'
const GIZMO_HOVER_COLOR = 0xffe066
const GIZMO_AXIS_COLORS = { x: 0xe5484d, y: 0x62d16e, z: 0x4d8ff0 } as const

type AxisName = keyof typeof GIZMO_AXIS_COLORS

export type StageEntityType = 'Prop' | 'Actor' | 'Camera' | 'Wall' | 'Opening' | 'Sun'

export type StageEntity = {
  id: string
  name: string
  type: StageEntityType
  root: THREE.Group
  mesh?: THREE.Mesh
  material?: THREE.MeshStandardMaterial
  setSelected?: (selected: boolean) => void
  setSnapPreview?: (active: boolean) => void
  dispose?: () => void
  transformable?: boolean
  scalable?: boolean
}

export type StagePropDefinition = Pick<PropDocument, 'id' | 'name' | 'shape' | 'position' | 'rotation' | 'primaryColor' | 'scale'>

export type StageTransform = {
  entityId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: [number, number, number]
}

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
  transformStarted: boolean
  mode: Exclude<StagePointerMode, 'idle'>
  entity: StageEntity | null
  handle: StageGizmoHandle | null
  origin: THREE.Vector3 | null
  axis: THREE.Vector3 | null
  plane: THREE.Plane | null
  startPoint: THREE.Vector3 | null
  startPosition: THREE.Vector3 | null
  startScale: THREE.Vector3 | null
  startQuaternion: THREE.Quaternion | null
  startAngle: number | null
  verticalMove: boolean
  gizmoScale: number | null
  screenAxis: THREE.Vector2 | null
  worldUnitsPerPixel: number | null
}

export type StageEngineDebugSnapshot = {
  tool: StageTool
  pointerMode: StagePointerMode
  ndc: string
  rayHits: string
  selectedId: string
  axisDrag: StageAxisDragDebug | null
  scaleDrag?: StageScaleDragDebug | null
}

export type StageEngineOptions = {
  onToolChanged?: (tool: StageTool) => void
  onTransformStart?: (change: StageTransform) => void
  onTransformEnd?: (change: StageTransform) => void
  onTransformPreview?: (change: StageTransform) => void
  onDebug?: (snapshot: StageEngineDebugSnapshot) => void
  debugEnabled?: boolean
}

type SelectionListener = (entityId: string | null) => void

export class StageEngine {
  readonly canvas: HTMLCanvasElement

  private readonly container: HTMLElement
  private readonly scene: THREE.Scene
  private readonly editorCamera: THREE.PerspectiveCamera
  private readonly renderer: THREE.WebGLRenderer
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
  private readonly orbit = { radius: 15, theta: 0.62, phi: 1.13 }
  private readonly options: StageEngineOptions
  private readonly debugEnabled: boolean
  private selectionListener: SelectionListener | null = null
  private frameRequest: number | null = null
  private resizeObserver: ResizeObserver | null = null
  private disposed = false
  private selectedId: string | null = null
  private tool: StageTool = 'select'
  private drag: StageDrag | null = null
  private hoverHandle: StageGizmoHandle | null = null
  private pointerMode: StagePointerMode = 'idle'
  private lastNdc = '—'
  private lastRayHits = '—'
  private lastAxisDragDebug: StageAxisDragDebug | null = null
  private lastScaleDragDebug: StageScaleDragDebug | null = null

  constructor(container: HTMLElement, options: StageEngineOptions = {}) {
    this.container = container
    this.options = options
    this.debugEnabled = options.debugEnabled ?? false
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#d9deef')
    this.editorCamera = new THREE.PerspectiveCamera(45, 1, 0.05, 500)
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'v2-stage-canvas'
    this.canvas.setAttribute('aria-label', 'V2 Blocking Stage')
    this.canvas.dataset.stageOwnership = 'v2-stage-engine'
    this.canvas.tabIndex = 0
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setClearColor('#d9deef', 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.canvas)

    this.createStageEnvironment()
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

  addEntity(entity: { id: string; type: StageEntityType; root: THREE.Group; name?: string; setSelected?: (selected: boolean) => void; setSnapPreview?: (active: boolean) => void; dispose?: () => void; transformable?: boolean; scalable?: boolean }): void {
    this.removeEntity(entity.id)
    const registered: StageEntity = { ...entity, name: entity.name ?? entity.id }
    registered.root.userData.entityId = registered.id
    this.entities.set(entity.id, registered)
    this.selectableRoots.push(entity.root)
    this.scene.add(entity.root)
    this.updateGizmo()
    this.requestRender()
  }

  removeEntity(entityId: string): void {
    const entity = this.entities.get(entityId)
    if (!entity) return
    if (this.selectedId === entityId) this.select(null)
    entity.root.removeFromParent()
    entity.dispose?.()
    this.entities.delete(entityId)
    this.selectableRoots.splice(0, this.selectableRoots.length, ...this.selectableRoots.filter((root) => root !== entity.root))
    this.requestRender()
  }

  setSelected(entityId: string | null): void {
    this.select(entityId)
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
    entity.root.position.set(...transform.position)
    entity.root.rotation.set(...transform.rotation)
    if (transform.scale) entity.root.scale.set(...transform.scale)
    if (entity.type === 'Actor') entity.root.position.y = 0
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
    this.editorCamera.aspect = width / height
    this.editorCamera.updateProjectionMatrix()
    this.applyViewCamera()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frameRequest !== null) window.cancelAnimationFrame(this.frameRequest)
    this.resizeObserver?.disconnect()
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleWindowResize)
    this.removeInput()
    this.entities.forEach((entity) => entity.dispose?.())
    this.resources.forEach((resource) => resource.dispose())
    this.renderer.dispose()
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
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false })
    window.addEventListener('keydown', this.handleKeyDown)
  }

  private removeInput(): void {
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu)
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown)
    this.canvas.removeEventListener('pointermove', this.handlePointerMove)
    this.canvas.removeEventListener('pointerup', this.handlePointerUp)
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.handlePointerCancel)
    this.canvas.removeEventListener('wheel', this.handleWheel)
    window.removeEventListener('keydown', this.handleKeyDown)
  }

  private readonly handleContextMenu = (event: MouseEvent) => event.preventDefault()

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
      startAngle: null,
      verticalMove: event.shiftKey,
      gizmoScale: null,
      screenAxis: null,
      worldUnitsPerPixel: null,
    }

    if (event.button === 2 || event.button === 1 || (event.button === 0 && event.altKey && event.shiftKey)) {
      this.drag = { ...base, mode: 'pan' }
      this.pointerMode = 'pan'
    } else {
      const gizmoHandle = event.button === 0 ? this.pickGizmo(event) : null
      if (gizmoHandle && this.selectedEntity && this.selectedEntity.transformable !== false && this.tool !== 'select' && (this.tool !== 'scale' || this.selectedEntity.scalable === true)) {
        this.drag = this.beginGizmoDrag(event, base, gizmoHandle)
        this.pointerMode = 'gizmo'
      } else {
        const hit = event.button === 0 ? this.pick(event) : null
        if (hit && this.tool === 'move' && hit.transformable !== false) {
          this.select(hit.id)
          this.drag = this.beginDirectMove(event, base, hit)
          this.pointerMode = 'move'
        } else {
          this.drag = { ...base, mode: 'orbit' }
          this.pointerMode = 'orbit'
        }
      }
    }
    event.preventDefault()
    this.emitDebug()
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    const drag = this.drag
    if (this.disposed || !drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.lastX
    const deltaY = event.clientY - drag.lastY
    if (!drag.moved && !stageMovedBeyondThreshold(drag.startX, drag.startY, event.clientX, event.clientY)) return
    drag.moved = true
    drag.lastX = event.clientX
    drag.lastY = event.clientY

    if ((drag.mode === 'move' || drag.mode === 'gizmo') && drag.entity && !drag.transformStarted) {
      this.beginTransform(drag.entity)
      drag.transformStarted = true
    }

    if (drag.mode === 'orbit') {
      this.orbit.theta -= deltaX * 0.006
      this.orbit.phi = THREE.MathUtils.clamp(this.orbit.phi - deltaY * 0.006, 0.05, 3.1)
      this.applyViewCamera()
    } else if (drag.mode === 'pan') {
      this.pan(deltaX, deltaY)
    } else if (drag.mode === 'move') {
      this.applyDirectMove(event, drag)
    } else {
      this.applyGizmoDrag(event, drag)
    }
    if (drag.transformStarted && drag.entity) this.options.onTransformPreview?.(this.transformSnapshot(drag.entity))
    event.preventDefault()
    this.emitDebug()
    this.requestRender()
  }

  private readonly handlePointerUp = (event: PointerEvent) => {
    if (this.disposed || !this.drag || this.drag.pointerId !== event.pointerId) return
    const drag = this.drag
    if (!drag.moved && drag.button === 0 && drag.mode !== 'gizmo') {
      const hit = this.pick(event)
      this.select(hit?.id ?? null)
    }
    if (drag.moved && drag.transformStarted && (drag.mode === 'move' || drag.mode === 'gizmo') && drag.entity) {
      this.endTransform(drag.entity)
      this.updateGizmo()
      this.requestRender()
    }
    this.releasePointer(event.pointerId)
    event.preventDefault()
    this.emitDebug(true)
  }

  private readonly handlePointerCancel = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return
    this.releasePointer(event.pointerId)
    this.emitDebug()
  }

  private readonly handleWheel = (event: WheelEvent) => {
    if (this.disposed) return
    const input = classifyWheelInput(event)
    if (input === 'trackpad-pan') this.pan(event.deltaX, event.deltaY)
    else this.orbit.radius = stageZoomDistance(this.orbit.radius, event.deltaY)
    this.applyViewCamera()
    event.preventDefault()
    this.emitDebug()
    this.requestRender()
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.isTypingTarget(event.target)) return
    const tool = stageToolForKey(event.key)
    if (tool) {
      this.setTool(tool)
      event.preventDefault()
      return
    }
    if (event.key.toLowerCase() === 'f') {
      this.frameSelected()
      event.preventDefault()
    } else if (event.key === 'Home' || event.key.toLowerCase() === 'h') {
      this.orbitTarget.set(0, 1, 0)
      this.orbit.radius = 15
      this.orbit.theta = 0.62
      this.orbit.phi = 1.13
      this.applyViewCamera()
      event.preventDefault()
    }
    this.emitDebug()
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable
  }

  private releasePointer(pointerId: number): void {
    if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId)
    this.drag = null
    this.pointerMode = 'idle'
    this.setHover(null)
  }

  private get selectedEntity(): StageEntity | null {
    return this.selectedId ? this.entities.get(this.selectedId) ?? null : null
  }

  private select(entityId: string | null): void {
    if (entityId !== null && !this.entities.has(entityId)) entityId = null
    this.selectedId = entityId
    this.entities.forEach((entity) => {
      entity.setSelected?.(entity.id === entityId)
      entity.material?.emissive.set(entity.id === entityId ? SELECTION_COLOR : '#000000')
      if (entity.material) entity.material.emissiveIntensity = entity.id === entityId ? 0.35 : 0
      entity.root.userData.stageSelected = entity.id === entityId
      entity.root.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material.emissive.set(entity.id === entityId ? SELECTION_COLOR : '#000000')
          object.material.emissiveIntensity = entity.id === entityId ? 0.35 : 0
        }
      })
    })
    this.selectedEntity?.root.updateMatrixWorld(true)
    this.updateGizmo()
    this.selectionListener?.(entityId)
    this.emitDebug()
    this.requestRender()
  }

  private beginTransform(entity: StageEntity): void {
    this.options.onTransformStart?.(this.transformSnapshot(entity))
  }

  private endTransform(entity: StageEntity): void {
    this.options.onTransformEnd?.(this.transformSnapshot(entity))
  }

  private transformSnapshot(entity: StageEntity): StageTransform {
    return {
      entityId: entity.id,
      position: [entity.root.position.x, entity.root.position.y, entity.root.position.z],
      rotation: [entity.root.rotation.x, entity.root.rotation.y, entity.root.rotation.z],
      scale: [entity.root.scale.x, entity.root.scale.y, entity.root.scale.z],
    }
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

  private pick(event: PointerEvent): StageEntity | null {
    const raycaster = this.pointerRay(event)
    const hits = raycaster.intersectObjects(this.selectableRoots, true)
    this.lastRayHits = String(hits.length)
    const hit = hits[0]
    if (!hit) return null
    let current: THREE.Object3D | null = hit.object
    while (current && !this.selectableRoots.includes(current as THREE.Group)) current = current.parent
    return current ? this.entities.get(current.userData.entityId as string) ?? null : null
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
    const hit = this.pointerRay(event).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -entity.root.position.y), new THREE.Vector3())
    const startPoint = hit ?? entity.root.position.clone()
    return { ...base, mode: 'move', entity, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -startPoint.y), startPoint, startPosition: entity.root.position.clone(), gizmoScale: this.gizmoScale(entity.root.position) }
  }

  private beginGizmoDrag(event: PointerEvent, base: Omit<StageDrag, 'mode'>, handle: StageGizmoHandle): StageDrag {
    const entity = this.selectedEntity
    if (!entity) return { ...base, mode: 'orbit' }
    const origin = this.gizmoRoot.position.clone()
    const axis = handle.axis ? new THREE.Vector3(handle.axis === 'x' ? 1 : 0, handle.axis === 'y' ? 1 : 0, handle.axis === 'z' ? 1 : 0) : null
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
      plane,
      startPoint,
      startPosition: entity.root.position.clone(),
      startScale: entity.root.scale.clone(),
      startQuaternion: entity.root.quaternion.clone(),
      startAngle: handle.mode === 'rotate' && axis ? this.ringAngle(event, origin, axis) : null,
      gizmoScale: this.gizmoScale(entity.root.position),
      screenAxis,
      worldUnitsPerPixel,
    }
  }

  private applyDirectMove(event: PointerEvent, drag: StageDrag): void {
    if (!drag.entity || !drag.plane || !drag.startPoint || !drag.startPosition) return
    const point = this.pointerRay(event).ray.intersectPlane(drag.plane, new THREE.Vector3())
    if (!point) return
    const delta = point.sub(drag.startPoint)
    if (!drag.verticalMove) delta.y = 0
    else { delta.x = 0; delta.z = 0 }
    drag.entity.root.position.copy(drag.startPosition).add(delta)
    if (drag.entity.type === 'Actor' && !drag.verticalMove) drag.entity.root.position.y = 0
    this.updateGizmo(drag)
  }

  private applyGizmoDrag(event: PointerEvent, drag: StageDrag): void {
    if (!drag.entity || !drag.handle || !drag.origin) return
    if (drag.handle.mode === 'scale') {
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
      drag.entity.root.quaternion.copy(drag.startQuaternion)
      drag.entity.root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(drag.axis, delta))
    } else {
      if (!drag.startPosition) return
      if (drag.handle.kind === 'plane') {
        if (!drag.plane || !drag.startPoint) return
        const point = this.pointerRay(event, false).ray.intersectPlane(drag.plane, new THREE.Vector3())
        if (!point) return
        const delta = point.sub(drag.startPoint)
        delta.y = 0
        drag.entity.root.position.copy(drag.startPosition).add(delta)
      } else if (drag.axis && drag.screenAxis && drag.worldUnitsPerPixel !== null) {
        const pointerDeltaX = event.clientX - drag.startX
        const pointerDeltaY = event.clientY - drag.startY
        const pixelsAlongAxis = stagePointerDeltaAlongAxis(drag.startX, drag.startY, event.clientX, event.clientY, drag.screenAxis)
        const worldDistance = pixelsAlongAxis * drag.worldUnitsPerPixel
        drag.entity.root.position.copy(drag.startPosition).addScaledVector(drag.axis, worldDistance)
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
      if (drag.entity.type === 'Actor') drag.entity.root.position.y = 0
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
    const scale = this.orbit.radius * 0.0014
    this.orbitTarget.addScaledVector(right, -deltaX * scale)
    this.orbitTarget.addScaledVector(up, deltaY * scale)
    this.applyViewCamera()
  }

  private applyViewCamera(): void {
    const { radius, theta, phi } = this.orbit
    this.editorCamera.position.set(
      this.orbitTarget.x + radius * Math.sin(phi) * Math.sin(theta),
      this.orbitTarget.y + radius * Math.cos(phi),
      this.orbitTarget.z + radius * Math.sin(phi) * Math.cos(theta),
    )
    this.editorCamera.lookAt(this.orbitTarget)
    this.editorCamera.updateMatrixWorld(true)
    this.updateGizmo()
    this.requestRender()
  }

  private frameSelected(): void {
    const entity = this.selectedEntity
    if (!entity) return
    const bounds = new THREE.Box3().setFromObject(entity.root)
    const center = bounds.getCenter(new THREE.Vector3())
    const size = bounds.getSize(new THREE.Vector3()).length()
    this.orbitTarget.copy(center)
    this.orbit.radius = Math.max(2.5, size * 1.8)
    this.applyViewCamera()
  }

  private gizmoScale(position: THREE.Vector3): number {
    return this.editorCamera.position.distanceTo(position) * Math.tan(THREE.MathUtils.degToRad(this.editorCamera.fov) / 2) * 0.3
  }

  private updateGizmo(drag: StageDrag | null = null): void {
    const entity = this.selectedEntity
    const activeTransform = !!drag?.moved && (drag.mode === 'move' || drag.mode === 'gizmo')
    const visible = !!entity && this.tool !== 'select'
    if (!activeTransform) {
      this.gizmoRoot.visible = visible
      this.gizmoMove.visible = visible && this.tool === 'move'
      this.gizmoRotate.visible = visible && this.tool === 'rotate'
      this.gizmoScaleHandles.visible = visible && this.tool === 'scale' && entity?.scalable === true
      this.gizmoHandles.forEach(({ pick, handle }) => {
        const actorYMove = entity?.type === 'Actor' && this.tool === 'move' && handle.axis === 'y'
        const actorZRotate = entity?.type === 'Actor' && this.tool === 'rotate' && handle.axis === 'z'
        const axisVisible = !((handle.mode === 'move' || handle.mode === 'scale') && handle.kind === 'axis' && handle.axis) || !!stageProjectWorldAxisToScreen(
          this.editorCamera,
          entity?.root.position ?? new THREE.Vector3(),
          new THREE.Vector3(handle.axis === 'x' ? 1 : 0, handle.axis === 'y' ? 1 : 0, handle.axis === 'z' ? 1 : 0),
          this.getCanvasRect(),
        )
        const handleVisible = !actorYMove && !actorZRotate && axisVisible && (handle.mode !== 'scale' || (this.tool === 'scale' && entity?.scalable === true))
        pick.visible = handleVisible
        handle.visible.forEach((mesh) => { mesh.visible = handleVisible })
      })
    }
    if (!entity) return
    this.gizmoRoot.position.copy(entity.root.position)
    this.gizmoRoot.quaternion.identity()
    this.gizmoRoot.scale.setScalar(activeTransform && drag?.gizmoScale !== null ? drag.gizmoScale : this.gizmoScale(entity.root.position))
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

  private emitDebug(force = false): void {
    const drag = this.drag
    if (!force && !this.debugEnabled && drag?.moved && (drag.mode === 'move' || drag.mode === 'gizmo')) return
    this.options.onDebug?.({
      tool: this.tool,
      pointerMode: this.pointerMode,
      ndc: this.lastNdc,
      rayHits: this.lastRayHits,
      selectedId: this.selectedId ?? 'NONE',
      axisDrag: this.lastAxisDragDebug ? { ...this.lastAxisDragDebug, resultPosition: [...this.lastAxisDragDebug.resultPosition] } : null,
      scaleDrag: this.lastScaleDragDebug ? { ...this.lastScaleDragDebug, startScale: [...this.lastScaleDragDebug.startScale], resultScale: [...this.lastScaleDragDebug.resultScale] } : null,
    })
  }

  requestRender(): void {
    if (this.disposed || this.frameRequest !== null) return
    this.frameRequest = window.requestAnimationFrame(() => {
      this.frameRequest = null
      this.renderer.render(this.scene, this.editorCamera)
    })
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
