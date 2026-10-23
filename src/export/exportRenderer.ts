import * as THREE from 'three'
import type { ActorDocument, CameraDocument, SceneDocument } from '../core/sceneDocument'
import type { ProjectDocument } from '../core/projectDocument'
import { cameraProjectionForDocument } from '../runtime/cameraMath'
import { createActorRuntime, type ActorRuntime } from '../runtime/actor/actorRuntime'
import { createScenicVisual, scenicGeometrySignature, type ScenicDefinition, type ScenicVisual } from '../runtime/scenicRuntime'
import { evaluateExportFrame } from './exportEvaluation'
import { centeredCrop, desqueezedCaptureAspect, dimensionsForDeliveryAspect, deliveryAspectForCamera, type ExportDimensions } from './exportMath'
import type { VideoExportSettings } from './exportTypes'
import { resolveOpeningAgainstWalls } from '../architecture/wallMath'
import type { EvaluatedEntityState } from '../timeline/timelineEvaluator'
import { logWebGLDiagnostics, registerWebGLRenderer } from '../runtime/webglDiagnostics'
import { drawShotInfoBurnIn, resolveSceneShotInfoBurnInModel } from './shotInfoBurnIn'

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
  private readonly actorRuntimes = new Map<string, ActorRuntime>()
  private readonly scenicRuntimes = new Map<string, ScenicVisual>()
  private readonly scenicSignatures = new Map<string, string>()
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = []
  private document: SceneDocument
  private settings: VideoExportSettings
  private sourceWidth: number
  private sourceHeight: number
  private deliveryAspectOverride: number | null
  private readonly diagnosticIdentity: 'scene-export' | 'master-export'
  private readonly shotInfoProject: ProjectDocument | null
  private readonly shotInfoProjectName: string
  private readonly drawShotInfo: boolean
  private exportContextLost = false
  private disposed = false
  private disposing = false
  private readonly webglDiagnosticsDispose: () => void

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault()
    this.exportContextLost = true
    if (import.meta.env.DEV) console.error('[export] dedicated WebGL context lost', { renderer: this.diagnosticIdentity, disposing: this.disposing })
  }

  constructor(sceneDocument: SceneDocument, settings: VideoExportSettings, options: { outputDimensions?: ExportDimensions; deliveryAspectOverride?: number; diagnosticIdentity?: 'scene-export' | 'master-export'; shotInfoProject?: ProjectDocument; shotInfoProjectName?: string; drawShotInfo?: boolean } = {}) {
    this.document = sceneDocument
    this.settings = settings
    this.deliveryAspectOverride = options.deliveryAspectOverride ?? null
    this.diagnosticIdentity = options.diagnosticIdentity ?? 'scene-export'
    this.shotInfoProject = options.shotInfoProject ?? null
    this.shotInfoProjectName = options.shotInfoProjectName ?? ''
    this.drawShotInfo = options.drawShotInfo !== false
    this.canvas = window.document.createElement('canvas')
    const deliveryAspect = options.deliveryAspectOverride ?? deliveryAspectForCamera(settings.deliveryAspectRatio, settings.cameraId, sceneDocument)
    const outputDimensions = options.outputDimensions ?? dimensionsForDeliveryAspect(settings.width, deliveryAspect)
    this.canvas.width = outputDimensions.width
    this.canvas.height = outputDimensions.height
    const outputContext = this.canvas.getContext('2d')
    if (!outputContext) throw new Error('The browser could not create an export canvas.')
    this.outputContext = outputContext

    const captureAspect = desqueezedCaptureAspect(sceneDocument, settings.cameraId) ?? 16 / 9
    this.sourceWidth = outputDimensions.width
    this.sourceHeight = dimensionsForDeliveryAspect(outputDimensions.width, captureAspect).height
    this.sourceCanvas = window.document.createElement('canvas')
    this.sourceCanvas.dataset.webglIdentity = this.diagnosticIdentity
    this.sourceRenderer = new THREE.WebGLRenderer({ canvas: this.sourceCanvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.sourceRenderer.setPixelRatio(1)
    this.sourceRenderer.setSize(this.sourceWidth, this.sourceHeight, false)
    this.sourceRenderer.setClearColor('#111721', 1)
    this.sourceRenderer.outputColorSpace = THREE.SRGBColorSpace
    this.sourceCanvas.addEventListener('webglcontextlost', this.handleContextLost, false)
    this.webglDiagnosticsDispose = registerWebGLRenderer(this.sourceRenderer, this.diagnosticIdentity)
    logWebGLDiagnostics(`${this.diagnosticIdentity} created`)
    this.createEnvironment()
    this.cameraMount.add(this.camera)
    this.scene.add(this.cameraMount)
    this.configureScene(sceneDocument, settings, options)
  }

  /** Replace scene-owned Three.js resources while retaining the export WebGL context. */
  reconfigureScene(sceneDocument: SceneDocument, settings: VideoExportSettings, options: { outputDimensions?: ExportDimensions; deliveryAspectOverride?: number } = {}): number {
    if (this.disposed) throw new Error('The export renderer has been disposed.')
    const releasedResources = this.disposeSceneResources()
    this.configureScene(sceneDocument, settings, options)
    return releasedResources
  }

  renderFrame(frame: number, evaluatedOverride?: Record<string, EvaluatedEntityState>): void {
    if (this.disposed) throw new Error('The export renderer has been disposed.')
    if (this.exportContextLost || this.sourceRenderer.getContext().isContextLost()) throw new Error('The dedicated export graphics context was lost.')
    const evaluated = evaluatedOverride ?? evaluateExportFrame(this.document, frame)
    const cameraDocument = this.resolveCamera(frame, evaluated)
    if (!cameraDocument) throw new Error('The active Camera is not available for export.')
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

    const deliveryAspect = this.optionsDeliveryAspect()
    const crop = centeredCrop(this.sourceWidth, this.sourceHeight, deliveryAspect)
    this.outputContext.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.outputContext.drawImage(this.sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, this.canvas.width, this.canvas.height)
    if (this.drawShotInfo && this.shotInfoProject && this.settings.source !== 'master' && this.settings.shotInfoBurnIn?.enabled) {
      drawShotInfoBurnIn(this.outputContext, this.canvas.width, this.canvas.height, resolveSceneShotInfoBurnInModel(this.shotInfoProject, this.shotInfoProjectName, this.document, cameraDocument.id, frame, this.document.timeline.frameRate, evaluated), this.settings.shotInfoBurnIn)
    }
  }

  async captureFramePng(frame: number): Promise<Blob> {
    this.renderFrame(frame)
    const blob = await new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, 'image/png'))
    if (!blob || blob.size === 0) throw new Error('The export renderer produced an empty PNG frame.')
    return blob
  }

  dispose(): void {
    if (this.disposed) return
    this.disposing = true
    this.disposed = true
    this.sourceCanvas.removeEventListener('webglcontextlost', this.handleContextLost, false)
    this.actorRuntimes.forEach((runtime) => runtime.dispose())
    this.scenicRuntimes.forEach((runtime) => runtime.dispose())
    this.scenicSignatures.clear()
    this.resources.forEach((resource) => resource.dispose())
    this.sourceRenderer.dispose()
    // This renderer is export-owned. Explicitly release its WebGL context so
    // native export cannot leave an extra high-resolution context resident in
    // the desktop WebView. Interactive renderers are never force-released.
    this.sourceRenderer.forceContextLoss()
    this.webglDiagnosticsDispose()
    logWebGLDiagnostics(`${this.diagnosticIdentity} disposed`)
    this.sourceCanvas.width = 0
    this.sourceCanvas.height = 0
    this.canvas.width = 0
    this.canvas.height = 0
  }

  private configureScene(sceneDocument: SceneDocument, settings: VideoExportSettings, options: { outputDimensions?: ExportDimensions; deliveryAspectOverride?: number }): void {
    this.document = sceneDocument
    this.settings = settings
    this.deliveryAspectOverride = options.deliveryAspectOverride ?? null
    const deliveryAspect = options.deliveryAspectOverride ?? deliveryAspectForCamera(settings.deliveryAspectRatio, settings.cameraId, sceneDocument)
    const outputDimensions = options.outputDimensions ?? dimensionsForDeliveryAspect(settings.width, deliveryAspect)
    this.sourceWidth = outputDimensions.width
    const captureAspect = desqueezedCaptureAspect(sceneDocument, settings.cameraId) ?? 16 / 9
    this.sourceHeight = dimensionsForDeliveryAspect(this.sourceWidth, captureAspect).height
    this.canvas.width = outputDimensions.width
    this.canvas.height = outputDimensions.height
    this.sourceRenderer.setSize(this.sourceWidth, this.sourceHeight, false)
    this.syncActors(sceneDocument.actors)
    this.syncScenic([...sceneDocument.props, ...sceneDocument.walls, ...sceneDocument.openings.map((opening) => resolveOpeningAgainstWalls(opening, sceneDocument.walls)), ...sceneDocument.lights])
  }

  private disposeSceneResources(): number {
    const releasedResources = this.actorRuntimes.size + this.scenicRuntimes.size
    this.actorRuntimes.forEach((runtime) => {
      runtime.root.removeFromParent()
      runtime.dispose()
    })
    this.actorRuntimes.clear()
    this.scenicRuntimes.forEach((runtime) => {
      runtime.root.removeFromParent()
      runtime.dispose()
    })
    this.scenicRuntimes.clear()
    this.scenicSignatures.clear()
    return releasedResources
  }

  private resolveCamera(frame: number, evaluatedEntities?: Record<string, EvaluatedEntityState>): CameraDocument | null {
    const base = this.settings.cameraId ? this.document.cameras.find((camera) => camera.id === this.settings.cameraId) : null
    if (!base) return null
    const evaluated = (evaluatedEntities ?? evaluateExportFrame(this.document, frame))[base.id]
    return evaluated ? { ...base, ...evaluated, focalLengthMm: evaluated.focalLengthMm ?? base.focalLengthMm } : base
  }

  private optionsDeliveryAspect(): number {
    return this.deliveryAspectOverride ?? deliveryAspectForCamera(this.settings.deliveryAspectRatio, this.settings.cameraId, this.document)
  }

  private syncActors(actors: readonly ActorDocument[]): void {
    actors.forEach((actor) => {
      const runtime = createActorRuntime(actor)
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
