import { describe, expect, it } from 'vitest'
import { createFrameGuide } from '../core/frameGuides'
import { frameGuideSelectionAfterDelete, resolveFrameGuideSelection } from '../core/frameGuideSelection'

describe('Frame Guide selection identity', () => {
  const guides = [
    createFrameGuide('guide-a', 'A', 1),
    createFrameGuide('guide-b', 'B', 4 / 3),
    createFrameGuide('guide-c', 'C', 2.39),
  ]

  it('preserves a valid guide ID through document edits and only falls back when invalid', () => {
    expect(resolveFrameGuideSelection(guides, 'guide-b')).toBe('guide-b')
    expect(resolveFrameGuideSelection([{ ...guides[1], name: 'B revised' }], 'guide-b')).toBe('guide-b')
    expect(resolveFrameGuideSelection(guides, null)).toBe('guide-a')
    expect(resolveFrameGuideSelection(guides, 'deleted-guide')).toBe('guide-a')
    expect(resolveFrameGuideSelection([], 'guide-b')).toBeNull()
  })

  it('selects the next adjacent guide after deletion, then the previous guide', () => {
    expect(frameGuideSelectionAfterDelete(guides, 'guide-a')).toBe('guide-b')
    expect(frameGuideSelectionAfterDelete(guides, 'guide-b')).toBe('guide-c')
    expect(frameGuideSelectionAfterDelete(guides, 'guide-c')).toBe('guide-b')
    expect(frameGuideSelectionAfterDelete([guides[0]], 'guide-a')).toBeNull()
  })
})
