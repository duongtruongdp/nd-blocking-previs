import * as THREE from 'three'
import { getActorPoseDefinition } from '../../core/actorPosePresets'
import type { ActorDocument, ActorJointName, ActorPose } from '../../core/sceneDocument'
import { CANONICAL_ACTOR_PROPORTIONS, type ActorProportions } from './proportions'

const SELECTION_COLOR = '#f0b866'

type ActorJointMap = Record<ActorJointName, THREE.Group>

export type ProceduralActorOptions = {
  proportions?: ActorProportions
}

export class ProceduralActorRuntime {
  readonly root: THREE.Group
  readonly selectableMeshes: THREE.Mesh[] = []
  private readonly documentId: string
  private readonly proportions: ActorProportions
  private readonly joints = {} as ActorJointMap
  private readonly bodyRoot: THREE.Group
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly materials = new Set<THREE.Material>()
  private readonly bodyMaterial: THREE.MeshStandardMaterial
  private disposed = false

  constructor(document: ActorDocument, options: ProceduralActorOptions = {}) {
    this.documentId = document.id
    this.proportions = options.proportions ?? CANONICAL_ACTOR_PROPORTIONS
    this.root = new THREE.Group()
    this.root.name = 'ActorRoot'
    this.bodyRoot = new THREE.Group()
    this.bodyRoot.name = 'ActorPoseRoot'
    this.root.add(this.bodyRoot)
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: document.appearance.primaryColor, roughness: 0.72, metalness: 0.02 })
    this.materials.add(this.bodyMaterial)
    this.buildHierarchy()
    this.applyDocument(document)
  }

  applyDocument(document: ActorDocument): void {
    this.root.position.set(...document.position)
    this.root.rotation.set(document.rotation[0], document.rotation[1], document.rotation[2])
    this.root.scale.set(...document.scale)
    this.bodyMaterial.color.set(document.appearance.primaryColor)
    const definition = document.posePreset ? getActorPoseDefinition(document.posePreset) : null
    this.bodyRoot.position.set(0, definition?.rootOffsetY ?? 0, 0)
    this.bodyRoot.rotation.set(...(definition?.bodyRotation ?? [0, 0, 0]))
    this.applyPose(definition?.pose ?? document.pose)
  }

  applyPose(pose: ActorPose): void {
    ;(Object.keys(this.joints) as ActorJointName[]).forEach((jointName) => {
      const rotation = pose[jointName]
      this.joints[jointName].rotation.set(rotation[0], rotation[1], rotation[2])
    })
  }

  setSelected(selected: boolean): void {
    this.bodyMaterial.emissive.set(selected ? SELECTION_COLOR : '#000000')
    this.bodyMaterial.emissiveIntensity = selected ? 0.32 : 0
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.geometries.forEach((geometry) => geometry.dispose())
    this.materials.forEach((material) => material.dispose())
    this.selectableMeshes.length = 0
  }

  private buildHierarchy(): void {
    const p = this.proportions
    const hipHeight = p.footHeight + p.shinLength + p.thighLength
    const pelvisJoint = this.createJoint('PelvisJoint', this.bodyRoot, new THREE.Vector3(0, hipHeight, 0), 'pelvis')
    const pelvis = this.createMesh('PelvisVisual', new THREE.SphereGeometry(1, 12, 8), pelvisJoint, new THREE.Vector3(0, 0, 0), 'pelvis')
    pelvis.scale.set(p.pelvisWidth / 2, p.pelvisHeight / 2, p.pelvisDepth / 2)

    const torsoJoint = this.createJoint('TorsoJoint', pelvisJoint, new THREE.Vector3(0, p.pelvisHeight * 0.42, 0), 'torso')
    const torso = this.createMesh('TorsoVisual', this.createCapsule(p.torsoLength, p.torsoRadius), torsoJoint, new THREE.Vector3(0, p.torsoLength / 2, 0), 'torso')
    torso.scale.set(1.1, 1, 0.78)

    const neckJoint = this.createJoint('NeckJoint', torsoJoint, new THREE.Vector3(0, p.torsoLength, 0))
    this.createMesh('NeckVisual', this.createCapsule(p.neckLength, 0.055), neckJoint, new THREE.Vector3(0, p.neckLength / 2, 0), 'head')
    const headJoint = this.createJoint('HeadJoint', neckJoint, new THREE.Vector3(0, p.neckLength, 0), 'head')
    this.createMesh('HeadVisual', new THREE.SphereGeometry(1, 16, 12), headJoint, new THREE.Vector3(0, p.headRadius, 0), 'head').scale.setScalar(p.headRadius)

    this.createArm('Left', -1, torsoJoint)
    this.createArm('Right', 1, torsoJoint)
    this.createLeg('Left', -1, pelvisJoint)
    this.createLeg('Right', 1, pelvisJoint)
  }

  private createArm(side: 'Left' | 'Right', sign: -1 | 1, torsoJoint: THREE.Group): void {
    const p = this.proportions
    const shoulderJoint = this.createJoint(`${side}ShoulderJoint`, torsoJoint, new THREE.Vector3(sign * p.shoulderWidth / 2, p.torsoLength * 0.78, 0), side === 'Left' ? 'leftShoulder' : 'rightShoulder')
    this.createMesh(`${side}ShoulderVisual`, new THREE.SphereGeometry(p.shoulderRadius, 10, 8), shoulderJoint, new THREE.Vector3(0, 0, 0), side === 'Left' ? 'leftShoulder' : 'rightShoulder')
    this.createMesh(`${side}UpperArm`, this.createCapsule(p.upperArmLength, p.upperArmRadius), shoulderJoint, new THREE.Vector3(0, -p.upperArmLength / 2, 0), side === 'Left' ? 'leftShoulder' : 'rightShoulder')
    const elbowJoint = this.createJoint(`${side}ElbowJoint`, shoulderJoint, new THREE.Vector3(sign * p.upperArmLength * 0.06, -p.upperArmLength, 0), side === 'Left' ? 'leftElbow' : 'rightElbow')
    this.createMesh(`${side}Forearm`, this.createCapsule(p.forearmLength, p.forearmRadius), elbowJoint, new THREE.Vector3(0, -p.forearmLength / 2, 0), side === 'Left' ? 'leftElbow' : 'rightElbow')
    const handJoint = this.createJoint(`${side}HandJoint`, elbowJoint, new THREE.Vector3(sign * p.forearmLength * 0.04, -p.forearmLength, 0))
    this.createMesh(`${side}Hand`, this.createCapsule(p.handLength, 0.045), handJoint, new THREE.Vector3(0, -p.handLength / 2, 0), side === 'Left' ? 'leftElbow' : 'rightElbow')
  }

  private createLeg(side: 'Left' | 'Right', sign: -1 | 1, pelvisJoint: THREE.Group): void {
    const p = this.proportions
    const hipJoint = this.createJoint(`${side}HipJoint`, pelvisJoint, new THREE.Vector3(sign * p.pelvisWidth * 0.32, 0, 0), side === 'Left' ? 'leftHip' : 'rightHip')
    this.createMesh(`${side}Thigh`, this.createCapsule(p.thighLength, p.thighRadius), hipJoint, new THREE.Vector3(0, -p.thighLength / 2, 0), side === 'Left' ? 'leftHip' : 'rightHip')
    const kneeJoint = this.createJoint(`${side}KneeJoint`, hipJoint, new THREE.Vector3(0, -p.thighLength, 0), side === 'Left' ? 'leftKnee' : 'rightKnee')
    this.createMesh(`${side}Shin`, this.createCapsule(p.shinLength, p.shinRadius), kneeJoint, new THREE.Vector3(0, -p.shinLength / 2, 0), side === 'Left' ? 'leftKnee' : 'rightKnee')
    const ankleJoint = this.createJoint(`${side}AnkleJoint`, kneeJoint, new THREE.Vector3(0, -p.shinLength, 0))
    const foot = this.createMesh(`${side}Foot`, new THREE.BoxGeometry(p.footLength, p.footHeight, p.footLength * 0.52), ankleJoint, new THREE.Vector3(0, -p.footHeight / 2, -p.footLength * 0.18), side === 'Left' ? 'leftKnee' : 'rightKnee')
    foot.geometry.computeVertexNormals()
  }

  private createJoint(name: string, parent: THREE.Object3D, position: THREE.Vector3, semanticName?: ActorJointName): THREE.Group {
    const joint = new THREE.Group()
    joint.name = name
    joint.position.copy(position)
    parent.add(joint)
    if (semanticName) this.joints[semanticName] = joint
    return joint
  }

  private createMesh(name: string, geometry: THREE.BufferGeometry, parent: THREE.Object3D, position: THREE.Vector3, semanticName: ActorJointName): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.bodyMaterial)
    mesh.name = name
    mesh.position.copy(position)
    mesh.userData.entityId = this.documentId
    mesh.userData.actorJoint = semanticName
    parent.add(mesh)
    this.geometries.add(geometry)
    this.selectableMeshes.push(mesh)
    return mesh
  }

  private createCapsule(length: number, radius: number): THREE.BufferGeometry {
    return new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 2), 6, 12)
  }
}
