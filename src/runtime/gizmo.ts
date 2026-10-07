import * as THREE from 'three'
export type V2TransformAxis = 'x' | 'y' | 'z' | 'xz'

const AXIS_COLORS: Record<'x' | 'y' | 'z', string> = {
  x: '#d85f68',
  y: '#55aa74',
  z: '#557fd0',
}

export type V2GizmoMode = 'move' | 'rotate'

/**
 * Keeps the Actor rotate control visually centered on the body's silhouette
 * instead of the ActorRoot ground contact point.
 */
export function actorRotateAnchorFromBounds(bounds: THREE.Box3, heightRatio = 0.45): THREE.Vector3 {
  const size = bounds.getSize(new THREE.Vector3())
  return new THREE.Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    bounds.min.y + size.y * heightRatio,
    (bounds.min.z + bounds.max.z) * 0.5,
  )
}

export function actorRotateGizmoScale(baseScale: number, diameterRatio = 0.6): number {
  return baseScale * diameterRatio
}

export class V2TransformGizmo {
  readonly root = new THREE.Group()
  readonly pickMeshes: THREE.Mesh[] = []
  private readonly resources: Array<THREE.BufferGeometry | THREE.Material> = []
  private mode: V2GizmoMode | null = null
  private actorSelected = false

  constructor() {
    this.root.name = 'TransformGizmo'
    this.root.visible = false
    this.root.renderOrder = 999
  }

  setMode(mode: V2GizmoMode | null, actorSelected: boolean): void {
    if (mode === this.mode && actorSelected === this.actorSelected && mode !== null) return
    this.clear()
    this.mode = mode
    this.actorSelected = actorSelected
    if (!mode) {
      this.root.visible = false
      return
    }
    if (mode === 'move') this.buildMoveGizmo(actorSelected)
    else this.buildRotateGizmo()
    this.root.visible = true
  }

  setWorldTransform(position: THREE.Vector3, scale: number): void {
    this.root.position.copy(position)
    this.root.rotation.set(0, 0, 0)
    this.root.scale.setScalar(scale)
  }

  setHandleHighlight(handle: V2TransformAxis | null): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const material = object.material
      if (!(material instanceof THREE.MeshBasicMaterial) || object.userData.gizmoPick) return
      const baseColor = object.userData.gizmoColor as string | undefined
      material.color.set(object.userData.gizmoHandle === handle ? '#ffffff' : baseColor ?? '#ffffff')
    })
  }

  dispose(): void {
    this.clear()
  }

  private buildMoveGizmo(actorSelected: boolean): void {
    ;(['x', 'y', 'z'] as const).forEach((axis) => {
      if (actorSelected && axis === 'y') return
      const direction = axis === 'x' ? new THREE.Vector3(1, 0, 0) : axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
      const color = AXIS_COLORS[axis]
      const visibleMaterial = this.track(new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }))
      const visible = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.018, 0.018, 1, 8)), visibleMaterial)
      visible.name = `move-${axis}`
      visible.renderOrder = 999
      visible.position.copy(direction).multiplyScalar(0.5)
      visible.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
      visible.userData.gizmoHandle = axis
      visible.userData.gizmoColor = color
      this.root.add(visible)

      const arrow = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.075, 0.18, 8)), visibleMaterial)
      arrow.name = `move-${axis}-arrow`
      arrow.renderOrder = 999
      arrow.position.copy(direction).multiplyScalar(1.02)
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
      arrow.userData.gizmoHandle = axis
      arrow.userData.gizmoColor = color
      this.root.add(arrow)

      const hitMaterial = this.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }))
      const hit = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.105, 0.105, 1.12, 8)), hitMaterial)
      hit.name = `move-${axis}-pick`
      hit.position.copy(direction).multiplyScalar(0.52)
      hit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
      hit.userData.gizmoHandle = axis
      hit.userData.gizmoPick = true
      this.root.add(hit)
      this.pickMeshes.push(hit)
    })

    const planeMaterial = this.track(new THREE.MeshBasicMaterial({ color: '#d1a35e', transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, side: THREE.DoubleSide }))
    const plane = new THREE.Mesh(this.track(new THREE.PlaneGeometry(0.3, 0.3)), planeMaterial)
    plane.name = 'move-xz'
    plane.renderOrder = 999
    plane.rotation.x = -Math.PI / 2
    plane.position.y = 0.035
    plane.userData.gizmoHandle = 'xz'
    plane.userData.gizmoColor = '#d1a35e'
    this.root.add(plane)
    const planeHit = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.36, 0.05, 0.36)), this.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false })))
    planeHit.name = 'move-xz-pick'
    planeHit.position.y = 0.035
    planeHit.userData.gizmoHandle = 'xz'
    planeHit.userData.gizmoPick = true
    this.root.add(planeHit)
    this.pickMeshes.push(planeHit)
  }

  private buildRotateGizmo(): void {
    ;([['x', '#d85f68'], ['y', '#55aa74']] as const).forEach(([axis, color]) => {
      const visibleMaterial = this.track(new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }))
      const ring = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.86, 0.025, 6, 32)), visibleMaterial)
      ring.name = `rotate-${axis}`
      ring.renderOrder = 999
      if (axis === 'y') ring.rotation.x = Math.PI / 2
      else ring.rotation.y = Math.PI / 2
      ring.userData.gizmoHandle = axis
      ring.userData.gizmoColor = color
      this.root.add(ring)
      const hitMaterial = this.track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }))
      const hitRing = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.86, 0.12, 6, 32)), hitMaterial)
      hitRing.name = `rotate-${axis}-pick`
      hitRing.rotation.copy(ring.rotation)
      hitRing.userData.gizmoHandle = axis
      hitRing.userData.gizmoPick = true
      this.root.add(hitRing)
      this.pickMeshes.push(hitRing)
    })
  }

  private track<T extends THREE.BufferGeometry | THREE.Material>(resource: T): T {
    this.resources.push(resource)
    return resource
  }

  private clear(): void {
    this.root.clear()
    this.pickMeshes.length = 0
    this.resources.forEach((resource) => resource.dispose())
    this.resources.length = 0
  }
}
