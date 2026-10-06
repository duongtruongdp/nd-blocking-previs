import * as THREE from 'three'
import type { ActorDocument, CameraDocument, PropDocument, SceneDocument } from '../core/sceneDocument'
import { cameraProjectionForDocument } from '../runtime/cameraMath'
import { ProceduralActorRuntime } from '../runtime/actor/proceduralActor'
import { createV2TestGeometry } from '../scene/testEntities'
import { evaluateExportFrame } from './exportEvaluation'
import { centeredCrop, desqueezedCaptureAspect, dimensionsForDeliveryAspect, deliveryAspectForCamera } from './exportMath'
import type { VideoExportSettings } from './exportTypes'

type PropRuntime = {
  root: THREE.Group
  geometry: THREE.BufferGeometry
  material: THREE.MeshStandardMaterial
}

/**
 * Dedicated production render path for browser video export.
 * It intentionally has no editor camera, helpers, selection state, or DOM UI.
 */
export class VideoExportRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly sourceCanvas: HTMLCanvasElement
  private readonly sourceRenderer: THREE.WebGLRenderer
  private readonly outputContext: CanvasRenderingContext2D
  private readonly scene = new THREE.Scene()
  private readonly cameraMount = new THREE.Group()
  private readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 500)
  private readonly actorRuntimes = new Map<string, ProceduralActorRuntime>()
  private readonly propRuntimes = new Map<string, PropRuntime>()
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = []
  private readonly document: SceneDocument
  private readonly settings: VideoExportSettings
  private readonly sourceWidth: number
  private readonly sourceHeight: number
  private disposed = false

  constructor(sceneDocument: SceneDocument, settings: VideoExportSettings) {
    this.document = sceneDocument
    this.settings = settings
    this.canvas = window.document.createElement('canvas')
    const deliveryAspect = deliveryAspectForCamera(settings.deliveryAspectRatio, settings.cameraId, sceneDocument)
    const outputDimensions = dimensionsForDeliveryAspect(settings.width, deliveryAspect)
    this.canvas.width = outputDimensions.width
    this.canvas.height = outputDimensions.height
    const outputContext = this.canvas.getContext('2d')
    if (!outputContext) throw new Error('The browser could not create an export canvas.')
    this.outputContext = outputContext

    const captureAspect = desqueezedCaptureAspect(sceneDocument, settings.cameraId) ?? 16 / 9
    this.sourceWidth = outputDimensions.width
    this.sourceHeight = dimensionsForDeliveryAspect(outputDimensions.width, captureAspect).height
    this.sourceCanvas = window.document.createElement('canvas')
    this.sourceRenderer = new THREE.WebGLRenderer({ canvas: this.sourceCanvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.sourceRenderer.setPixelRatio(1)
    this.sourceRenderer.setSize(this.sourceWidth, this.sourceHeight, false)
    this.sourceRenderer.setClearColor('#111721', 1)
    this.sourceRenderer.outputColorSpace = THREE.SRGBColorSpace
    this.createEnvironment()
    this.cameraMount.add(this.camera)
    this.scene.add(this.cameraMount)
    this.syncActors(sceneDocument.actors)
    this.syncProps(sceneDocument.props)
  }

  renderFrame(frame: number): void {
    if (this.disposed) throw new Error('The export renderer has been disposed.')
    const cameraDocument = this.resolveCamera(frame)
    if (!cameraDocument) throw new Error('The active Camera is not available for export.')
    const evaluated = evaluateExportFrame(this.document, frame)
    this.document.actors.forEach((actor) => {
      const runtime = this.actorRuntimes.get(actor.id)
      if (runtime) runtime.applyDocument({ ...actor, ...(evaluated[actor.id] ?? {}) })
    })
    this.document.props.forEach((prop) => {
      const runtime = this.propRuntimes.get(prop.id)
      if (!runtime) return
      const evaluatedProp = evaluated[prop.id]
      runtime.root.position.set(...(evaluatedProp?.position ?? prop.position))
      runtime.root.rotation.set(...(evaluatedProp?.rotation ?? prop.rotation))
    })

    const projection = cameraProjectionForDocument(cameraDocument)
    if (!projection) throw new Error('The active Camera has no valid capture mode.')
    this.cameraMount.position.set(...cameraDocument.position)
    this.cameraMount.rotation.set(...cameraDocument.rotation)
    this.camera.aspect = projection.displayAspect
    this.camera.fov = projection.fov
    this.camera.updateProjectionMatrix()
    this.cameraMount.updateMatrixWorld(true)
    this.scene.updateMatrixWorld(true)
    this.sourceRenderer.setScissorTest(false)
    this.sourceRenderer.setViewport(0, 0, this.sourceWidth, this.sourceHeight)
    this.sourceRenderer.clear()
    this.sourceRenderer.render(this.scene, this.camera)

    const deliveryAspect = deliveryAspectForCamera(this.settings.deliveryAspectRatio, this.settings.cameraId, this.document)
    const crop = centeredCrop(this.sourceWidth, this.sourceHeight, deliveryAspect)
    this.outputContext.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.outputContext.drawImage(this.sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, this.canvas.width, this.canvas.height)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.actorRuntimes.forEach((runtime) => runtime.dispose())
    this.propRuntimes.forEach((runtime) => {
      runtime.geometry.dispose()
      runtime.material.dispose()
    })
    this.resources.forEach((resource) => resource.dispose())
    this.sourceRenderer.dispose()
    this.sourceCanvas.width = 0
    this.sourceCanvas.height = 0
    this.canvas.width = 0
    this.canvas.height = 0
  }

  private resolveCamera(frame: number): CameraDocument | null {
    const base = this.settings.cameraId ? this.document.cameras.find((camera) => camera.id === this.settings.cameraId) : null
    if (!base) return null
    const evaluated = evaluateExportFrame(this.document, frame)[base.id]
    return evaluated ? { ...base, ...evaluated, focalLengthMm: evaluated.focalLengthMm ?? base.focalLengthMm } : base
  }

  private syncActors(actors: readonly ActorDocument[]): void {
    actors.forEach((actor) => {
      const runtime = new ProceduralActorRuntime(actor)
      this.actorRuntimes.set(actor.id, runtime)
      this.scene.add(runtime.root)
    })
  }

  private syncProps(props: readonly PropDocument[]): void {
    props.forEach((prop) => {
      const root = new THREE.Group()
      root.name = `${prop.name} Export`
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
}
