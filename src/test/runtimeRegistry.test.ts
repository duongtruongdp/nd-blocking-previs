import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RuntimeRegistry } from '../runtime/RuntimeRegistry'

describe('runtime entity registry', () => {
  it('resolves compound proxy child hits to their parent entity ID', () => {
    const registry = new RuntimeRegistry()
    const root = new THREE.Group()
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    root.add(child)
    registry.register('actor-1', root)

    expect(registry.resolveHit(child)).toBe('actor-1')
    expect(registry.get('actor-1')).toBe(root)
    registry.unregister('actor-1')
    expect(registry.resolveHit(child)).toBeUndefined()
    child.geometry.dispose()
  })

  it('resolves nested character and camera meshes to their owning entities', () => {
    const registry = new RuntimeRegistry()
    const actorRoot = new THREE.Group()
    const actorModel = new THREE.Group()
    const actorMesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1))
    actorModel.add(actorMesh)
    actorRoot.add(actorModel)
    const cameraRoot = new THREE.Group()
    const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    cameraRoot.add(cameraBody)

    registry.register('actor-1', actorRoot)
    registry.register('camera-1', cameraRoot)

    expect(registry.resolveHit(actorMesh)).toBe('actor-1')
    expect(registry.resolveHit(cameraBody)).toBe('camera-1')

    actorMesh.geometry.dispose()
    cameraBody.geometry.dispose()
  })
})
