import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyBlockingNavigationState, createBlockingNavigationState, framingDistanceForBounds, framingPositionForBounds, isEditableNavigationTarget, orbitBlockingNavigation, panBlockingNavigation, standardViewOffset, standardViewPosition, synchronizeBlockingInteractionMatrices, zoomBlockingNavigation } from '../runtime/navigation'
import { VIEW_CUBE_FACES, VIEW_CUBE_LAYOUT, VIEW_CUBE_PANELS, VIEW_CUBE_ZONES, viewCubeCssTransform } from '../components/viewCube'

describe('Blocking View standard navigation', () => {
  const target = new THREE.Vector3(2, 0.65, -1)

  it.each([
    ['front', [0, 0, 1]],
    ['back', [0, 0, -1]],
    ['left', [-1, 0, 0]],
    ['right', [1, 0, 0]],
    ['top', [0, 1, 0]],
    ['bottom', [0, -1, 0]],
  ] as const)('%s resolves to the established Stage direction', (direction, expected) => {
    expect(standardViewOffset(direction).toArray()).toEqual(expected)
  })

  it('preserves the orbit target and working distance for standard views', () => {
    const position = standardViewPosition('left', target, 8)
    expect(position.distanceTo(target)).toBeCloseTo(8, 4)
    expect(position.x).toBeCloseTo(-6, 4)
    expect(position.y).toBeCloseTo(target.y, 4)
    expect(position.z).toBeCloseTo(target.z, 4)
  })

  it('gives TOP and BOTTOM a stable screen-up nudge', () => {
    const top = standardViewPosition('top', target, 6)
    const bottom = standardViewPosition('bottom', target, 6)
    expect(top.y).toBeGreaterThan(target.y)
    expect(bottom.y).toBeLessThan(target.y)
    expect(top.z).toBeLessThan(target.z)
    expect(bottom.z).toBeGreaterThan(target.z)
  })

  it('calculates a padded framing distance from bounds, FOV, and aspect', () => {
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000)
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -2, -0.5), new THREE.Vector3(1, 2, 0.5))
    const distance = framingDistanceForBounds(bounds, camera)

    expect(distance).toBeGreaterThan(4.5)
    expect(framingDistanceForBounds(bounds, camera, 1.5)).toBeGreaterThan(distance)
  })

  it('recognizes editable controls as keyboard-safe targets', () => {
    expect(isEditableNavigationTarget({ tagName: 'input' })).toBe(true)
    expect(isEditableNavigationTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isEditableNavigationTarget({ tagName: 'div', isContentEditable: true })).toBe(true)
    expect(isEditableNavigationTarget({ tagName: 'div' })).toBe(false)
    expect(isEditableNavigationTarget(null)).toBe(false)
  })

  it('places the framed bounds center at the camera centerline', () => {
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000)
    const currentTarget = new THREE.Vector3(0, 0.65, 0)
    const currentPosition = new THREE.Vector3(6, 4.8, 7)
    const bounds = new THREE.Box3(new THREE.Vector3(-1, 0, -0.5), new THREE.Vector3(1, 2, 0.5))
    const framed = framingPositionForBounds(bounds, camera, currentTarget, currentPosition)

    camera.position.copy(framed.position)
    camera.lookAt(framed.center)
    camera.updateMatrixWorld(true)
    const projected = framed.center.clone().project(camera)

    expect(projected.x).toBeCloseTo(0, 5)
    expect(projected.y).toBeCloseTo(0, 5)
    expect(framed.position.distanceTo(framed.center)).toBeCloseTo(framed.distance, 5)
  })

  it('orbits by changing only azimuth and polar', () => {
    const state = createBlockingNavigationState()
    const target = state.target.clone()
    const distance = state.distance
    const azimuth = state.azimuth
    const polar = state.polar

    orbitBlockingNavigation(state, 100, -40)

    expect(state.target).toEqual(target)
    expect(state.distance).toBe(distance)
    expect(state.azimuth).not.toBe(azimuth)
    expect(state.polar).not.toBe(polar)
  })

  it('pans the target while preserving camera distance', () => {
    const state = createBlockingNavigationState()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    applyBlockingNavigationState(camera, state)
    const beforeDistance = state.distance
    const beforeTarget = state.target.clone()

    panBlockingNavigation(state, camera, 60, -20)

    expect(state.target.equals(beforeTarget)).toBe(false)
    expect(state.distance).toBe(beforeDistance)
  })

  it('zooms multiplicatively while preserving the target', () => {
    const state = createBlockingNavigationState()
    const target = state.target.clone()
    const distance = state.distance

    zoomBlockingNavigation(state, -100)

    expect(state.target).toEqual(target)
    expect(state.distance).toBeLessThan(distance)
  })

  it('clamps polar angle and keeps the derived camera upright', () => {
    const state = createBlockingNavigationState()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)

    orbitBlockingNavigation(state, 0, 10000)
    applyBlockingNavigationState(camera, state)
    expect(state.polar).toBeGreaterThan(0)
    expect(camera.up.toArray()).toEqual([0, 1, 0])
    expect(camera.position.distanceTo(state.target)).toBeCloseTo(state.distance, 8)
  })

  it('synchronizes render and interaction matrices after deriving navigation transforms', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 1000)
    const state = createBlockingNavigationState()
    const probe = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    probe.position.copy(state.target)
    scene.add(probe)

    applyBlockingNavigationState(camera, state)
    synchronizeBlockingInteractionMatrices(scene, camera)
    state.azimuth += 0.35
    applyBlockingNavigationState(camera, state)

    const beforeSync = state.target.clone().project(camera)
    synchronizeBlockingInteractionMatrices(scene, camera)
    const afterSync = state.target.clone().project(camera)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(afterSync.x, afterSync.y), camera)

    expect(Math.abs(afterSync.x)).toBeLessThan(1e-6)
    expect(Math.abs(afterSync.y)).toBeLessThan(1e-6)
    expect(Math.abs(beforeSync.x) + Math.abs(beforeSync.y)).toBeGreaterThan(1e-4)
    expect(raycaster.intersectObject(probe, true)).toHaveLength(1)

    probe.geometry.dispose()
    ;(probe.material as THREE.Material).dispose()
  })

  it('keeps the View Cube interaction boundary compact and inside the Stage', () => {
    expect(VIEW_CUBE_LAYOUT.faceArea).toBeGreaterThanOrEqual(88)
    expect(VIEW_CUBE_LAYOUT.right + VIEW_CUBE_LAYOUT.width).toBeLessThanOrEqual(128)
    expect(VIEW_CUBE_LAYOUT.top + VIEW_CUBE_LAYOUT.height).toBeLessThanOrEqual(128)
  })

  it('maps every DOM View Cube face to a Stage direction', () => {
    expect(VIEW_CUBE_FACES.map((face) => face.direction)).toEqual(['front', 'back', 'left', 'right', 'top', 'bottom'])
    expect(VIEW_CUBE_ZONES).toHaveLength(26)
    expect(new Set(VIEW_CUBE_ZONES.map((zone) => zone.key)).size).toBe(26)
    expect(VIEW_CUBE_PANELS).toHaveLength(6)
    expect(VIEW_CUBE_PANELS.flatMap((panel) => panel.zones)).toHaveLength(54)
    expect(viewCubeCssTransform([0, 0, 0, 1])).toMatch(/^matrix3d\(/)
  })
})
