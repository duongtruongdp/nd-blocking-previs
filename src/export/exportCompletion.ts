import { frameToTimecode } from '../timeline/timelineMath'
import type { ExportFormat, ExportSource, VideoExportSuccess } from './exportTypes'
import type { RationalFrameRate } from '../core/sceneDocument'

export type ExportSaveResult = {
  saved: boolean
  outputPath: string | null
  outputBytes: number | null
}

export function successMetadataForExport(input: {
  source: ExportSource
  format: ExportFormat
  resolution: { width: number; height: number }
  frameCount: number
  frameRate: RationalFrameRate
  saveResult: ExportSaveResult
}): VideoExportSuccess | null {
  if (!input.saveResult.saved) return null
  return {
    source: input.source,
    format: input.format,
    resolution: { ...input.resolution },
    durationTimecode: frameToTimecode(Math.max(0, input.frameCount), input.frameRate),
    outputPath: input.saveResult.outputPath,
    outputBytes: input.saveResult.outputBytes,
  }
}
