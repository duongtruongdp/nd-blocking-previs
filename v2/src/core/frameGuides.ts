import type { FrameGuide, FrameGuideLineStyle } from './sceneDocument'

export type FrameGuidePreset = {
  name: string
  aspectRatio: number
  category: 'Cinema' | 'Social' | 'Custom'
}

export const FRAME_GUIDE_PRESETS: readonly FrameGuidePreset[] = [
  { name: '16:9', aspectRatio: 16 / 9, category: 'Cinema' },
  { name: '1.85:1', aspectRatio: 1.85, category: 'Cinema' },
  { name: '2.00:1', aspectRatio: 2, category: 'Cinema' },
  { name: '2.39:1', aspectRatio: 2.39, category: 'Cinema' },
  { name: '2.40:1', aspectRatio: 2.4, category: 'Cinema' },
  { name: '4:3', aspectRatio: 4 / 3, category: 'Cinema' },
  { name: '3:2', aspectRatio: 3 / 2, category: 'Cinema' },
  { name: '1:1', aspectRatio: 1, category: 'Social' },
  { name: '4:5', aspectRatio: 4 / 5, category: 'Social' },
  { name: '9:16', aspectRatio: 9 / 16, category: 'Social' },
  { name: '2:1', aspectRatio: 2, category: 'Cinema' },
  { name: '5:4', aspectRatio: 5 / 4, category: 'Social' },
  { name: '1.66:1', aspectRatio: 1.66, category: 'Cinema' },
]

export const DEFAULT_FRAME_GUIDE_COLOR = '#D7DDE8'

export function normalizeFrameGuideColor(value: string, fallback = DEFAULT_FRAME_GUIDE_COLOR): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback
}

export function createFrameGuide(id: string, name: string, aspectRatio: number, overrides: Partial<FrameGuide> = {}): FrameGuide {
  const guide: FrameGuide = {
    id,
    name,
    aspectRatio,
    enabled: true,
    lineStyle: 'dashed' satisfies FrameGuideLineStyle,
    opacity: 0.82,
    lineWeight: 1,
    color: DEFAULT_FRAME_GUIDE_COLOR,
    shadeOutside: false,
    shadeOpacity: 0.12,
    safeMarginPercent: 0,
    ...overrides,
  }
  return { ...guide, color: normalizeFrameGuideColor(guide.color) }
}

export function frameGuideLabel(aspectRatio: number): string {
  if (Math.abs(aspectRatio - 16 / 9) < 0.005) return '16:9'
  if (Math.abs(aspectRatio - 4 / 3) < 0.005) return '4:3'
  if (Math.abs(aspectRatio - 3 / 2) < 0.005) return '3:2'
  if (Math.abs(aspectRatio - 1) < 0.005) return '1:1'
  return `${aspectRatio.toFixed(2)}:1`
}
