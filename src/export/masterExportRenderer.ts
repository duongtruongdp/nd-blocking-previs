import type { ProjectDocument } from '../core/projectDocument'
import { resolveMasterRenderFrame, type MasterRenderPlan } from './masterRenderPlan'
import { resolveMasterPreviewContext } from '../core/masterPreview'
import { VideoExportRenderer } from './exportRenderer'
import type { VideoExportSettings } from './exportTypes'
import { imageTransformForAsset } from '../core/masterGraphics'
import { recordWebGLDiagnosticEvent } from '../runtime/webglDiagnostics'
import { createMasterExportLifecycle, type MasterExportLifecycleStats } from './masterExportLifecycle'
import { buildShotInfoBurnInModel, drawShotInfoBurnIn } from './shotInfoBurnIn'

/**
 * Production-only Master renderer. It keeps one export-owned WebGL renderer
 * alive for the complete operation and replaces only scene-owned resources at
 * Master boundaries; the editor's active Scene and playheads are never mutated.
 */
export class MasterExportRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private renderer: VideoExportRenderer | null = null
  private rendererKey: string | null = null
  private readonly project: ProjectDocument
  private readonly plan: MasterRenderPlan
  private readonly settings: VideoExportSettings
  private readonly imageAssets: ReadonlyMap<string, HTMLImageElement>
  private readonly lifecycle = createMasterExportLifecycle()
  private disposed = false

  constructor(project: ProjectDocument, plan: MasterRenderPlan, settings: VideoExportSettings, imageAssets: ReadonlyMap<string, HTMLImageElement> = new Map()) {
    this.project = project
    this.plan = plan
    this.settings = settings
    this.imageAssets = imageAssets
    this.canvas = window.document.createElement('canvas')
    this.canvas.width = plan.dimensions.width
    this.canvas.height = plan.dimensions.height
    const context = this.canvas.getContext('2d')
    if (!context) throw new Error('The browser could not create the Master export canvas.')
    this.context = context
  }

  renderFrame(masterFrame: number): void {
    if (this.disposed) throw new Error('The Master export renderer has been disposed.')
    const context = resolveMasterPreviewContext(this.project, masterFrame, false)
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.context.fillStyle = '#000'
    this.context.fillRect(0, 0, this.canvas.width, this.canvas.height)
    const frame = context.status === 'resolved' ? resolveMasterRenderFrame(this.project, masterFrame) : null
    if (frame) {
      const rendererKey = `${frame.sceneId}:${frame.cameraId}`
      if (!this.renderer) {
        const settings: VideoExportSettings = { ...this.settings, source: 'scene', cameraId: frame.cameraId }
        this.renderer = new VideoExportRenderer(frame.scene, settings, { outputDimensions: this.plan.dimensions, deliveryAspectOverride: this.plan.deliveryAspect, diagnosticIdentity: 'master-export', drawShotInfo: false })
        this.lifecycle.rendererCreated()
        this.recordLifecycle('export-renderer-created', 'persistent renderer created')
        this.rendererKey = rendererKey
      } else if (this.rendererKey !== rendererKey) {
        const settings: VideoExportSettings = { ...this.settings, source: 'scene', cameraId: frame.cameraId }
        const releasedResources = this.renderer.reconfigureScene(frame.scene, settings, { outputDimensions: this.plan.dimensions, deliveryAspectOverride: this.plan.deliveryAspect })
        this.lifecycle.sceneTransition(releasedResources)
        this.recordLifecycle('export-scene-transition', `transition=${this.lifecycle.stats.sceneTransitions}`)
        this.recordLifecycle('export-resource-disposal', `released=${releasedResources}`)
        this.rendererKey = rendererKey
      }
      const renderer = this.renderer
      if (!renderer) throw new Error('The Master export renderer could not create a scene renderer.')
      renderer.renderFrame(frame.sourceFrame, frame.evaluatedEntities)
      this.context.drawImage(renderer.canvas, 0, 0, this.canvas.width, this.canvas.height)
    }
    context.graphics.forEach(({ clip, asset, opacity }) => {
      const image = this.imageAssets.get(asset.id)
      if (!image || opacity <= 0) return
      const transform = imageTransformForAsset(clip, asset, this.plan.deliveryAspect)
      this.context.save()
      this.context.globalAlpha = opacity
      this.context.translate(transform.x * this.canvas.width, transform.y * this.canvas.height)
      this.context.rotate(transform.rotation * Math.PI / 180)
      this.context.drawImage(image, -transform.width * this.canvas.width / 2, -transform.height * this.canvas.height / 2, transform.width * this.canvas.width, transform.height * this.canvas.height)
      this.context.restore()
    })
    if (frame && this.settings.shotInfoBurnIn?.enabled) {
      const shot = this.project.shots.find((candidate) => candidate.id === frame.shotId) ?? null
      const camera = frame.scene.cameras.find((candidate) => candidate.id === frame.cameraId) ?? null
      drawShotInfoBurnIn(this.context, this.canvas.width, this.canvas.height, buildShotInfoBurnInModel({ source: 'master', projectName: this.project.name, scene: frame.scene, shot, camera, evaluatedCamera: frame.evaluatedEntities[frame.cameraId], frame: masterFrame, frameRate: this.plan.frameRate }), this.settings.shotInfoBurnIn)
    }
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
    if (this.renderer) {
      this.renderer.dispose()
      this.lifecycle.rendererDisposed()
    }
    this.renderer = null
    this.rendererKey = null
    this.recordLifecycle('export-cleanup', 'persistent renderer disposed')
    this.canvas.width = 0
    this.canvas.height = 0
  }

  getLifecycleStats(): MasterExportLifecycleStats {
    return { ...this.lifecycle.stats }
  }

  private recordLifecycle(type: 'export-renderer-created' | 'export-scene-transition' | 'export-resource-disposal' | 'export-cleanup', message: string): void {
    const stats = this.lifecycle.stats
    recordWebGLDiagnosticEvent({
      type,
      renderer: 'master-export',
      exportRendererInstanceCount: stats.rendererInstances,
      exportRendererCreations: stats.rendererCreations,
      exportRendererDisposals: stats.rendererDisposals,
      exportSceneTransitions: stats.sceneTransitions,
      exportResourceDisposals: stats.resourceDisposals,
      message,
    })
  }
}
