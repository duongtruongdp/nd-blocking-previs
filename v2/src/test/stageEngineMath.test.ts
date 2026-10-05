import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { stageMovedBeyondThreshold, stageNdcFromEvent, stagePointerDeltaAlongAxis, stageProjectWorldAxisToScreen, stageToolForKey, stageWorldUnitsPerPixelAtDepth, stageWorldUnitsPerPixelAlongAxis, stageZoomDistance } from '../stage-engine'

describe('StageEngine math boundary', () => {
  it('maps pointer coordinates using the live canvas rectangle', () => {
    const ndc = stageNdcFromEvent({ clientX: 150, clientY: 250 }, { left: 100, top: 200, width: 100, height: 100 })
    expect(ndc.x).toBeCloseTo(0)
    expect(ndc.y).toBeCloseTo(0)
  })

  it('uses the DEMO three-pixel movement threshold', () => {
    expect(stageMovedBeyondThreshold(10, 10, 12, 12)).toBe(false)
    expect(stageMovedBeyondThreshold(10, 10, 13, 14)).toBe(true)
  })

  it('maps E, Q, and R to StageEngine tools', () => {
    expect(stageToolForKey('e')).toBe('select')
    expect(stageToolForKey('Q')).toBe('move')
    expect(stageToolForKey('r')).toBe('rotate')
    expect(stageToolForKey('w')).toBeNull()
  })

  it('uses multiplicative DEMO-style zoom distance', () => {
    expect(stageZoomDistance(15, -60)).toBeLessThan(15)
    expect(stageZoomDistance(0.1, 100)).toBeGreaterThanOrEqual(0.6)
  })

  it('projects a visible world axis into a stable client-space direction', () => {
    const camera = new THREE.PerspectiveCamera(90, 4 / 3, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    const direction = stageProjectWorldAxisToScreen(camera, new THREE.Vector3(), new THREE.Vector3(1, 0, 0), { left: 0, top: 0, width: 800, height: 600 })
    expect(direction?.x).toBeGreaterThan(0.99)
    expect(direction?.y).toBeCloseTo(0)
  })

  it('projects pointer movement onto the cached screen axis only', () => {
    expect(stagePointerDeltaAlongAxis(100, 100, 130, 120, new THREE.Vector2(1, 0))).toBeCloseTo(30)
    expect(stagePointerDeltaAlongAxis(100, 100, 130, 120, new THREE.Vector2(0, 1))).toBeCloseTo(20)
  })

  it('calculates perspective world-units-per-pixel from depth and vertical FOV', () => {
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100)
    expect(stageWorldUnitsPerPixelAtDepth(camera, 10, 100)).toBeCloseTo(0.2)
  })

  it('rejects an axis that is nearly aligned with the camera', () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    const rect = { left: 0, top: 0, width: 800, height: 800 }
    expect(stageProjectWorldAxisToScreen(camera, new THREE.Vector3(), new THREE.Vector3(0, 0, 1), rect)).toBeNull()
    expect(stageWorldUnitsPerPixelAlongAxis(camera, new THREE.Vector3(), new THREE.Vector3(0, 0, 1), rect)).toBeNull()
  })
})
