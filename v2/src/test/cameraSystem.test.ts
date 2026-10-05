import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { defaultCameraPlacement } from '../core/cameraPlacement'
import { applySceneEntityTransform, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { activeCaptureAspect, cameraDisplayAspect, cameraProjectionForDocument, cameraRotationLookingAt, horizontalFovDegrees, letterboxRect, verticalFovDegrees } from '../runtime/cameraMath'
import { degreesToRadians, parseCameraNumber } from '../runtime/cameraInputMath'
import { cameraFrustumGuideDimensions } from '../runtime/cameraFrustum'
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

  it('keeps active-camera state independent from the selected camera entity and transforms', () => {
    const definition = CAMERA_DATABASE[0]
    const mode = definition.captureModes[0]
    const first = createCameraDocument('camera-01', 'Camera 01', [2, 2, 4], [0, 0.5, 0], definition.id, mode.id)
    const second = createCameraDocument('camera-02', 'Camera 02', [-2, 2, 4], [0, -0.5, 0], definition.id, mode.id)
    const scene = { ...createEmptySceneDocument(), cameras: [first, second], activeCameraId: first.id }
    const activated = { ...scene, activeCameraId: second.id }
    const transformed = applySceneEntityTransform(activated, { entityId: first.id, position: [3, 1, 2], rotation: [0.2, 0.4, 0] })
    expect(transformed.activeCameraId).toBe(second.id)
    expect(transformed.cameras.find((camera) => camera.id === second.id)).toEqual(second)
    expect(transformed.cameras.find((camera) => camera.id === first.id)?.position).toEqual([3, 1, 2])
  })

  it('uses deterministic centered camera placements with a human-readable look-at rotation', () => {
    const first = defaultCameraPlacement(1)
    const second = defaultCameraPlacement(2)
    expect(first.position).toEqual([0, 1.6, 6])
    expect(second.position).toEqual([1, 1.6, 6])
    expect(first.target).toEqual([0, 1.2, 0])
    const rotation = cameraRotationLookingAt(first.position, first.target)
    expect(rotation[0] * 180 / Math.PI).toBeCloseTo(-3.8, 1)
    expect(rotation[1] * 180 / Math.PI).toBeCloseTo(0, 8)
    expect(rotation[2] * 180 / Math.PI).toBeCloseTo(0, 8)
  })

  it('accepts decimal focal length input and converts degree rotation to document radians', () => {
    expect(parseCameraNumber('47.5', 0.1, 1000)).toBe(47.5)
    expect(parseCameraNumber('35', 0.1, 1000)).toBe(35)
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2, 8)
  })

  it('derives projection FOV from active capture area rather than sensor label', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const projection = cameraProjectionForDocument(camera)
    expect(projection?.aspect).toBeCloseTo(definition.captureModes[0].activeWidthMm / definition.captureModes[0].activeHeightMm, 8)
    expect(projection?.fov).toBeCloseTo(verticalFovDegrees(35, definition.captureModes[0]), 8)
    expect(horizontalFovDegrees(35, definition.captureModes[0])).toBeGreaterThan(projection?.fov ?? 0)
  })

  it('updates physical FOV with focal length and capture mode while delivery frame stays display-only', () => {
    const definition = CAMERA_DATABASE[0]
    const openGate = definition.captureModes[0]
    const cropped = definition.captureModes[2]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], definition.id, openGate.id)
    const wideHorizontal = horizontalFovDegrees(camera.focalLengthMm, openGate)
    const wideVertical = verticalFovDegrees(camera.focalLengthMm, openGate)
    expect(horizontalFovDegrees(50, openGate)).toBeLessThan(wideHorizontal)
    expect(verticalFovDegrees(50, openGate)).toBeLessThan(wideVertical)
    expect(activeCaptureAspect(cropped)).not.toBeCloseTo(activeCaptureAspect(openGate), 5)
    expect(horizontalFovDegrees(camera.focalLengthMm, cropped)).not.toBeCloseTo(wideHorizontal, 5)
    expect(verticalFovDegrees(camera.focalLengthMm, cropped)).not.toBeCloseTo(wideVertical, 5)

    const deliveryFrames = ['sensor', '16:9', '1.85', '2.00', '2.39'] as const
    const physicalFovByFrame = deliveryFrames.map((deliveryAspectRatio) => {
      const framed = { ...camera, deliveryAspectRatio }
      return [horizontalFovDegrees(framed.focalLengthMm, openGate), verticalFovDegrees(framed.focalLengthMm, openGate)]
    })
    physicalFovByFrame.forEach(([horizontal, vertical]) => {
      expect(horizontal).toBeCloseTo(wideHorizontal, 8)
      expect(vertical).toBeCloseTo(wideVertical, 8)
    })
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

  it('keeps the generic Stage representation when capture model data changes', () => {
    const firstDefinition = CAMERA_DATABASE[0]
    const secondDefinition = CAMERA_DATABASE[1]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 3], [0, 0, 0], firstDefinition.id, firstDefinition.captureModes[0].id)
    const runtime = new ProceduralCameraRuntime(camera)
    const proxyMeshes = [...runtime.selectableMeshes]
    const proxyNames = proxyMeshes.map((mesh) => mesh.name)
    runtime.applyDocument({ ...camera, cameraDefinitionId: secondDefinition.id, captureModeId: secondDefinition.captureModes[0].id })
    expect(runtime.selectableMeshes).toEqual(proxyMeshes)
    expect(runtime.selectableMeshes.map((mesh) => mesh.name)).toEqual(proxyNames)
    expect(runtime.root.position.toArray()).toEqual(camera.position)
    runtime.dispose()
  })

  it('derives a non-pickable physical FOV guide from the production camera projection', () => {
    const definition = CAMERA_DATABASE[0]
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1.6, 6], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const runtime = new ProceduralCameraRuntime(camera)
    const wide = cameraFrustumGuideDimensions(runtime.productionCamera, 3)
    runtime.applyDocument({ ...camera, focalLengthMm: 85 })
    const narrow = cameraFrustumGuideDimensions(runtime.productionCamera, 3)
    expect(narrow.width).toBeLessThan(wide.width)
    expect(narrow.height).toBeLessThan(wide.height)
    expect(wide.aspect).toBeCloseTo(runtime.productionCamera.aspect, 8)
    runtime.applyDocument({ ...camera, focalLengthMm: 85, deliveryAspectRatio: '2.39' })
    const deliveryOnly = cameraFrustumGuideDimensions(runtime.productionCamera, 3)
    expect(deliveryOnly.width).toBeCloseTo(narrow.width, 8)
    expect(deliveryOnly.height).toBeCloseTo(narrow.height, 8)
    const guideLine = runtime.fovGuide.children[0]
    expect(runtime.fovGuide.userData.stageSelectable).toBe(false)
    expect(guideLine.userData.stageSelectable).toBe(false)
    expect(guideLine.raycast).not.toBe(THREE.LineSegments.prototype.raycast)
    runtime.dispose()
  })

  it('keeps letterbox framing centered for capture display', () => {
    const frame = letterboxRect(1200, 800, 16 / 9)
    expect(frame.x).toBe(0)
    expect(frame.y).toBeGreaterThan(0)
    expect(frame.width / frame.height).toBeCloseTo(16 / 9, 8)
  })
})
