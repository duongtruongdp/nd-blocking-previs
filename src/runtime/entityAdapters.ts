import * as THREE from 'three'
import type { ActorDocument, PropDocument } from '../domain/types'
import { updateActorRuntimeAppearance } from './characterAssets'

export type BlockingEntity = ActorDocument | PropDocument

/**
 * Normalized adult mannequin proportions. The Actor root is scaled by
 * heightM, so these values remain the single source of truth for body shape
 * and keep feet on the Stage floor when the height changes.
 */
export const ACTOR_PROPORTIONS = {
  foot: {
    height: 0.04,
    width: 0.1,
    length: 0.16,
    forwardOffset: -0.04,
  },
  lowerLegLength: 0.24,
  upperLegLength: 0.25,
  hipY: 0.52,
  pelvis: {
    centerY: 0.585,
    height: 0.13,
    width: 0.28,
    depth: 0.18,
  },
  abdomen: {
    centerY: 0.69,
    height: 0.1,
    width: 0.25,
    depth: 0.16,
  },
  chest: {
    centerY: 0.8,
    height: 0.18,
    width: 0.32,
    depth: 0.2,
  },
  neck: {
    centerY: 0.91,
    height: 0.05,
    width: 0.09,
    depth: 0.09,
  },
  head: {
    centerY: 0.94,
    height: 0.12,
    width: 0.17,
    depth: 0.145,
  },
  shoulder: {
    x: 0.205,
    y: 0.845,
  },
  upperArmLength: 0.17,
  forearmLength: 0.17,
  upperLegWidth: 0.105,
  lowerLegWidth: 0.085,
  jointDiameter: 0.09,
  handDiameter: 0.07,
  facingTick: {
    width: 0.018,
    height: 0.012,
    length: 0.055,
    z: -0.105,
  },
} as const

export class BlockingAssetLibrary {
  readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  readonly cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
  readonly actorSphereGeometry = new THREE.SphereGeometry(0.5, 12, 8)
  readonly actorTorsoGeometry = new THREE.CylinderGeometry(0.5, 0.58, 1, 10)
  readonly actorLimbGeometry = new THREE.CylinderGeometry(0.44, 0.54, 1, 10)

  private readonly materials = new Map<string, THREE.MeshStandardMaterial>()
  private readonly actorMaterials = new Set<THREE.MeshStandardMaterial>()

  material(color: string): THREE.MeshStandardMaterial {
    const existing = this.materials.get(color)
    if (existing) return existing
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.82,
      metalness: 0.02,
    })
    this.materials.set(color, material)
    return material
  }

  actorMaterial(color: string): THREE.MeshStandardMaterial {
    const material = this.material(color).clone()
    this.actorMaterials.add(material)
    return material
  }

  dispose(): void {
    this.boxGeometry.dispose()
    this.cylinderGeometry.dispose()
    this.actorSphereGeometry.dispose()
    this.actorTorsoGeometry.dispose()
    this.actorLimbGeometry.dispose()
    this.actorMaterials.forEach((material) => material.dispose())
    this.actorMaterials.clear()
    this.materials.forEach((material) => material.dispose())
    this.materials.clear()
  }
}

export function createBlockingProxy(
  entity: BlockingEntity,
  library: BlockingAssetLibrary,
): THREE.Group {
  const group = isActorEntity(entity)
    ? createActorProxy(entity, library)
    : createPropProxy(entity, library)
  group.userData.entityId = entity.id
  group.userData.entityKind = isActorEntity(entity) ? 'actor' : 'prop'
  updateBlockingProxy(group, entity)
  return group
}

export function updateBlockingProxy(
  group: THREE.Group,
  entity: BlockingEntity,
): void {
  applyPlacement(group, entity.placement)
  if (isActorEntity(entity)) {
    const actor = entity
    group.scale.setScalar(actor.appearance.heightM)
    updateActorRuntimeAppearance(group, actor)
  } else {
    const prop = entity as PropDocument
    group.scale.set(...prop.appearance.dimensionsM)
  }
}

function isActorEntity(entity: BlockingEntity): entity is ActorDocument {
  return 'character' in entity
}

function createActorProxy(actor: ActorDocument, library: BlockingAssetLibrary): THREE.Group {
  const group = new THREE.Group()
  group.name = 'ActorRoot'
  const fallback = createGroup(group, 'ActorFallback', [0, 0, 0])
  fallback.userData.characterFallback = true
  const body = library.actorMaterial(actor.appearance.color)

  const pelvis = createGroup(fallback, 'Pelvis', [0, ACTOR_PROPORTIONS.pelvis.centerY, 0])
  addPart(
    pelvis,
    library.actorTorsoGeometry,
    body,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.pelvis.width, ACTOR_PROPORTIONS.pelvis.height, ACTOR_PROPORTIONS.pelvis.depth],
    'pelvis-form',
  )

  const torso = createGroup(fallback, 'Torso', [0, 0, 0])
  const abdomen = createGroup(torso, 'Abdomen', [0, ACTOR_PROPORTIONS.abdomen.centerY, 0])
  addPart(
    abdomen,
    library.actorTorsoGeometry,
    body,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.abdomen.width, ACTOR_PROPORTIONS.abdomen.height, ACTOR_PROPORTIONS.abdomen.depth],
    'abdomen-form',
  )
  const chest = createGroup(torso, 'Chest', [0, ACTOR_PROPORTIONS.chest.centerY, 0])
  addPart(
    chest,
    library.actorTorsoGeometry,
    body,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.chest.width, ACTOR_PROPORTIONS.chest.height, ACTOR_PROPORTIONS.chest.depth],
    'chest-form',
  )

  const neck = createGroup(torso, 'Neck', [0, ACTOR_PROPORTIONS.neck.centerY, 0])
  addPart(
    neck,
    library.actorTorsoGeometry,
    body,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.neck.width, ACTOR_PROPORTIONS.neck.height, ACTOR_PROPORTIONS.neck.depth],
    'neck-form',
  )
  const head = createGroup(neck, 'Head', [0, 0.03, 0])
  addPart(
    head,
    library.actorSphereGeometry,
    body,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.head.width, ACTOR_PROPORTIONS.head.height, ACTOR_PROPORTIONS.head.depth],
    'head-form',
  )

  addArm(torso, library, body, -1, 'Left')
  addArm(torso, library, body, 1, 'Right')
  addLeg(fallback, library, body, -1, 'Left')
  addLeg(fallback, library, body, 1, 'Right')

  const facingMaterial = library.material('#a58a68')
  const facingTick = addPart(
    group,
    library.boxGeometry,
    facingMaterial,
    [0, ACTOR_PROPORTIONS.facingTick.height / 2, ACTOR_PROPORTIONS.facingTick.z],
    [ACTOR_PROPORTIONS.facingTick.width, ACTOR_PROPORTIONS.facingTick.height, ACTOR_PROPORTIONS.facingTick.length],
    'facing-tick',
  )
  facingTick.userData.facingIndicator = true
  facingTick.visible = false

  return group
}

function addArm(
  torso: THREE.Group,
  library: BlockingAssetLibrary,
  material: THREE.Material,
  side: -1 | 1,
  label: 'Left' | 'Right',
): void {
  const shoulder = createGroup(torso, `${label}Shoulder`, [side * ACTOR_PROPORTIONS.shoulder.x, ACTOR_PROPORTIONS.shoulder.y, 0])
  shoulder.rotation.z = side * 0.1
  addPart(
    shoulder,
    library.actorSphereGeometry,
    material,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter],
    `${label.toLowerCase()}-shoulder-joint`,
  )

  const upperArm = createGroup(shoulder, `${label}UpperArm`, [0, 0, 0])
  addPart(
    upperArm,
    library.actorLimbGeometry,
    material,
    [0, -ACTOR_PROPORTIONS.upperArmLength / 2, 0],
    [0.075, ACTOR_PROPORTIONS.upperArmLength, 0.075],
    `${label.toLowerCase()}-upper-arm`,
  )

  const elbow = createGroup(upperArm, `${label}Elbow`, [0, -ACTOR_PROPORTIONS.upperArmLength, 0])
  addPart(
    elbow,
    library.actorSphereGeometry,
    material,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter],
    `${label.toLowerCase()}-elbow-joint`,
  )

  const forearm = createGroup(elbow, `${label}Forearm`, [0, 0, 0])
  forearm.rotation.z = side * -0.08
  addPart(
    forearm,
    library.actorLimbGeometry,
    material,
    [0, -ACTOR_PROPORTIONS.forearmLength / 2, 0],
    [0.065, ACTOR_PROPORTIONS.forearmLength, 0.065],
    `${label.toLowerCase()}-forearm`,
  )

  const hand = createGroup(forearm, `${label}Hand`, [0, -ACTOR_PROPORTIONS.forearmLength, 0])
  addPart(
    hand,
    library.actorSphereGeometry,
    material,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.handDiameter, ACTOR_PROPORTIONS.handDiameter, ACTOR_PROPORTIONS.handDiameter],
    `${label.toLowerCase()}-hand`,
  )
}

function addLeg(
  root: THREE.Group,
  library: BlockingAssetLibrary,
  material: THREE.Material,
  side: -1 | 1,
  label: 'Left' | 'Right',
): void {
  const hip = createGroup(root, `${label}Hip`, [side * 0.105, ACTOR_PROPORTIONS.hipY, 0])
  addPart(
    hip,
    library.actorSphereGeometry,
    material,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter],
    `${label.toLowerCase()}-hip-joint`,
  )

  const upperLeg = createGroup(hip, `${label}UpperLeg`, [0, 0, 0])
  addPart(
    upperLeg,
    library.actorLimbGeometry,
    material,
    [0, -ACTOR_PROPORTIONS.upperLegLength / 2, 0],
    [ACTOR_PROPORTIONS.upperLegWidth, ACTOR_PROPORTIONS.upperLegLength, ACTOR_PROPORTIONS.upperLegWidth],
    `${label.toLowerCase()}-upper-leg`,
  )

  const knee = createGroup(upperLeg, `${label}Knee`, [0, -ACTOR_PROPORTIONS.upperLegLength, 0])
  addPart(
    knee,
    library.actorSphereGeometry,
    material,
    [0, 0, 0],
    [ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter, ACTOR_PROPORTIONS.jointDiameter],
    `${label.toLowerCase()}-knee-joint`,
  )

  const lowerLeg = createGroup(knee, `${label}LowerLeg`, [0, 0, 0])
  addPart(
    lowerLeg,
    library.actorLimbGeometry,
    material,
    [0, -ACTOR_PROPORTIONS.lowerLegLength / 2, 0],
    [ACTOR_PROPORTIONS.lowerLegWidth, ACTOR_PROPORTIONS.lowerLegLength, ACTOR_PROPORTIONS.lowerLegWidth],
    `${label.toLowerCase()}-lower-leg`,
  )

  const ankle = createGroup(lowerLeg, `${label}Ankle`, [0, -ACTOR_PROPORTIONS.lowerLegLength, 0])
  const foot = createGroup(ankle, `${label}Foot`, [0, 0, 0])
  addPart(
    foot,
    library.boxGeometry,
    material,
    [0, -ACTOR_PROPORTIONS.foot.height / 4, ACTOR_PROPORTIONS.foot.forwardOffset],
    [ACTOR_PROPORTIONS.foot.width, ACTOR_PROPORTIONS.foot.height, ACTOR_PROPORTIONS.foot.length],
    `${label.toLowerCase()}-foot`,
  )
}

function createGroup(
  parent: THREE.Group,
  name: string,
  position: readonly [number, number, number],
): THREE.Group {
  const group = new THREE.Group()
  group.name = name
  group.position.set(...position)
  parent.add(group)
  return group
}

function createPropProxy(prop: PropDocument, library: BlockingAssetLibrary): THREE.Group {
  const group = new THREE.Group()
  const material = library.material(prop.appearance.color)

  switch (prop.appearance.propType) {
    case 'cube':
      addPart(group, library.boxGeometry, material, [0, 0.5, 0], [1, 1, 1], 'cube')
      break
    case 'cylinder':
      addPart(group, library.cylinderGeometry, material, [0, 0.5, 0], [1, 1, 1], 'cylinder')
      break
    case 'wall':
      addPart(group, library.boxGeometry, material, [0, 0.5, 0], [1, 1, 1], 'wall')
      break
    case 'floor':
      addPart(group, library.boxGeometry, material, [0, 0.5, 0], [1, 1, 1], 'floor')
      break
    case 'table':
      addTableParts(group, library, material)
      break
    case 'chair':
      addChairParts(group, library, material)
      break
  }

  return group
}

function addTableParts(group: THREE.Group, library: BlockingAssetLibrary, material: THREE.Material): void {
  addPart(group, library.boxGeometry, material, [0, 0.92, 0], [0.94, 0.12, 0.94], 'table-top')
  const legs = [[-0.4, 0.46, -0.27], [0.4, 0.46, -0.27], [-0.4, 0.46, 0.27], [0.4, 0.46, 0.27]] as const
  legs.forEach((position, index) => addPart(group, library.boxGeometry, material, position, [0.08, 0.92, 0.08], `table-leg-${index}`))
}

function addChairParts(group: THREE.Group, library: BlockingAssetLibrary, material: THREE.Material): void {
  addPart(group, library.boxGeometry, material, [0, 0.46, 0], [0.9, 0.1, 0.9], 'chair-seat')
  addPart(group, library.boxGeometry, material, [0, 0.82, 0.36], [0.9, 0.78, 0.1], 'chair-back')
  const legs = [[-0.35, 0.23, -0.3], [0.35, 0.23, -0.3], [-0.35, 0.23, 0.3], [0.35, 0.23, 0.3]] as const
  legs.forEach((position, index) => addPart(group, library.boxGeometry, material, position, [0.08, 0.46, 0.08], `chair-leg-${index}`))
}

function addPart(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  name: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.position.set(...position)
  mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

function applyPlacement(group: THREE.Group, placement: ActorDocument['placement']): void {
  group.position.set(...placement.position)
  group.rotation.set(...placement.rotation.radians, placement.rotation.order)
}
