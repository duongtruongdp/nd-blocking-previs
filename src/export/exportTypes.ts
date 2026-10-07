import type { CameraDeliveryFrame, RationalFrameRate, SceneDocument } from '../core/sceneDocument'

export const EXPORT_WIDTHS = [1280, 1920, 2560] as const

export type ExportWidth = typeof EXPORT_WIDTHS[number]
export type ExportFormat = 'mp4' | 'webm'
export type ExportQuality = 'high' | 'standard' | 'small'

export type VideoExportSettings = {
  cameraId: string | null
  markIn: number
  markOut: number
  frameRate: RationalFrameRate
  deliveryAspectRatio: CameraDeliveryFrame
  width: ExportWidth
  format: ExportFormat
  quality: ExportQuality
}

export type VideoExportStatus = 'idle' | 'preparing' | 'exporting' | 'encoding' | 'finalizing' | 'completed' | 'error' | 'cancelled'

export type VideoExportProgress = {
  completedFrames: number
  totalFrames: number
  currentFrame: number
  phase?: 'rendering' | 'encoding'
}

export type VideoExportProgressHandler = (progress: VideoExportProgress) => void

export type VideoExportRequest = {
  document: SceneDocument
  settings: VideoExportSettings
  signal?: AbortSignal
  onProgress?: VideoExportProgressHandler
}
