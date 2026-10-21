import * as THREE from 'three'
import type { ActorVector3, SceneDocument, SceneGroup } from './sceneDocument'

export type GroupableEntity = { id: string; position: ActorVector3; rotation: ActorVector3 }

export function groupableEntityIds(scene: SceneDocument): string[] {
  return [...scene.actors, ...scene.props, ...scene.walls, ...scene.cameras, ...scene.lights]
    .map((entity) => entity.id)
}

export function groupPivot(entities: readonly GroupableEntity[]): ActorVector3 {
  if (entities.length === 0) return [0, 0, 0]
  const center = entities.reduce((sum, entity) => sum.add(new THREE.Vector3(...entity.position)), new THREE.Vector3()).multiplyScalar(1 / entities.length)
  return [center.x, center.y, center.z]
}

/** Applies the group's non-destructive world-space delta to one child. */
export function applyGroupTransform(entity: GroupableEntity, group: SceneGroup): GroupableEntity {
  const cleanZero = (value: number): number => value === 0 ? 0 : value
  const pivot = new THREE.Vector3(...group.pivot)
  const rotation = new THREE.Euler(...group.rotation, 'XYZ')
  const position = new THREE.Vector3(...entity.position).sub(pivot).applyEuler(rotation).add(pivot).add(new THREE.Vector3(...group.position))
  const childQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...entity.rotation, 'XYZ'))
  const groupQuaternion = new THREE.Quaternion().setFromEuler(rotation)
  const composed = groupQuaternion.multiply(childQuaternion)
  const euler = new THREE.Euler().setFromQuaternion(composed, 'XYZ')
  return { ...entity, position: [cleanZero(position.x), cleanZero(position.y), cleanZero(position.z)], rotation: [cleanZero(euler.x), cleanZero(euler.y), cleanZero(euler.z)] }
}

export function groupForChild(scene: SceneDocument, entityId: string): SceneGroup | null {
  return scene.groups.find((group) => group.childIds.includes(entityId)) ?? null
}

export function evaluateGroupTransforms<T extends GroupableEntity>(entities: readonly T[], groups: readonly SceneGroup[]): T[] {
  return entities.map((entity) => {
    const group = groups.find((candidate) => candidate.childIds.includes(entity.id))
    return group ? applyGroupTransform(entity, group) as T : entity
  })
}

export function bakeGroupChildren<T extends GroupableEntity>(entities: readonly T[], group: SceneGroup): T[] {
  const children = new Set(group.childIds)
  return entities.map((entity) => children.has(entity.id) ? applyGroupTransform(entity, group) as T : entity)
}

