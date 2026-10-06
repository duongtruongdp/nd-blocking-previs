import type { ActorVector3, OpeningDocument, WallDocument } from '../core/sceneDocument'

export const DEFAULT_WALL_HEIGHT = 2.7
export const DEFAULT_WALL_THICKNESS = 0.14
export const WALL_GRID_INTERVAL = 0.1
export const WALL_SNAP_THRESHOLD = 0.4
export const WALL_GEOMETRY_EPSILON = 0.0001

export type WallGeometry = {
  center: ActorVector3
  length: number
  heading: number
  height: number
  thickness: number
}

export type WallSnap = {
  wallId: string
  point: ActorVector3
  offset: number
  distance: number
  heading: number
}

export function wallFromEndpoints(start: ActorVector3, end: ActorVector3, height = DEFAULT_WALL_HEIGHT, thickness = DEFAULT_WALL_THICKNESS): WallGeometry {
  const dx = end[0] - start[0]
  const dz = end[2] - start[2]
  const length = Math.hypot(dx, dz)
  return {
    center: [(start[0] + end[0]) / 2, 0, (start[2] + end[2]) / 2],
    length,
    heading: Math.atan2(-dz, dx),
    height,
    thickness,
  }
}

export function wallTangent(wall: WallDocument): ActorVector3 {
  const heading = wall.rotation[1]
  return [Math.cos(heading), 0, -Math.sin(heading)]
}

export function wallNormal(wall: WallDocument): ActorVector3 {
  const tangent = wallTangent(wall)
  return [tangent[2], 0, -tangent[0]]
}

export function wallEndpoints(wall: WallDocument): { start: ActorVector3; end: ActorVector3 } {
  const tangent = wallTangent(wall)
  const half = wall.length / 2
  return {
    start: [wall.position[0] - tangent[0] * half, 0, wall.position[2] - tangent[2] * half],
    end: [wall.position[0] + tangent[0] * half, 0, wall.position[2] + tangent[2] * half],
  }
}

export function worldPointFromWallOffset(wall: WallDocument, offset: number): ActorVector3 {
  const endpoints = wallEndpoints(wall)
  const tangent = wallTangent(wall)
  return [endpoints.start[0] + tangent[0] * offset, 0, endpoints.start[2] + tangent[2] * offset]
}

export function projectPointOntoWall(wall: WallDocument, point: ActorVector3): { point: ActorVector3; offset: number; distance: number } {
  const endpoints = wallEndpoints(wall)
  const tangent = wallTangent(wall)
  const dx = point[0] - endpoints.start[0]
  const dz = point[2] - endpoints.start[2]
  const offset = Math.max(0, Math.min(wall.length, dx * tangent[0] + dz * tangent[2]))
  const projected = worldPointFromWallOffset(wall, offset)
  return { point: projected, offset, distance: Math.hypot(point[0] - projected[0], point[2] - projected[2]) }
}

export function clampOpeningOffset(wall: WallDocument, openingWidth: number, offset: number): number {
  const halfWidth = Math.max(0, openingWidth / 2)
  return Math.max(halfWidth, Math.min(Math.max(halfWidth, wall.length - halfWidth), offset))
}

export function clampOpeningToWall(wall: WallDocument, opening: OpeningDocument): OpeningDocument {
  const width = Math.min(Math.max(WALL_GEOMETRY_EPSILON, opening.width), Math.max(WALL_GEOMETRY_EPSILON, wall.length))
  const height = Math.min(Math.max(WALL_GEOMETRY_EPSILON, opening.height), Math.max(WALL_GEOMETRY_EPSILON, wall.height))
  if (opening.openingType === 'door') {
    return { ...opening, width, height, sillHeight: 0 }
  }
  const sillHeight = Math.min(Math.max(0, opening.sillHeight), Math.max(0, wall.height - WALL_GEOMETRY_EPSILON))
  return { ...opening, width, height: Math.min(height, Math.max(WALL_GEOMETRY_EPSILON, wall.height - sillHeight)), sillHeight }
}

export function nearestWallForOpening(openingPosition: ActorVector3, walls: readonly WallDocument[], threshold = WALL_SNAP_THRESHOLD, openingWidth = 0): WallSnap | null {
  let nearest: WallSnap | null = null
  walls.forEach((wall) => {
    const projected = projectPointOntoWall(wall, openingPosition)
    const offset = clampOpeningOffset(wall, openingWidth, projected.offset)
    const point = worldPointFromWallOffset(wall, offset)
    const distance = Math.hypot(openingPosition[0] - point[0], openingPosition[2] - point[2])
    if (distance <= threshold && (!nearest || distance < nearest.distance)) nearest = { wallId: wall.id, point, offset, distance, heading: wall.rotation[1] }
  })
  return nearest
}

export function resolveOpeningAgainstWalls(opening: OpeningDocument, walls: readonly WallDocument[]): OpeningDocument {
  if (!opening.wallId) return opening
  const wall = walls.find((candidate) => candidate.id === opening.wallId)
  if (!wall) return { ...opening, wallId: null, offsetAlongWallMeters: undefined }
  const safeOpening = clampOpeningToWall(wall, opening)
  const fallback = projectPointOntoWall(wall, safeOpening.position).offset
  const offset = clampOpeningOffset(wall, safeOpening.width, safeOpening.offsetAlongWallMeters ?? fallback)
  const center = worldPointFromWallOffset(wall, offset)
  const normal = wallNormal(wall)
  const faceOffset = wall.thickness / 2 + safeOpening.depth / 2 + 0.012
  return {
    ...safeOpening,
    position: [center[0] + normal[0] * faceOffset, safeOpening.openingType === 'window' ? safeOpening.sillHeight : 0, center[2] + normal[2] * faceOffset],
    rotation: [0, wall.rotation[1], 0],
    offsetAlongWallMeters: offset,
  }
}

export function snapAngle45(start: ActorVector3, point: ActorVector3): ActorVector3 {
  const dx = point[0] - start[0]
  const dz = point[2] - start[2]
  const length = Math.hypot(dx, dz)
  if (length === 0) return [...start]
  const angle = Math.atan2(dz, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return [start[0] + Math.cos(snapped) * length, 0, start[2] + Math.sin(snapped) * length]
}
