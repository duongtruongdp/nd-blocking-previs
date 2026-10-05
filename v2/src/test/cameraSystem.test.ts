import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { cameraDisplayAspect, cameraProjectionForDocument, horizontalFovDegrees, letterboxRect, verticalFovDegrees } from '../runtime/cameraMath'
import { ProceduralCameraRuntime } from '../runtime/cameraRuntime'

describe('V2 Camera system foundation', () => {
  it('seeds a small verified camera set with provenance and active capture areas', () => {
    expect(CAMERA_DATABASE.length).toBeGreaterThanOrEqual(5)
    expect(CAMERA_DATABASE.every((camera) => camera.provenance.url && camera.captureModes.length > 0)).toBe(true)
    expect(CAMERA_DATABASE.flatMap((camera) => camera.captureModes).every((mode) => mode.activeWidthMm > 0 && mode.activeHeightMm > 0 && mode.provenance.url)).toBe(true)
  })

  it('keeps SceneDocument cameras serializable and separate from Three.js cameras', () => {
    const document = createEmptySceneDocument()
    const camera = createCameraDocument('camera-01', 'Camera 01', [2, 2, 4], [0, 0.5, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
    const next = { ...document, cameras: [camera], activeCameraId: camera.id }
    expect(next.cameras[0]).not.toHaveProperty('productionCamera')
    expect(JSON.stringify(next)).not.toContain('PerspectiveCamera')
    expect(next.activeCameraId).toBe(camera.id)
  })

  it('derives projection FOV from active capture area rather than sensor label', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const projection = cameraProjectionForDocument(camera)
    expect(projection?.aspect).toBeCloseTo(definition.captureModes[0].activeWidthMm / definition.captureModes[0].activeHeightMm, 8)
    expect(projection?.fov).toBeCloseTo(verticalFovDegrees(35, definition.captureModes[0]), 8)
    expect(horizontalFovDegrees(35, definition.captureModes[0])).toBeGreaterThan(projection?.fov ?? 0)
  })

  it('keeps lens squeeze as a display concern and does not alter capture projection math', () => {
    const definition = CAMERA_DATABASE[0]
    const mode = definition.captureModes[0]
    const spherical = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, mode.id)
    const anamorphic = { ...spherical, lensType: 'Anamorphic' as const, anamorphicSqueeze: 2 as const }
    expect(cameraProjectionForDocument(anamorphic)?.aspect).toBe(cameraProjectionForDocument(spherical)?.aspect)
    expect(cameraDisplayAspect(anamorphic)).toBeCloseTo((mode.activeWidthMm / mode.activeHeightMm) * 2, 8)
  })

  it('creates a recognizable selectable proxy with the filmmaking camera forward axis', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const runtime = new ProceduralCameraRuntime(camera)
    runtime.root.updateMatrixWorld(true)
    runtime.productionCamera.updateMatrixWorld(true)
    const direction = runtime.productionCamera.getWorldDirection(new THREE.Vector3())
    expect(direction.z).toBeCloseTo(-1, 8)
    expect(runtime.selectableMeshes.length).toBeGreaterThan(10)
    expect(runtime.selectableMeshes.every((mesh) => mesh.userData.entityId === camera.id)).toBe(true)
    runtime.dispose()
  })

  it('keeps letterbox framing centered for capture display', () => {
    const frame = letterboxRect(1200, 800, 16 / 9)
    expect(frame.x).toBe(0)
    expect(frame.y).toBeGreaterThan(0)
    expect(frame.width / frame.height).toBeCloseTo(16 / 9, 8)
  })
})
