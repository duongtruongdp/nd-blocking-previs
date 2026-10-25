import { describe, expect, it } from 'vitest'
import { createMasterSequenceDocument, resolveMasterFrame, trimMasterClipToRange, type MasterSequenceDocument } from '../core/masterSequence'
import { createShotDocument } from '../core/shotDocument'
import { duplicateMasterTimelineSelection, moveMasterTimelineSelection, previewMasterClipTrim, removeMasterTimelineSelection, type MasterTimelineItem } from '../core/masterTimelineEditing'

const base = (clips: MasterSequenceDocument['clips']): MasterSequenceDocument => ({ ...createMasterSequenceDocument(), clips })

describe('Master Timeline NLE editing', () => {
  it('trims the source range without changing the timeline start for a right trim', () => {
    const sequence = base([{ id: 'a', shotId: 'shot-a', sourceStartFrame: 0, sourceEndFrame: 100, startMasterFrame: 20, order: 0 }])
    const trimmed = { ...sequence, clips: sequence.clips.map((clip) => ({ ...clip, sourceEndFrame: 70 })) }
    expect(trimmed.clips[0]).toMatchObject({ startMasterFrame: 20, sourceStartFrame: 0, sourceEndFrame: 70 })
    expect(resolveMasterFrame(trimmed, [], 19)).toBeNull()
    expect(resolveMasterFrame(trimmed, [], 20)?.sourceFrame).toBe(0)
    expect(resolveMasterFrame(trimmed, [], 89)?.sourceFrame).toBe(69)
    expect(resolveMasterFrame(trimmed, [], 90)).toBeNull()
  })

  it('validates source bounds and rejects a trimmed placement overlap', () => {
    const shot = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: 'scene-a', cameraId: null, startFrame: 10, endFrame: 100, order: 0, notes: '', thumbnail: null })
    const sequence = base([
      { id: 'a', shotId: shot.id, sourceStartFrame: 10, sourceEndFrame: 80, startMasterFrame: 0, order: 0 },
      { id: 'b', shotId: 'shot-b', sourceStartFrame: 0, sourceEndFrame: 20, startMasterFrame: 100, order: 1 },
    ])
    expect(trimMasterClipToRange(sequence, 'a', shot, 0, 50)).toBeNull()
    expect(trimMasterClipToRange(sequence, 'a', shot, 20, 90, 60)).toBeNull()
    const valid = trimMasterClipToRange(sequence, 'a', shot, 20, 60, 10)
    expect(valid?.clips.find((clip) => clip.id === 'a')).toMatchObject({ sourceStartFrame: 20, sourceEndFrame: 60, startMasterFrame: 10 })
  })

  it('moves the timeline start and source in together for a left trim', () => {
    const sequence = base([{ id: 'a', shotId: 'shot-a', sourceStartFrame: 20, sourceEndFrame: 100, startMasterFrame: 50, order: 0 }])
    const trimmed = { ...sequence, clips: sequence.clips.map((clip) => ({ ...clip, sourceStartFrame: 35, startMasterFrame: 65 })) }
    expect(trimmed.clips[0]).toMatchObject({ startMasterFrame: 65, sourceStartFrame: 35, sourceEndFrame: 100 })
    expect(trimmed.clips[0].startMasterFrame! + (trimmed.clips[0].sourceEndFrame - trimmed.clips[0].sourceStartFrame)).toBe(130)
  })

  it('clamps right trim to the source end while the pointer is beyond it', () => {
    const shot = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: 'scene-a', cameraId: null, startFrame: 0, endFrame: 96, order: 0, notes: '', thumbnail: null })
    const sequence = base([{ id: 'a', shotId: shot.id, sourceStartFrame: 0, sourceEndFrame: 48, startMasterFrame: 100, order: 0 }])
    const preview = previewMasterClipTrim(sequence, 'a', shot, 'trim-right', 250)
    expect(preview).toMatchObject({ boundary: 196, startMasterFrame: 100, sourceStartFrame: 0, sourceEndFrame: 96, constrained: true, limitingConstraint: 'SOURCE_LIMIT' })
  })

  it('clamps left trim to Source In and keeps the original right boundary', () => {
    const shot = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: 'scene-a', cameraId: null, startFrame: 0, endFrame: 96, order: 0, notes: '', thumbnail: null })
    const sequence = base([{ id: 'a', shotId: shot.id, sourceStartFrame: 48, sourceEndFrame: 96, startMasterFrame: 148, order: 0 }])
    const preview = previewMasterClipTrim(sequence, 'a', shot, 'trim-left', -20)
    expect(preview).toMatchObject({ boundary: 100, startMasterFrame: 100, sourceStartFrame: 0, sourceEndFrame: 96, constrained: true, limitingConstraint: 'SOURCE_LIMIT' })
  })

  it('clamps trim extension to the nearest neighboring Shot without moving it', () => {
    const shotA = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: 'scene-a', cameraId: null, startFrame: 0, endFrame: 150, order: 0, notes: '', thumbnail: null })
    const shotB = createShotDocument({ id: 'shot-b', name: 'Shot B', sceneId: 'scene-a', cameraId: null, startFrame: 0, endFrame: 80, order: 1, notes: '', thumbnail: null })
    const sequence = base([
      { id: 'a', shotId: shotA.id, sourceStartFrame: 0, sourceEndFrame: 50, startMasterFrame: 100, order: 0 },
      { id: 'b', shotId: shotB.id, sourceStartFrame: 50, sourceEndFrame: 80, startMasterFrame: 180, order: 1 },
    ])
    const preview = previewMasterClipTrim(sequence, 'a', shotA, 'trim-right', 500)
    expect(preview).toMatchObject({ boundary: 180, limitingConstraint: 'NEIGHBOR_LIMIT', neighborCollisionBoundary: 180 })
    expect(sequence.clips.find((clip) => clip.id === 'b')?.startMasterFrame).toBe(180)
    const leftLimited = previewMasterClipTrim(sequence, 'b', shotB, 'trim-left', -100)
    expect(leftLimited).toMatchObject({ boundary: 150, limitingConstraint: 'NEIGHBOR_LIMIT', neighborCollisionBoundary: 150 })
  })

  it('preserves a one-frame minimum and recalculates from the original snapshot', () => {
    const shot = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: 'scene-a', cameraId: null, startFrame: 0, endFrame: 96, order: 0, notes: '', thumbnail: null })
    const sequence = base([{ id: 'a', shotId: shot.id, sourceStartFrame: 0, sourceEndFrame: 96, startMasterFrame: 100, order: 0 }])
    const short = previewMasterClipTrim(sequence, 'a', shot, 'trim-right', 100)
    const restored = previewMasterClipTrim(sequence, 'a', shot, 'trim-right', 196)
    const backToMiddle = previewMasterClipTrim(sequence, 'a', shot, 'trim-right', 172)
    expect(short).toMatchObject({ boundary: 101, sourceEndFrame: 1 })
    expect(restored).toMatchObject({ boundary: 196, sourceEndFrame: 96 })
    expect(backToMiddle).toMatchObject({ boundary: 172, sourceEndFrame: 72 })
  })

  it('clamps negative timeline boundaries without changing the source Shot', () => {
    const shot = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: 'scene-a', cameraId: null, startFrame: 10, endFrame: 40, order: 0, notes: '', thumbnail: null })
    const sequence = base([{ id: 'a', shotId: shot.id, sourceStartFrame: 20, sourceEndFrame: 40, startMasterFrame: 30, order: 0 }])
    const preview = previewMasterClipTrim(sequence, 'a', shot, 'trim-left', -50)
    expect(preview).toMatchObject({ boundary: 20, sourceStartFrame: 10, sourceEndFrame: 40 })
    expect(shot.startFrame).toBe(10)
    expect(shot.endFrame).toBe(40)
  })

  it('moves mixed Shot and Graphics selections by one anchor delta', () => {
    const sequence: MasterSequenceDocument = {
      ...base([
        { id: 'a', shotId: 'shot-a', sourceStartFrame: 0, sourceEndFrame: 20, startMasterFrame: 0, order: 0 },
        { id: 'b', shotId: 'shot-b', sourceStartFrame: 0, sourceEndFrame: 20, startMasterFrame: 100, order: 1 },
      ]),
      imageClips: [{ id: 'image-a', trackId: 'track', assetId: 'asset', startMasterFrame: 30, durationFrames: 10, positionX: .5, positionY: .5, scale: 1, rotation: 0, opacity: 1, fadeInFrames: 0, fadeOutFrames: 0 }],
    }
    const selection: MasterTimelineItem[] = [{ kind: 'clip', id: 'a' }, { kind: 'image', id: 'image-a' }]
    const moved = moveMasterTimelineSelection(sequence, selection, { kind: 'clip', id: 'a' }, 50)
    expect(moved?.clips.find((clip) => clip.id === 'a')?.startMasterFrame).toBe(50)
    expect(moved?.imageClips?.[0].startMasterFrame).toBe(80)
    expect(moved?.clips.find((clip) => clip.id === 'b')?.startMasterFrame).toBe(100)
  })

  it('rejects group moves that collide with an unselected Shot but permits internal overlap', () => {
    const sequence = base([
      { id: 'a', shotId: 'shot-a', sourceStartFrame: 0, sourceEndFrame: 20, startMasterFrame: 0, order: 0 },
      { id: 'b', shotId: 'shot-b', sourceStartFrame: 0, sourceEndFrame: 20, startMasterFrame: 10, order: 1 },
      { id: 'c', shotId: 'shot-c', sourceStartFrame: 0, sourceEndFrame: 20, startMasterFrame: 100, order: 2 },
    ])
    expect(moveMasterTimelineSelection(sequence, [{ kind: 'clip', id: 'a' }, { kind: 'clip', id: 'b' }], { kind: 'clip', id: 'a' }, 90)).toBeNull()
    const overlapping = moveMasterTimelineSelection(sequence, [{ kind: 'clip', id: 'a' }, { kind: 'clip', id: 'b' }], { kind: 'clip', id: 'a' }, 5)
    expect(overlapping).not.toBeNull()
  })

  it('duplicates selected clips with new IDs after the selected group and removes them without ripple', () => {
    const sequence: MasterSequenceDocument = {
      ...base([{ id: 'a', shotId: 'shot-a', sourceStartFrame: 0, sourceEndFrame: 10, startMasterFrame: 0, order: 0 }]),
      imageClips: [{ id: 'image-a', trackId: 'track', assetId: 'asset', startMasterFrame: 12, durationFrames: 4, positionX: .5, positionY: .5, scale: 1, rotation: 0, opacity: 1, fadeInFrames: 0, fadeOutFrames: 0 }],
    }
    const result = duplicateMasterTimelineSelection(sequence, [{ kind: 'clip', id: 'a' }, { kind: 'image', id: 'image-a' }])
    expect(result?.selection).toHaveLength(2)
    expect(result?.selection.every((item) => item.id !== 'a' && item.id !== 'image-a')).toBe(true)
    expect(result?.sequence.clips).toHaveLength(2)
    const removed = result ? removeMasterTimelineSelection(result.sequence, result.selection) : null
    expect(removed?.clips).toHaveLength(1)
    expect(removed?.imageClips).toHaveLength(1)
  })
})
