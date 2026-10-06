import * as THREE from 'three'
import type { ActorDocument, CameraDocument, SceneDocument } from '../core/sceneDocument'
import { cameraProjectionForDocument } from '../runtime/cameraMath'
import { ProceduralActorRuntime } from '../runtime/actor/proceduralActor'
import { createScenicVisual, scenicGeometrySignature, type ScenicDefinition, type ScenicVisual } from '../runtime/scenicRuntime'
import { evaluateExportFrame } from './exportEvaluation'
import { centeredCrop, desqueezedCaptureAspect, dimensionsForDeliveryAspect, deliveryAspectForCamera } from './exportMath'
import type { VideoExportSettings } from './exportTypes'
import { resolveOpeningAgainstWalls } from '../architecture/wallMath'

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
  private readonly scenicRuntimes = new Map<string, ScenicVisual>()
  private readonly scenicSignatures = new Map<string, string>()
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
    this.syncScenic([...sceneDocument.props, ...sceneDocument.walls, ...sceneDocument.openings.map((opening) => resolveOpeningAgainstWalls(opening, sceneDocument.walls)), ...sceneDocument.lights])
  }

  renderFrame(frame: number): void {
    if (this.disposed) throw new Error('The export renderer has been disposed.')
    const cameraDocument = this.resolveCamera(frame)
    if (!cameraDocument) throw new Error('The active Camera is not available for export.')
    const evaluated = evaluateExportFrame(this.document, frame)
    const evaluatedProps = this.document.props.map((prop) => ({ ...prop, ...(evaluated[prop.id] ?? {}) }))
    const evaluatedWalls = this.document.walls.map((wall) => ({ ...wall, ...(evaluated[wall.id] ?? {}) }))
    const evaluatedOpenings = this.document.openings.map((opening) => {
      const value = evaluated[opening.id]
      return resolveOpeningAgainstWalls({ ...opening, ...(value ?? {}), openAngle: value?.openAngle ?? opening.openAngle }, evaluatedWalls)
    })
    const evaluatedLights = this.document.lights.map((sun) => {
      const value = evaluated[sun.id]
      return { ...sun, ...(value ?? {}), azimuth: value?.azimuth ?? sun.azimuth, elevation: value?.elevation ?? sun.elevation, intensity: value?.intensity ?? sun.intensity, color: value?.color ?? sun.color }
    })
    this.syncScenic([...evaluatedProps, ...evaluatedWalls, ...evaluatedOpenings, ...evaluatedLights])
    this.document.actors.forEach((actor) => {
      const runtime = this.actorRuntimes.get(actor.id)
      if (runtime) runtime.applyDocument({ ...actor, ...(evaluated[actor.id] ?? {}) })
    })
    evaluatedProps.forEach((prop) => {
      const runtime = this.scenicRuntimes.get(prop.id)
      if (!runtime) return
      runtime.applyDocument(prop)
    })
    evaluatedWalls.forEach((wall) => this.scenicRuntimes.get(wall.id)?.applyDocument(wall))
    evaluatedOpenings.forEach((opening) => this.scenicRuntimes.get(opening.id)?.applyDocument(opening))
    evaluatedLights.forEach((sun) => this.scenicRuntimes.get(sun.id)?.applyDocument(sun))

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
    this.scenicRuntimes.forEach((runtime) => runtime.dispose())
    this.scenicSignatures.clear()
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

  private syncScenic(definitions: readonly ScenicDefinition[]): void {
    const ids = new Set(definitions.map((definition) => definition.id))
    Array.from(this.scenicRuntimes.entries()).forEach(([id, runtime]) => {
      if (ids.has(id)) return
      runtime.root.removeFromParent()
      runtime.dispose()
      this.scenicRuntimes.delete(id)
      this.scenicSignatures.delete(id)
    })
    definitions.forEach((definition) => {
      const wallOpenings = definition.type === 'Wall' ? definitions.filter((candidate): candidate is Extract<ScenicDefinition, { type: 'Opening' }> => candidate.type === 'Opening' && candidate.wallId === definition.id) : []
      const signature = scenicGeometrySignature(definition, wallOpenings)
      const existing = this.scenicRuntimes.get(definition.id)
      if (existing && this.scenicSignatures.get(definition.id) === signature) {
        existing.applyDocument(definition)
        return
      }
      if (existing) {
        existing.root.removeFromParent()
        existing.dispose()
        this.scenicRuntimes.delete(definition.id)
      }
      const runtime = createScenicVisual(definition, { includeSunHelper: false, wallOpenings })
      runtime.root.name = `${definition.name} Export`
      this.scenicRuntimes.set(definition.id, runtime)
      this.scenicSignatures.set(definition.id, signature)
      this.scene.add(runtime.root)
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
