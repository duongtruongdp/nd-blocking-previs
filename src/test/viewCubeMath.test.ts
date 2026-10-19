import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { VIEW_CUBE_TARGET_OCCUPANCY, viewCubeFaceLabel, viewCubeOrthoHalfHeight, viewCubeProjectedBounds } from '../runtime/viewCubeMath'

describe('ViewCube framing math', () => {
  it('uses the final substantial occupancy target', () => {
    expect(VIEW_CUBE_TARGET_OCCUPANCY).toBeCloseTo(0.8, 8)
  })

  it('frames the front cube to the target occupancy instead of the old oversized frustum', () => {
    const bounds = viewCubeProjectedBounds(new THREE.Quaternion())
    const halfHeight = viewCubeOrthoHalfHeight(bounds, 1)
    expect(bounds).toEqual({ width: 2, height: 2 })
    expect(halfHeight).toBeCloseTo(2 / (2 * VIEW_CUBE_TARGET_OCCUPANCY), 8)
    expect(bounds.width / (halfHeight * 2)).toBeCloseTo(VIEW_CUBE_TARGET_OCCUPANCY, 8)
  })

  it('keeps representative diagonal orientations contained at the target occupancy', () => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, Math.PI / 4, 0))
    const bounds = viewCubeProjectedBounds(rotation)
    const halfHeight = viewCubeOrthoHalfHeight(bounds, 1)
    expect(bounds.width / (halfHeight * 2)).toBeLessThanOrEqual(VIEW_CUBE_TARGET_OCCUPANCY + 1e-8)
    expect(bounds.height / (halfHeight * 2)).toBeLessThanOrEqual(VIEW_CUBE_TARGET_OCCUPANCY + 1e-8)
    expect(bounds.width).toBeGreaterThan(2)
    expect(bounds.height).toBeGreaterThan(2)
  })

  it('uses CSS aspect rather than backing-pixel density when fitting', () => {
    const bounds = { width: 3, height: 1 }
    const square = viewCubeOrthoHalfHeight(bounds, 1)
    const wide = viewCubeOrthoHalfHeight(bounds, 2)
    expect(wide).toBeLessThan(square)
    expect(bounds.width / (wide * 2 * 2)).toBeCloseTo(VIEW_CUBE_TARGET_OCCUPANCY, 8)
  })

  it('keeps tooltip names aligned with semantic face identities', () => {
    const faces = ['top', 'bottom', 'front', 'back', 'left', 'right'] as const
    expect(faces.map(viewCubeFaceLabel)).toEqual(['Top', 'Bottom', 'Front', 'Back', 'Left', 'Right'])
  })
})
