import * as THREE from 'three'
import type { ActorDocument, CameraDocument, FrameGuide, OpeningDocument, PropDocument, SunDocument, WallDocument } from '../core/sceneDocument'
import { cameraProjectionForDocument, letterboxRect } from './cameraMath'
import { deliveryAspectValue, fitAspectInsideSource, insetFrameGuideRect } from './frameGuideMath'
import { centeredCrop } from '../export/exportMath'
import type { StageTransform } from '../stage-engine'
import type { StillCaptureOptions } from './stillCapture'
import { stillDimensionsForCamera } from './stillCapture'
import { ProceduralActorRuntime } from './actor/proceduralActor'
import { ProceduralCameraRuntime } from './cameraRuntime'
import { createScenicVisual, scenicGeometrySignature, type ScenicDefinition, type ScenicVisual } from './scenicRuntime'
import { resolveOpeningAgainstWalls } from '../architecture/wallMath'
import { sunAnglesFromHelperPosition } from './sunMapping'
import { cameraViewEntityCollections, staleRuntimeEntityIds } from './cameraViewReconciliation'

const MAX_PIXEL_RATIO = 2

/**
 * Read-only render adapter for Camera View.
 *
 * It deliberately owns a separate renderer and scene so the StageEngine editor
 * camera, navigation state, picking, and transform interaction remain untouched.
 */
export class CameraViewRuntime {
  readonly canvas = document.createElement('canvas')
  readonly previewElement = document.createElement('div')
  private readonly container: HTMLElement
  private readonly scene = new THREE.Scene()
  private readonly renderer: THREE.WebGLRenderer
  private readonly previewCanvas = document.createElement('canvas')
  private readonly previewRenderer: THREE.WebGLRenderer
  private readonly actorRuntimes = new Map<string, ProceduralActorRuntime>()
  private readonly scenicRuntimes = new Map<string, ScenicVisual>()
  private readonly scenicDefinitions = new Map<string, ScenicDefinition>()
  private readonly scenicSignatures = new Map<string, string>()
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = []
  private readonly resizeObserver: ResizeObserver | null
  private cameraRuntime: ProceduralCameraRuntime | null = null
  private captureAspect = 16 / 9
  private deliveryAspect = 16 / 9
  private displayMode: 'hidden' | 'full' | 'preview' = 'hidden'
  private currentCamera: CameraDocument | null = null
  private lastSceneRevision = ''
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
    this.previewElement.className = 'v2-camera-preview-frame'
    this.previewElement.setAttribute('aria-hidden', 'true')
    this.previewElement.style.display = 'none'
    this.previewElement.appendChild(this.previewCanvas)
    this.previewCanvas.className = 'v2-camera-preview-canvas'
    this.previewRenderer = new THREE.WebGLRenderer({ canvas: this.previewCanvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    this.previewRenderer.setPixelRatio(1)
    this.previewRenderer.setClearColor('#111721', 1)
    this.previewRenderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.previewElement)
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
    this.setDisplayMode(visible ? 'full' : 'hidden')
  }

  setDisplayMode(mode: 'hidden' | 'full' | 'preview'): void {
    this.displayMode = mode
    this.canvas.style.display = mode === 'full' ? 'block' : 'none'
    this.previewElement.style.display = mode === 'preview' && this.currentCamera ? 'block' : 'none'
    if (mode !== 'hidden') this.render()
  }

  setPreviewAspect(aspect: number): void {
    this.deliveryAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
    this.previewElement.style.aspectRatio = String(this.deliveryAspect)
    this.updatePreviewCanvasLayout()
    if (this.displayMode === 'preview') this.render()
  }

  /**
   * Reconcile the isolated production-camera scene from one authoritative
   * snapshot. This is intentionally separate from StageEngine: Camera View,
   * the compact preview, and still thumbnails all consume this same runtime.
   */
  reconcileScene(scene: {
    revision: string
    actors: readonly ActorDocument[]
    props: readonly PropDocument[]
    walls: readonly WallDocument[]
    openings: readonly OpeningDocument[]
    lights: readonly SunDocument[]
    camera: CameraDocument | null
  }): void {
    if (this.disposed) return
    this.lastSceneRevision = scene.revision
    const scenic = [...scene.props, ...scene.walls, ...scene.openings.map((opening) => resolveOpeningAgainstWalls(opening, scene.walls)), ...scene.lights]
    this.syncActors(scene.actors)
    this.syncScenic(scenic)
    this.syncCamera(scene.camera)
    if (this.displayMode !== 'hidden') this.render()
  }

  previewTransform(change: StageTransform): void {
    const actor = this.actorRuntimes.get(change.entityId)
    const scenic = this.scenicRuntimes.get(change.entityId)
    const camera = this.cameraRuntime && this.currentCamera?.id === change.entityId ? this.cameraRuntime.root : null
    const root = actor?.root ?? scenic?.root ?? camera
    if (!root) return
    root.position.set(...change.position)
    root.rotation.set(...change.rotation)
    if (change.scale && scenic) root.scale.set(...change.scale)
    const definition = this.scenicDefinitions.get(change.entityId)
    if (definition?.type === 'Wall') {
      const previewWall = { ...definition, position: [...change.position] as [number, number, number], rotation: [...change.rotation] as [number, number, number] }
      this.scenicDefinitions.forEach((candidate) => {
        if (candidate.type !== 'Opening' || candidate.wallId !== definition.id) return
        const resolved = resolveOpeningAgainstWalls(candidate, [previewWall])
        this.scenicRuntimes.get(candidate.id)?.applyDocument(resolved)
      })
    } else if (definition?.type === 'Sun') {
      this.scenicRuntimes.get(definition.id)?.applyDocument({ ...definition, ...sunAnglesFromHelperPosition(new THREE.Vector3(...change.position)) })
    }
    if (this.displayMode !== 'hidden') this.render()
  }

  /** Keep Camera View aligned with the temporary desktop Camera orientation. */
  applyLiveCameraRotation(cameraId: string, rotation: [number, number, number]): void {
    if (!this.cameraRuntime || this.currentCamera?.id !== cameraId) return
    this.cameraRuntime.applyLiveRotation(rotation)
    this.currentCamera = { ...this.currentCamera, rotation: [...rotation] }
    if (this.displayMode !== 'hidden') this.render()
  }

  async captureStill(options: StillCaptureOptions): Promise<Blob | null> {
    const camera = this.currentCamera
    const projection = camera ? cameraProjectionForDocument(camera) : null
    if (!camera || !projection || this.disposed || !this.cameraRuntime) return null
    const output = stillDimensionsForCamera(camera, options.width)
    const sourceWidth = output.width
    const sourceHeight = Math.max(2, Math.round((sourceWidth / projection.displayAspect) / 2) * 2)
    // Reuse the existing production-camera renderer. Creating a fourth WebGL
    // context for a background Save can fail in a desktop WebView, especially
    // while Camera View is hidden. The preview renderer is already isolated
    // from StageEngine and uses the same scene, camera, and projection path.
    const sourceCanvas = this.previewCanvas
    const stillRenderer = this.previewRenderer
    stillRenderer.setPixelRatio(1)
    stillRenderer.setSize(sourceWidth, sourceHeight, false)
    stillRenderer.setClearColor('#111721', 1)
    stillRenderer.outputColorSpace = THREE.SRGBColorSpace
    this.cameraRuntime.root.updateMatrixWorld(true)
    this.scene.updateMatrixWorld(true)
    stillRenderer.render(this.scene, this.cameraRuntime.productionCamera)

    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = output.width
    outputCanvas.height = output.height
    const context = outputCanvas.getContext('2d')
    if (!context) {
      return null
    }
    const crop = centeredCrop(sourceWidth, sourceHeight, output.width / output.height)
    context.drawImage(sourceCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height)
    if (options.includeGuides) drawStillGuides(context, output.width, output.height, sourceWidth, sourceHeight, crop, camera.frameGuides, projection.displayAspect)
    const blob = await new Promise<Blob | null>((resolve) => outputCanvas.toBlob(resolve, 'image/png'))
    if (this.displayMode === 'preview') this.renderPreview()
    return blob
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.resizeObserver?.disconnect()
    if (!this.resizeObserver) window.removeEventListener('resize', this.handleWindowResize)
    this.actorRuntimes.forEach((runtime) => runtime.dispose())
    this.scenicRuntimes.forEach((runtime) => runtime.dispose())
    this.scenicDefinitions.clear()
    this.scenicSignatures.clear()
    this.cameraRuntime?.dispose()
    this.resources.forEach((resource) => resource.dispose())
    this.renderer.dispose()
    this.previewRenderer.dispose()
    this.canvas.remove()
    this.previewElement.remove()
  }

  private readonly handleWindowResize = () => this.resize()

  private syncActors(actors: readonly ActorDocument[]): void {
    const { actorIds } = cameraViewEntityCollections(actors, [])
    staleRuntimeEntityIds(this.actorRuntimes.keys(), actorIds).forEach((id) => {
      const runtime = this.actorRuntimes.get(id)
      if (!runtime) return
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

  private syncScenic(definitions: readonly ScenicDefinition[]): void {
    const { scenicIds } = cameraViewEntityCollections([], definitions)
    staleRuntimeEntityIds(this.scenicRuntimes.keys(), scenicIds).forEach((id) => {
      const runtime = this.scenicRuntimes.get(id)
      if (!runtime) return
      runtime.root.removeFromParent()
      runtime.dispose()
      this.scenicRuntimes.delete(id)
      this.scenicDefinitions.delete(id)
      this.scenicSignatures.delete(id)
    })
    definitions.forEach((definition) => {
      const wallOpenings = definition.type === 'Wall' ? definitions.filter((candidate): candidate is OpeningDocument => candidate.type === 'Opening' && candidate.wallId === definition.id) : []
      const signature = scenicGeometrySignature(definition, wallOpenings)
      const existing = this.scenicRuntimes.get(definition.id)
      if (existing && this.scenicSignatures.get(definition.id) === signature) {
        existing.applyDocument(definition)
        this.scenicDefinitions.set(definition.id, definition)
        return
      }
      if (existing) {
        existing.root.removeFromParent()
        existing.dispose()
        this.scenicRuntimes.delete(definition.id)
      }
      const runtime = createScenicVisual(definition, { includeSunHelper: false, wallOpenings })
      runtime.root.name = `${definition.name} Camera View`
      this.scenicRuntimes.set(definition.id, runtime)
      this.scenicDefinitions.set(definition.id, definition)
      this.scenicSignatures.set(definition.id, signature)
      this.scene.add(runtime.root)
    })
  }

  private syncCamera(camera: CameraDocument | null): void {
    if (!camera) {
      this.currentCamera = null
      this.cameraRuntime?.dispose()
      this.cameraRuntime = null
      this.previewElement.style.display = 'none'
      return
    }
    this.currentCamera = camera
    if (!this.cameraRuntime) this.cameraRuntime = new ProceduralCameraRuntime(camera)
    this.cameraRuntime.applyDocument(camera)
    this.captureAspect = cameraProjectionForDocument(camera)?.displayAspect ?? this.captureAspect
    this.deliveryAspect = deliveryAspectValue(camera.deliveryAspectRatio, this.captureAspect)
    this.previewElement.style.aspectRatio = String(this.deliveryAspect)
    this.updatePreviewCanvasLayout()
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
    if (this.displayMode !== 'hidden') this.render()
  }

  private render(): void {
    if (this.disposed || this.displayMode === 'hidden' || !this.cameraRuntime) return
    if (this.displayMode === 'preview') {
      this.renderPreview()
      return
    }
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

  private renderPreview(): void {
    if (this.disposed || !this.cameraRuntime || !this.currentCamera) return
    const sourceWidth = 640
    const sourceHeight = Math.max(2, Math.round((sourceWidth / this.captureAspect) / 2) * 2)
    this.previewRenderer.setSize(sourceWidth, sourceHeight, false)
    this.cameraRuntime.root.updateMatrixWorld(true)
    this.scene.updateMatrixWorld(true)
    this.previewRenderer.setScissorTest(false)
    this.previewRenderer.setViewport(0, 0, sourceWidth, sourceHeight)
    this.previewRenderer.clear()
    this.previewRenderer.render(this.scene, this.cameraRuntime.productionCamera)
    this.updatePreviewCanvasLayout()
  }

  private updatePreviewCanvasLayout(): void {
    this.previewCanvas.style.width = this.captureAspect >= this.deliveryAspect ? 'auto' : '100%'
    this.previewCanvas.style.height = this.captureAspect >= this.deliveryAspect ? '100%' : 'auto'
  }
}

function drawStillGuides(context: CanvasRenderingContext2D, outputWidth: number, outputHeight: number, sourceWidth: number, sourceHeight: number, crop: { x: number; y: number; width: number; height: number }, guides: readonly FrameGuide[], sourceAspect: number): void {
  context.save()
  context.strokeStyle = 'rgba(240, 184, 102, 0.96)'
  context.lineWidth = Math.max(2, outputWidth / 960)
  context.strokeRect(0, 0, outputWidth, outputHeight)
  guides.filter((guide) => guide.enabled).forEach((guide) => {
    const sourceRect = insetFrameGuideRect(fitAspectInsideSource(sourceAspect, guide.aspectRatio), guide.safeMarginPercent)
    const x = (sourceRect.x * sourceWidth - crop.x) * outputWidth / crop.width
    const y = (sourceRect.y * sourceHeight - crop.y) * outputHeight / crop.height
    const width = sourceRect.width * sourceWidth * outputWidth / crop.width
    const height = sourceRect.height * sourceHeight * outputHeight / crop.height
    context.strokeStyle = guide.color
    context.globalAlpha = guide.opacity
    context.lineWidth = Math.max(1, guide.lineWeight)
    context.setLineDash(guide.lineStyle === 'dashed' ? [8, 6] : [])
    context.strokeRect(x, y, width, height)
    context.setLineDash([])
    context.font = '12px sans-serif'
    context.fillStyle = guide.color
    context.fillText(guide.name, Math.max(4, x + 5), Math.max(14, y + 14))
  })
  context.restore()
}
