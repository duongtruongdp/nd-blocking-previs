import { describe, expect, it } from 'vitest'
import { createOpeningDocument, createWallDocument } from '../core/sceneDocument'
import { clampOpeningOffset, nearestWallForOpening, projectPointOntoWall, resolveOpeningAgainstWalls, snapAngle45, wallEndpoints, wallFromEndpoints, wallNormal, wallTangent, worldPointFromWallOffset } from '../architecture/wallMath'

describe('V2.10C wall geometry', () => {
  it('creates a wall from endpoints and recovers its endpoints', () => {
    const geometry = wallFromEndpoints([1, 0, 2], [1, 0, -4])
    const wall = { ...createWallDocument('wall-01', 'Wall 01'), position: geometry.center, rotation: [0, geometry.heading, 0] as [number, number, number], length: geometry.length, height: geometry.height, thickness: geometry.thickness }
    const endpoints = wallEndpoints(wall)
    expect(geometry.length).toBeCloseTo(6)
    expect(endpoints.start[0]).toBeCloseTo(1)
    expect(endpoints.start[2]).toBeCloseTo(2)
    expect(endpoints.end[2]).toBeCloseTo(-4)
  })

  it('projects and offsets points along a wall with tangent and normal vectors', () => {
    const wall = createWallDocument('wall-01', 'Wall 01', [0, 0, 0])
    const projection = projectPointOntoWall(wall, [1, 0, 0.7])
    expect(projection.offset).toBeCloseTo(4)
    expect(projection.distance).toBeCloseTo(0.7)
    expect(worldPointFromWallOffset(wall, 3)).toEqual([0, 0, 0])
    expect(wallTangent(wall)).toEqual([1, 0, -0])
    expect(wallNormal(wall)).toEqual([-0, 0, -1])
  })

  it('finds the nearest wall and clamps an opening inside its endpoints', () => {
    const wall = createWallDocument('wall-01', 'Wall 01', [0, 0, -3])
    const snap = nearestWallForOpening([2.7, 0, -2.9], [wall], 0.4, 0.9)
    expect(snap?.wallId).toBe(wall.id)
    expect(snap?.offset).toBeCloseTo(5.55)
    expect(clampOpeningOffset(wall, 0.9, 99)).toBeCloseTo(5.55)
  })

  it('resolves an attached opening and follows wall edits without CSG', () => {
    const wall = createWallDocument('wall-01', 'Wall 01', [0, 0, -3])
    const opening = createOpeningDocument('door-01', 'Door 01', 'door', [0, 0, -2.9])
    const attached = resolveOpeningAgainstWalls({ ...opening, wallId: wall.id, offsetAlongWallMeters: 2 }, [wall])
    const movedWall = { ...wall, position: [2, 0, -1] as [number, number, number], rotation: [0, Math.PI / 2, 0] as [number, number, number] }
    const followed = resolveOpeningAgainstWalls(attached, [movedWall])
    expect(attached.offsetAlongWallMeters).toBe(2)
    expect(attached.rotation[1]).toBe(wall.rotation[1])
    expect(followed.position[0]).toBeCloseTo(2 - wall.thickness / 2 - opening.depth / 2 - 0.012)
    expect(followed.position[2]).toBeCloseTo(0)
  })

  it('supports 45 degree wall drawing snap', () => {
    const result = snapAngle45([0, 0, 0], [1, 0, 0.8])
    expect(result[0]).toBeCloseTo(result[2])
  })
})
