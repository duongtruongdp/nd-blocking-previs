export type OverlayRect = { x: number; y: number; width: number; height: number }

export type OverlayLabelRequest = {
  id: string
  text: string
  rect: OverlayRect
}

export type OverlayLabelPlacement = {
  id: string
  side: 'left' | 'right'
  topOffset: number
}

export type CompactPreviewOverlayPolicy = {
  showCameraLabel: true
  showDeliveryLabel: false
  showGuideLabels: false
}

/** The small Blocking View monitor deliberately carries only its camera badge. */
export function compactPreviewOverlayPolicy(): CompactPreviewOverlayPolicy {
  return { showCameraLabel: true, showDeliveryLabel: false, showGuideLabels: false }
}

export function previewCameraLabel(cameraName: string, focalLengthMm: number, previewWidth: number): string {
  const fullLabel = `${cameraName} · ${focalLengthMm}mm`
  const availableCharacters = Math.max(8, Math.floor((previewWidth - 58) / 6.2))
  return fullLabel.length <= availableCharacters ? fullLabel : cameraName
}

export function fullCameraInfoLines(focalLengthMm: number, cameraModel?: string, captureMode?: string): [string, string] {
  return [`${focalLengthMm}mm${cameraModel ? ` · ${cameraModel}` : ''}`, captureMode ?? 'Sensor / Native']
}

export function cameraOverlayMode(containerWidth: number): 'full' | 'compact' {
  return containerWidth < 720 ? 'compact' : 'full'
}

function labelWidth(text: string, rectWidth: number): number {
  return Math.min(Math.max(42, text.length * 6.1 + 10), Math.max(42, rectWidth - 8))
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * Places small frame labels against their own frame while avoiding the camera
 * status block and already-placed labels. The algorithm is intentionally
 * deterministic and bounded; it is not a general overlay layout engine.
 */
export function layoutOverlayLabels(
  requests: readonly OverlayLabelRequest[],
  options: { width: number; height: number; statusRect?: { x: number; y: number; width: number; height: number } },
): OverlayLabelPlacement[] {
  const placed: Array<OverlayLabelPlacement & { bounds: { x: number; y: number; width: number; height: number } }> = []
  const labelHeight = 17
  requests.forEach((request) => {
    const rect = { x: request.rect.x * options.width, y: request.rect.y * options.height, width: request.rect.width * options.width, height: request.rect.height * options.height }
    const width = labelWidth(request.text, rect.width)
    const candidates: Array<{ side: 'left' | 'right'; top: number }> = []
    for (const top of [4, 22, 40, Math.max(4, rect.height - labelHeight - 4)]) {
      candidates.push({ side: 'left', top })
      candidates.push({ side: 'right', top })
    }
    const candidate = candidates.find(({ side, top }) => {
      const bounds = { x: rect.x + (side === 'left' ? 4 : rect.width - width - 4), y: rect.y + top, width, height: labelHeight }
      if (options.statusRect && intersects(bounds, options.statusRect)) return false
      return !placed.some((previous) => intersects(bounds, previous.bounds))
    }) ?? candidates[0]
    const bounds = { x: rect.x + (candidate.side === 'left' ? 4 : rect.width - width - 4), y: rect.y + candidate.top, width, height: labelHeight }
    placed.push({ id: request.id, side: candidate.side, topOffset: candidate.top, bounds })
  })
  return placed.map(({ id, side, topOffset }) => ({ id, side, topOffset }))
}
