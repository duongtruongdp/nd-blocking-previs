import * as THREE from 'three'
import type { ActorVector3 } from '../core/sceneDocument'
import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS, WALL_GRID_INTERVAL, snapAngle45, wallFromEndpoints } from './wallMath'
import type { StageEngine } from '../stage-engine'

export type WallDrawingState = {
  active: boolean
  start: ActorVector3 | null
  end: ActorVector3 | null
  length: number
}

type WallDrawingOptions = {
  onCommit: (start: ActorVector3, end: ActorVector3) => void
  onState: (state: WallDrawingState) => void
  onExit: () => void
}

export class WallDrawingController {
  private readonly engine: StageEngine
  private readonly options: WallDrawingOptions
  private readonly previewRoot = new THREE.Group()
  private readonly previewMaterial = new THREE.MeshBasicMaterial({ color: '#c28b42', transparent: true, opacity: 0.45, depthTest: false })
  private readonly previewGeometry = new THREE.BoxGeometry(1, DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS)
  private readonly previewMesh = new THREE.Mesh(this.previewGeometry, this.previewMaterial)
  private readonly startMarker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.previewMaterial)
  private active = false
  private pointerId: number | null = null
  private start: ActorVector3 | null = null

  constructor(engine: StageEngine, options: WallDrawingOptions) {
    this.engine = engine
    this.options = options
    this.previewRoot.name = 'Wall drawing preview'
    this.previewRoot.renderOrder = 998
    this.previewRoot.add(this.previewMesh, this.startMarker)
    this.previewMesh.visible = false
    this.startMarker.visible = false
    engine.addOverlay(this.previewRoot)
    engine.canvas.addEventListener('pointerdown', this.handlePointerDown, true)
    engine.canvas.addEventListener('pointermove', this.handlePointerMove, true)
    engine.canvas.addEventListener('pointerup', this.handlePointerUp, true)
    engine.canvas.addEventListener('pointercancel', this.handlePointerCancel, true)
    window.addEventListener('keydown', this.handleKeyDown, true)
  }

  setActive(active: boolean): void {
    if (this.active === active) return
    this.active = active
    this.engine.canvas.style.cursor = active ? 'crosshair' : ''
    if (!active) this.cancel()
    this.emitState(null)
  }

  dispose(): void {
    this.setActive(false)
    this.engine.canvas.removeEventListener('pointerdown', this.handlePointerDown, true)
    this.engine.canvas.removeEventListener('pointermove', this.handlePointerMove, true)
    this.engine.canvas.removeEventListener('pointerup', this.handlePointerUp, true)
    this.engine.canvas.removeEventListener('pointercancel', this.handlePointerCancel, true)
    window.removeEventListener('keydown', this.handleKeyDown, true)
    this.engine.removeOverlay(this.previewRoot)
    this.previewGeometry.dispose()
    this.previewMaterial.dispose()
    this.startMarker.geometry.dispose()
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.active || event.button !== 0) return
    const point = this.engine.groundPointFromClient(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.pointerId = event.pointerId
    this.engine.canvas.setPointerCapture(event.pointerId)
    if (!this.start) {
      this.start = this.snapPoint(point, event)
      this.startMarker.position.set(...this.start)
      this.startMarker.visible = true
      this.emitState(null)
      return
    }
    const end = this.snapPoint(point, event)
    if (Math.hypot(end[0] - this.start[0], end[2] - this.start[2]) < 0.05) return
    const start = this.start
    this.options.onCommit(start, end)
    this.start = end
    this.startMarker.position.set(...end)
    this.emitState(end)
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.active || !this.start || (this.pointerId !== null && this.pointerId !== event.pointerId)) return
    const point = this.engine.groundPointFromClient(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.updatePreview(this.snapPoint(point, event))
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopImmediatePropagation()
    this.pointerId = null
  }

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return
    this.pointerId = null
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.active) return
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.cancel()
      this.options.onExit()
    }
  }

  private snapPoint(point: ActorVector3, event: PointerEvent): ActorVector3 {
    if (event.shiftKey && this.start) return snapAngle45(this.start, point)
    if (event.ctrlKey || event.metaKey) return point.map((value, index) => index === 1 ? 0 : Math.round(value / WALL_GRID_INTERVAL) * WALL_GRID_INTERVAL) as ActorVector3
    return point
  }

  private updatePreview(end: ActorVector3 | null): void {
    if (!this.start || !end) return
    const geometry = wallFromEndpoints(this.start, end)
    this.previewRoot.position.set(...geometry.center)
    this.previewRoot.rotation.set(0, geometry.heading, 0)
    this.previewMesh.scale.set(Math.max(0.001, geometry.length), 1, 1)
    this.previewMesh.visible = true
    this.emitState(end)
    this.engine.requestRender()
  }

  private emitState(end: ActorVector3 | null): void {
    this.options.onState({ active: this.active, start: this.start ? [...this.start] : null, end: end ? [...end] : null, length: this.start && end ? Math.hypot(end[0] - this.start[0], end[2] - this.start[2]) : 0 })
  }

  private cancel(): void {
    this.start = null
    this.pointerId = null
    this.previewMesh.visible = false
    this.startMarker.visible = false
    this.engine.requestRender()
    this.emitState(null)
  }
}
