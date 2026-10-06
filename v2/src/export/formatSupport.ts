import type { RationalFrameRate } from '../core/sceneDocument'
import type { ExportDimensions } from './exportMath'
import type { ExportFormat } from './exportTypes'
import { supportedWebmMimeTypes } from './mediaRecorder'
import { detectBrowserCapabilities } from '../platform/browserCapabilities'

export type ExportFormatCapabilities = {
  mp4: boolean
  webm: boolean
}

export async function canExportMp4(dimensions: ExportDimensions, frameRate: RationalFrameRate): Promise<boolean> {
  if (!detectBrowserCapabilities().webCodecs) return false
  try {
    const { canEncodeVideo, Quality } = await import('mediabunny')
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

export function exportFormatMessage(capabilities: ExportFormatCapabilities, format: ExportFormat): string {
  if (capabilities[format]) return ''
  if (format === 'mp4' && capabilities.webm) return 'MP4 export is not supported by this browser. Choose WebM instead.'
  if (format === 'webm' && capabilities.mp4) return 'WebM export is not supported by this browser. Choose MP4 instead.'
  return 'Video export is not supported by this browser. Try the latest Chrome or Edge on desktop.'
}

export function preferredExportFormat(capabilities: ExportFormatCapabilities): ExportFormat | null {
  if (capabilities.mp4) return 'mp4'
  if (capabilities.webm) return 'webm'
  return null
}
