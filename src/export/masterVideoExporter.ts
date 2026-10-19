import { AudioBufferSource, BufferTarget, CanvasSource, Input, ALL_FORMATS, BlobSource, Mp4OutputFormat, Output, Quality } from 'mediabunny'
import { canExportMp4 } from './formatSupport'
import { mediaRecorderErrorMessage, selectWebmMimeType } from './mediaRecorder'
import { MasterExportRenderer } from './masterExportRenderer'
import { buildMasterRenderPlan } from './masterRenderPlan'
import { decodeMasterMusicForExport } from './masterAudio'
import { rationalFrameDuration, frameTimestampSeconds } from './exportMath'
import type { ProjectDocument } from '../core/projectDocument'
import type { VideoExportProgressHandler, VideoExportRequest } from './exportTypes'
import { ExportCancelledError } from './videoExporter'

function mediabunnyQuality(quality: VideoExportRequest['settings']['quality']): 'low' | 'medium' | 'high' {
  return quality === 'high' ? 'high' : quality === 'small' ? 'low' : 'medium'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError()
}

function waitUntil(targetTimeMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, targetTimeMs - performance.now())))
}

export async function exportMasterVideo(request: VideoExportRequest & { project: ProjectDocument }): Promise<Blob> {
  const settings = { ...request.settings, source: 'master' as const, cameraId: null }
  const plan = request.masterPlan ?? buildMasterRenderPlan(request.project, { width: settings.width, deliveryAspectRatio: settings.deliveryAspectRatio, includeMusic: settings.includeMusic === true })
  if (settings.includeMusic === true && plan.musicOverlap && !request.musicBlob) throw new Error('Master Music is missing. Re-import the Music asset or export without Music.')
  const renderer = new MasterExportRenderer(request.project, plan, settings)
  try {
    const musicBuffer = settings.includeMusic === true && plan.musicOverlap && request.musicBlob ? await decodeMasterMusicForExport(request.musicBlob, plan) : null
    return settings.format === 'mp4'
      ? await encodeMasterMp4(renderer, plan, settings.quality, musicBuffer, request.signal, request.onProgress)
      : await encodeMasterWebm(renderer, plan, musicBuffer, request.signal, request.onProgress)
  } finally {
    renderer.dispose()
  }
}

async function encodeMasterMp4(renderer: MasterExportRenderer, plan: ReturnType<typeof buildMasterRenderPlan>, quality: VideoExportRequest['settings']['quality'], musicBuffer: AudioBuffer | null, signal: AbortSignal | undefined, onProgress: VideoExportProgressHandler | undefined): Promise<Blob> {
  if (!(await canExportMp4(plan.dimensions, plan.frameRate))) throw new Error('MP4 unavailable in this browser.')
  const target = new BufferTarget()
  const output = new Output({ format: new Mp4OutputFormat(), target })
  const videoSource = new CanvasSource(renderer.canvas, { codec: 'avc', quality: new Quality(mediabunnyQuality(quality)) })
  output.addVideoTrack(videoSource, { frameRate: plan.frameRate.numerator / plan.frameRate.denominator })
  const audioSource = musicBuffer ? new AudioBufferSource({ codec: 'aac', quality: new Quality('medium') }) : null
  if (audioSource) output.addAudioTrack(audioSource)
  const abortHandler = () => { void output.cancel() }
  signal?.addEventListener('abort', abortHandler, { once: true })
  try {
    throwIfAborted(signal)
    await output.start()
    const duration = rationalFrameDuration(plan.frameRate)
    for (let index = 0; index < plan.frameCount; index += 1) {
      throwIfAborted(signal)
      const masterFrame = plan.startFrame + index
      renderer.renderFrame(masterFrame)
      await videoSource.add(frameTimestampSeconds(index, plan.frameRate), duration)
      onProgress?.({ completedFrames: index + 1, totalFrames: plan.frameCount, currentFrame: masterFrame, phase: 'rendering' })
    }
    if (audioSource && musicBuffer) await audioSource.add(musicBuffer)
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
  }
}

async function encodeMasterWebm(renderer: MasterExportRenderer, plan: ReturnType<typeof buildMasterRenderPlan>, musicBuffer: AudioBuffer | null, signal: AbortSignal | undefined, onProgress: VideoExportProgressHandler | undefined): Promise<Blob> {
  const mimeType = selectWebmMimeType()
  if (!mimeType) throw new Error(mediaRecorderErrorMessage())
  if (typeof renderer.canvas.captureStream !== 'function') throw new Error('This browser cannot capture the Master export canvas for video.')
  const stream = renderer.canvas.captureStream(0)
  const videoTrack = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined
  const frameContext = musicBuffer ? audioCaptureStream(musicBuffer, stream) : null
  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, { mimeType })
  } catch {
    frameContext?.dispose()
    stream.getTracks().forEach((track) => track.stop())
    throw new Error(mediaRecorderErrorMessage())
  }
  const chunks: Blob[] = []
  const recording = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data) }
    recorder.onerror = () => reject(new Error('The browser could not encode the Master export video.'))
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })
  const abortHandler = () => { if (recorder.state !== 'inactive') recorder.stop() }
  signal?.addEventListener('abort', abortHandler, { once: true })
  try {
    throwIfAborted(signal)
    recorder.start()
    frameContext?.start()
    const startedAt = performance.now()
    const frameDurationMs = rationalFrameDuration(plan.frameRate) * 1000
    for (let index = 0; index < plan.frameCount; index += 1) {
      throwIfAborted(signal)
      const masterFrame = plan.startFrame + index
      renderer.renderFrame(masterFrame)
      videoTrack?.requestFrame?.()
      onProgress?.({ completedFrames: index + 1, totalFrames: plan.frameCount, currentFrame: masterFrame, phase: 'rendering' })
      await waitUntil(startedAt + (index + 1) * frameDurationMs)
    }
    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await recording
    throwIfAborted(signal)
    return blob
  } finally {
    signal?.removeEventListener('abort', abortHandler)
    frameContext?.dispose()
    stream.getTracks().forEach((track) => track.stop())
  }
}

function audioCaptureStream(buffer: AudioBuffer, stream: MediaStream): { start: () => void; dispose: () => void } {
  const Context = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Context) throw new Error('This browser cannot include Master Music in WebM export.')
  const context = new Context()
  const destination = context.createMediaStreamDestination()
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(destination)
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track))
  return {
    start: () => { void context.resume(); source.start(0) },
    dispose: () => { try { source.stop() } catch {} destination.stream.getTracks().forEach((track) => track.stop()); void context.close() },
  }
}

export async function validateMasterMusicBlob(blob: Blob): Promise<boolean> {
  try {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
    return Boolean(await input.getPrimaryAudioTrack())
  } catch {
    return false
  }
}
