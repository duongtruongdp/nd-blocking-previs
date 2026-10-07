import { platformAdapter } from '../platform/platformAdapter'
import { dimensionsForDeliveryAspect, deliveryAspectForCamera, exportFrameRange, validateExportRequest } from './exportMath'
import { buildNativeFfmpegArgs, encodedFrameFromProgress, type NativeH264Encoder } from './nativeExportMath'
import type { VideoExportRequest } from './exportTypes'
import { ExportCancelledError } from './videoExporter'
import { VideoExportRenderer } from './exportRenderer'

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError()
}

function frameName(frame: number): string {
  return `frame_${String(frame).padStart(6, '0')}.png`
}

function nativeEncoder(): NativeH264Encoder {
  return /Macintosh|Mac OS X/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent) ? 'h264_videotoolbox' : 'libx264'
}

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

export async function exportNativeVideo(request: VideoExportRequest, destinationPath: string): Promise<void> {
  if (platformAdapter.kind !== 'desktop') throw new Error('Native FFmpeg export is available in the desktop app.')
  const runtime = platformAdapter.nativeExportRuntime
  if (!runtime) throw new Error('The desktop export runtime is not available.')
  const validationError = validateExportRequest(request.document, request.settings.cameraId, request.settings.markIn, request.settings.markOut)
  if (validationError) throw new Error(validationError)
  const frames = exportFrameRange(request.settings.markIn, request.settings.markOut)
  if (frames.length === 0) throw new Error('The export range contains no frames.')
  const jobId = `video-export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const paths = await runtime.prepareWorkspace(jobId)
  const dimensions = dimensionsForDeliveryAspect(request.settings.width, deliveryAspectForCamera(request.settings.deliveryAspectRatio, request.settings.cameraId, request.document))
  const renderer = new VideoExportRenderer(request.document, request.settings)
  try {
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(request.signal)
      const frame = frames[index]
      const png = await renderer.captureFramePng(frame)
      await runtime.writeFrame(paths.workspace, frameName(index), await blobBytes(png))
      request.onProgress?.({ completedFrames: index + 1, totalFrames: frames.length, currentFrame: frame, phase: 'rendering' })
    }
    throwIfAborted(request.signal)
    await runtime.runFfmpeg(buildNativeFfmpegArgs({ inputPattern: paths.inputPattern, outputPath: paths.partialAbsolutePath, width: dimensions.width, height: dimensions.height, frameRate: request.settings.frameRate, quality: request.settings.quality, encoder: nativeEncoder() }), request.signal, (line) => {
      const frame = encodedFrameFromProgress(line, request.settings.frameRate, frames.length)
      if (frame !== null) request.onProgress?.({ completedFrames: frame, totalFrames: frames.length, currentFrame: request.settings.markIn + Math.max(0, frame - 1), phase: 'encoding' })
    })
    throwIfAborted(request.signal)
    await runtime.verifyPartial(paths.partialRelativePath)
    await runtime.finalizePartial(paths.partialRelativePath, destinationPath)
  } finally {
    renderer.dispose()
    await runtime.cleanupWorkspace(paths.workspace)
  }
}
