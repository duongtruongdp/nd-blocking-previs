import { canEncodeVideo, Quality } from 'mediabunny'
import type { RationalFrameRate } from '../core/sceneDocument'
import type { ExportDimensions } from './exportMath'
import type { ExportFormat } from './exportTypes'
import { supportedWebmMimeTypes } from './mediaRecorder'

export type ExportFormatCapabilities = {
  mp4: boolean
  webm: boolean
}

export async function canExportMp4(dimensions: ExportDimensions, frameRate: RationalFrameRate): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false
  try {
    return await canEncodeVideo('avc', {
      width: dimensions.width,
      height: dimensions.height,
      frameRate: frameRate.numerator / frameRate.denominator,
      quality: new Quality('high'),
    })
  } catch {
    return false
  }
}

export async function detectExportFormatCapabilities(dimensions: ExportDimensions, frameRate: RationalFrameRate): Promise<ExportFormatCapabilities> {
  return { mp4: await canExportMp4(dimensions, frameRate), webm: supportedWebmMimeTypes().length > 0 }
}

export function preferredExportFormat(capabilities: ExportFormatCapabilities): ExportFormat | null {
  if (capabilities.mp4) return 'mp4'
  if (capabilities.webm) return 'webm'
  return null
}
