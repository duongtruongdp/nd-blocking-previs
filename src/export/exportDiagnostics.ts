import type { VideoExportRequest, VideoExportStage, VideoExportStageEvent } from './exportTypes'
import type { NativeEncoderResult, NativeOutputVerification } from '../platform/platformAdapter'
import { recordWebGLDiagnosticEvent } from '../runtime/webglDiagnostics'

export type ExportDiagnosticsSnapshot = Omit<VideoExportStageEvent, 'stage'> & { stage: VideoExportStage }

export class ExportStageError extends Error {
  readonly stage: VideoExportStage
  readonly diagnostics: ExportDiagnosticsSnapshot
  readonly cause: unknown

  constructor(stage: VideoExportStage, error: unknown, diagnostics: ExportDiagnosticsSnapshot) {
    const message = error instanceof Error ? error.message : String(error)
    super(message)
    this.name = error instanceof Error && error.name ? error.name : 'ExportStageError'
    this.stage = stage
    this.diagnostics = diagnostics
    this.cause = error
  }
}

export type ExportDiagnosticContext = {
  frameRange?: { startFrame: number; endFrameExclusive: number }
  frameRate?: VideoExportStageEvent['frameRate']
  resolution?: { width: number; height: number }
  encoderCommandId?: string
}

export function createExportTracker(request: { settings: Pick<VideoExportRequest['settings'], 'source'>; onStage?: VideoExportRequest['onStage'] }, totalFrames: number, context: ExportDiagnosticContext = {}) {
  let renderedFrames = 0
  let submittedFrames = 0
  let stage: VideoExportStage = 'preparing'
  let outputBytes: number | undefined
  let encoderStatus: NativeEncoderResult | undefined
  let outputVerification: NativeOutputVerification | undefined
  let lastDiagnosticStage: VideoExportStage | null = null

  const report = (nextStage: VideoExportStage, message?: string): void => {
    stage = nextStage
    const event: VideoExportStageEvent = {
      stage,
      source: request.settings.source ?? 'scene',
      totalFrames,
      renderedFrames,
      submittedFrames,
      ...context,
      ...(encoderStatus ? { encoderCommandId: encoderStatus.commandId, encoderStarted: encoderStatus.started, encoderExitCode: encoderStatus.exitCode } : {}),
      ...(outputVerification ? { outputExists: outputVerification.exists, outputBytes: outputVerification.byteLength } : {}),
      ...(outputBytes === undefined ? {} : { outputBytes }),
      ...(message ? { message } : {}),
    }
    request.onStage?.(event)
    const diagnosticType = nextStage === 'preparing' ? 'export-started' : nextStage === 'rendering' ? 'export-rendering' : nextStage === 'encoding' ? 'export-encoding' : nextStage === 'completed' ? 'export-completed' : undefined
    if (diagnosticType && nextStage !== lastDiagnosticStage) {
      lastDiagnosticStage = nextStage
      recordWebGLDiagnosticEvent({ type: diagnosticType, renderer: event.source === 'master' ? 'master-export' : 'scene-export', exportStage: nextStage, message })
    }
    if (import.meta.env.DEV) {
      console.debug('[export]', event)
    }
  }

  const markRendered = (): void => { renderedFrames += 1 }
  const markSubmitted = (): void => { submittedFrames += 1 }
  const setOutputBytes = (bytes: number): void => { outputBytes = bytes }
  const setEncoderStatus = (status: NativeEncoderResult): void => { encoderStatus = status }
  const setOutputVerification = (verification: NativeOutputVerification): void => { outputVerification = verification; outputBytes = verification.byteLength }
  const snapshot = (): ExportDiagnosticsSnapshot => ({
    stage,
    source: request.settings.source ?? 'scene',
    totalFrames,
    renderedFrames,
    submittedFrames,
    ...context,
    ...(encoderStatus ? { encoderCommandId: encoderStatus.commandId, encoderStarted: encoderStatus.started, encoderExitCode: encoderStatus.exitCode } : {}),
    ...(outputVerification ? { outputExists: outputVerification.exists, outputBytes: outputVerification.byteLength } : {}),
    ...(outputBytes === undefined ? {} : { outputBytes }),
  })
  const fail = (error: unknown): ExportStageError => {
    const failure = new ExportStageError(stage, error, snapshot())
    recordWebGLDiagnosticEvent({ type: failure.stage === 'cancelled' ? 'export-cancelled' : 'export-failed', renderer: failure.diagnostics.source === 'master' ? 'master-export' : 'scene-export', exportStage: failure.stage, message: `error=${error instanceof Error ? error.name : 'UnknownError'}` })
    if (import.meta.env.DEV) {
      console.error('[export] failed', {
        stage: failure.stage,
        source: failure.diagnostics.source,
        totalFrames: failure.diagnostics.totalFrames,
        renderedFrames: failure.diagnostics.renderedFrames,
        submittedFrames: failure.diagnostics.submittedFrames,
        frameRange: failure.diagnostics.frameRange,
        frameRate: failure.diagnostics.frameRate,
        resolution: failure.diagnostics.resolution,
        encoderCommandId: failure.diagnostics.encoderCommandId,
        encoderStarted: failure.diagnostics.encoderStarted,
        encoderExitCode: failure.diagnostics.encoderExitCode,
        outputExists: failure.diagnostics.outputExists,
        outputBytes: failure.diagnostics.outputBytes,
        name: error instanceof Error ? error.name : 'UnknownError',
        message: exportErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
    return failure
  }
  return { report, markRendered, markSubmitted, setOutputBytes, setEncoderStatus, setOutputVerification, snapshot, fail }
}

export function exportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}
