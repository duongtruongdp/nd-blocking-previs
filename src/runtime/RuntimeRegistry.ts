import * as THREE from 'three'

export class RuntimeRegistry {
  private readonly roots = new Map<string, THREE.Object3D>()
  private readonly hitIds = new WeakMap<THREE.Object3D, string>()

  register(entityId: string, root: THREE.Object3D): void {
    this.roots.set(entityId, root)
    root.traverse((object) => this.hitIds.set(object, entityId))
  }

  unregister(entityId: string): THREE.Object3D | undefined {
    const root = this.roots.get(entityId)
    if (!root) return undefined
    root.traverse((object) => this.hitIds.delete(object))
    this.roots.delete(entityId)
    return root
  }

  get(entityId: string): THREE.Object3D | undefined {
    return this.roots.get(entityId)
  }

  resolveHit(object: THREE.Object3D | undefined): string | undefined {
    let current = object
    while (current) {
      const entityId = this.hitIds.get(current)
      if (entityId) return entityId
      current = current.parent ?? undefined
    }
    return undefined
  }

  rootsList(): THREE.Object3D[] {
    return [...this.roots.values()]
  }

  clear(): void {
    this.roots.clear()
  }
}
