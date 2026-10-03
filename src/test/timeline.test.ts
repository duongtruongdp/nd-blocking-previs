import { describe, expect, it } from 'vitest'
import { clampFrame, evaluateTimelineTrack, validateMarkRange } from '../domain/timeline'
import type { TimelineTrack } from '../domain/types'

describe('blocking timeline foundation', () => {
  const scalarTrack: TimelineTrack = {
    id: 'track-lens',
    entityId: 'camera-a',
    property: 'focalLengthMm',
    keyframes: [
      { id: 'key-1', frame: 10, value: 35, interpolation: 'linear' },
      { id: 'key-2', frame: 20, value: 50, interpolation: 'linear' },
    ],
  }

  it('evaluates exact, before-range, after-range, and linear values', () => {
    expect(evaluateTimelineTrack(scalarTrack, 10)).toBe(35)
    expect(evaluateTimelineTrack(scalarTrack, 5)).toBe(35)
    expect(evaluateTimelineTrack(scalarTrack, 25)).toBe(50)
    expect(evaluateTimelineTrack(scalarTrack, 15)).toBe(42.5)
  })

  it('evaluates step interpolation', () => {
    const track: TimelineTrack = {
      ...scalarTrack,
      keyframes: [
        { id: 'key-1', frame: 10, value: 35, interpolation: 'step' },
        { id: 'key-2', frame: 20, value: 50, interpolation: 'linear' },
      ],
    }

    expect(evaluateTimelineTrack(track, 15)).toBe(35)
  })

  it('uses the last source keyframe when duplicate frames are encountered', () => {
    const track: TimelineTrack = {
      ...scalarTrack,
      keyframes: [
        { id: 'key-first', frame: 10, value: 35, interpolation: 'linear' },
        { id: 'key-last', frame: 10, value: 40, interpolation: 'linear' },
        { id: 'key-2', frame: 20, value: 50, interpolation: 'linear' },
      ],
    }

    expect(evaluateTimelineTrack(track, 10)).toBe(40)
  })

  it('validates and clamps Mark In / Mark Out', () => {
    expect(validateMarkRange({ startFrame: 0, endFrame: 100, markIn: 10, markOut: 90 })).toEqual([])
    expect(validateMarkRange({ startFrame: 0, endFrame: 100, markIn: 90, markOut: 10 })).not.toEqual([])
    expect(clampFrame(150, 0, 100)).toBe(100)
    expect(clampFrame(-2, 0, 100)).toBe(0)
    expect(clampFrame(25.6, 0, 100)).toBe(26)
  })
})
