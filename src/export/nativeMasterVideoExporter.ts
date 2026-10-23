import { NATIVE_FFMPEG_COMMAND_ID, NativeEncoderError, platformAdapter, type NativeOutputVerification } from '../platform/platformAdapter'
import type { ProjectDocument } from '../core/projectDocument'
import { buildMasterRenderPlan } from './masterRenderPlan'
import { MasterExportRenderer } from './masterExportRenderer'
import { buildNativeFfmpegArgs, encodedFrameFromProgress, type NativeH264Encoder } from './nativeExportMath'
import type { VideoExportRequest } from './exportTypes'
import { ExportCancelledError } from './videoExporter'
import { createExportTracker } from './exportDiagnostics'
import { assertNativeOutput } from './nativeExportLifecycle'
import { logWebGLDiagnostics } from '../runtime/webglDiagnostics'

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError()
}

function nativeEncoder(): NativeH264Encoder {
  return /Macintosh|Mac OS X/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent) ? 'h264_videotoolbox' : 'libx264'
}

function frameName(frame: number): string {
  return `frame_${String(frame).padStart(6, '0')}.png`
}

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

function musicInputFileName(fileName: string): string {
  const extension = /\.[a-z0-9]+$/i.exec(fileName)?.[0] ?? '.audio'
  return `master-music-input${extension}`
}

export async function exportNativeMasterVideo(request: VideoExportRequest & { project: ProjectDocument }, destinationPath: string): Promise<NativeOutputVerification> {
  if (platformAdapter.kind !== 'desktop') throw new Error('Native FFmpeg export is available in the desktop app.')
  const runtime = platformAdapter.nativeExportRuntime
  if (!runtime) throw new Error('The desktop export runtime is not available.')
  const settings = { ...request.settings, source: 'master' as const, cameraId: null }
  const plan = request.masterPlan ?? buildMasterRenderPlan(request.project, { width: settings.width, deliveryAspectRatio: settings.deliveryAspectRatio, includeMusic: settings.includeMusic === true })
  if (settings.includeMusic === true && plan.musicOverlap && !request.musicBlob) throw new Error('Master Music is missing. Re-import the Music asset or export without Music.')
  const tracker = createExportTracker(request, plan.frameCount, {
    frameRange: { startFrame: plan.startFrame, endFrameExclusive: plan.endFrameExclusive },
    frameRate: plan.frameRate,
    resolution: plan.dimensions,
    encoderCommandId: NATIVE_FFMPEG_COMMAND_ID,
  })
  tracker.report('preparing')
  logWebGLDiagnostics('native master export: preparing')
  const jobId = `master-video-export-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const paths = await runtime.prepareWorkspace(jobId)
  let renderer: MasterExportRenderer | null = null
  const musicFileName = musicInputFileName(plan.musicOverlap ? projectMusicFileName(request.project, plan.musicOverlap.clipId) : 'master.audio')
  try {
    renderer = new MasterExportRenderer(request.project, plan, settings, request.masterImageAssets)
    logWebGLDiagnostics('native master export: renderer ready')
    if (settings.includeMusic === true && plan.musicOverlap && request.musicBlob) await runtime.writeFrame(paths.workspace, musicFileName, await blobBytes(request.musicBlob))
    for (let index = 0; index < plan.frameCount; index += 1) {
      throwIfAborted(request.signal)
      const masterFrame = plan.startFrame + index
      const png = await renderer.captureFramePng(masterFrame)
      tracker.markRendered()
      tracker.report('rendering')
      await runtime.writeFrame(paths.workspace, frameName(index), await blobBytes(png))
      tracker.markSubmitted()
      request.onProgress?.({ completedFrames: index + 1, totalFrames: plan.frameCount, currentFrame: masterFrame, phase: 'rendering' })
    }
    throwIfAborted(request.signal)
    const music = plan.musicOverlap && request.musicBlob ? {
      inputPath: `${paths.workspaceAbsolute}/${musicFileName}`,
      sourceStartSeconds: plan.musicOverlap.sourceStartSeconds,
      outputStartSeconds: plan.musicOverlap.outputStartSeconds,
      durationSeconds: plan.musicOverlap.durationSeconds,
    } : undefined
    tracker.report('encoding')
    try {
      const encoderResult = await runtime.runFfmpeg(buildNativeFfmpegArgs({ inputPattern: paths.inputPattern, outputPath: paths.partialAbsolutePath, width: plan.dimensions.width, height: plan.dimensions.height, frameRate: plan.frameRate, quality: settings.quality, encoder: nativeEncoder(), totalDurationSeconds: plan.frameCount * plan.frameRate.denominator / plan.frameRate.numerator, music }), request.signal, (line) => {
        const frame = encodedFrameFromProgress(line, plan.frameRate, plan.frameCount)
        if (frame !== null) request.onProgress?.({ completedFrames: frame, totalFrames: plan.frameCount, currentFrame: plan.startFrame + Math.max(0, frame - 1), phase: 'encoding' })
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
    logWebGLDiagnostics('native master export: completed')
    return output
  } catch (error) {
    throw tracker.fail(error)
  } finally {
    try {
      renderer?.dispose()
      logWebGLDiagnostics('native master export: renderer cleanup complete')
    } finally {
      await runtime.cleanupWorkspace(paths.workspace)
    }
  }
}

function projectMusicFileName(project: ProjectDocument, clipId: string): string {
  return project.masterSequence.musicClip?.id === clipId ? project.masterSequence.musicClip.asset.fileName : 'master.audio'
}
