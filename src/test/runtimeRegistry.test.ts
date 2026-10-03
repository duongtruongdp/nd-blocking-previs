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
})
