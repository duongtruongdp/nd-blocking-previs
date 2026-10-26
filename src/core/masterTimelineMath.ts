import type { RationalFrameRate } from './sceneDocument'

export type MasterTimelinePixelRange = {
  startFrame: number
  endFrame: number
  startPx: number
  endPx: number
  widthPx: number
}

export function masterFrameToPixel(frame: number, pixelsPerFrame: number): number {
  return Math.max(0, frame) * Math.max(0.0001, pixelsPerFrame)
}

/**
 * Converts one temporal range from its two canonical frame boundaries.
 * Keeping both edges absolute avoids accumulating rounded pixel widths across
 * adjacent clips at very low zoom.
 */
export function masterFrameRangeToPixels(startFrame: number, endFrame: number, pixelsPerFrame: number): MasterTimelinePixelRange {
  const start = Math.max(0, Math.round(Number.isFinite(startFrame) ? startFrame : 0))
  const end = Math.max(start, Math.round(Number.isFinite(endFrame) ? endFrame : start))
  const startPx = masterFrameToPixel(start, pixelsPerFrame)
  const endPx = masterFrameToPixel(end, pixelsPerFrame)
  return { startFrame: start, endFrame: end, startPx, endPx, widthPx: Math.max(0.0001, endPx - startPx) }
}

export function pixelToMasterFrame(pixel: number, pixelsPerFrame: number, maxFrame: number): number {
  const frame = Math.round(Math.max(0, pixel) / Math.max(0.0001, pixelsPerFrame))
  return Math.max(0, Math.min(Math.max(0, Math.round(maxFrame)), frame))
}

/** Maps a viewport client X coordinate to the canonical Master frame domain. */
export function masterClientXToFrame(clientX: number, trackLeft: number, scrollLeft: number, trackOriginPadding: number, pixelsPerFrame: number, maxFrame: number): number {
  return pixelToMasterFrame(clientX - trackLeft + scrollLeft - trackOriginPadding, pixelsPerFrame, maxFrame)
}

export function fitMasterPixelsPerFrame(viewportWidth: number, shotSequenceFrames: number, rate: RationalFrameRate, emptyMusicPreviewSeconds = 20): number {
  const fallbackFrames = Math.max(1, Math.round(emptyMusicPreviewSeconds * rate.numerator / rate.denominator))
  return Math.max(0.02, Math.min(24, viewportWidth / Math.max(1, shotSequenceFrames || fallbackFrames)))
}

export function chooseMasterRulerInterval(pixelsPerFrame: number, rate: RationalFrameRate): number {
  const pixelsPerSecond = pixelsPerFrame * rate.numerator / rate.denominator
  const candidates = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  return candidates.find((seconds) => pixelsPerSecond * seconds >= 72) ?? 600
}

export function masterRulerFrames(maxFrame: number, pixelsPerFrame: number, rate: RationalFrameRate): number[] {
  const interval = chooseMasterRulerInterval(pixelsPerFrame, rate)
  const intervalFrames = Math.max(1, Math.round(interval * rate.numerator / rate.denominator))
  const marks: number[] = []
  for (let frame = 0; frame <= Math.max(0, Math.round(maxFrame)); frame += intervalFrames) marks.push(frame)
  return marks
}
