import type { KeyframeGlyphMode } from '../timeline/keyframeGlyph'

type KeyframeGlyphProps = {
  mode: KeyframeGlyphMode
}

const paths: Record<KeyframeGlyphMode, string> = {
  linear: 'M 6 1 L 11 6 L 6 11 L 1 6 Z',
  easeIn: 'M 1.4 1.4 Q 4.4 6 1.4 10.6 L 11 6 Z',
  easeOut: 'M 10.6 1.4 Q 7.6 6 10.6 10.6 L 1 6 Z',
  easeInOut: 'M 1.2 1.4 Q 4.2 2.2 6 4.8 Q 7.8 2.2 10.8 1.4 Q 9.6 4.3 7.1 6 Q 9.6 7.7 10.8 10.6 Q 7.8 9.8 6 7.2 Q 4.2 9.8 1.2 10.6 Q 2.4 7.7 4.9 6 Q 2.4 4.3 1.2 1.4 Z',
  hold: 'M 2 2 H 10 V 10 H 2 Z',
}

export function KeyframeGlyph({ mode }: KeyframeGlyphProps) {
  return <svg className={`v2-keyframe-glyph v2-keyframe-glyph-${mode}`} viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path className="v2-keyframe-glyph-path" d={paths[mode]} /></svg>
}
