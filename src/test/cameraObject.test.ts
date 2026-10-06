import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { addCamera, setCameraFocalLength, setCameraModel, setCameraSensorMode } from '../domain/blockingCommands'
import { createMinimumValidProject } from '../domain/project'
import { BlockingAssetLibrary, CAMERA_OPTICAL_ORIGIN_Z, createBlockingProxy, updateBlockingProxy } from '../runtime/entityAdapters'
import { computeBlockingBounds } from '../runtime/characterAssets'

function project() {
  return createMinimumValidProject(() => 'project-id')
}

describe('camera object foundation runtime', () => {
  it('creates a finite camera representation with a projection derived from capture geometry', () => {
    const added = addCamera(project(), () => 'camera-1')
    const library = new BlockingAssetLibrary()
    const root = createBlockingProxy(added.project.shots[0].cameras[0], library)
    const runtimeCamera = root.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera
    expect(runtimeCamera.userData.filmmakingCamera).toBe(true)
    expect(runtimeCamera.aspect).toBeCloseTo(1.5, 10)
    expect(runtimeCamera.fov).toBeGreaterThan(0)
    expect(root.getObjectByName('CameraFrustumGuide')?.children).toHaveLength(1)
    expect(root.getObjectByName('camera-top-handle')).toBeDefined()
    expect(root.getObjectByName('camera-front-glass')).toBeDefined()
    expect(root.getObjectByName('camera-matte-box-top')).toBeDefined()
    const frontGlass = root.getObjectByName('camera-front-glass') as THREE.Mesh
    const matteBoxTop = root.getObjectByName('camera-matte-box-top') as THREE.Mesh
    const matteBoxLeft = root.getObjectByName('camera-matte-box-left') as THREE.Mesh
    const matteBoxBottom = root.getObjectByName('camera-matte-box-bottom') as THREE.Mesh
    expect(matteBoxTop.scale.x / frontGlass.scale.x).toBeCloseTo(1.75, 10)
    expect(matteBoxLeft.scale.y / frontGlass.scale.x).toBeCloseTo(1.6, 10)
    expect(matteBoxTop.scale.z).toBeCloseTo(0.07, 10)
    expect(matteBoxBottom.position.x).toBe(0)
    expect(matteBoxTop.position.x).toBe(0)
    const handle = root.getObjectByName('camera-top-handle') as THREE.Mesh
    expect(handle.scale.z).toBeGreaterThan(handle.scale.x)
    expect(root.getObjectByName('camera-handle-support-rear')?.position.z).toBeGreaterThan(0)
    expect(root.getObjectByName('camera-handle-support-front')?.position.z).toBeLessThan(0)
    const body = root.getObjectByName('camera-body') as THREE.Mesh
    const rear = root.getObjectByName('camera-rear-module') as THREE.Mesh
    expect(rear.scale.x).toBeLessThan(body.scale.x)
    const forward = root.getObjectByName('camera-forward')
    expect(forward?.userData.cameraDirection).toBe(true)
    expect(forward?.position.toArray()).toEqual([0, 0, CAMERA_OPTICAL_ORIGIN_Z])
    expect(forward).not.toBeInstanceOf(THREE.Mesh)

    const guide = root.getObjectByName('CameraFrustumLines') as THREE.LineSegments
    const guidePositions = guide.geometry.getAttribute('position')
    const guideZValues = Array.from({ length: guidePositions.count }, (_, index) => guidePositions.getZ(index))
    expect(guidePositions.count).toBe(16)
    expect(Math.max(...guideZValues)).toBeLessThanOrEqual(CAMERA_OPTICAL_ORIGIN_Z)
    expect(guidePositions.getX(0)).toBe(0)
    expect(guidePositions.getY(0)).toBe(0)
    expect(guidePositions.getZ(0)).toBe(CAMERA_OPTICAL_ORIGIN_Z)
    const farCornerIndices = [8, 10, 12, 14]
    expect(farCornerIndices.reduce((sum, index) => sum + guidePositions.getX(index), 0) / farCornerIndices.length).toBeCloseTo(0, 10)
    expect(farCornerIndices.reduce((sum, index) => sum + guidePositions.getY(index), 0) / farCornerIndices.length).toBeCloseTo(0, 10)
    expect(new Set(farCornerIndices.map((index) => guidePositions.getZ(index))).size).toBe(1)
    const selectionBounds = computeBlockingBounds(root)
    expect(selectionBounds.min.z).toBeGreaterThan(CAMERA_OPTICAL_ORIGIN_Z - 0.1)
    expect(selectionBounds.max.z).toBeGreaterThan(0.25)
    library.dispose()
  })

  it('keeps the generic cinema-camera representation when the Camera Model changes', () => {
    const added = addCamera(project(), () => 'camera-1')
    const library = new BlockingAssetLibrary()
    const root = createBlockingProxy(added.project.shots[0].cameras[0], library)
    const namesBefore: string[] = []
    root.traverse((object) => { if (object.name) namesBefore.push(object.name) })

    const changed = setCameraModel(added.project, added.entityId, 'arri.amira')
    updateBlockingProxy(root, changed.shots[0].cameras[0])
    const namesAfter: string[] = []
    root.traverse((object) => { if (object.name) namesAfter.push(object.name) })

    expect(namesAfter).toEqual(namesBefore)
    expect(root.getObjectByName('camera-matte-box-top')).toBeDefined()
    expect(root.getObjectByName('camera-top-handle')).toBeDefined()
    library.dispose()
  })

  it('updates projection FOV when focal length and sensor mode change', () => {
    const added = addCamera(project(), () => 'camera-1')
    const library = new BlockingAssetLibrary()
    const before = added.project.shots[0].cameras[0]
    const root = createBlockingProxy(before, library)
    const initialFov = (root.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera).fov
    const longLensProject = setCameraFocalLength(added.project, added.entityId, 100)
    const longLens = longLensProject.shots[0].cameras[0]
    updateBlockingProxy(root, longLens)
    const longLensFov = (root.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera).fov
    expect(longLensFov).toBeLessThan(initialFov)

    const arrIProject = setCameraModel(longLensProject, added.entityId, 'arri.alexa-35')
    const modeProject = setCameraSensorMode(arrIProject, added.entityId, 'arri.alexa-35.3_3k-6_5')
    updateBlockingProxy(root, modeProject.shots[0].cameras[0])
    const runtimeCamera = root.getObjectByName('FilmCameraRuntime') as THREE.PerspectiveCamera
    expect(runtimeCamera.aspect).toBeCloseTo(20.22 / 16.95, 10)
    expect(runtimeCamera.fov).not.toBe(longLensFov)
    expect(root.getObjectByName('CameraFrustumGuide')?.children).toHaveLength(1)
    library.dispose()
  })
})
