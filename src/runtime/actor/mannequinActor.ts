import * as THREE from 'three'
import type { ActorBodyVariant, ActorDocument, ActorJointName, ActorPose } from '../../core/sceneDocument'
import { getActorPoseDefinition } from '../../core/actorPosePresets'
import { resolveMannequinPose } from '../../core/mannequinPoseCalibration'

/** Runtime-only, low-poly presentation model for visualStyle = mannequin. */
export type MannequinActorOptions = { totalHeight?: number }

type MannequinJointMap = Record<ActorJointName, THREE.Group>
type VariantFactors = { shoulder: number; pelvis: number; chest: number }

export type MannequinMetrics = Readonly<{
  totalHeight: number
  footHeight: number
  footLength: number
  footWidth: number
  ankleY: number
  kneeY: number
  hipY: number
  pelvisLower: number
  pelvisUpper: number
  pelvisWidth: number
  pelvisDepth: number
  abdomenLength: number
  waistWidth: number
  waistDepth: number
  chestLength: number
  chestBottomWidth: number
  shoulderWidth: number
  chestDepth: number
  shoulderY: number
  neckLength: number
  neckWidth: number
  neckDepth: number
  headHeight: number
  headWidth: number
  headDepth: number
  upperArmLength: number
  forearmLength: number
  handLength: number
  thighLength: number
  shinLength: number
  shoulderRadius: number
  hipRadius: number
  kneeRadius: number
  elbowRadius: number
  wristRadius: number
  ankleRadius: number
}>

const SELECTION_COLOR = '#f0b866'
const DEFAULT_HEIGHT = 1.78
const variantFactors: Record<ActorBodyVariant, VariantFactors> = {
  neutral: { shoulder: 1, pelvis: 1, chest: 1 },
  male: { shoulder: 1.035, pelvis: 0.97, chest: 1.025 },
  female: { shoulder: 0.97, pelvis: 1.05, chest: 0.98 },
}

/** A single normalized source for all visual anchors and proportions. */
export function createMannequinMetrics(totalHeight = DEFAULT_HEIGHT, bodyVariant: ActorBodyVariant = 'neutral'): MannequinMetrics {
  const f = variantFactors[bodyVariant] ?? variantFactors.neutral
  const h = totalHeight
  const footHeight = h * 0.045
  const shinLength = h * 0.208
  const thighLength = h * 0.225
  const ankleY = footHeight
  const kneeY = ankleY + shinLength
  const hipY = kneeY + thighLength
  const pelvisUpper = h * 0.085
  const abdomenLength = h * 0.085
  const chestLength = h * 0.175
  const neckLength = h * 0.042
  const headHeight = h * 0.128
  return {
    totalHeight: h,
    footHeight,
    footLength: h * 0.145,
    footWidth: h * 0.075,
    ankleY,
    kneeY,
    hipY,
    pelvisLower: h * 0.04,
    pelvisUpper,
    pelvisWidth: h * 0.19 * f.pelvis,
    pelvisDepth: h * 0.135,
    abdomenLength,
    waistWidth: h * 0.155 * f.chest,
    waistDepth: h * 0.115,
    chestLength,
    chestBottomWidth: h * 0.19 * f.chest,
    shoulderWidth: h * 0.25 * f.shoulder,
    chestDepth: h * 0.145,
    shoulderY: abdomenLength + chestLength * 0.76,
    neckLength,
    neckWidth: h * 0.07,
    neckDepth: h * 0.075,
    headHeight,
    headWidth: h * 0.115,
    headDepth: h * 0.12,
    upperArmLength: h * 0.17,
    forearmLength: h * 0.145,
    handLength: h * 0.095,
    thighLength,
    shinLength,
    shoulderRadius: h * 0.038,
    hipRadius: h * 0.034,
    kneeRadius: h * 0.032,
    elbowRadius: h * 0.027,
    wristRadius: h * 0.019,
    ankleRadius: h * 0.021,
  }
}

export class MannequinActorRuntime {
  readonly visualStyle = 'mannequin' as const
  readonly root: THREE.Group
  readonly selectableMeshes: THREE.Mesh[] = []
  private readonly documentId: string
  private readonly totalHeight: number
  private readonly bodyRoot: THREE.Group
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.MeshStandardMaterial>()
  private joints = {} as MannequinJointMap
  private bodyMaterial!: THREE.MeshStandardMaterial
  private jointMaterial!: THREE.MeshStandardMaterial
  private accentMaterial!: THREE.MeshStandardMaterial
  private variant: ActorBodyVariant = 'neutral'
  private disposed = false

  constructor(document: ActorDocument, options: MannequinActorOptions = {}) {
    this.documentId = document.id
    this.totalHeight = options.totalHeight ?? DEFAULT_HEIGHT
    this.root = new THREE.Group()
    this.root.name = 'ActorRoot'
    this.root.userData.actorVisualStyle = 'mannequin'
    this.bodyRoot = new THREE.Group()
    this.bodyRoot.name = 'ActorPoseRoot'
    this.root.add(this.bodyRoot)
    this.rebuild(document.appearance.bodyVariant)
    this.applyDocument(document)
  }

  get jointMap(): Readonly<MannequinJointMap> { return this.joints }
  get bodyMeshes(): readonly THREE.Mesh[] { return this.selectableMeshes }
  get metrics(): MannequinMetrics { return createMannequinMetrics(this.totalHeight, this.variant) }

  applyDocument(document: ActorDocument): void {
    if (this.disposed) return
    if (document.appearance.bodyVariant !== this.variant) this.rebuild(document.appearance.bodyVariant)
    this.root.position.set(...document.position)
    this.root.rotation.set(...document.rotation)
    this.root.scale.set(...document.scale)
    this.updateMaterials(document.appearance.primaryColor)
    const definition = document.posePreset ? getActorPoseDefinition(document.posePreset) : null
    this.bodyRoot.position.set(0, definition?.rootOffsetY ?? 0, 0)
    this.bodyRoot.rotation.set(...(definition?.bodyRotation ?? [0, 0, 0]))
    this.applyPose(definition ? resolveMannequinPose(document.posePreset, definition.pose) : document.pose)
    this.groundPose()
  }

  applyPose(pose: ActorPose): void {
    ;(Object.keys(this.joints) as ActorJointName[]).forEach((name) => {
      const rotation = pose[name]
      this.joints[name].rotation.set(rotation[0], rotation[1], rotation[2])
    })
  }

  setSelected(selected: boolean): void {
    ;[this.bodyMaterial, this.jointMaterial, this.accentMaterial].forEach((material) => {
      material.emissive.set(selected ? SELECTION_COLOR : '#000000')
      material.emissiveIntensity = selected ? 0.28 : 0
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearResources()
    this.selectableMeshes.length = 0
  }

  private rebuild(variant: ActorBodyVariant): void {
    this.clearResources()
    this.bodyRoot.clear()
    this.selectableMeshes.length = 0
    this.joints = {} as MannequinJointMap
    this.variant = variantFactors[variant] ? variant : 'neutral'
    this.bodyMaterial = this.createMaterial('#7f72c9')
    this.jointMaterial = this.createMaterial('#6d62aa')
    this.accentMaterial = this.createMaterial('#9288d5')
    this.buildHierarchy(createMannequinMetrics(this.totalHeight, this.variant))
  }

  private buildHierarchy(m: MannequinMetrics): void {
    const pelvis = this.createJoint('PelvisJoint', this.bodyRoot, new THREE.Vector3(0, m.hipY, 0), 'pelvis')
    this.createMesh('PelvisVisual', createPelvisGeometry(m), pelvis, new THREE.Vector3(), this.bodyMaterial)
    // A tiny overlap prevents an air gap while retaining a true torso pivot.
    const torso = this.createJoint('TorsoJoint', pelvis, new THREE.Vector3(0, m.pelvisUpper - m.abdomenLength * 0.06, 0), 'torso')
    // The waist grows upward from the pelvis overlap to the chest pivot. It
    // intentionally shares a small amount of vertical volume with the pelvis.
    this.createMesh('AbdomenVisual', createFacetedUpwardSegmentGeometry(m.abdomenLength, m.waistWidth, m.waistDepth, m.chestBottomWidth, m.chestDepth * 0.9, 6), torso, new THREE.Vector3(), this.accentMaterial)
    const chest = this.createJoint('ChestJoint', torso, new THREE.Vector3(0, m.abdomenLength, 0))
    this.createMesh('ChestVisual', createTorsoGeometry(m), chest, new THREE.Vector3(), this.bodyMaterial)
    const neck = this.createJoint('NeckJoint', chest, new THREE.Vector3(0, m.chestLength, 0))
    this.createMesh('NeckVisual', createFacetedSegmentGeometry(m.neckLength, m.neckWidth, m.neckDepth, m.neckWidth * 0.92, m.neckDepth * 0.92, 6), neck, new THREE.Vector3(), this.jointMaterial)
    const head = this.createJoint('HeadJoint', neck, new THREE.Vector3(0, m.neckLength, 0), 'head')
    this.createMesh('HeadVisual', createHeadGeometry(m.headHeight, m.headWidth, m.headDepth), head, new THREE.Vector3(), this.bodyMaterial)
    this.createArm('Left', -1, chest, m)
    this.createArm('Right', 1, chest, m)
    this.createLeg('Left', -1, pelvis, m)
    this.createLeg('Right', 1, pelvis, m)
  }

  private createArm(side: 'Left' | 'Right', sign: -1 | 1, chest: THREE.Group, m: MannequinMetrics): void {
    const shoulder = this.createJoint(`${side}ShoulderJoint`, chest, new THREE.Vector3(sign * m.shoulderWidth / 2, m.shoulderY - m.abdomenLength, 0), side === 'Left' ? 'leftShoulder' : 'rightShoulder')
    this.createJointMesh(`${side}ShoulderVisual`, m.shoulderRadius, shoulder)
    this.createMesh(`${side}UpperArm`, createFacetedSegmentGeometry(m.upperArmLength, m.totalHeight * 0.058, m.totalHeight * 0.059, m.totalHeight * 0.046, m.totalHeight * 0.048, 6), shoulder, new THREE.Vector3(), this.bodyMaterial)
    const elbow = this.createJoint(`${side}ElbowJoint`, shoulder, new THREE.Vector3(sign * m.totalHeight * 0.006, -m.upperArmLength, 0), side === 'Left' ? 'leftElbow' : 'rightElbow')
    this.createJointMesh(`${side}ElbowVisual`, m.elbowRadius, elbow)
    this.createMesh(`${side}Forearm`, createFacetedSegmentGeometry(m.forearmLength, m.totalHeight * 0.047, m.totalHeight * 0.049, m.totalHeight * 0.034, m.totalHeight * 0.037, 6), elbow, new THREE.Vector3(), this.bodyMaterial)
    const wrist = this.createJoint(`${side}WristJoint`, elbow, new THREE.Vector3(sign * m.totalHeight * 0.004, -m.forearmLength, 0))
    this.createJointMesh(`${side}WristVisual`, m.wristRadius, wrist)
    this.createMesh(`${side}Hand`, createHandGeometry(m.totalHeight * 0.042, m.handLength, m.totalHeight * 0.032), wrist, new THREE.Vector3(), this.accentMaterial)
  }

  private createLeg(side: 'Left' | 'Right', sign: -1 | 1, pelvis: THREE.Group, m: MannequinMetrics): void {
    const hip = this.createJoint(`${side}HipJoint`, pelvis, new THREE.Vector3(sign * m.pelvisWidth * 0.29, 0, 0), side === 'Left' ? 'leftHip' : 'rightHip')
    this.createJointMesh(`${side}HipVisual`, m.hipRadius, hip)
    this.createMesh(`${side}Thigh`, createFacetedSegmentGeometry(m.thighLength, m.totalHeight * 0.092, m.totalHeight * 0.085, m.totalHeight * 0.066, m.totalHeight * 0.07, 7, 1.06), hip, new THREE.Vector3(), this.bodyMaterial)
    const knee = this.createJoint(`${side}KneeJoint`, hip, new THREE.Vector3(0, -m.thighLength, 0), side === 'Left' ? 'leftKnee' : 'rightKnee')
    this.createJointMesh(`${side}KneeVisual`, m.kneeRadius, knee)
    this.createMesh(`${side}Calf`, createFacetedSegmentGeometry(m.shinLength, m.totalHeight * 0.066, m.totalHeight * 0.07, m.totalHeight * 0.043, m.totalHeight * 0.046, 7, 1.12), knee, new THREE.Vector3(), this.bodyMaterial)
    const ankle = this.createJoint(`${side}AnkleJoint`, knee, new THREE.Vector3(0, -m.shinLength, 0))
    this.createJointMesh(`${side}AnkleVisual`, m.ankleRadius, ankle)
    this.createMesh(`${side}Foot`, createFootGeometry(m.footWidth, m.footLength, m.footHeight), ankle, new THREE.Vector3(), this.accentMaterial)
  }

  private createJointMesh(name: string, radius: number, parent: THREE.Group): void {
    this.createMesh(name, new THREE.IcosahedronGeometry(radius, 1), parent, new THREE.Vector3(), this.jointMaterial)
  }

  private createJoint(name: string, parent: THREE.Object3D, position: THREE.Vector3, semanticName?: ActorJointName): THREE.Group {
    const joint = new THREE.Group()
    joint.name = name
    joint.position.copy(position)
    parent.add(joint)
    if (semanticName) this.joints[semanticName] = joint
    return joint
  }

  private createMesh(name: string, geometry: THREE.BufferGeometry, parent: THREE.Object3D, position: THREE.Vector3, material: THREE.MeshStandardMaterial): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.position.copy(position)
    mesh.userData.entityId = this.documentId
    mesh.userData.actorJoint = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    this.geometries.add(geometry)
    this.selectableMeshes.push(mesh)
    return mesh
  }

  private createMaterial(color: string): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, flatShading: true })
    this.materials.add(material)
    return material
  }

  private updateMaterials(color: string): void {
    const base = new THREE.Color(color)
    this.bodyMaterial.color.copy(base)
    this.jointMaterial.color.copy(base.clone().offsetHSL(0, 0, -0.08))
    this.accentMaterial.color.copy(base.clone().offsetHSL(0, 0.01, 0.06))
  }

  private clearResources(): void {
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.geometries.clear()
    this.materials.clear()
  }

  private groundPose(): void {
    this.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(this.bodyRoot)
    const floorDelta = bounds.min.y - this.root.position.y
    if (floorDelta < 0) this.bodyRoot.position.y += -floorDelta / Math.max(0.001, Math.abs(this.root.scale.y))
  }
}

/** Geometry runs from a parent pivot at y=0 down to its child pivot at -length. */
function createFacetedSegmentGeometry(length: number, topWidth: number, topDepth: number, bottomWidth: number, bottomDepth: number, sides: number, midScale = 1): THREE.BufferGeometry {
  const rings = midScale === 1
    ? [{ y: 0, width: topWidth, depth: topDepth }, { y: -length, width: bottomWidth, depth: bottomDepth }]
    : [{ y: 0, width: topWidth, depth: topDepth }, { y: -length * 0.48, width: Math.max(topWidth, bottomWidth) * midScale, depth: Math.max(topDepth, bottomDepth) * midScale }, { y: -length, width: bottomWidth, depth: bottomDepth }]
  return createRingGeometry(rings, sides)
}

/** Geometry for the articulated pelvis → waist → chest chain. */
function createFacetedUpwardSegmentGeometry(length: number, bottomWidth: number, bottomDepth: number, topWidth: number, topDepth: number, sides: number): THREE.BufferGeometry {
  return createRingGeometry([
    { y: 0, width: bottomWidth, depth: bottomDepth },
    { y: length, width: topWidth, depth: topDepth },
  ], sides)
}

function createTorsoGeometry(m: MannequinMetrics): THREE.BufferGeometry {
  return createRingGeometry([
    { y: 0, width: m.chestBottomWidth, depth: m.chestDepth * 0.88 },
    { y: m.chestLength * 0.52, width: m.shoulderWidth * 0.93, depth: m.chestDepth },
    { y: m.chestLength, width: m.shoulderWidth * 0.82, depth: m.chestDepth * 0.82 },
  ], 8)
}

function createPelvisGeometry(m: MannequinMetrics): THREE.BufferGeometry {
  return createRingGeometry([
    { y: -m.pelvisLower, width: m.pelvisWidth * 0.74, depth: m.pelvisDepth * 0.8 },
    { y: m.pelvisUpper * 0.38, width: m.pelvisWidth, depth: m.pelvisDepth },
    { y: m.pelvisUpper, width: m.pelvisWidth * 0.82, depth: m.pelvisDepth * 0.86 },
  ], 7)
}

function createHeadGeometry(height: number, width: number, depth: number): THREE.BufferGeometry {
  return createRingGeometry([
    { y: 0, width: width * 0.62, depth: depth * 0.64 },
    { y: height * 0.18, width: width * 0.82, depth: depth * 0.82 },
    { y: height * 0.62, width, depth },
    { y: height * 0.94, width: width * 0.84, depth: depth * 0.88 },
    { y: height, width: width * 0.55, depth: depth * 0.58 },
  ], 8)
}

function createHandGeometry(width: number, length: number, depth: number): THREE.BufferGeometry {
  return createRingGeometry([
    { y: 0, width, depth },
    { y: -length * 0.78, width: width * 0.8, depth: depth * 0.78 },
    { y: -length, width: width * 0.58, depth: depth * 0.58 },
  ], 5)
}

function createFootGeometry(width: number, length: number, height: number): THREE.BufferGeometry {
  // -Z is actor-forward, so the longer toe visibly projects forward.
  const heel = length * 0.24
  const toe = -length * 0.76
  const halfHeel = width * 0.38
  const halfToe = width * 0.56
  return createIndexedGeometry(new Float32Array([
    -halfHeel, 0, heel, halfHeel, 0, heel, halfToe, -height * 0.5, toe, -halfToe, -height * 0.5, toe,
    -halfHeel, -height * 0.84, heel, halfHeel, -height * 0.84, heel, halfToe, -height, toe, -halfToe, -height, toe,
  ]), [
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ])
}

type Ring = { y: number; width: number; depth: number }

function createRingGeometry(rings: Ring[], sides: number): THREE.BufferGeometry {
  const vertices: number[] = []
  rings.forEach((ring) => {
    for (let index = 0; index < sides; index += 1) {
      const angle = (index / sides) * Math.PI * 2 + Math.PI / 4
      vertices.push(Math.cos(angle) * ring.width / 2, ring.y, Math.sin(angle) * ring.depth / 2)
    }
  })
  const indices: number[] = []
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let index = 0; index < sides; index += 1) {
      const next = (index + 1) % sides
      const lower = ring * sides + index
      const upper = (ring + 1) * sides + index
      indices.push(lower, ring * sides + next, upper, ring * sides + next, (ring + 1) * sides + next, upper)
    }
  }
  for (let index = 1; index < sides - 1; index += 1) {
    indices.push(0, index + 1, index)
    const top = (rings.length - 1) * sides
    indices.push(top, top + index, top + index + 1)
  }
  return createIndexedGeometry(new Float32Array(vertices), indices)
}

function createIndexedGeometry(vertices: Float32Array, indices: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
