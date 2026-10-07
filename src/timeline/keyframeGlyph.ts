import type { TimelineInterpolation } from '../core/sceneDocument'

export type KeyframeGlyphMode = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold'

export type KeyframeGlyphSource = {
  interpolation: TimelineInterpolation
  easeIn?: boolean
  easeOut?: boolean
}

/** Resolve the visual glyph without changing the evaluator's interpolation semantics. */
export function keyframeGlyphMode(keyframe: KeyframeGlyphSource): KeyframeGlyphMode {
  if (keyframe.interpolation === 'hold') return 'hold'
  if (keyframe.easeIn && keyframe.easeOut) return 'easeInOut'
  if (keyframe.easeIn) return 'easeIn'
  if (keyframe.easeOut) return 'easeOut'
  return 'linear'
}

export function keyframeGlyphLabel(mode: KeyframeGlyphMode): string {
  if (mode === 'easeIn') return 'Ease In'
  if (mode === 'easeOut') return 'Ease Out'
  if (mode === 'easeInOut') return 'Ease In & Out'
  if (mode === 'hold') return 'Hold'
  return 'Linear'
}
