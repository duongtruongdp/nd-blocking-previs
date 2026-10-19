import { describe, expect, it } from 'vitest'
import { alignOffset, arrangePopoverPosition, boundsCenter, combinedBounds, distributeOffsets, rotatePointAroundY, snapAngle } from '../stage-engine/arrangeMath'

describe('arrangement math', () => {
  it('computes visible-bound alignment offsets', () => {
    const bounds = { min: [-2, 1, 3] as [number, number, number], max: [2, 5, 7] as [number, number, number] }
    expect(boundsCenter(bounds)).toEqual([0, 3, 5])
    expect(alignOffset(bounds, 'x', 'min', 4)).toBe(6)
    expect(alignOffset(bounds, 'y', 'center', 1)).toBe(-2)
    expect(alignOffset(bounds, 'z', 'max', 2)).toBe(-5)
  })

  it('combines bounds for a multi-selection frame target', () => {
    expect(combinedBounds([
      { min: [-1, 0, 2], max: [1, 2, 4] },
      { min: [3, -1, -2], max: [5, 1, 0] },
    ])).toEqual({ min: [-1, -1, -2], max: [5, 2, 4] })
  })

  it('distributes visible bounds while preserving the outer items', () => {
    const items = [
      { id: 'a', min: [0, 0, 0] as [number, number, number], max: [2, 1, 1] as [number, number, number] },
      { id: 'b', min: [4, 0, 0] as [number, number, number], max: [5, 1, 1] as [number, number, number] },
      { id: 'c', min: [8, 0, 0] as [number, number, number], max: [10, 1, 1] as [number, number, number] },
    ]
    expect(distributeOffsets(items, 'x')).toEqual(new Map([['b', 0.5]]))
  })

  it('snaps rotation deltas and rotates group points around a pivot', () => {
    expect(snapAngle(Math.PI / 10, Math.PI / 12)).toBeCloseTo(Math.PI / 12)
    expect(rotatePointAroundY([2, 0, 0], [1, 0, 0], Math.PI / 2)).toEqual([1, 0, 1])
  })

  it('anchors the Arrange popover to the trigger and flips within the viewport', () => {
    expect(arrangePopoverPosition(
      { left: 320, top: 40, right: 390, bottom: 73 },
      { width: 214, height: 180 },
      { left: 0, top: 0, right: 500, bottom: 400 },
    )).toEqual({ left: 176, top: 79 })
    expect(arrangePopoverPosition(
      { left: 420, top: 350, right: 490, bottom: 383 },
      { width: 214, height: 180 },
      { left: 0, top: 0, right: 500, bottom: 400 },
    )).toEqual({ left: 276, top: 164 })
  })

  it('keeps the production-width Arrange popover inside a narrow stage viewport', () => {
    expect(arrangePopoverPosition(
      { left: 320, top: 40, right: 390, bottom: 73 },
      { width: 320, height: 210 },
      { left: 0, top: 0, right: 500, bottom: 400 },
    )).toEqual({ left: 70, top: 79 })
    expect(arrangePopoverPosition(
      { left: 420, top: 350, right: 490, bottom: 383 },
      { width: 320, height: 210 },
      { left: 0, top: 0, right: 500, bottom: 400 },
    )).toEqual({ left: 170, top: 134 })
  })
})
