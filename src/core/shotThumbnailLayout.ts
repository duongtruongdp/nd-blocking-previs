import type { ShotThumbnail } from './shotDocument'

/** The standard Shot List preview frame; the image remains aspect-preserving inside it. */
export const SHOT_LIST_PREVIEW_ASPECT = 16 / 9

export function thumbnailAspectRatio(thumbnail: Pick<ShotThumbnail, 'width' | 'height'> | null | undefined): number {
  const width = thumbnail?.width ?? 0
  const height = thumbnail?.height ?? 0
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return SHOT_LIST_PREVIEW_ASPECT
  return width / height
}

export function containThumbnailRect(containerWidth: number, containerHeight: number, sourceWidth: number, sourceHeight: number): { x: number; y: number; width: number; height: number } {
  const safeContainerWidth = Math.max(0, containerWidth)
  const safeContainerHeight = Math.max(0, containerHeight)
  const safeSourceWidth = Math.max(1, sourceWidth)
  const safeSourceHeight = Math.max(1, sourceHeight)
  const scale = Math.min(safeContainerWidth / safeSourceWidth, safeContainerHeight / safeSourceHeight)
  const width = safeSourceWidth * scale
  const height = safeSourceHeight * scale
  return { x: (safeContainerWidth - width) / 2, y: (safeContainerHeight - height) / 2, width, height }
}
