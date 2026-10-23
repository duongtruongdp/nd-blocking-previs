export function isExportCancelled(error: unknown): boolean {
  return error instanceof Error && (error.name === 'ExportCancelledError' || error.name === 'AbortError')
}

export function userFacingExportError(error: unknown): string {
  if (error instanceof Error && error.message === 'Export cancelled.') return 'Export cancelled.'
  if (error instanceof Error && /Master Music is missing/i.test(error.message)) return error.message
  if (error instanceof Error && /Master export requires|Master clip|Shot .*missing Scene|No shots in the Master Sequence|Master render range/i.test(error.message)) return error.message
  if (error instanceof Error && /MP4 unavailable/i.test(error.message)) return 'MP4 export is not supported by this browser. Choose WebM instead.'
  if (error instanceof Error && /WebM video|capture the export canvas/i.test(error.message)) return 'WebM export is not supported by this browser. Try the latest Chrome or Edge on desktop.'
  if (error instanceof ExportStageError) return `Video export failed during ${stageLabel(error.stage)}: ${exportErrorMessage(error.cause)}`
  if (error instanceof Error && /Camera/i.test(error.message)) return error.message
  return `Video export failed: ${exportErrorMessage(error)}`
}
import { ExportStageError, exportErrorMessage } from './exportDiagnostics'


function stageLabel(stage: ExportStageError['stage']): string {
  if (stage === 'preparing') return 'preparation'
  if (stage === 'rendering') return 'rendering'
  if (stage === 'encoding') return 'encoding'
  if (stage === 'finalizing') return 'MP4 finalization'
  if (stage === 'saving') return 'saving'
  return stage
}
