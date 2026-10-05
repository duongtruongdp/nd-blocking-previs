import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyV2NavigationState, createV2NavigationState, orbitV2Navigation, panTrackpadV2Navigation, panV2Navigation, synchronizeV2StageMatrices, zoomV2Navigation } from '../runtime/navigationState'
import { signedV2AxisAngle, v2MovedBeyondThreshold, v2PointerToNdc, v2ToolForShortcut } from '../runtime/interactionMath'
import { classifyWheelInput, V2WheelDeltaModePixel } from '../runtime/inputNormalization'

describe('V2 navigation foundation', () => {
  it('derives a camera transform from target, distance, azimuth, and polar', () => {
    const state = createV2NavigationState()
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500)

    applyV2NavigationState(camera, state)

    expect(camera.position.distanceTo(state.target)).toBeCloseTo(state.distance, 8)
    expect(camera.getWorldDirection(new THREE.Vector3()).dot(state.target.clone().sub(camera.position).normalize())).toBeCloseTo(1, 8)
  })

  it('maps client coordinates to NDC using the exact canvas rect', () => {
    const ndc = v2PointerToNdc(150, 250, { left: 100, top: 200, width: 100, height: 100 })
    expect(ndc.x).toBeCloseTo(0)
    expect(ndc.y).toBeCloseTo(0)
  })

  it('keeps orbit, pan, and zoom changes in navigation state', () => {
    const state = createV2NavigationState()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    applyV2NavigationState(camera, state)
    const target = state.target.clone()
    const beforeAzimuth = state.azimuth
    orbitV2Navigation(state, 30, -10)
    expect(state.target).toEqual(target)
    expect(state.azimuth).not.toBe(beforeAzimuth)
    panV2Navigation(state, camera, 12, -8)
    expect(state.target.equals(target)).toBe(false)
    const beforeZoom = state.distance
    zoomV2Navigation(state, -60)
    expect(state.distance).toBeLessThan(beforeZoom)
    expect(state.distance).toBeGreaterThanOrEqual(1.4)
  })

  it('classifies a click and drag with the demo three-pixel threshold', () => {
    expect(v2MovedBeyondThreshold(10, 10, 12, 12)).toBe(false)
    expect(v2MovedBeyondThreshold(10, 10, 15, 10)).toBe(true)
  })

  it('maps the production shortcuts to the transform tools', () => {
    expect(v2ToolForShortcut('q')).toBe('move')
    expect(v2ToolForShortcut('E')).toBe('select')
    expect(v2ToolForShortcut('r')).toBe('rotate')
    expect(v2ToolForShortcut('w')).toBeNull()
  })

  it('classifies pinch, trackpad scroll, and mouse-wheel input', () => {
    expect(classifyWheelInput({ ctrlKey: true, deltaMode: V2WheelDeltaModePixel, deltaX: 0, deltaY: -4 })).toBe('trackpad-pinch-zoom')
    expect(classifyWheelInput({ ctrlKey: false, deltaMode: V2WheelDeltaModePixel, deltaX: 0, deltaY: 12 })).toBe('trackpad-pan')
    expect(classifyWheelInput({ ctrlKey: false, deltaMode: 1, deltaX: 0, deltaY: 3 })).toBe('mouse-wheel-zoom')
    expect(classifyWheelInput({ ctrlKey: false, deltaMode: V2WheelDeltaModePixel, deltaX: 0, deltaY: 120 })).toBe('mouse-wheel-zoom')
  })

  it('pans trackpad input through camera-relative target motion', () => {
    const state = createV2NavigationState()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
    applyV2NavigationState(camera, state)
    const beforeTarget = state.target.clone()

    panTrackpadV2Navigation(state, camera, 10, -8)

    expect(state.target.equals(beforeTarget)).toBe(false)
    expect(state.distance).toBeCloseTo(createV2NavigationState().distance)
  })

  it('uses the existing multiplicative distance model for pinch zoom', () => {
    const state = createV2NavigationState()
    const beforeDistance = state.distance

    zoomV2Navigation(state, -20)

    expect(state.distance).toBeLessThan(beforeDistance)
  })

  it('computes signed X and Y rotation angles', () => {
    expect(signedV2AxisAngle(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0))).toBeCloseTo(Math.PI / 2)
    expect(signedV2AxisAngle(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0))).toBeCloseTo(-Math.PI / 2)
  })

  it('synchronizes matrices before projecting and raycasting a visible primitive', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500)
    const state = createV2NavigationState()
    const probe = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())
    probe.position.copy(state.target)
    scene.add(probe)
    applyV2NavigationState(camera, state)
    synchronizeV2StageMatrices(scene, camera)
    const projected = state.target.clone().project(camera)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera)
    expect(projected.x).toBeCloseTo(0, 6)
    expect(projected.y).toBeCloseTo(0, 6)
    expect(raycaster.intersectObject(probe, true)).toHaveLength(1)
    probe.geometry.dispose()
    ;(probe.material as THREE.Material).dispose()
  })
})
