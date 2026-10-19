import type { ProjectDocument } from '../core/projectDocument'
import { resolveMasterRenderFrame, type MasterRenderPlan } from './masterRenderPlan'
import { VideoExportRenderer } from './exportRenderer'
import type { VideoExportSettings } from './exportTypes'

/**
 * Production-only Master renderer. It keeps one clean Scene renderer per
 * Scene/Camera pair and switches only the render context at Master boundaries;
 * the editor's active Scene and playheads are never mutated.
 */
export class MasterExportRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly renderers = new Map<string, VideoExportRenderer>()
  private readonly project: ProjectDocument
  private readonly plan: MasterRenderPlan
  private readonly settings: VideoExportSettings
  private disposed = false

  constructor(project: ProjectDocument, plan: MasterRenderPlan, settings: VideoExportSettings) {
    this.project = project
    this.plan = plan
    this.settings = settings
    this.canvas = window.document.createElement('canvas')
    this.canvas.width = plan.dimensions.width
    this.canvas.height = plan.dimensions.height
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('The browser could not create the Master export canvas.')
    this.context = context
  }

  renderFrame(masterFrame: number): void {
    if (this.disposed) throw new Error('The Master export renderer has been disposed.')
    const frame = resolveMasterRenderFrame(this.project, masterFrame)
    const rendererKey = `${frame.sceneId}:${frame.cameraId}`
    let renderer = this.renderers.get(rendererKey)
    if (!renderer) {
      const settings: VideoExportSettings = { ...this.settings, source: 'scene', cameraId: frame.cameraId }
      renderer = new VideoExportRenderer(frame.scene, settings, { outputDimensions: this.plan.dimensions, deliveryAspectOverride: this.plan.deliveryAspect })
      this.renderers.set(rendererKey, renderer)
    }
    renderer.renderFrame(frame.sourceFrame, frame.evaluatedEntities)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.context.drawImage(renderer.canvas, 0, 0, this.canvas.width, this.canvas.height)
  }

  async captureFramePng(masterFrame: number): Promise<Blob> {
    this.renderFrame(masterFrame)
    const blob = await new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, 'image/png'))
    if (!blob || blob.size === 0) throw new Error('The Master export renderer produced an empty PNG frame.')
    return blob
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderers.forEach((renderer) => renderer.dispose())
    this.renderers.clear()
    this.canvas.width = 0
    this.canvas.height = 0
  }
}
