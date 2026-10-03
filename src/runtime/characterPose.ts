import * as THREE from 'three'
import type { ActorDocument } from '../domain/types'
import type { PoseDefinition } from '../characters/poseLibrary'
import { getPoseDefinition } from '../characters/poseLibrary'
import { fallbackJointName, getRigProfile, type RigProfile, type SemanticJoint } from '../characters/rigProfiles'

const restPoses = new WeakMap<THREE.Object3D, { position: THREE.Vector3; quaternion: THREE.Quaternion }>()

export function clearActorPoseRestTransforms(root: THREE.Object3D): void {
  restPoses.delete(root)
  root.traverse((object) => restPoses.delete(object))
}

export function applyActorPose(
  root: THREE.Object3D,
  actor: ActorDocument,
  rigProfileId: 'humanoid-v1',
  override?: PoseDefinition,
): void {
  const definition = override ?? getPoseDefinition(actor.pose.poseId)
  if (!definition) return

  const rootRest = restPoses.get(root) ?? { position: root.position.clone(), quaternion: root.quaternion.clone() }
  restPoses.set(root, rootRest)
  root.position.copy(rootRest.position)
  root.quaternion.copy(rootRest.quaternion)
  if (definition.rootOffset) root.position.add(new THREE.Vector3(...definition.rootOffset))
  if (definition.rootRotationQuaternion) root.quaternion.multiply(new THREE.Quaternion(...definition.rootRotationQuaternion))

  const profile = getRigProfile(rigProfileId)
  const targets = resolveJointTargets(root, profile)
  targets.forEach((target) => {
    const rest = restPoses.get(target) ?? { position: target.position.clone(), quaternion: target.quaternion.clone() }
    restPoses.set(target, rest)
    target.position.copy(rest.position)
    target.quaternion.copy(rest.quaternion)
  })

  Object.entries(definition.bones).forEach(([joint, transform]) => {
    const target = targets.get(joint as SemanticJoint)
    if (!target || !transform) return
    if (transform.rotationQuaternion) {
      const offset = new THREE.Quaternion(...transform.rotationQuaternion)
      target.quaternion.multiply(offset)
    }
    if (transform.positionOffset) target.position.add(new THREE.Vector3(...transform.positionOffset))
  })
}

export function hasRequiredSemanticJoints(root: THREE.Object3D, rigProfileId: 'humanoid-v1'): boolean {
  const profile = getRigProfile(rigProfileId)
  const targets = resolveJointTargets(root, profile)
  const required: SemanticJoint[] = [
    'hips', 'spine', 'chest', 'neck', 'head',
    'shoulder.L', 'upperArm.L', 'lowerArm.L', 'hand.L',
    'shoulder.R', 'upperArm.R', 'lowerArm.R', 'hand.R',
    'upperLeg.L', 'lowerLeg.L', 'foot.L',
    'upperLeg.R', 'lowerLeg.R', 'foot.R',
  ]
  return required.every((joint) => targets.has(joint))
}

export function findSemanticJoint(
  root: THREE.Object3D,
  joint: SemanticJoint,
  rigProfileId: 'humanoid-v1',
): THREE.Object3D | undefined {
  return resolveJointTargets(root, getRigProfile(rigProfileId)).get(joint)
}

function resolveJointTargets(root: THREE.Object3D, profile: RigProfile): Map<SemanticJoint, THREE.Object3D> {
  const targets = new Map<SemanticJoint, THREE.Object3D>()
  const isFallback = root.userData.characterFallback === true

  ;(Object.keys(profile.jointNames) as SemanticJoint[]).forEach((joint) => {
    if (isFallback) {
      const fallback = root.getObjectByName(fallbackJointName(joint))
      if (fallback) targets.set(joint, fallback)
      return
    }

    const candidateNames = profile.poseJointNames?.[joint] ?? profile.jointNames[joint]
    let match: THREE.Object3D | undefined
    root.traverse((object) => {
      if (match) return
      if (!(object instanceof THREE.Bone)) return
      const normalized = object.name.toLowerCase()
      if (candidateNames.some((name) => normalized === name.toLowerCase())) match = object
    })
    if (match) targets.set(joint, match)
  })

  return targets
}
