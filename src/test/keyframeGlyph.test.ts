import { describe, expect, it } from 'vitest'
import { keyframeGlyphMode } from '../timeline/keyframeGlyph'

describe('keyframe glyph mode resolution', () => {
  it('maps interpolation and easing metadata to the visual mode', () => {
    expect(keyframeGlyphMode({ interpolation: 'linear' })).toBe('linear')
    expect(keyframeGlyphMode({ interpolation: 'linear', easeIn: true })).toBe('easeIn')
    expect(keyframeGlyphMode({ interpolation: 'linear', easeOut: true })).toBe('easeOut')
    expect(keyframeGlyphMode({ interpolation: 'linear', easeIn: true, easeOut: true })).toBe('easeInOut')
    expect(keyframeGlyphMode({ interpolation: 'hold', easeIn: true, easeOut: true })).toBe('hold')
  })

  it('keeps legacy keys without easing metadata as linear', () => {
    expect(keyframeGlyphMode({ interpolation: 'linear' })).toBe('linear')
  })
})
