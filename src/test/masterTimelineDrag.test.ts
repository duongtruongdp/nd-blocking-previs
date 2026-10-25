import { describe, expect, it } from 'vitest'
import { masterShotPlacementIsValid, masterShotSnapTargets, masterTimelineInsertionIndex, previewMasterClipOrder, snapMasterFrame } from '../core/masterTimelineDrag'

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

  it('keeps insertion thresholds on absolute boundaries at minimum zoom', () => {
    const shortClips = clips.map((clip, index) => ({ ...clip, sourceEndFrame: index === 0 ? 1 : index === 1 ? 2 : index === 2 ? 1 : 3 }))
    // The first two clips occupy 0–1 and 1–3 frames; the threshold after the
    // second clip is still derived from frame 3, even below one pixel/frame.
    expect(masterTimelineInsertionIndex(shortClips, 0.06, 0.02)).toBe(2)
  })

  it('supports B between C and D and a no-op original insertion', () => {
    expect(previewMasterClipOrder(clips, 'clip-b', 2).map((clip) => clip.id)).toEqual(['clip-a', 'clip-c', 'clip-b', 'clip-d'])
    expect(previewMasterClipOrder(clips, 'clip-b', 1).map((clip) => clip.id)).toEqual(['clip-a', 'clip-b', 'clip-c', 'clip-d'])
  })

  it('snaps to absolute clip boundaries, playhead, and marks without ripple math', () => {
    const placed = clips.map((clip, index) => ({ ...clip, startMasterFrame: index === 0 ? 0 : index === 1 ? 140 : index === 2 ? 200 : 520 }))
    const sequence = { clips: placed, markInFrame: 300, markOutFrame: 480 }
    const targets = masterShotSnapTargets(sequence, 'clip-a', 300, 300, 480)
    expect(snapMasterFrame(137, targets, 5)).toBe(140)
    expect(snapMasterFrame(302, targets, 5)).toBe(300)
    expect(snapMasterFrame(151, targets, 5)).toBe(151)
  })

  it('reports overlap previews as invalid while allowing a gap placement', () => {
    const placed = clips.slice(0, 2).map((clip, index) => ({ ...clip, startMasterFrame: index === 0 ? 0 : 140 }))
    const sequence = { clips: placed }
    expect(masterShotPlacementIsValid(sequence, 'clip-b', 60)).toBe(false)
    expect(masterShotPlacementIsValid(sequence, 'clip-b', 110)).toBe(true)
  })
})
