export function isExportCancelled(error: unknown): boolean {
  return error instanceof Error && (error.name === 'ExportCancelledError' || error.name === 'AbortError')
}

export function userFacingExportError(error: unknown): string {
  if (error instanceof Error && error.message === 'Export cancelled.') return 'Export cancelled.'
  if (error instanceof Error && /MP4 unavailable/i.test(error.message)) return 'MP4 export is not supported by this browser. Choose WebM instead.'
  if (error instanceof Error && /WebM video|capture the export canvas/i.test(error.message)) return 'WebM export is not supported by this browser. Try the latest Chrome or Edge on desktop.'
  return 'Video export failed. Check the selected Camera and try again.'
}
