import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { addCamera, setCameraFocalLength, setCameraModel, setCameraSensorMode } from '../domain/blockingCommands'
import { createMinimumValidProject } from '../domain/project'
import { BlockingAssetLibrary, createBlockingProxy, updateBlockingProxy } from '../runtime/entityAdapters'

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
