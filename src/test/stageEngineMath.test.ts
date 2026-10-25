import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { STAGE_SNAP_GRID_PRESETS, STAGE_VIEW_CUBE_FACE_MODES, constrainStageDeltaToAxis, dominantStageAxis, scaleFromFactor, scaleFromPointer, snapStagePosition, snapStageValue, stageApplyRotation, stageGizmoSpaceForSelection, stageIsometricAngles, stageLocalAxis, stageMarqueeRect, stageMarqueeSelection, stageMovedBeyondThreshold, stageNdcFromEvent, stageOrbitAfterPointerDelta, stageOrbitAnglesFromDirection, stagePointerDeltaAlongAxis, stageProjectWorldAxisToScreen, stageProjectedBoundsIntersectMarquee, stageRotationAxis, stageToolForKey, stageTransformAxis, stageTransformSpace, stageViewCubeDragStarted, stageViewCubeFaceMode, stageViewDirection, stageViewModeIsOrthographic, stageViewSelectionIsIsometric, stageWorldAxis, stageWorldUnitsPerPixelAtDepth, stageWorldUnitsPerPixelAlongAxis, stageZoomDistance } from '../stage-engine'

describe('StageEngine math boundary', () => {
  it('keeps Y on world-up while X/Z follow the semantic local basis', () => {
    const rotation: [number, number, number] = [0, Math.PI / 2, 0]
    expect(stageRotationAxis(rotation, 'y').toArray()).toEqual([0, 1, 0])
    expect(stageRotationAxis(rotation, 'x').z).toBeCloseTo(-1)
    expect(stageRotationAxis(rotation, 'z').x).toBeCloseTo(1)
  })

  it('uses a full local basis for single-object gizmos', () => {
    const rotation: [number, number, number] = [Math.PI / 2, 0, 0]
    expect(stageGizmoSpaceForSelection(1)).toBe('local')
    expect(stageGizmoSpaceForSelection(2)).toBe('world')
    expect(stageLocalAxis(rotation, 'x').toArray()).toEqual([1, 0, 0])
    expect(stageLocalAxis(rotation, 'y').z).toBeCloseTo(1)
    expect(stageLocalAxis(rotation, 'z').y).toBeCloseTo(-1)
  })

  it('uses the camera local basis for single-camera Move and Rotate', () => {
    const yawed: [number, number, number] = [0, Math.PI / 4, 0]
    expect(stageTransformSpace('camera', 'move', 1)).toBe('local')
    expect(stageTransformSpace('camera', 'rotate', 1)).toBe('local')
    expect(stageTransformSpace('default', 'rotate', 1)).toBe('local')
    expect(stageTransformSpace('camera', 'rotate', 2)).toBe('world')
    expect(stageTransformAxis('camera', 'rotate', yawed, 'x', 1).z).toBeCloseTo(-Math.SQRT1_2)
    expect(stageTransformAxis('camera', 'rotate', yawed, 'y', 1).toArray()).toEqual([0, 1, 0])
    expect(stageTransformAxis('camera', 'rotate', yawed, 'z', 1).x).toBeCloseTo(Math.SQRT1_2)
    expect(stageTransformAxis('camera', 'rotate', yawed, 'x', 2).angleTo(stageRotationAxis(yawed, 'x'))).toBeLessThan(1e-10)
    expect(stageTransformAxis('camera', 'move', yawed, 'x', 1).x).toBeCloseTo(Math.SQRT1_2)
    expect(stageWorldAxis('y').toArray()).toEqual([0, 1, 0])
  })

  it('applies world rotations by pre-multiplying the delta quaternion', () => {
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0, 'XYZ'))
    const axis = stageWorldAxis('y')
    const result = stageApplyRotation(start, axis, Math.PI / 2, 'world')
    const expected = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI / 2).multiply(start.clone()).normalize()
    expect(result.angleTo(expected)).toBeLessThan(1e-10)
    const xAxis = stageWorldAxis('x')
    const worldX = stageApplyRotation(start, xAxis, Math.PI / 2, 'world')
    expect(stageApplyRotation(start, xAxis, Math.PI / 2, 'local').angleTo(worldX)).toBeGreaterThan(0.1)
  })

  it('applies local X from identity around the expected axis', () => {
    const start = new THREE.Quaternion()
    const result = stageApplyRotation(start, stageWorldAxis('x'), THREE.MathUtils.degToRad(30), 'local')
    const expected = new THREE.Quaternion().setFromAxisAngle(stageWorldAxis('x'), THREE.MathUtils.degToRad(30))
    expect(result.angleTo(expected)).toBeLessThan(1e-10)
  })

  it('applies local X around a pre-yawed camera axis, not world X', () => {
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0, 'XYZ'))
    const localAxis = stageWorldAxis('x')
    const delta = new THREE.Quaternion().setFromAxisAngle(localAxis, THREE.MathUtils.degToRad(30))
    const result = stageApplyRotation(start, localAxis, THREE.MathUtils.degToRad(30), 'local')
    const expected = start.clone().multiply(delta).normalize()
    const worldResult = new THREE.Quaternion().setFromAxisAngle(stageWorldAxis('x'), THREE.MathUtils.degToRad(30)).multiply(start.clone()).normalize()
    expect(result.angleTo(expected)).toBeLessThan(1e-10)
    expect(result.angleTo(worldResult)).toBeGreaterThan(0.1)
    const rotatedLocalX = stageLocalAxis([0, Math.PI / 4, 0], 'x')
    expect(rotatedLocalX.angleTo(new THREE.Vector3(1, 0, 0))).toBeGreaterThan(0.1)
  })

  it('applies compound local Y and local Z deltas in the camera basis', () => {
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.32, -0.48, 0.27, 'XYZ'))
    const localY = stageWorldAxis('y')
    const localZ = stageWorldAxis('z')
    const yDelta = 0.41
    const zDelta = -0.23
    const yResult = stageApplyRotation(start, localY, yDelta, 'local')
    const zResult = stageApplyRotation(start, localZ, zDelta, 'local')
    expect(yResult.angleTo(start.clone().multiply(new THREE.Quaternion().setFromAxisAngle(localY, yDelta)).normalize())).toBeLessThan(1e-10)
    expect(zResult.angleTo(start.clone().multiply(new THREE.Quaternion().setFromAxisAngle(localZ, zDelta)).normalize())).toBeLessThan(1e-10)
  })

  it('keeps a local roll rigid and preserves the transform position', () => {
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.6, -0.2, 'XYZ'))
    const root = new THREE.Object3D()
    root.position.set(2.4, 1.1, -3.2)
    root.scale.set(1.3, 0.8, 2.1)
    const position = root.position.clone()
    const scale = root.scale.clone()
    const result = stageApplyRotation(start, stageWorldAxis('z'), Math.PI / 6, 'local')
    root.quaternion.copy(result)
    expect(result.length()).toBeCloseTo(1)
    expect(root.position.toArray()).toEqual(position.toArray())
    expect(root.scale.toArray()).toEqual(scale.toArray())
  })

  it('evaluates the same drag delta non-cumulatively from the captured start', () => {
    const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0.7, 0.18, 'XYZ'))
    const axis = stageWorldAxis('y')
    const delta = 0.63
    const expected = stageApplyRotation(start, axis, delta, 'local')
    const firstPointerMove = stageApplyRotation(start, axis, delta, 'local')
    const repeatedEvaluation = stageApplyRotation(start, axis, delta, 'local')
    expect(firstPointerMove.angleTo(expected)).toBeLessThan(1e-10)
    expect(repeatedEvaluation.angleTo(expected)).toBeLessThan(1e-10)
  })

  it('maps pointer coordinates using the live canvas rectangle', () => {
    const ndc = stageNdcFromEvent({ clientX: 150, clientY: 250 }, { left: 100, top: 200, width: 100, height: 100 })
    expect(ndc.x).toBeCloseTo(0)
    expect(ndc.y).toBeCloseTo(0)
  })

  it('uses the DEMO three-pixel movement threshold', () => {
    expect(stageMovedBeyondThreshold(10, 10, 12, 12)).toBe(false)
    expect(stageMovedBeyondThreshold(10, 10, 13, 14)).toBe(true)
  })

  it('normalizes all four marquee drag directions', () => {
    const expected = { left: 10, top: 20, width: 30, height: 40, additive: false, subtractive: false }
    expect(stageMarqueeRect(10, 20, 40, 60)).toEqual(expected)
    expect(stageMarqueeRect(40, 20, 10, 60)).toEqual(expected)
    expect(stageMarqueeRect(10, 60, 40, 20)).toEqual(expected)
    expect(stageMarqueeRect(40, 60, 10, 20)).toEqual(expected)
  })

  it('applies replace, additive, and subtractive marquee selection in one commit', () => {
    expect(stageMarqueeSelection(['a'], ['b', 'b'], 'a', 'replace')).toEqual({ ids: ['b'], primaryId: 'b' })
    expect(stageMarqueeSelection(['a'], ['b', 'b'], 'a', 'add')).toEqual({ ids: ['a', 'b'], primaryId: 'b' })
    expect(stageMarqueeSelection(['a', 'b'], ['b'], 'b', 'subtract')).toEqual({ ids: ['a'], primaryId: 'a' })
  })

  it('clears on a zero-hit replace click while preserving additive and subtractive selections', () => {
    expect(stageMarqueeSelection(['actor-1', 'actor-2'], [], 'actor-2', 'replace')).toEqual({ ids: [], primaryId: null })
    expect(stageMarqueeSelection(['actor-1', 'actor-2'], [], 'actor-2', 'add')).toEqual({ ids: ['actor-1', 'actor-2'], primaryId: 'actor-2' })
    expect(stageMarqueeSelection(['actor-1', 'actor-2'], [], 'actor-2', 'subtract')).toEqual({ ids: ['actor-1', 'actor-2'], primaryId: 'actor-2' })
  })

  it('uses projected visual bounds for perspective box selection with viewport offsets', () => {
    const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1))
    object.updateMatrixWorld(true)
    const canvas = { left: 100, top: 200, width: 800, height: 600 }
    expect(stageProjectedBoundsIntersectMarquee(object, camera, canvas, { left: 430, top: 430, width: 120, height: 120 })).toBe(true)
    expect(stageProjectedBoundsIntersectMarquee(object, camera, canvas, { left: 900, top: 900, width: 40, height: 40 })).toBe(false)
    object.geometry.dispose()
  })

  it('uses a four-pixel ViewCube click-versus-drag threshold', () => {
    expect(stageViewCubeDragStarted(10, 10, 12, 12)).toBe(false)
    expect(stageViewCubeDragStarted(10, 10, 14, 10)).toBe(true)
  })

  it('maps ViewCube drag axes onto the shared editor orbit', () => {
    const orbit = { radius: 15, theta: 0.62, phi: 1.13 }
    expect(stageOrbitAfterPointerDelta(orbit, 10, 0).theta).toBeLessThan(orbit.theta)
    expect(stageOrbitAfterPointerDelta(orbit, 0, 10).phi).toBeLessThan(orbit.phi)
    expect(stageOrbitAnglesFromDirection(stageViewDirection('front').direction).phi).toBeCloseTo(Math.PI / 2)
  })

  it('keeps all six ViewCube face identities mapped to deterministic Stage views', () => {
    expect(STAGE_VIEW_CUBE_FACE_MODES).toEqual(['top', 'bottom', 'front', 'back', 'left', 'right'])
    expect(STAGE_VIEW_CUBE_FACE_MODES.map(stageViewCubeFaceMode)).toEqual(['top', 'bottom', 'front', 'back', 'left', 'right'])
  })

  it('maps E, Q, and R to StageEngine tools', () => {
    expect(stageToolForKey('e')).toBe('select')
    expect(stageToolForKey('Q')).toBe('move')
    expect(stageToolForKey('r')).toBe('rotate')
    expect(stageToolForKey('s')).toBe('scale')
    expect(stageToolForKey('m')).toBeNull()
    expect(stageToolForKey('w')).toBeNull()
  })

  it('snaps world positions on selected axes without touching other axes', () => {
    expect(STAGE_SNAP_GRID_PRESETS).toEqual([0.01, 0.05, 0.1, 0.25, 0.5, 1])
    expect(snapStageValue(0.14, 0.1)).toBeCloseTo(0.1)
    expect(snapStageValue(0.15, 0.1)).toBeCloseTo(0.2)
    expect(snapStageValue(-0.16, 0.1)).toBeCloseTo(-0.2)
    expect(snapStagePosition(new THREE.Vector3(1.14, 2.26, -0.16), ['x', 'z'], 0.1).toArray()).toEqual([1.1, 2.26, -0.2])
    expect(snapStagePosition(new THREE.Vector3(1.14, 2.26, -0.16), ['y'], 0.25).toArray()).toEqual([1.14, 2.25, -0.16])
  })

  it('scales one axis without changing the other components', () => {
    expect(scaleFromFactor([2, 1, 3], 'x', 1.5)).toEqual([3, 1, 3])
    expect(scaleFromFactor([2, 1, 3], 'y', 1.5)).toEqual([2, 1.5, 3])
    expect(scaleFromFactor([2, 1, 3], 'z', 1.5)).toEqual([2, 1, 4.5])
  })

  it('uses the initial proportions for uniform and Shift-constrained scaling', () => {
    expect(scaleFromFactor([2, 1, 3], 'uniform', 1.5)).toEqual([3, 1.5, 4.5])
    expect(scaleFromPointer([2, 1, 3], 'x', 180, true).scale).toEqual([2 * Math.E, 1 * Math.E, 3 * Math.E])
  })

  it('clamps scale factors to the supported document range', () => {
    expect(scaleFromFactor([1, 1, 1], 'x', 0.001)[0]).toBe(0.05)
    expect(scaleFromFactor([2, 2, 2], 'uniform', 1000)).toEqual([100, 100, 100])
  })

  it('uses multiplicative DEMO-style zoom distance', () => {
    expect(stageZoomDistance(15, -60)).toBeLessThan(15)
    expect(stageZoomDistance(0.1, 100)).toBeGreaterThanOrEqual(0.6)
  })

  it('does not mutate canonical selection while navigation math is applied repeatedly', () => {
    const selectedIds = ['actor-01', 'prop-01', 'camera-01']
    const initialSelection = [...selectedIds]
    let radius = 15
    for (const deltaY of [-40, 20, -12, 8]) radius = stageZoomDistance(radius, deltaY)
    expect(radius).toBeGreaterThan(0.6)
    expect(selectedIds).toEqual(initialSelection)
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

  it('chooses a deterministic dominant world axis and constrains movement', () => {
    expect(dominantStageAxis(new THREE.Vector3(1.2, 0.15, 0.4))).toBe('x')
    expect(dominantStageAxis(new THREE.Vector3(0.2, -2, 0.4))).toBe('y')
    expect(dominantStageAxis(new THREE.Vector3(0.2, 0.4, -1.2))).toBe('z')
    expect(constrainStageDeltaToAxis(new THREE.Vector3(2, 3, 4), 'y').toArray()).toEqual([0, 3, 0])
  })

  it('defines six true orthographic editor directions without changing the production camera', () => {
    expect(stageViewModeIsOrthographic('perspective')).toBe(false)
    expect(stageViewModeIsOrthographic('top')).toBe(true)
    expect(stageViewDirection('front').direction.toArray()).toEqual([0, 0, 1])
    expect(stageViewDirection('right').direction.toArray()).toEqual([1, 0, 0])
  })

  it('maps the ViewCube isometric corners to deterministic editor angles', () => {
    expect(stageViewSelectionIsIsometric('top-front-right')).toBe(true)
    expect(stageViewSelectionIsIsometric('perspective')).toBe(false)
    expect(stageViewSelectionIsIsometric('top')).toBe(false)
    expect(stageIsometricAngles('top-front-right').theta).toBeCloseTo(Math.PI / 4)
    expect(stageIsometricAngles('top-front-left').theta).toBeCloseTo(-Math.PI / 4)
    expect(stageIsometricAngles('top-back-right').theta).toBeCloseTo((Math.PI * 3) / 4)
    expect(stageIsometricAngles('top-back-left').theta).toBeCloseTo((-Math.PI * 3) / 4)
  })

  it('calculates orthographic world-units-per-pixel from the frustum', () => {
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100)
    expect(stageWorldUnitsPerPixelAtDepth(camera, 10, 80)).toBeCloseTo(0.1)
  })
})
