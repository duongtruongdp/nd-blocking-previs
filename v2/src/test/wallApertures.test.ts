import { describe, expect, it } from 'vitest'
import { createOpeningDocument, createWallDocument } from '../core/sceneDocument'
import { resolveOpeningAgainstWalls } from '../architecture/wallMath'
import { apertureFromOpening, wallSolidRectangles } from '../architecture/wallApertures'

function attachedOpening(wall: ReturnType<typeof createWallDocument>, id: string, type: 'door' | 'window', offset: number) {
  const opening = createOpeningDocument(id, id, type, [0, 0, 0])
  return resolveOpeningAgainstWalls({ ...opening, wallId: wall.id, offsetAlongWallMeters: offset }, [wall])
}

function overlaps(rect: { uMin: number; uMax: number; vMin: number; vMax: number }, aperture: { uMin: number; uMax: number; vMin: number; vMax: number }): boolean {
  return rect.uMin < aperture.uMax && rect.uMax > aperture.uMin && rect.vMin < aperture.vMax && rect.vMax > aperture.vMin
}

describe('V2.10D procedural wall apertures', () => {
  it('keeps a wall as one full solid rectangle when no openings are attached', () => {
    const wall = createWallDocument('wall-01', 'Wall 01')
    expect(wallSolidRectangles(wall, [])).toEqual([{ uMin: 0, uMax: wall.length, vMin: 0, vMax: wall.height }])
  })

  it('decomposes a floor-to-ceiling door into left, right, and header solids', () => {
    const wall = createWallDocument('wall-01', 'Wall 01')
    const door = attachedOpening(wall, 'door-01', 'door', 2)
    const aperture = apertureFromOpening(wall, door)
    const solids = wallSolidRectangles(wall, [door])
    expect(aperture).not.toBeNull()
    expect(solids).toHaveLength(3)
    expect(solids.every((rect) => !overlaps(rect, aperture!))).toBe(true)
    expect(solids.some((rect) => rect.vMin === 0 && rect.vMax === wall.height)).toBe(true)
  })

  it('preserves below, above, and side solids around a window', () => {
    const wall = createWallDocument('wall-01', 'Wall 01')
    const window = attachedOpening(wall, 'window-01', 'window', 3)
    const aperture = apertureFromOpening(wall, window)
    const solids = wallSolidRectangles(wall, [window])
    expect(solids.length).toBeGreaterThanOrEqual(4)
    expect(solids.every((rect) => !overlaps(rect, aperture!))).toBe(true)
    expect(solids.some((rect) => rect.vMax <= window.sillHeight)).toBe(true)
    expect(solids.some((rect) => rect.vMin >= window.sillHeight + window.height)).toBe(true)
  })

  it('supports multiple openings and excludes overlapping aperture unions without invalid fragments', () => {
    const wall = createWallDocument('wall-01', 'Wall 01')
    const door = attachedOpening(wall, 'door-01', 'door', 1.2)
    const window = attachedOpening(wall, 'window-01', 'window', 2.5)
    const overlapWindow = attachedOpening(wall, 'window-02', 'window', 2.5)
    const solids = wallSolidRectangles(wall, [door, window, overlapWindow])
    const apertures = [door, window, overlapWindow].map((opening) => apertureFromOpening(wall, opening)!).filter(Boolean)
    expect(solids.length).toBeGreaterThan(0)
    expect(solids.every((rect) => rect.uMax - rect.uMin > 0 && rect.vMax - rect.vMin > 0)).toBe(true)
    expect(solids.every((rect) => apertures.every((aperture) => !overlaps(rect, aperture)))).toBe(true)
  })

  it('clamps edge openings and removes the aperture when detached', () => {
    const wall = createWallDocument('wall-01', 'Wall 01')
    const door = createOpeningDocument('door-01', 'Door 01', 'door', [0, 0, 0])
    const oversized = resolveOpeningAgainstWalls({ ...door, width: 99, height: 99, wallId: wall.id, offsetAlongWallMeters: 99 }, [wall])
    const aperture = apertureFromOpening(wall, oversized)
    expect(oversized.width).toBeLessThanOrEqual(wall.length)
    expect(oversized.height).toBeLessThanOrEqual(wall.height)
    expect(aperture?.uMin).toBeGreaterThanOrEqual(0)
    expect(aperture?.uMax).toBeLessThanOrEqual(wall.length)
    expect(wallSolidRectangles(wall, [{ ...oversized, wallId: null }])).toEqual([{ uMin: 0, uMax: wall.length, vMin: 0, vMax: wall.height }])
  })

  it('keeps wall aperture geometry independent from a Window open angle', () => {
    const wall = createWallDocument('wall-01', 'Wall 01')
    const closed = attachedOpening(wall, 'window-01', 'window', 3)
    const open = { ...closed, openAngle: 90 }
    expect(wallSolidRectangles(wall, [open])).toEqual(wallSolidRectangles(wall, [closed]))
    expect(apertureFromOpening(wall, open)).toEqual(apertureFromOpening(wall, closed))
  })
})
