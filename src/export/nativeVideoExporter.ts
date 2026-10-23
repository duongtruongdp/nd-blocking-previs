import { NATIVE_FFMPEG_COMMAND_ID, NativeEncoderError, platformAdapter, type NativeOutputVerification } from '../platform/platformAdapter'
import { dimensionsForDeliveryAspect, deliveryAspectForCamera, exportFrameRange, validateExportRequest } from './exportMath'
import { buildNativeFfmpegArgs, encodedFrameFromProgress, type NativeH264Encoder } from './nativeExportMath'
import type { VideoExportRequest } from './exportTypes'
import { ExportCancelledError } from './videoExporter'
import { VideoExportRenderer } from './exportRenderer'
import { createExportTracker } from './exportDiagnostics'
import { assertNativeOutput } from './nativeExportLifecycle'
import { logWebGLDiagnostics, recordWebGLDiagnosticEvent } from '../runtime/webglDiagnostics'

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

export async function exportNativeVideo(request: VideoExportRequest, destinationPath: string): Promise<NativeOutputVerification> {
  if (platformAdapter.kind !== 'desktop') throw new Error('Native FFmpeg export is available in the desktop app.')
  const runtime = platformAdapter.nativeExportRuntime
  if (!runtime) throw new Error('The desktop export runtime is not available.')
  const validationError = validateExportRequest(request.document, request.settings.cameraId, request.settings.markIn, request.settings.markOut)
  if (validationError) throw new Error(validationError)
  const frames = exportFrameRange(request.settings.markIn, request.settings.markOut)
  if (frames.length === 0) throw new Error('The export range contains no frames.')
  const dimensions = dimensionsForDeliveryAspect(request.settings.width, deliveryAspectForCamera(request.settings.deliveryAspectRatio, request.settings.cameraId, request.document))
  const tracker = createExportTracker(request, frames.length, {
    frameRange: { startFrame: request.settings.markIn, endFrameExclusive: request.settings.markOut },
    frameRate: request.settings.frameRate,
    resolution: dimensions,
    encoderCommandId: NATIVE_FFMPEG_COMMAND_ID,
  })
  tracker.report('preparing')
  logWebGLDiagnostics('native scene export: preparing')
  const jobId = `video-export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const paths = await runtime.prepareWorkspace(jobId)
  let renderer: VideoExportRenderer | null = null
  try {
    renderer = new VideoExportRenderer(request.document, request.settings, { shotInfoProject: request.project, shotInfoProjectName: request.project?.name })
    logWebGLDiagnostics('native scene export: renderer ready')
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(request.signal)
      const frame = frames[index]
      const png = await renderer.captureFramePng(frame)
      tracker.markRendered()
      tracker.report('rendering')
      await runtime.writeFrame(paths.workspace, frameName(index), await blobBytes(png))
      tracker.markSubmitted()
      request.onProgress?.({ completedFrames: index + 1, totalFrames: frames.length, currentFrame: frame, phase: 'rendering' })
    }
    throwIfAborted(request.signal)
    tracker.report('encoding')
    try {
      const encoderResult = await runtime.runFfmpeg(buildNativeFfmpegArgs({ inputPattern: paths.inputPattern, outputPath: paths.partialAbsolutePath, width: dimensions.width, height: dimensions.height, frameRate: request.settings.frameRate, quality: request.settings.quality, encoder: nativeEncoder(), totalDurationSeconds: frames.length * request.settings.frameRate.denominator / request.settings.frameRate.numerator }), request.signal, (line) => {
        const frame = encodedFrameFromProgress(line, request.settings.frameRate, frames.length)
        if (frame !== null) request.onProgress?.({ completedFrames: frame, totalFrames: frames.length, currentFrame: request.settings.markIn + Math.max(0, frame - 1), phase: 'encoding' })
      })
      tracker.setEncoderStatus(encoderResult)
      tracker.report('encoding', `encoder=${encoderResult.commandId} started=${encoderResult.started} exit=${encoderResult.exitCode ?? 'unknown'}`)
    } catch (error: unknown) {
      if (error instanceof NativeEncoderError) tracker.setEncoderStatus(error.result)
      throw error
    }
    throwIfAborted(request.signal)
    tracker.report('finalizing')
    const partial = await runtime.verifyPartial(paths.partialRelativePath)
    tracker.setOutputVerification(partial)
    assertNativeOutput(partial)
    tracker.report('finalizing', `outputExists=${partial.exists} outputBytes=${partial.byteLength}`)
    tracker.report('saving')
    const output = await runtime.finalizePartial(paths.partialRelativePath, destinationPath)
    tracker.setOutputVerification(output)
    assertNativeOutput(output, 'The exported video')
    tracker.report('completed', `outputExists=${output.exists} outputBytes=${output.byteLength}`)
    logWebGLDiagnostics('native scene export: completed')
    return output
  } catch (error) {
    throw tracker.fail(error)
  } finally {
    try {
      renderer?.dispose()
      recordWebGLDiagnosticEvent({ type: 'export-cleanup', renderer: 'scene-export', exportStage: 'cleanup' })
      logWebGLDiagnostics('native scene export: renderer cleanup complete')
    } finally {
      await runtime.cleanupWorkspace(paths.workspace)
    }
  }
}
