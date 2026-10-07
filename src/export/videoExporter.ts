import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality } from 'mediabunny'
import type { RationalFrameRate } from '../core/sceneDocument'
import { deliveryAspectForCamera, dimensionsForDeliveryAspect, exportFrameRange, frameTimestampSeconds, rationalFrameDuration, validateExportRequest } from './exportMath'
import { canExportMp4 } from './formatSupport'
import { mediaRecorderErrorMessage, selectWebmMimeType } from './mediaRecorder'
import { VideoExportRenderer } from './exportRenderer'
import type { VideoExportProgressHandler, VideoExportRequest } from './exportTypes'

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.')
    this.name = 'ExportCancelledError'
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError()
}

function waitUntil(targetTimeMs: number): Promise<void> {
  // WebM MediaRecorder has no portable explicit timestamp API. This clock is
  // used only to pace requestFrame() wall-clock submission; MP4 timestamps are
  // derived independently from the rational frame rate below.
  const delay = targetTimeMs - performance.now()
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, delay)))
}

async function recordCanvas(canvas: HTMLCanvasElement, frames: readonly number[], frameRate: RationalFrameRate, renderFrame: (frame: number) => void, signal: AbortSignal | undefined, onProgress: VideoExportProgressHandler | undefined): Promise<Blob> {
  const mimeType = selectWebmMimeType()
  if (!mimeType) throw new Error(mediaRecorderErrorMessage())
  if (typeof canvas.captureStream !== 'function') throw new Error('This browser cannot capture the export canvas for video.')

  const probeStream = canvas.captureStream(0)
  let stream = probeStream
  let videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  const frameRequestSupported = typeof videoTrack?.requestFrame === 'function'
  if (!frameRequestSupported) {
    stream.getTracks().forEach((track) => track.stop())
    stream = canvas.captureStream(frameRate.numerator / frameRate.denominator)
    videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  }

  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, { mimeType })
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error(mediaRecorderErrorMessage())
  }
  const chunks: Blob[] = []
  const recording = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
    recorder.onerror = () => reject(new Error('The browser could not encode the export video.'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })
  const abortHandler = () => {
    if (recorder.state !== 'inactive') recorder.stop()
  }
  signal?.addEventListener('abort', abortHandler, { once: true })
  try {
    throwIfAborted(signal)
    recorder.start()
    const startedAt = performance.now()
    const frameDurationMs = rationalFrameDuration(frameRate) * 1000
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(signal)
      const frame = frames[index]
      renderFrame(frame)
      videoTrack?.requestFrame?.()
      onProgress?.({ completedFrames: index + 1, totalFrames: frames.length, currentFrame: frame })
      await waitUntil(startedAt + (index + 1) * frameDurationMs)
    }
    throwIfAborted(signal)
    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await recording
    throwIfAborted(signal)
    return blob
  } finally {
    signal?.removeEventListener('abort', abortHandler)
    stream.getTracks().forEach((track) => track.stop())
  }
}

export async function exportWebm({ document, settings, signal, onProgress }: VideoExportRequest): Promise<Blob> {
  const validationError = validateExportRequest(document, settings.cameraId, settings.markIn, settings.markOut)
  if (validationError) throw new Error(validationError)
  const frames = exportFrameRange(settings.markIn, settings.markOut)
  const renderer = new VideoExportRenderer(document, settings)
  try {
    return await recordCanvas(renderer.canvas, frames, settings.frameRate, (frame) => renderer.renderFrame(frame), signal, onProgress)
  } finally {
    renderer.dispose()
  }
}

async function exportMp4({ document, settings, signal, onProgress }: VideoExportRequest): Promise<Blob> {
  const validationError = validateExportRequest(document, settings.cameraId, settings.markIn, settings.markOut)
  if (validationError) throw new Error(validationError)
  const outputDimensions = dimensionsForDeliveryAspect(settings.width, deliveryAspectForCamera(settings.deliveryAspectRatio, settings.cameraId, document))
  if (!(await canExportMp4(outputDimensions, settings.frameRate))) throw new Error('MP4 unavailable in this browser.')

  const frames = exportFrameRange(settings.markIn, settings.markOut)
  const renderer = new VideoExportRenderer(document, settings)
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const frameRate = settings.frameRate.numerator / settings.frameRate.denominator
  const source = new CanvasSource(renderer.canvas, { codec: 'avc', quality: new Quality('high') })
  output.addVideoTrack(source, { frameRate })
  const abortHandler = () => { void output.cancel() }
  signal?.addEventListener('abort', abortHandler, { once: true })
  try {
    throwIfAborted(signal)
    await output.start()
    const duration = rationalFrameDuration(settings.frameRate)
    for (let index = 0; index < frames.length; index += 1) {
      throwIfAborted(signal)
      renderer.renderFrame(frames[index])
      await source.add(frameTimestampSeconds(index, settings.frameRate), duration)
      onProgress?.({ completedFrames: index + 1, totalFrames: frames.length, currentFrame: frames[index] })
    }
    throwIfAborted(signal)
    await output.finalize()
    if (!target.buffer) throw new Error('The browser did not produce an MP4 file.')
    return new Blob([target.buffer], { type: 'video/mp4' })
  } catch (error) {
    if (signal?.aborted) throw new ExportCancelledError()
    throw error
  } finally {
    signal?.removeEventListener('abort', abortHandler)
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => {})
    renderer.dispose()
  }
}

export async function exportVideo(request: VideoExportRequest): Promise<Blob> {
  return request.settings.format === 'mp4' ? exportMp4(request) : exportWebm(request)
}
