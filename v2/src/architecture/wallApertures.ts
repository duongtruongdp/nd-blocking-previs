import type { OpeningDocument, WallDocument } from '../core/sceneDocument'
import { clampOpeningToWall, WALL_GEOMETRY_EPSILON } from './wallMath'

export type WallAperture = {
  sourceOpeningId: string
  uMin: number
  uMax: number
  vMin: number
  vMax: number
}

export type WallSolidRect = {
  uMin: number
  uMax: number
  vMin: number
  vMax: number
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

export function apertureFromOpening(wall: WallDocument, opening: OpeningDocument): WallAperture | null {
  if (opening.wallId !== wall.id) return null
  const safe = clampOpeningToWall(wall, opening)
  const centerU = clampNumber(safe.offsetAlongWallMeters ?? wall.length / 2, 0, wall.length)
  const halfWidth = safe.width / 2
  const uMin = clampNumber(centerU - halfWidth, 0, wall.length)
  const uMax = clampNumber(centerU + halfWidth, 0, wall.length)
  const vMin = safe.openingType === 'door' ? 0 : clampNumber(safe.sillHeight, 0, wall.height)
  const vMax = clampNumber(vMin + safe.height, vMin, wall.height)
  if (uMax - uMin <= WALL_GEOMETRY_EPSILON || vMax - vMin <= WALL_GEOMETRY_EPSILON) return null
  return { sourceOpeningId: opening.id, uMin, uMax, vMin, vMax }
}

function mergeVerticalRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = ranges
    .filter(([min, max]) => max - min > WALL_GEOMETRY_EPSILON)
    .sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  sorted.forEach(([min, max]) => {
    const previous = merged[merged.length - 1]
    if (previous && min <= previous[1] + WALL_GEOMETRY_EPSILON) previous[1] = Math.max(previous[1], max)
    else merged.push([min, max])
  })
  return merged
}

/**
 * Decomposes a wall's local U/V rectangle into solid rectangles around all
 * attached rectangular openings. The W/thickness dimension is applied by the
 * procedural runtime, so the result stays a small serializable pure value.
 */
export function wallSolidRectangles(wall: WallDocument, openings: readonly OpeningDocument[]): WallSolidRect[] {
  const apertures = openings.map((opening) => apertureFromOpening(wall, opening)).filter((aperture): aperture is WallAperture => aperture !== null)
  if (apertures.length === 0) return [{ uMin: 0, uMax: wall.length, vMin: 0, vMax: wall.height }]

  const boundaries = Array.from(new Set([0, wall.length, ...apertures.flatMap((aperture) => [aperture.uMin, aperture.uMax])]))
    .sort((a, b) => a - b)
  const rectangles: WallSolidRect[] = []
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const uMin = boundaries[index]
    const uMax = boundaries[index + 1]
    if (uMax - uMin <= WALL_GEOMETRY_EPSILON) continue
    const ranges = mergeVerticalRanges(apertures
      .filter((aperture) => aperture.uMin < uMax - WALL_GEOMETRY_EPSILON && aperture.uMax > uMin + WALL_GEOMETRY_EPSILON)
      .map((aperture) => [aperture.vMin, aperture.vMax] as [number, number]))
    let cursor = 0
    ranges.forEach(([vMin, vMax]) => {
      if (vMin - cursor > WALL_GEOMETRY_EPSILON) rectangles.push({ uMin, uMax, vMin: cursor, vMax: vMin })
      cursor = Math.max(cursor, vMax)
    })
    if (wall.height - cursor > WALL_GEOMETRY_EPSILON) rectangles.push({ uMin, uMax, vMin: cursor, vMax: wall.height })
  }
  return rectangles
}
