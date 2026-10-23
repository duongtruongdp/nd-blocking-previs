import type { CameraDeliveryFrame, RationalFrameRate, SceneDocument } from '../core/sceneDocument'
import type { ProjectDocument } from '../core/projectDocument'
import type { MasterRenderPlan } from './masterRenderPlan'

export const EXPORT_WIDTHS = [1280, 1920, 2560] as const

export type ExportWidth = typeof EXPORT_WIDTHS[number]
export type ExportFormat = 'mp4' | 'webm'
export type ExportQuality = 'high' | 'standard' | 'small'
export type ExportSource = 'scene' | 'master'

export type ShotInfoBurnInPreset = 'minimal' | 'detailed'
export type ShotInfoBurnInField = 'projectName' | 'sceneName' | 'shotNameNumber' | 'shotSize' | 'cameraModel' | 'focalLength' | 'cameraMovement' | 'timecode' | 'shotNotes'
export type ShotInfoBurnInFields = Record<ShotInfoBurnInField, boolean>
export type ShotInfoBurnInSettings = {
  enabled: boolean
  preset: ShotInfoBurnInPreset
  fields: ShotInfoBurnInFields
}

export type VideoExportSettings = {
  source?: ExportSource
  cameraId: string | null
  markIn: number
  markOut: number
  frameRate: RationalFrameRate
  deliveryAspectRatio: CameraDeliveryFrame
  width: ExportWidth
  format: ExportFormat
  quality: ExportQuality
  includeMusic?: boolean
  shotInfoBurnIn?: ShotInfoBurnInSettings
}

export type VideoExportStage = 'preparing' | 'rendering' | 'encoding' | 'finalizing' | 'saving' | 'completed' | 'failed' | 'cancelled'
export type VideoExportStatus = 'idle' | 'exporting' | VideoExportStage | 'error'

export type VideoExportSuccess = {
  source: ExportSource
  format: ExportFormat
  resolution: { width: number; height: number }
  durationTimecode: string
  outputPath: string | null
  outputBytes: number | null
}

export type VideoExportProgress = {
  completedFrames: number
  totalFrames: number
  currentFrame: number
  phase?: 'rendering' | 'encoding'
  renderedFrames?: number
  submittedFrames?: number
}

export type VideoExportProgressHandler = (progress: VideoExportProgress) => void

export type VideoExportStageEvent = {
  stage: VideoExportStage
  source: ExportSource
  totalFrames: number
  renderedFrames: number
  submittedFrames: number
  frameRange?: { startFrame: number; endFrameExclusive: number }
  frameRate?: RationalFrameRate
  resolution?: { width: number; height: number }
  encoderCommandId?: string
  encoderStarted?: boolean
  encoderExitCode?: number | null
  outputExists?: boolean
  outputBytes?: number
  message?: string
}

export type VideoExportStageHandler = (event: VideoExportStageEvent) => void

export type VideoExportRequest = {
  document: SceneDocument
  project?: ProjectDocument
  masterPlan?: MasterRenderPlan
  musicBlob?: Blob | null
  settings: VideoExportSettings
  signal?: AbortSignal
  onProgress?: VideoExportProgressHandler
  onStage?: VideoExportStageHandler
  masterImageAssets?: ReadonlyMap<string, HTMLImageElement>
}
