import { describe, expect, it } from 'vitest'
import { masterTimelineInsertionIndex, previewMasterClipOrder } from '../core/masterTimelineDrag'

const clips = [
  { id: 'clip-a', shotId: 'a', sourceStartFrame: 0, sourceEndFrame: 100, order: 0 },
  { id: 'clip-b', shotId: 'b', sourceStartFrame: 0, sourceEndFrame: 20, order: 1 },
  { id: 'clip-c', shotId: 'c', sourceStartFrame: 0, sourceEndFrame: 300, order: 2 },
  { id: 'clip-d', shotId: 'd', sourceStartFrame: 0, sourceEndFrame: 10, order: 3 },
]

describe('Master Timeline magnetic insertion geometry', () => {
  it('uses remaining clip geometry for C before A and A after D', () => {
    expect(previewMasterClipOrder(clips, 'clip-c', 0).map((clip) => clip.id)).toEqual(['clip-c', 'clip-a', 'clip-b', 'clip-d'])
    expect(previewMasterClipOrder(clips, 'clip-a', 3).map((clip) => clip.id)).toEqual(['clip-b', 'clip-c', 'clip-d', 'clip-a'])
  })

  it('uses unequal timeline durations instead of equal list slots', () => {
    // After removing D, A occupies 0–100 and B occupies 100–120 frames.
    expect(masterTimelineInsertionIndex(clips, 90, 1, 'clip-d')).toBe(1)
    expect(masterTimelineInsertionIndex(clips, 115, 1, 'clip-d')).toBe(2)
    expect(previewMasterClipOrder(clips, 'clip-d', 1).map((clip) => clip.id)).toEqual(['clip-a', 'clip-d', 'clip-b', 'clip-c'])
  })

  it('supports B between C and D and a no-op original insertion', () => {
    expect(previewMasterClipOrder(clips, 'clip-b', 2).map((clip) => clip.id)).toEqual(['clip-a', 'clip-c', 'clip-b', 'clip-d'])
    expect(previewMasterClipOrder(clips, 'clip-b', 1).map((clip) => clip.id)).toEqual(['clip-a', 'clip-b', 'clip-c', 'clip-d'])
  })
})
