export const MAX_STAGE_PIXEL_RATIO = 2

export function capStagePixelRatio(devicePixelRatio: number | undefined): number {
  if (!Number.isFinite(devicePixelRatio) || !devicePixelRatio || devicePixelRatio < 1) return 1
  return Math.min(devicePixelRatio, MAX_STAGE_PIXEL_RATIO)
}
