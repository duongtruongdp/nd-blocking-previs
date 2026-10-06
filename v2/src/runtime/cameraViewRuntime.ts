import * as THREE from 'three'
import type { ActorDocument, CameraDocument, PropDocument } from '../core/sceneDocument'
import { cameraProjectionForDocument, letterboxRect } from './cameraMath'
import { ProceduralActorRuntime } from './actor/proceduralActor'
import { ProceduralCameraRuntime } from './cameraRuntime'
import { createV2TestGeometry } from '../scene/testEntities'

const MAX_PIXEL_RATIO = 2

type PropRuntime = {
  root: THREE.Group
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
}

/**
 * Read-only render adapter for Camera View.
 *
 * It deliberately owns a separate renderer and scene so the StageEngine editor
 * camera, navigation state, picking, and transform interaction remain untouched.
 */
export class CameraViewRuntime {
  readonly canvas = document.createElement('canvas')
  private readonly container: HTMLElement
  private readonly scene = new THREE.Scene()
  private readonly renderer: THREE.WebGLRenderer
  private readonly actorRuntimes = new Map<string, ProceduralActorRuntime>()
  private readonly propRuntimes = new Map<string, PropRuntime>()
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = []
  private readonly resizeObserver: ResizeObserver | null
  private cameraRuntime: ProceduralCameraRuntime | null = null
  private captureAspect = 16 / 9
  private visible = false
  private disposed = false

  constructor(container: HTMLElement) {
    this.container = container
    this.canvas.className = 'v2-camera-view-canvas'
    this.canvas.setAttribute('aria-label', 'Camera View')
    this.canvas.dataset.stageOwnership = 'v2-camera-view'
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setClearColor('#111721', 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.canvas)
    this.createEnvironment()

    const ResizeObserverClass = window.ResizeObserver
    if (ResizeObserverClass) {
      this.resizeObserver = new ResizeObserverClass(() => this.resize())
      this.resizeObserver.observe(container)
    } else {
      this.resizeObserver = null
      window.addEventListener('resize', this.handleWindowResize)
    }
    this.resize()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.canvas.style.display = visible ? 'block' : 'none'
    if (visible) this.render()
  }

  setDocuments(actors: readonly ActorDocument[], props: readonly PropDocument[], camera: CameraDocument | null): void {
    if (this.disposed) return
    this.syncActors(actors)
    this.syncProps(props)
    this.syncCamera(camera)
    if (this.visible) this.render()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.resizeObserver?.disconnect()
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleWindowResize)
    this.actorRuntimes.forEach((runtime) => runtime.dispose())
    this.propRuntimes.forEach((runtime) => runtime.material.dispose())
    this.propRuntimes.forEach((runtime) => runtime.geometry.dispose())
    this.cameraRuntime?.dispose()
    this.resources.forEach((resource) => resource.dispose())
    this.renderer.dispose()
    this.canvas.remove()
  }

  private readonly handleWindowResize = () => this.resize()

  private syncActors(actors: readonly ActorDocument[]): void {
    const ids = new Set(actors.map((actor) => actor.id))
    Array.from(this.actorRuntimes.entries()).forEach(([id, runtime]) => {
      if (ids.has(id)) return
      runtime.dispose()
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
    })
  }

  private syncProps(props: readonly PropDocument[]): void {
    const ids = new Set(props.map((prop) => prop.id))
    Array.from(this.propRuntimes.entries()).forEach(([id, runtime]) => {
      if (ids.has(id)) return
      runtime.root.removeFromParent()
      runtime.geometry.dispose()
      runtime.material.dispose()
      this.propRuntimes.delete(id)
    })
    props.forEach((prop) => {
      const existing = this.propRuntimes.get(prop.id)
      if (existing) {
        existing.root.position.set(...prop.position)
        existing.root.rotation.set(...prop.rotation)
        return
      }
      const root = new THREE.Group()
      root.name = `${prop.name} Camera View`
      root.position.set(...prop.position)
      root.rotation.set(...prop.rotation)
      const geometry = createV2TestGeometry(prop.shape)
      const material = new THREE.MeshStandardMaterial({ color: prop.primaryColor, roughness: 0.78, metalness: 0.04 })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      root.add(mesh)
      this.propRuntimes.set(prop.id, { root, geometry, material })
      this.scene.add(root)
    })
  }

  private syncCamera(camera: CameraDocument | null): void {
    if (!camera) {
      this.cameraRuntime?.dispose()
      this.cameraRuntime = null
      return
    }
    if (!this.cameraRuntime) this.cameraRuntime = new ProceduralCameraRuntime(camera)
    this.cameraRuntime.applyDocument(camera)
    this.captureAspect = cameraProjectionForDocument(camera)?.displayAspect ?? this.captureAspect
  }

  private createEnvironment(): void {
    this.scene.background = new THREE.Color('#111721')
    const groundGeometry = new THREE.PlaneGeometry(24, 24)
    const groundMaterial = new THREE.MeshStandardMaterial({ color: '#9ca5b6', roughness: 0.9, metalness: 0 })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)
    this.resources.push(groundGeometry, groundMaterial)

    const hemisphere = new THREE.HemisphereLight('#f3f5ff', '#5e6677', 1.8)
    this.scene.add(hemisphere)
    const key = new THREE.DirectionalLight('#fff5df', 2.4)
    key.position.set(4, 7, 5)
    key.castShadow = true
    this.scene.add(key)
  }

  private resize(): void {
    if (this.disposed) return
    const rect = this.container.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    this.renderer.setSize(width, height, false)
    if (this.visible) this.render()
  }

  private render(): void {
    if (this.disposed || !this.visible || !this.cameraRuntime) return
    const camera = this.cameraRuntime.productionCamera
    const rect = this.container.getBoundingClientRect()
    const frame = letterboxRect(Math.max(1, rect.width), Math.max(1, rect.height), this.captureAspect)
    this.cameraRuntime.root.updateMatrixWorld(true)
    this.scene.updateMatrixWorld(true)
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, Math.max(1, rect.width), Math.max(1, rect.height))
    this.renderer.clear()
    this.renderer.setScissorTest(true)
    this.renderer.setScissor(frame.x, Math.max(0, rect.height - frame.y - frame.height), frame.width, frame.height)
    this.renderer.setViewport(frame.x, Math.max(0, rect.height - frame.y - frame.height), frame.width, frame.height)
    this.renderer.render(this.scene, camera)
    this.renderer.setScissorTest(false)
  }
}
