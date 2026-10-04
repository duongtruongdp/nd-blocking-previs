import * as THREE from 'three'
import type { ActorDocument, Vec3 } from '../domain/types'
import type { PoseDefinition, PoseGrounding, QuaternionValue } from '../characters/poseLibrary'
import { findSemanticJoint, applyActorPose, clearActorPoseRestTransforms } from './characterPose'
import { getRigProfile, type SemanticJoint } from '../characters/rigProfiles'
import { lyingPoseVariantIntents, referencePoseIntents, sittingPoseVariantIntents, standingPoseVariantIntents, type AnatomicalJointIntent, type AnatomicalPoseIntent, type AnatomicalPoseVariantIntent, type AnatomicalRotationIntent } from './anatomicalPose'

export type { AnatomicalRotationIntent } from './anatomicalPose'

export type RigJointDiagnostic = {
  joint: SemanticJoint
  bone: string
  parentBone: string | null
  restLocalPosition: Vec3
  restLocalQuaternion: QuaternionValue
  restLocalScale: Vec3
  restWorldPosition: Vec3
  restWorldQuaternion: QuaternionValue
  restWorldQuaternionCharacterSpace: QuaternionValue
  primaryChildBone: string | null
  primaryChildJoint: SemanticJoint | null
  primaryDirectionCharacterSpace: Vec3
  localAxesCharacterSpace: {
    x: Vec3
    y: Vec3
    z: Vec3
  }
}

export type ArmFrameDiagnostic = {
  side: 'L' | 'R'
  shoulderPositionCharacterSpace: Vec3
  upperArmOriginCharacterSpace: Vec3
  elbowPositionCharacterSpace: Vec3
  wristPositionCharacterSpace: Vec3
  upperArmDirectionCharacterSpace: Vec3
  forearmDirectionCharacterSpace: Vec3
  localPrimaryAxis: 'x' | 'y' | 'z'
  localBendAxis: 'x' | 'y' | 'z'
  localTwistAxis: 'x' | 'y' | 'z'
  bendAxisCharacterSpace: Vec3
  twistAxisCharacterSpace: Vec3
}

export type CharacterAxes = {
  up: Vec3
  right: Vec3
  forward: Vec3
}

export type RigSymmetryDiagnostic = {
  leftJoint: SemanticJoint
  rightJoint: SemanticJoint
  positionMirrorError: number
  rotationMirrorErrorDeg: number
}

export type RigDiagnosticReport = {
  rigProfile: 'humanoid-v1'
  rootName: string
  bounds: { min: Vec3; max: Vec3; size: Vec3 }
  characterAxes: CharacterAxes
  joints: Partial<Record<SemanticJoint, RigJointDiagnostic>>
  armFrames: ArmFrameDiagnostic[]
  symmetry: RigSymmetryDiagnostic[]
  warnings: string[]
}

export type PoseValidationReport = {
  poseId: string
  valid: boolean
  warnings: string[]
  metrics: Record<string, number>
}

export type PoseDiagnosticsSnapshot = {
  poseId: string
  validation: PoseValidationReport
  preContactBounds: Vec3
  postContactBounds: Vec3
  contactMode: 'Feet' | 'Seat + Feet' | 'Back'
  supportOrientation: 'Posterior' | 'Anterior' | 'Left Lateral' | 'Right Lateral' | 'Posterior Inclined' | 'Lateral'
  torsoOrientation: 'Vertical' | 'Seated' | 'Horizontal'
}

export type PoseShapeSignature = {
  poseId: string
  bounds: { width: number; height: number; depth: number }
  boundsLongitudinalExtent: number
  heightRatio: number
  horizontalLengthRatio: number
  pelvisToHeadVertical: number
  torsoHorizontalAlignment: number
  hipFlexionL: number
  hipFlexionR: number
  kneeFlexionL: number
  kneeFlexionR: number
  hipKneeHorizontalL: number
  hipKneeHorizontalR: number
  kneeAnkleHorizontalL: number
  kneeAnkleHorizontalR: number
}

export type PoseArmShape = {
  shoulderWidth: number
  shoulderWidthRatio: number
  clavicleWidth: number
  shoulderSocketWidth: number
  shoulderSocketWidthRatio: number
  shoulderDistanceFromCenterlineL: number
  shoulderDistanceFromCenterlineR: number
  socketDistanceFromCenterlineL: number
  socketDistanceFromCenterlineR: number
  elbowDistanceFromCenterlineL: number
  elbowDistanceFromCenterlineR: number
  wristDistanceFromCenterlineL: number
  wristDistanceFromCenterlineR: number
  minimumArmToTorsoClearance: number
  upperArmLengthRatioL: number
  upperArmLengthRatioR: number
  forearmLengthRatioL: number
  forearmLengthRatioR: number
  shoulderElbowOutwardL: number
  shoulderElbowOutwardR: number
  shoulderElbowTowardFeetL: number
  shoulderElbowTowardFeetR: number
  elbowWristTowardFeetL: number
  elbowWristTowardFeetR: number
  upperArmDropL: number
  upperArmDropR: number
  forearmDropL: number
  forearmDropR: number
  armLateralSymmetryError: number
  elbowLateralSymmetryError: number
  wristLateralSymmetryError: number
}

export type PoseJointAudit = {
  semanticJoint: SemanticJoint
  actualBone: string | null
  parentBone: string | null
  parentSemanticJoint: SemanticJoint | null
  restLocalPosition: Vec3 | null
  restLocalQuaternion: QuaternionValue | null
  restWorldPosition: Vec3 | null
  posedWorldPosition: Vec3 | null
  restWorldDirection: Vec3 | null
  posedWorldDirection: Vec3 | null
  primaryBoneAxis: Vec3 | null
  bendAxis: Vec3 | null
  twistAxis: Vec3 | null
  childDirection: Vec3 | null
  distanceFromCenterline: number | null
  distanceFromTorso: number | null
  shoulderToElbowVector: Vec3 | null
  elbowToWristVector: Vec3 | null
  quaternionOffset: QuaternionValue | null
  source: 'anatomical-intent' | 'inherited-rest'
}

const SEMANTIC_CHILDREN: Partial<Record<SemanticJoint, SemanticJoint>> = {
  hips: 'spine',
  spine: 'chest',
  chest: 'neck',
  neck: 'head',
  'shoulder.L': 'upperArm.L',
  'upperArm.L': 'lowerArm.L',
  'lowerArm.L': 'hand.L',
  'shoulder.R': 'upperArm.R',
  'upperArm.R': 'lowerArm.R',
  'lowerArm.R': 'hand.R',
  'upperLeg.L': 'lowerLeg.L',
  'lowerLeg.L': 'foot.L',
  'upperLeg.R': 'lowerLeg.R',
  'lowerLeg.R': 'foot.R',
}

const SYMMETRY_PAIRS: Array<[SemanticJoint, SemanticJoint]> = [
  ['shoulder.L', 'shoulder.R'],
  ['upperArm.L', 'upperArm.R'],
  ['lowerArm.L', 'lowerArm.R'],
  ['hand.L', 'hand.R'],
  ['upperLeg.L', 'upperLeg.R'],
  ['lowerLeg.L', 'lowerLeg.R'],
  ['foot.L', 'foot.R'],
]

const POSE_ORDER: SemanticJoint[] = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulder.L', 'upperArm.L', 'lowerArm.L', 'hand.L',
  'shoulder.R', 'upperArm.R', 'lowerArm.R', 'hand.R',
  'upperLeg.L', 'lowerLeg.L', 'foot.L',
  'upperLeg.R', 'lowerLeg.R', 'foot.R',
]

function asVec3(value: THREE.Vector3): Vec3 {
  return [value.x, value.y, value.z]
}

function asQuaternion(value: THREE.Quaternion): QuaternionValue {
  return [value.x, value.y, value.z, value.w]
}

function fromVec3(value: Vec3): THREE.Vector3 {
  return new THREE.Vector3(...value)
}

function fromQuaternion(value: QuaternionValue): THREE.Quaternion {
  return new THREE.Quaternion(...value)
}

function normalizeOrFallback(value: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  return value.lengthSq() > 1e-10 ? value.normalize() : fallback.clone().normalize()
}

function closestAxis(value: THREE.Vector3, axes: RigJointDiagnostic['localAxesCharacterSpace']): 'x' | 'y' | 'z' {
  const candidates: Array<['x' | 'y' | 'z', Vec3]> = [['x', axes.x], ['y', axes.y], ['z', axes.z]]
  return candidates.reduce((best, candidate) => (
    Math.abs(value.dot(fromVec3(candidate[1]))) > Math.abs(value.dot(fromVec3(best[1]))) ? candidate : best
  ))[0]
}

function semanticBone(root: THREE.Object3D, joint: SemanticJoint): THREE.Bone | undefined {
  const object = findSemanticJoint(root, joint, 'humanoid-v1')
  return object instanceof THREE.Bone ? object : undefined
}

function characterQuaternion(root: THREE.Object3D, object: THREE.Object3D): THREE.Quaternion {
  const rootWorld = root.getWorldQuaternion(new THREE.Quaternion())
  return rootWorld.invert().multiply(object.getWorldQuaternion(new THREE.Quaternion()))
}

function characterDirection(root: THREE.Object3D, direction: THREE.Vector3): THREE.Vector3 {
  const inverseRotation = root.getWorldQuaternion(new THREE.Quaternion()).invert()
  return direction.clone().applyQuaternion(inverseRotation).normalize()
}

function deriveCharacterAxes(root: THREE.Object3D, joints: Map<SemanticJoint, THREE.Bone>, warnings: string[]): CharacterAxes {
  const hips = joints.get('hips')?.getWorldPosition(new THREE.Vector3())
  const head = joints.get('head')?.getWorldPosition(new THREE.Vector3())
  const leftShoulder = joints.get('shoulder.L')?.getWorldPosition(new THREE.Vector3())
  const rightShoulder = joints.get('shoulder.R')?.getWorldPosition(new THREE.Vector3())
  const up = hips && head
    ? normalizeOrFallback(head.sub(hips), new THREE.Vector3(0, 1, 0))
    : new THREE.Vector3(0, 1, 0)
  let right = leftShoulder && rightShoulder
    ? normalizeOrFallback(rightShoulder.sub(leftShoulder), new THREE.Vector3(-1, 0, 0))
    : new THREE.Vector3(-1, 0, 0)
  right.sub(up.clone().multiplyScalar(right.dot(up)))
  right = normalizeOrFallback(right, new THREE.Vector3(-1, 0, 0))
  const forward = normalizeOrFallback(up.clone().cross(right), new THREE.Vector3(0, 0, 1))
  if (!hips || !head) warnings.push('Unable to derive character up from hips and head.')
  if (!leftShoulder || !rightShoulder) warnings.push('Unable to derive character right from shoulder symmetry.')
  void root
  return { up: asVec3(up), right: asVec3(right), forward: asVec3(forward) }
}

function primaryChildBone(root: THREE.Object3D, bone: THREE.Bone, joint: SemanticJoint, joints: Map<SemanticJoint, THREE.Bone>): { bone: THREE.Bone | null; joint: SemanticJoint | null } {
  const semanticChild = SEMANTIC_CHILDREN[joint]
  const semanticBoneChild = semanticChild ? joints.get(semanticChild) : undefined
  if (semanticBoneChild) return { bone: semanticBoneChild, joint: semanticChild ?? null }
  const directBone = bone.children.find((child): child is THREE.Bone => child instanceof THREE.Bone)
  if (directBone) {
    const childJoint = [...joints.entries()].find(([, candidate]) => candidate === directBone)?.[0] ?? null
    return { bone: directBone, joint: childJoint }
  }
  void root
  return { bone: null, joint: null }
}

export function diagnoseRig(root: THREE.Object3D): RigDiagnosticReport {
  root.updateMatrixWorld(true)
  const profile = getRigProfile('humanoid-v1')
  const warnings: string[] = []
  const joints = new Map<SemanticJoint, THREE.Bone>()
  ;(Object.keys(profile.jointNames) as SemanticJoint[]).forEach((joint) => {
    const bone = semanticBone(root, joint)
    if (bone) joints.set(joint, bone)
    else warnings.push(`Missing semantic joint: ${joint}.`)
  })

  const characterAxes = deriveCharacterAxes(root, joints, warnings)
  const rootInverse = root.matrixWorld.clone().invert()
  const rootRotationInverse = root.getWorldQuaternion(new THREE.Quaternion()).invert()
  const diagnosticJoints: Partial<Record<SemanticJoint, RigJointDiagnostic>> = {}

  joints.forEach((bone, joint) => {
    const worldPosition = bone.getWorldPosition(new THREE.Vector3())
    const worldQuaternion = bone.getWorldQuaternion(new THREE.Quaternion())
    const child = primaryChildBone(root, bone, joint, joints)
    let primaryDirection: THREE.Vector3
    if (child.bone) {
      const childPosition = child.bone.getWorldPosition(new THREE.Vector3())
      primaryDirection = characterDirection(root, childPosition.sub(worldPosition))
    } else {
      primaryDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(characterQuaternion(root, bone)).normalize()
    }
    const characterBoneQuaternion = rootRotationInverse.clone().multiply(worldQuaternion)
    const localAxes = {
      x: asVec3(new THREE.Vector3(1, 0, 0).applyQuaternion(characterBoneQuaternion).normalize()),
      y: asVec3(new THREE.Vector3(0, 1, 0).applyQuaternion(characterBoneQuaternion).normalize()),
      z: asVec3(new THREE.Vector3(0, 0, 1).applyQuaternion(characterBoneQuaternion).normalize()),
    }
    diagnosticJoints[joint] = {
      joint,
      bone: bone.name,
      parentBone: bone.parent?.name ?? null,
      restLocalPosition: asVec3(bone.position),
      restLocalQuaternion: asQuaternion(bone.quaternion),
      restLocalScale: asVec3(bone.scale),
      restWorldPosition: asVec3(worldPosition),
      restWorldQuaternion: asQuaternion(worldQuaternion),
      restWorldQuaternionCharacterSpace: asQuaternion(characterBoneQuaternion),
      primaryChildBone: child.bone?.name ?? null,
      primaryChildJoint: child.joint,
      primaryDirectionCharacterSpace: asVec3(primaryDirection),
      localAxesCharacterSpace: localAxes,
    }
  })

  const symmetry = SYMMETRY_PAIRS.flatMap(([leftJoint, rightJoint]) => {
    const left = diagnosticJoints[leftJoint]
    const right = diagnosticJoints[rightJoint]
    if (!left || !right) return []
    const mirroredPosition = mirrorVectorInCharacterSpace(fromVec3(left.restWorldPosition).applyMatrix4(rootInverse), fromVec3(characterAxes.right))
    const actualRightPosition = fromVec3(right.restWorldPosition).applyMatrix4(rootInverse)
    const mirroredRotation = mirrorQuaternionInCharacterSpace(fromQuaternion(left.restWorldQuaternionCharacterSpace), characterAxes)
    const actualRightRotation = fromQuaternion(right.restWorldQuaternionCharacterSpace)
    return [{
      leftJoint,
      rightJoint,
      positionMirrorError: mirroredPosition.distanceTo(actualRightPosition),
      rotationMirrorErrorDeg: quaternionAngleDegrees(mirroredRotation, actualRightRotation),
    }]
  })

  refreshDiagnosticSkinnedBounds(root)
  const bounds = new THREE.Box3().setFromObject(root)
  const armFrames = (['L', 'R'] as const).flatMap((side): ArmFrameDiagnostic[] => {
    const shoulder = diagnosticJoints[`shoulder.${side}`]
    const upperArm = diagnosticJoints[`upperArm.${side}`]
    const lowerArm = diagnosticJoints[`lowerArm.${side}`]
    const hand = diagnosticJoints[`hand.${side}`]
    if (!shoulder || !upperArm || !lowerArm || !hand) return []
    const toCharacter = (position: Vec3): THREE.Vector3 => fromVec3(position).applyMatrix4(rootInverse)
    const shoulderPosition = toCharacter(shoulder.restWorldPosition)
    const upperArmOrigin = toCharacter(upperArm.restWorldPosition)
    const elbowPosition = toCharacter(lowerArm.restWorldPosition)
    const wristPosition = toCharacter(hand.restWorldPosition)
    const upperDirection = normalizeOrFallback(elbowPosition.clone().sub(upperArmOrigin), fromVec3(upperArm.primaryDirectionCharacterSpace))
    const forearmDirection = normalizeOrFallback(wristPosition.clone().sub(elbowPosition), fromVec3(lowerArm.primaryDirectionCharacterSpace))
    const bendAxis = normalizeOrFallback(upperDirection.clone().cross(forearmDirection), fromVec3(characterAxes.forward))
    return [{
      side,
      shoulderPositionCharacterSpace: asVec3(shoulderPosition),
      upperArmOriginCharacterSpace: asVec3(upperArmOrigin),
      elbowPositionCharacterSpace: asVec3(elbowPosition),
      wristPositionCharacterSpace: asVec3(wristPosition),
      upperArmDirectionCharacterSpace: asVec3(upperDirection),
      forearmDirectionCharacterSpace: asVec3(forearmDirection),
      localPrimaryAxis: closestAxis(upperDirection, upperArm.localAxesCharacterSpace),
      localBendAxis: closestAxis(bendAxis, upperArm.localAxesCharacterSpace),
      localTwistAxis: closestAxis(upperDirection, upperArm.localAxesCharacterSpace),
      bendAxisCharacterSpace: asVec3(bendAxis),
      twistAxisCharacterSpace: asVec3(upperDirection),
    }]
  })
  return {
    rigProfile: 'humanoid-v1',
    rootName: root.name,
    bounds: {
      min: asVec3(bounds.min),
      max: asVec3(bounds.max),
      size: asVec3(bounds.getSize(new THREE.Vector3())),
    },
    characterAxes,
    joints: diagnosticJoints,
    armFrames,
    symmetry,
    warnings,
  }
}

export function mirrorVectorInCharacterSpace(value: THREE.Vector3, characterRight: THREE.Vector3): THREE.Vector3 {
  const normal = characterRight.clone().normalize()
  return value.sub(normal.multiplyScalar(2 * value.dot(normal)))
}

export function mirrorQuaternionInCharacterSpace(value: THREE.Quaternion, axes: CharacterAxes): THREE.Quaternion {
  const normal = fromVec3(axes.right).normalize()
  const nx = normal.x
  const ny = normal.y
  const nz = normal.z
  const reflection = new THREE.Matrix4().set(
    1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * nz, 0,
    -2 * ny * nx, 1 - 2 * ny * ny, -2 * ny * nz, 0,
    -2 * nz * nx, -2 * nz * ny, 1 - 2 * nz * nz, 0,
    0, 0, 0, 1,
  )
  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(value)
  const mirrored = reflection.clone().multiply(rotation).multiply(reflection)
  return new THREE.Quaternion().setFromRotationMatrix(mirrored).normalize()
}

export function mirrorPoseOffset(report: RigDiagnosticReport, leftJoint: SemanticJoint, rightJoint: SemanticJoint, leftOffset: QuaternionValue): QuaternionValue | undefined {
  const left = report.joints[leftJoint]
  const right = report.joints[rightJoint]
  if (!left || !right) return undefined
  const leftRest = fromQuaternion(left.restWorldQuaternionCharacterSpace)
  const leftPose = leftRest.multiply(fromQuaternion(leftOffset))
  const mirroredPose = mirrorQuaternionInCharacterSpace(leftPose, report.characterAxes)
  const rightRest = fromQuaternion(right.restWorldQuaternionCharacterSpace)
  const rightOffset = rightRest.invert().multiply(mirroredPose).normalize()
  return asQuaternion(rightOffset)
}

function anatomicalAxes(report: RigDiagnosticReport, joint: SemanticJoint): { flexion: THREE.Vector3; abduction: THREE.Vector3; twist: THREE.Vector3 } {
  const up = fromVec3(report.characterAxes.up)
  const right = fromVec3(report.characterAxes.right)
  const forward = fromVec3(report.characterAxes.forward)
  const isLeg = joint.includes('Leg')
  const isArm = joint.includes('Arm') || joint.includes('shoulder') || joint.includes('hand')
  const flexion = isLeg || !isArm ? right.clone().negate() : forward.clone()
  return {
    flexion: normalizeOrFallback(flexion, right),
    abduction: normalizeOrFallback(forward, up),
    twist: normalizeOrFallback(up, right),
  }
}

export function anatomicalRotationToLocalOffset(report: RigDiagnosticReport, joint: SemanticJoint, intent: AnatomicalRotationIntent): QuaternionValue | undefined {
  const diagnostic = report.joints[joint]
  if (!diagnostic) return undefined
  const axes = anatomicalAxes(report, joint)
  const delta = new THREE.Quaternion()
  const rotate = (axis: THREE.Vector3, degrees: number | undefined) => {
    if (!degrees) return
    delta.multiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees)))
  }
  rotate(axes.flexion, (intent.flexionDeg ?? intent.pitchDeg ?? 0) - (intent.extensionDeg ?? 0))
  rotate(axes.abduction, (intent.abductionDeg ?? intent.rollDeg ?? 0) - (intent.adductionDeg ?? 0) + (intent.sideBendDeg ?? 0))
  rotate(axes.twist, intent.twistDeg ?? intent.yawDeg)

  const restLocal = fromQuaternion(diagnostic.restLocalQuaternion)
  const restWorld = fromQuaternion(diagnostic.restWorldQuaternionCharacterSpace)
  const parentRest = restWorld.clone().multiply(restLocal.clone().invert())
  const localOffset = restLocal.clone().invert()
    .multiply(parentRest.clone().invert())
    .multiply(delta)
    .multiply(parentRest)
    .multiply(restLocal)
    .normalize()
  return asQuaternion(localOffset)
}

function directionFromIntent(report: RigDiagnosticReport, intent: AnatomicalJointIntent): THREE.Vector3 | undefined {
  const direction = intent.targetDirection
  if (!direction) return undefined
  return normalizeOrFallback(
    fromVec3(report.characterAxes.right).multiplyScalar(direction.characterRight)
      .add(fromVec3(report.characterAxes.up).multiplyScalar(direction.characterUp))
      .add(fromVec3(report.characterAxes.forward).multiplyScalar(direction.characterForward)),
    fromVec3(report.characterAxes.up),
  )
}

function referenceHeightFor(report: RigDiagnosticReport, joint: SemanticJoint): number {
  const diagnostic = report.joints[joint]
  if (!diagnostic) return 0.5
  const height = Math.max(0.001, report.bounds.size[1])
  return THREE.MathUtils.clamp((diagnostic.restWorldPosition[1] - report.bounds.min[1]) / height, 0.3, 0.7)
}

function backContactOffsetFor(report: RigDiagnosticReport): number {
  return THREE.MathUtils.clamp(report.bounds.size[2] / Math.max(0.001, report.bounds.size[1]) * 0.12, 0.02, 0.2)
}

function poseFromDirections(
  root: THREE.Object3D,
  report: RigDiagnosticReport,
  id: string,
  label: string,
  category: PoseDefinition['category'],
  joints: Partial<Record<SemanticJoint, AnatomicalJointIntent>>,
  grounding: PoseGrounding,
  rootRotationQuaternion?: QuaternionValue,
): PoseDefinition {
  const bones: PoseDefinition['bones'] = {}
  const desiredWorld = new Map<THREE.Bone, THREE.Quaternion>()
  const resolveDesiredWorld = (bone: THREE.Bone): THREE.Quaternion => {
    const existing = desiredWorld.get(bone)
    if (existing) return existing.clone()
    if (bone.parent instanceof THREE.Bone) return resolveDesiredWorld(bone.parent).multiply(bone.quaternion)
    return fromQuaternion(characterQuaternion(root, bone).toArray() as QuaternionValue)
  }

  const entries = POSE_ORDER
    .filter((joint) => joints[joint] && report.joints[joint])
    .sort((left, right) => {
      const leftBone = semanticBone(root, left)
      const rightBone = semanticBone(root, right)
      const depth = (bone: THREE.Bone | undefined): number => {
        let value = 0
        let current = bone?.parent
        while (current) { value += 1; current = current.parent }
        return value
      }
      return depth(leftBone) - depth(rightBone)
    })

  entries.forEach((joint) => {
    const bone = semanticBone(root, joint)
    const diagnostic = report.joints[joint]
    const intent = joints[joint]
    if (!bone || !diagnostic || !intent) return
    const parentWorld = bone.parent instanceof THREE.Bone
      ? resolveDesiredWorld(bone.parent)
      : characterQuaternion(root, bone).multiply(bone.quaternion.clone().invert())
    const targetDirection = directionFromIntent(report, intent)
    let localOffset: THREE.Quaternion
    let desiredWorldQuaternion: THREE.Quaternion
    if (targetDirection) {
      const restDirection = fromVec3(diagnostic.primaryDirectionCharacterSpace)
      const directionDelta = new THREE.Quaternion().setFromUnitVectors(restDirection, targetDirection)
      desiredWorldQuaternion = directionDelta.multiply(fromQuaternion(diagnostic.restWorldQuaternionCharacterSpace)).normalize()
      const desiredLocal = parentWorld.clone().invert().multiply(desiredWorldQuaternion)
      localOffset = bone.quaternion.clone().invert().multiply(desiredLocal).normalize()
    } else if (intent.targetFrame === 'character-rest') {
      desiredWorldQuaternion = fromQuaternion(diagnostic.restWorldQuaternionCharacterSpace)
      const desiredLocal = parentWorld.clone().invert().multiply(desiredWorldQuaternion)
      localOffset = bone.quaternion.clone().invert().multiply(desiredLocal).normalize()
    } else {
      localOffset = fromQuaternion(anatomicalRotationToLocalOffset(report, joint, intent.rotation ?? {}) ?? [0, 0, 0, 1])
      desiredWorldQuaternion = parentWorld.clone().multiply(bone.quaternion).multiply(localOffset).normalize()
    }
    bones[joint] = { rotationQuaternion: asQuaternion(localOffset) }
    desiredWorld.set(bone, desiredWorldQuaternion)
  })

  return {
    id,
    label,
    category,
    rigProfile: 'humanoid-v1',
    status: 'production',
    bones,
    grounding,
    metadata: { source: 'auto-diagnosed', calibrated: true },
    ...(rootRotationQuaternion ? { rootRotationQuaternion } : {}),
  }
}

function groundingForIntent(report: RigDiagnosticReport, intent: AnatomicalPoseIntent): PoseGrounding {
  if (intent.contact === 'seat') {
    return {
      type: 'seat',
      referenceJoint: 'hips',
      referenceHeight: referenceHeightFor(report, 'hips'),
      secondaryContact: { type: 'feet', referenceJoints: ['foot.L', 'foot.R'], floorHeight: 0, supportOffsets: {} },
    }
  }
  if (intent.contact === 'back') return { type: 'back', referenceJoint: 'spine', contactOffset: backContactOffsetFor(report) }
  return { type: 'feet', referenceJoint: 'foot.L' }
}

function clonePoseGrounding(grounding: PoseGrounding): PoseGrounding {
  if (grounding.type === 'seat') {
    return {
      ...grounding,
      ...(grounding.secondaryContact ? {
        secondaryContact: {
          ...grounding.secondaryContact,
          supportOffsets: { ...grounding.secondaryContact.supportOffsets },
        },
      } : {}),
    }
  }
  return { ...grounding }
}

function groundingForVariant(base: PoseGrounding, variant: AnatomicalPoseVariantIntent): PoseGrounding {
  const grounding = clonePoseGrounding(base)
  if (grounding.type === 'back' && variant.supportFrame) return { ...grounding, supportFrame: variant.supportFrame }
  if (grounding.type !== 'seat') return grounding
  if (variant.groundingReferenceHeightDelta) grounding.referenceHeight += variant.groundingReferenceHeightDelta
  if (variant.releaseFeet) delete grounding.secondaryContact
  return grounding
}

function rootRotationForIntent(report: RigDiagnosticReport, intent: Pick<AnatomicalPoseIntent, 'rootRotation'>): QuaternionValue | undefined {
  if (!intent.rootRotation) return undefined
  const axis = intent.rootRotation.axis === 'characterRight'
    ? report.characterAxes.right
    : intent.rootRotation.axis === 'characterUp'
      ? report.characterAxes.up
      : report.characterAxes.forward
  return asQuaternion(new THREE.Quaternion().setFromAxisAngle(fromVec3(axis), THREE.MathUtils.degToRad(intent.rootRotation.degrees)))
}

export function reconstructReferencePoses(root: THREE.Object3D, report: RigDiagnosticReport): Record<string, PoseDefinition> {
  root.userData.rigDiagnosticReport = report
  const referenceIntents = referencePoseIntents()
  const poses = Object.fromEntries(referenceIntents.map((intent) => [
    intent.id,
    poseFromDirections(
      root,
      report,
      intent.id,
      intent.label,
      intent.category,
      intent.joints,
      groundingForIntent(report, intent),
      rootRotationForIntent(report, intent),
    ),
  ])) as Record<string, PoseDefinition>

  const standingIntent = referenceIntents.find((intent) => intent.id === 'standing-neutral')
  if (standingIntent) {
    standingPoseVariantIntents().forEach((variant) => {
      if (variant.basePoseId !== standingIntent.id) return
      poses[variant.id] = poseFromDirections(
        root,
        report,
        variant.id,
        variant.label,
        variant.category,
        { ...standingIntent.joints, ...variant.joints },
        clonePoseGrounding(poses[standingIntent.id].grounding),
      )
    })
  }

  const calibrationActor: ActorDocument = {
    id: '__pose-contact-calibration__',
    name: 'Pose Contact Calibration',
    character: { characterId: 'male-01' },
    appearance: { color: '#ffffff', heightM: 1, representation: 'person-proxy' },
    pose: { poseId: 'standing-neutral' },
    placement: { position: [0, 0, 0], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
  }
  const resetPose: PoseDefinition = {
    id: '__pose-rest__',
    label: 'Pose Rest',
    category: 'standing',
    rigProfile: 'humanoid-v1',
    status: 'temporary',
    bones: {},
    grounding: { type: 'feet', referenceJoint: 'foot.L' },
    metadata: { source: 'auto-diagnosed', calibrated: true },
  }

  const sitting = poses['sitting-neutral']
  if (sitting) {
    applyActorPose(root, calibrationActor, 'humanoid-v1', sitting)
    root.updateMatrixWorld(true)
    refreshDiagnosticSkinnedBounds(root)
    const hips = positionOf(root, 'hips')
    const footL = positionOf(root, 'foot.L')
    const footR = positionOf(root, 'foot.R')
    const rootScaleY = Math.abs(root.getWorldScale(new THREE.Vector3()).y) || 1
    const secondary = sitting.grounding.type === 'seat' ? sitting.grounding.secondaryContact : undefined
    const supportOffsetL = footSupportOffset(root, 'foot.L', 'L', rootScaleY)
    const supportOffsetR = footSupportOffset(root, 'foot.R', 'R', rootScaleY)
    if (secondary) {
      secondary.supportOffsets = {
        'foot.L': supportOffsetL,
        'foot.R': supportOffsetR,
      }
    }
    if (hips && footL && footR && secondary && sitting.grounding.type === 'seat') {
      const floorL = footL.y - supportOffsetL * rootScaleY
      const floorR = footR.y - supportOffsetR * rootScaleY
      sitting.grounding.referenceHeight = THREE.MathUtils.clamp(
        (hips.y - Math.min(floorL, floorR)) / rootScaleY,
        0.25,
        0.9,
      )
    }
    applyActorPose(root, calibrationActor, 'humanoid-v1', resetPose)
  }

  const sittingIntent = referenceIntents.find((intent) => intent.id === 'sitting-neutral')
  if (sitting && sittingIntent) {
    sittingPoseVariantIntents().forEach((variant) => {
      if (variant.basePoseId !== sittingIntent.id) return
      poses[variant.id] = poseFromDirections(
        root,
        report,
        variant.id,
        variant.label,
        variant.category,
        { ...sittingIntent.joints, ...variant.joints },
        groundingForVariant(sitting.grounding, variant),
      )
    })
  }

  const lying = poses['lying-supine']
  const lyingIntent = referenceIntents.find((intent) => intent.id === 'lying-supine')
  if (lying && lyingIntent) {
    lyingPoseVariantIntents().forEach((variant) => {
      if (variant.basePoseId !== lyingIntent.id) return
      poses[variant.id] = poseFromDirections(
        root,
        report,
        variant.id,
        variant.label,
        variant.category,
        { ...lyingIntent.joints, ...variant.joints },
        groundingForVariant(lying.grounding, variant),
        rootRotationForIntent(report, variant),
      )
    })
  }

  const lyingPoses = Object.values(poses).filter((pose) => pose.category === 'lying')
  lyingPoses.forEach((lyingPose) => {
    applyActorPose(root, calibrationActor, 'humanoid-v1', lyingPose)
    root.updateMatrixWorld(true)
    refreshDiagnosticSkinnedBounds(root)
    const bounds = new THREE.Box3().setFromObject(root)
    const supportReference = positionOf(root, lyingPose.grounding.referenceJoint)
    const rootScaleY = Math.abs(root.getWorldScale(new THREE.Vector3()).y) || 1
    if (supportReference && lyingPose.grounding.type === 'back') {
      const supportFrame = lyingPose.grounding.supportFrame
      lyingPose.grounding.contactOffset = THREE.MathUtils.clamp(
        (supportReference.y - bounds.min.y) / rootScaleY,
        0.01,
        supportFrame && supportFrame !== 'posterior' ? 0.9 : 0.3,
      )
    }
    applyActorPose(root, calibrationActor, 'humanoid-v1', resetPose)
  })

  clearActorPoseRestTransforms(root)
  root.userData.reconstructedPoses = poses
  return poses
}

function refreshDiagnosticSkinnedBounds(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      object.computeBoundingBox()
      object.computeBoundingSphere()
    }
  })
}

function footSupportOffset(root: THREE.Object3D, joint: 'foot.L' | 'foot.R', side: 'L' | 'R', rootScaleY: number): number {
  const foot = semanticBone(root, joint)
  if (!foot) return 0
  const profile = getRigProfile('humanoid-v1')
  const supportNames = new Set([foot.name.toLowerCase(), ...(profile.supportBoneNames?.[side] ?? [])].map((name) => name.toLowerCase()))
  let lowestSupportY = Number.POSITIVE_INFINITY
  const vertex = new THREE.Vector3()
  root.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return
    const skinIndex = object.geometry.getAttribute('skinIndex')
    const skinWeight = object.geometry.getAttribute('skinWeight')
    if (!skinIndex || !skinWeight) return
    const supportBoneIndices = new Set(
      object.skeleton.bones
        .map((bone, index) => supportNames.has(bone.name.toLowerCase()) ? index : -1)
        .filter((index) => index >= 0),
    )
    if (supportBoneIndices.size === 0) return
    for (let index = 0; index < skinIndex.count; index += 1) {
      const influences = [
        [skinIndex.getX(index), skinWeight.getX(index)],
        [skinIndex.getY(index), skinWeight.getY(index)],
        [skinIndex.getZ(index), skinWeight.getZ(index)],
        [skinIndex.getW(index), skinWeight.getW(index)],
      ] as const
      if (!influences.some(([boneIndex, weight]) => supportBoneIndices.has(boneIndex) && weight > 0.2)) continue
      object.getVertexPosition(index, vertex)
      vertex.applyMatrix4(object.matrixWorld)
      lowestSupportY = Math.min(lowestSupportY, vertex.y)
    }
  })
  if (!Number.isFinite(lowestSupportY)) return 0
  const footY = foot.getWorldPosition(new THREE.Vector3()).y
  return THREE.MathUtils.clamp((footY - lowestSupportY) / rootScaleY, 0, 0.4)
}

function positionOf(root: THREE.Object3D, joint: SemanticJoint): THREE.Vector3 | undefined {
  return findSemanticJoint(root, joint, 'humanoid-v1')?.getWorldPosition(new THREE.Vector3())
}

function directionBetween(root: THREE.Object3D, from: SemanticJoint, to: SemanticJoint): THREE.Vector3 | undefined {
  const start = positionOf(root, from)
  const end = positionOf(root, to)
  return start && end ? end.sub(start).normalize() : undefined
}

function currentPoseBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true)
  refreshDiagnosticSkinnedBounds(root)
  root.updateMatrixWorld(true)
  return new THREE.Box3().setFromObject(root)
}

function poseBasis(root: THREE.Object3D): { up: THREE.Vector3; right: THREE.Vector3; forward: THREE.Vector3 } {
  const report = root.userData.rigDiagnosticReport as RigDiagnosticReport | undefined
  const rootRotation = root.getWorldQuaternion(new THREE.Quaternion())
  return {
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(rootRotation).normalize(),
    right: report ? fromVec3(report.characterAxes.right).applyQuaternion(rootRotation).normalize() : new THREE.Vector3(1, 0, 0),
    forward: report ? fromVec3(report.characterAxes.forward).applyQuaternion(rootRotation).normalize() : new THREE.Vector3(0, 0, 1),
  }
}

function horizontalAlignment(direction: THREE.Vector3 | undefined, up: THREE.Vector3): number {
  return direction ? 1 - Math.abs(direction.dot(up)) : 0
}

function armPoseShape(root: THREE.Object3D): PoseArmShape | undefined {
  const report = root.userData.rigDiagnosticReport as RigDiagnosticReport | undefined
  if (!report) return undefined
  const shoulderL = positionOf(root, 'shoulder.L')
  const shoulderR = positionOf(root, 'shoulder.R')
  const socketL = positionOf(root, 'upperArm.L')
  const socketR = positionOf(root, 'upperArm.R')
  const elbowL = positionOf(root, 'lowerArm.L')
  const elbowR = positionOf(root, 'lowerArm.R')
  const wristL = positionOf(root, 'hand.L')
  const wristR = positionOf(root, 'hand.R')
  const hips = positionOf(root, 'hips')
  const chest = positionOf(root, 'chest')
  const head = positionOf(root, 'head')
  const frameL = report.armFrames.find((frame) => frame.side === 'L')
  const frameR = report.armFrames.find((frame) => frame.side === 'R')
  if (!shoulderL || !shoulderR || !socketL || !socketR || !elbowL || !elbowR || !wristL || !wristR || !hips || !chest || !frameL || !frameR) return undefined

  const rootScale = root.getWorldScale(new THREE.Vector3())
  const uniformScale = Math.max(0.001, (Math.abs(rootScale.x) + Math.abs(rootScale.y) + Math.abs(rootScale.z)) / 3)
  const center = hips.clone().add(chest).multiplyScalar(0.5)
  const lateral = shoulderL.clone().sub(shoulderR).normalize()
  const clavicleWidth = shoulderL.distanceTo(shoulderR)
  const shoulderWidth = socketL.distanceTo(socketR)
  const restClavicleWidth = fromVec3(report.joints['shoulder.L']?.restWorldPosition ?? [0, 0, 0])
    .distanceTo(fromVec3(report.joints['shoulder.R']?.restWorldPosition ?? [0, 0, 0])) * uniformScale
  const restSocketWidth = fromVec3(report.joints['upperArm.L']?.restWorldPosition ?? [0, 0, 0])
    .distanceTo(fromVec3(report.joints['upperArm.R']?.restWorldPosition ?? [0, 0, 0])) * uniformScale
  const torsoRadius = Math.max(0.001, restClavicleWidth * 1.5)
  const outward = (point: THREE.Vector3, side: 'L' | 'R'): number => {
    const signed = point.clone().sub(center).dot(lateral)
    return side === 'L' ? signed : -signed
  }
  const midpoint = (left: THREE.Vector3, right: THREE.Vector3): THREE.Vector3 => left.clone().add(right).multiplyScalar(0.5)
  const bodyAxis = head && head.clone().sub(hips).setY(0).normalize()
  const towardFeet = bodyAxis && bodyAxis.lengthSq() > 1e-8 ? bodyAxis.clone().negate() : new THREE.Vector3()
  const upperArmL = elbowL.clone().sub(socketL)
  const upperArmR = elbowR.clone().sub(socketR)
  const forearmL = wristL.clone().sub(elbowL)
  const forearmR = wristR.clone().sub(elbowR)
  const restUpperL = fromVec3(frameL.upperArmOriginCharacterSpace).distanceTo(fromVec3(frameL.elbowPositionCharacterSpace)) * uniformScale
  const restUpperR = fromVec3(frameR.upperArmOriginCharacterSpace).distanceTo(fromVec3(frameR.elbowPositionCharacterSpace)) * uniformScale
  const restForeL = fromVec3(frameL.elbowPositionCharacterSpace).distanceTo(fromVec3(frameL.wristPositionCharacterSpace)) * uniformScale
  const restForeR = fromVec3(frameR.elbowPositionCharacterSpace).distanceTo(fromVec3(frameR.wristPositionCharacterSpace)) * uniformScale
  const outwardDirection = (vector: THREE.Vector3, side: 'L' | 'R'): number => {
    const signed = vector.clone().normalize().dot(lateral)
    return side === 'L' ? signed : -signed
  }
  const upperMidL = midpoint(socketL, elbowL)
  const upperMidR = midpoint(socketR, elbowR)
  return {
    shoulderWidth,
    shoulderWidthRatio: shoulderWidth / Math.max(0.001, restSocketWidth),
    clavicleWidth,
    shoulderSocketWidth: shoulderWidth,
    shoulderSocketWidthRatio: shoulderWidth / Math.max(0.001, restSocketWidth),
    shoulderDistanceFromCenterlineL: Math.abs(shoulderL.clone().sub(center).dot(lateral)),
    shoulderDistanceFromCenterlineR: Math.abs(shoulderR.clone().sub(center).dot(lateral)),
    socketDistanceFromCenterlineL: Math.abs(socketL.clone().sub(center).dot(lateral)),
    socketDistanceFromCenterlineR: Math.abs(socketR.clone().sub(center).dot(lateral)),
    elbowDistanceFromCenterlineL: Math.abs(elbowL.clone().sub(center).dot(lateral)),
    elbowDistanceFromCenterlineR: Math.abs(elbowR.clone().sub(center).dot(lateral)),
    wristDistanceFromCenterlineL: Math.abs(wristL.clone().sub(center).dot(lateral)),
    wristDistanceFromCenterlineR: Math.abs(wristR.clone().sub(center).dot(lateral)),
    minimumArmToTorsoClearance: Math.min(
      outward(upperMidL, 'L'), outward(upperMidR, 'R'),
      outward(elbowL, 'L'), outward(elbowR, 'R'),
      outward(wristL, 'L'), outward(wristR, 'R'),
    ) - torsoRadius,
    upperArmLengthRatioL: upperArmL.length() / Math.max(0.001, restUpperL),
    upperArmLengthRatioR: upperArmR.length() / Math.max(0.001, restUpperR),
    forearmLengthRatioL: forearmL.length() / Math.max(0.001, restForeL),
    forearmLengthRatioR: forearmR.length() / Math.max(0.001, restForeR),
    shoulderElbowOutwardL: outwardDirection(upperArmL, 'L'),
    shoulderElbowOutwardR: outwardDirection(upperArmR, 'R'),
    shoulderElbowTowardFeetL: upperArmL.clone().normalize().dot(towardFeet),
    shoulderElbowTowardFeetR: upperArmR.clone().normalize().dot(towardFeet),
    elbowWristTowardFeetL: forearmL.clone().normalize().dot(towardFeet),
    elbowWristTowardFeetR: forearmR.clone().normalize().dot(towardFeet),
    upperArmDropL: -upperArmL.clone().normalize().y,
    upperArmDropR: -upperArmR.clone().normalize().y,
    forearmDropL: -forearmL.clone().normalize().y,
    forearmDropR: -forearmR.clone().normalize().y,
    armLateralSymmetryError: Math.abs(outward(upperMidL, 'L') - outward(upperMidR, 'R')),
    elbowLateralSymmetryError: Math.abs(outward(elbowL, 'L') - outward(elbowR, 'R')),
    wristLateralSymmetryError: Math.abs(outward(wristL, 'L') - outward(wristR, 'R')),
  }
}

function angleFromDown(direction: THREE.Vector3 | undefined, up: THREE.Vector3): number {
  if (!direction) return 0
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(direction.dot(up.clone().negate()), -1, 1)))
}

function angleBetween(left: THREE.Vector3 | undefined, right: THREE.Vector3 | undefined): number {
  if (!left || !right) return 0
  return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(left.dot(right), -1, 1)))
}

function longitudinalAxis(root: THREE.Object3D, basis: { up: THREE.Vector3; forward: THREE.Vector3 }): THREE.Vector3 {
  const worldUp = new THREE.Vector3(0, 1, 0)
  const hips = positionOf(root, 'hips')
  const head = positionOf(root, 'head')
  const bodyAxis = hips && head ? head.clone().sub(hips) : new THREE.Vector3()
  const horizontalBodyAxis = bodyAxis.clone().sub(worldUp.clone().multiplyScalar(bodyAxis.dot(worldUp)))
  const horizontalForward = horizontalBodyAxis.lengthSq() > 1e-8 ? horizontalBodyAxis : basis.forward.clone()
  return horizontalForward.sub(worldUp.clone().multiplyScalar(horizontalForward.dot(worldUp))).normalize()
}

function boundsExtentAlong(bounds: THREE.Box3, axis: THREE.Vector3): number {
  const corners = [
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  ]
  const values = corners.map((corner) => corner.dot(axis))
  return Math.max(...values) - Math.min(...values)
}

function longitudinalExtent(root: THREE.Object3D, basis: { up: THREE.Vector3; forward: THREE.Vector3 }): number {
  const points = (['hips', 'chest', 'head', 'upperLeg.L', 'upperLeg.R', 'lowerLeg.L', 'lowerLeg.R', 'foot.L', 'foot.R'] as SemanticJoint[])
    .map((joint) => positionOf(root, joint))
    .filter((position): position is THREE.Vector3 => Boolean(position))
  const axis = longitudinalAxis(root, basis)
  if (axis.lengthSq() < 1e-8 || points.length < 2) return 0
  const values = points.map((point) => point.dot(axis))
  return Math.max(...values) - Math.min(...values)
}

function measureCurrentPoseShape(root: THREE.Object3D, poseId: string): PoseShapeSignature {
  const basis = poseBasis(root)
  const bounds = currentPoseBounds(root)
  const hips = positionOf(root, 'hips')
  const head = positionOf(root, 'head')
  const upperLegL = directionBetween(root, 'upperLeg.L', 'lowerLeg.L')
  const upperLegR = directionBetween(root, 'upperLeg.R', 'lowerLeg.R')
  const lowerLegL = directionBetween(root, 'lowerLeg.L', 'foot.L')
  const lowerLegR = directionBetween(root, 'lowerLeg.R', 'foot.R')
  const hipsToHead = hips && head ? head.clone().sub(hips) : undefined
  const report = root.userData.rigDiagnosticReport as RigDiagnosticReport | undefined
  const runtimeReferenceHeight = root.userData.poseReferenceHeight as number | undefined
  const rootScale = root.getWorldScale(new THREE.Vector3())
  const referenceHeight = Math.max(0.001, runtimeReferenceHeight ?? (report?.bounds.size[1] ?? bounds.getSize(new THREE.Vector3()).y) * (Math.abs(rootScale.y) || 1))
  const bodyAxis = longitudinalAxis(root, basis)
  const boundsLongitudinalExtent = boundsExtentAlong(bounds, bodyAxis)
  const semanticLongitudinalExtent = longitudinalExtent(root, basis)
  const worldUp = new THREE.Vector3(0, 1, 0)
  const torsoDirections = [directionBetween(root, 'hips', 'chest'), directionBetween(root, 'chest', 'head')]
  return {
    poseId,
    bounds: { width: bounds.max.x - bounds.min.x, height: bounds.max.y - bounds.min.y, depth: bounds.max.z - bounds.min.z },
    boundsLongitudinalExtent,
    heightRatio: (bounds.max.y - bounds.min.y) / referenceHeight,
    horizontalLengthRatio: Math.max(boundsLongitudinalExtent, semanticLongitudinalExtent) / referenceHeight,
    pelvisToHeadVertical: hipsToHead ? Math.abs(hipsToHead.dot(worldUp)) / referenceHeight : 0,
    torsoHorizontalAlignment: torsoDirections.reduce((minimum, direction) => Math.min(minimum, horizontalAlignment(direction, worldUp)), 1),
    hipFlexionL: angleFromDown(upperLegL, basis.up),
    hipFlexionR: angleFromDown(upperLegR, basis.up),
    kneeFlexionL: angleBetween(upperLegL, lowerLegL),
    kneeFlexionR: angleBetween(upperLegR, lowerLegR),
    hipKneeHorizontalL: horizontalAlignment(upperLegL, basis.up),
    hipKneeHorizontalR: horizontalAlignment(upperLegR, basis.up),
    kneeAnkleHorizontalL: horizontalAlignment(lowerLegL, basis.up),
    kneeAnkleHorizontalR: horizontalAlignment(lowerLegR, basis.up),
  }
}

export function measurePoseShapeSignature(root: THREE.Object3D, actor: ActorDocument, pose: PoseDefinition): PoseShapeSignature {
  applyActorPose(root, actor, 'humanoid-v1', pose)
  return measureCurrentPoseShape(root, pose.id)
}

export function auditPoseDefinition(root: THREE.Object3D, actor: ActorDocument, pose: PoseDefinition): PoseJointAudit[] {
  const report = root.userData.rigDiagnosticReport as RigDiagnosticReport | undefined
  const restRootRotation = root.getWorldQuaternion(new THREE.Quaternion())
  const initialTransforms = new Map<THREE.Object3D, { position: THREE.Vector3; quaternion: THREE.Quaternion }>()
  root.traverse((object) => initialTransforms.set(object, { position: object.position.clone(), quaternion: object.quaternion.clone() }))
  applyActorPose(root, actor, 'humanoid-v1', pose)
  root.updateMatrixWorld(true)
  const parentByJoint = new Map<SemanticJoint, SemanticJoint>()
  Object.entries(SEMANTIC_CHILDREN).forEach(([parent, child]) => {
    if (child) parentByJoint.set(child, parent as SemanticJoint)
  })
  const posedPositions = new Map<SemanticJoint, THREE.Vector3>()
  POSE_ORDER.forEach((joint) => {
    const position = positionOf(root, joint)
    if (position) posedPositions.set(joint, position)
  })
  const posedCenter = posedPositions.get('hips') && posedPositions.get('chest')
    ? posedPositions.get('hips')!.clone().add(posedPositions.get('chest')!).multiplyScalar(0.5)
    : undefined
  const posedLateral = posedPositions.get('shoulder.L') && posedPositions.get('shoulder.R')
    ? posedPositions.get('shoulder.L')!.clone().sub(posedPositions.get('shoulder.R')!).normalize()
    : undefined
  const auditRootScale = root.getWorldScale(new THREE.Vector3())
  const auditScale = Math.max(0.001, (Math.abs(auditRootScale.x) + Math.abs(auditRootScale.y) + Math.abs(auditRootScale.z)) / 3)
  const restShoulderWidth = report?.joints['shoulder.L'] && report.joints['shoulder.R']
    ? fromVec3(report.joints['shoulder.L']!.restWorldPosition).distanceTo(fromVec3(report.joints['shoulder.R']!.restWorldPosition)) * auditScale
    : 0
  const torsoReferenceRadius = restShoulderWidth * 1.5
  const armFrameFor = (joint: SemanticJoint): ArmFrameDiagnostic | undefined => {
    const side = joint.endsWith('.L') ? 'L' : joint.endsWith('.R') ? 'R' : undefined
    return side ? report?.armFrames.find((frame) => frame.side === side) : undefined
  }
  const audit = POSE_ORDER.map((joint) => {
    const diagnostic = report?.joints[joint]
    const object = semanticBone(root, joint)
    const child = diagnostic?.primaryChildJoint ? semanticBone(root, diagnostic.primaryChildJoint) : undefined
    const position = object?.getWorldPosition(new THREE.Vector3())
    const childPosition = child?.getWorldPosition(new THREE.Vector3())
    const posedDirection = position && childPosition
      ? childPosition.sub(position).normalize()
      : object
        ? new THREE.Vector3(0, 1, 0).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion())).normalize()
        : undefined
    const restDirection = diagnostic ? fromVec3(diagnostic.primaryDirectionCharacterSpace).applyQuaternion(restRootRotation).normalize() : undefined
    const armFrame = armFrameFor(joint)
    const distanceFromCenterline = position && posedCenter && posedLateral
      ? Math.abs(position.clone().sub(posedCenter).dot(posedLateral))
      : null
    const shoulderToElbowVector = joint === 'upperArm.L' && posedPositions.get('lowerArm.L') && position
      ? asVec3(posedPositions.get('lowerArm.L')!.clone().sub(position))
      : joint === 'upperArm.R' && posedPositions.get('lowerArm.R') && position
        ? asVec3(posedPositions.get('lowerArm.R')!.clone().sub(position))
        : null
    const elbowToWristVector = joint === 'lowerArm.L' && posedPositions.get('hand.L') && position
      ? asVec3(posedPositions.get('hand.L')!.clone().sub(position))
      : joint === 'lowerArm.R' && posedPositions.get('hand.R') && position
        ? asVec3(posedPositions.get('hand.R')!.clone().sub(position))
        : null
    return {
      semanticJoint: joint,
      actualBone: diagnostic?.bone ?? null,
      parentBone: object?.parent?.name ?? diagnostic?.parentBone ?? null,
      parentSemanticJoint: parentByJoint.get(joint) ?? null,
      restLocalPosition: diagnostic?.restLocalPosition ?? null,
      restLocalQuaternion: diagnostic?.restLocalQuaternion ?? null,
      restWorldPosition: diagnostic?.restWorldPosition ?? null,
      posedWorldPosition: position ? asVec3(position) : null,
      restWorldDirection: restDirection ? asVec3(restDirection) : null,
      posedWorldDirection: posedDirection ? asVec3(posedDirection) : null,
      primaryBoneAxis: diagnostic ? diagnostic.primaryDirectionCharacterSpace : null,
      bendAxis: armFrame ? armFrame.bendAxisCharacterSpace : null,
      twistAxis: armFrame ? armFrame.twistAxisCharacterSpace : null,
      childDirection: posedDirection ? asVec3(posedDirection) : null,
      distanceFromCenterline,
      distanceFromTorso: distanceFromCenterline === null ? null : distanceFromCenterline - torsoReferenceRadius,
      shoulderToElbowVector,
      elbowToWristVector,
      quaternionOffset: pose.bones[joint]?.rotationQuaternion ?? null,
      source: pose.bones[joint] ? 'anatomical-intent' as const : 'inherited-rest' as const,
    }
  })
  initialTransforms.forEach((transform, object) => {
    object.position.copy(transform.position)
    object.quaternion.copy(transform.quaternion)
  })
  root.updateMatrixWorld(true)
  return audit
}

function quaternionAngleDegrees(left: THREE.Quaternion, right: THREE.Quaternion): number {
  const dot = Math.abs(THREE.MathUtils.clamp(left.dot(right), -1, 1))
  return THREE.MathUtils.radToDeg(2 * Math.acos(dot))
}

export function validatePoseDefinition(root: THREE.Object3D, actor: ActorDocument, pose: PoseDefinition): PoseValidationReport {
  applyActorPose(root, actor, 'humanoid-v1', pose)
  root.updateMatrixWorld(true)
  const warnings: string[] = []
  const shape = measureCurrentPoseShape(root, pose.id)
  const basis = poseBasis(root)
  const pelvis = positionOf(root, 'hips')
  const head = positionOf(root, 'head')
  const spine = directionBetween(root, 'hips', 'head')
  const metrics: Record<string, number> = {}
  metrics.preContactBoundsWidth = shape.bounds.width
  metrics.preContactBoundsHeight = shape.bounds.height
  metrics.preContactBoundsDepth = shape.bounds.depth
  metrics.preContactBoundsLongitudinalExtent = shape.boundsLongitudinalExtent
  metrics.preContactHeightRatio = shape.heightRatio
  metrics.preContactHorizontalLengthRatio = shape.horizontalLengthRatio
  metrics.preContactPelvisToHeadVertical = shape.pelvisToHeadVertical
  metrics.preContactTorsoHorizontalAlignment = shape.torsoHorizontalAlignment
  metrics.hipFlexionL = shape.hipFlexionL
  metrics.hipFlexionR = shape.hipFlexionR
  metrics.kneeFlexionL = shape.kneeFlexionL
  metrics.kneeFlexionR = shape.kneeFlexionR
  metrics.hipKneeHorizontalL = shape.hipKneeHorizontalL
  metrics.hipKneeHorizontalR = shape.hipKneeHorizontalR
  metrics.kneeAnkleHorizontalL = shape.kneeAnkleHorizontalL
  metrics.kneeAnkleHorizontalR = shape.kneeAnkleHorizontalR
  if (!pelvis || !head || !spine) warnings.push('Missing body chain required for pose validation.')
  if (pelvis && head) {
    metrics.headAbovePelvis = head.clone().sub(pelvis).dot(basis.up)
    if (pose.category !== 'lying' && metrics.headAbovePelvis <= 0) warnings.push('Head is not above pelvis.')
  }

  if (spine) {
    const orientationUp = pose.category === 'lying' ? new THREE.Vector3(0, 1, 0) : basis.up
    metrics.torsoVerticality = Math.abs(spine.dot(orientationUp))
    if (pose.category === 'standing' && metrics.torsoVerticality < 0.7) warnings.push('Standing torso is not approximately vertical.')
    if (pose.category === 'sitting' && metrics.torsoVerticality < 0.7) warnings.push('Sitting torso is not approximately upright.')
    if (pose.category === 'lying') {
      if (pose.id === 'lying-reclined') {
        if (metrics.torsoVerticality < 0.2 || metrics.torsoVerticality > 0.8) warnings.push('Reclined torso is not measurably elevated above a horizontal lying state.')
      } else if (metrics.torsoVerticality > 0.35) {
        warnings.push('Lying torso is not approximately horizontal.')
      }
    }
  }

  const arms = armPoseShape(root)
  if (arms) {
    Object.entries(arms).forEach(([key, value]) => { metrics[key] = value })
    if (Object.values(arms).some((value) => !Number.isFinite(value))) warnings.push('Pose contains a non-finite arm metric.')
    if (pose.category === 'sitting' || pose.category === 'lying') {
      if (arms.shoulderWidthRatio < 0.9 || arms.shoulderWidthRatio > 1.1) warnings.push('Shoulder width is not preserved from the diagnosed rest rig.')
      const minimumClearance = pose.id === 'lying-supine' ? 0 : -0.12
      if (arms.minimumArmToTorsoClearance <= minimumClearance) warnings.push('Upper-arm or forearm chain penetrates the torso reference volume.')
      if ([arms.upperArmLengthRatioL, arms.upperArmLengthRatioR, arms.forearmLengthRatioL, arms.forearmLengthRatioR].some((ratio) => ratio < 0.9 || ratio > 1.1)) {
        warnings.push('Arm segment length is not preserved through the pose solve.')
      }
      if (pose.id !== 'lying-curled' && !pose.id.includes('side') && (arms.armLateralSymmetryError > arms.shoulderWidth * 0.5 || arms.elbowLateralSymmetryError > arms.shoulderWidth * 0.5 || arms.wristLateralSymmetryError > arms.shoulderWidth * 0.5)) {
        warnings.push('Arm chain is laterally asymmetrical.')
      }
    }
    if (pose.category === 'sitting') {
      if (Math.min(arms.upperArmDropL, arms.upperArmDropR) < 0.55) warnings.push('Sitting upper arms do not hang beside the torso.')
      if (Math.min(arms.elbowDistanceFromCenterlineL, arms.elbowDistanceFromCenterlineR) <= 0 || Math.min(arms.wristDistanceFromCenterlineL, arms.wristDistanceFromCenterlineR) <= 0) {
        warnings.push('Sitting elbows or wrists collapse onto the torso centerline.')
      }
    }
    if (pose.id === 'lying-supine') {
      if (Math.min(arms.shoulderElbowOutwardL, arms.shoulderElbowOutwardR) < 0.1) warnings.push('Lying upper arms are not abducted away from the rib cage.')
      if (Math.min(arms.shoulderElbowTowardFeetL, arms.shoulderElbowTowardFeetR, arms.elbowWristTowardFeetL, arms.elbowWristTowardFeetR) < 0.15) warnings.push('Lying arm chain does not continue naturally toward the feet.')
    }
  } else if (pose.category !== 'standing') {
    warnings.push('Missing arm chain required for upper-body pose validation.')
  }

  if (pose.category === 'standing') {
    const leftArm = directionBetween(root, 'shoulder.L', 'hand.L')
    const rightArm = directionBetween(root, 'shoulder.R', 'hand.R')
    metrics.armDrop = Math.min(Math.abs(leftArm?.y ?? 0), Math.abs(rightArm?.y ?? 0))
    if (metrics.armDrop < 0.03) warnings.push('Standing arms remain close to a T-pose.')

    const leftShoulder = positionOf(root, 'shoulder.L')
    const rightShoulder = positionOf(root, 'shoulder.R')
    const leftUpperArm = positionOf(root, 'upperArm.L')
    const rightUpperArm = positionOf(root, 'upperArm.R')
    const leftElbow = positionOf(root, 'lowerArm.L')
    const rightElbow = positionOf(root, 'lowerArm.R')
    const leftWrist = positionOf(root, 'hand.L')
    const rightWrist = positionOf(root, 'hand.R')
    const hips = pelvis
    const chest = positionOf(root, 'chest')
    if (leftShoulder && rightShoulder && leftUpperArm && rightUpperArm && leftElbow && rightElbow && leftWrist && rightWrist && hips && chest) {
      const leftAxis = leftShoulder.clone().sub(rightShoulder).normalize()
      const center = hips.clone().add(chest).multiplyScalar(0.5)
      const clavicleWidth = leftShoulder.distanceTo(rightShoulder)
      const torsoCoreRadius = Math.max(0.08, clavicleWidth * 2)
      const outward = (point: THREE.Vector3, side: 'L' | 'R'): number => {
        const lateral = point.clone().sub(center).dot(leftAxis)
        return side === 'L' ? lateral : -lateral
      }
      const leftMidpoint = leftUpperArm.clone().add(leftElbow).multiplyScalar(0.5)
      const rightMidpoint = rightUpperArm.clone().add(rightElbow).multiplyScalar(0.5)
      const leftMidpointOutward = outward(leftMidpoint, 'L')
      const rightMidpointOutward = outward(rightMidpoint, 'R')
      const leftElbowOutward = outward(leftElbow, 'L')
      const rightElbowOutward = outward(rightElbow, 'R')
      const leftWristOutward = outward(leftWrist, 'L')
      const rightWristOutward = outward(rightWrist, 'R')
      metrics.clavicleWidth = clavicleWidth
      metrics.leftElbowLateral = leftElbowOutward
      metrics.rightElbowLateral = rightElbowOutward
      metrics.leftWristLateral = leftWristOutward
      metrics.rightWristLateral = rightWristOutward
      metrics.leftUpperArmMidpointLateral = leftMidpointOutward
      metrics.rightUpperArmMidpointLateral = rightMidpointOutward
      metrics.leftElbowTorsoDistance = leftElbowOutward
      metrics.rightElbowTorsoDistance = rightElbowOutward
      metrics.armTorsoPenetration = Math.max(
        0,
        torsoCoreRadius - Math.min(leftMidpointOutward, rightMidpointOutward, leftElbowOutward, rightElbowOutward),
      )
      metrics.armLateralSymmetryError = Math.abs(leftMidpointOutward - rightMidpointOutward)
      metrics.elbowLateralSymmetryError = Math.abs(leftElbowOutward - rightElbowOutward)
      if (pose.id !== 'standing-arms-crossed' && (leftMidpointOutward <= torsoCoreRadius || rightMidpointOutward <= torsoCoreRadius || leftElbowOutward <= torsoCoreRadius || rightElbowOutward <= torsoCoreRadius)) {
        warnings.push('Standing upper-arm or elbow points penetrate the torso core.')
      }
      if (metrics.armLateralSymmetryError > clavicleWidth * 0.5 || metrics.elbowLateralSymmetryError > clavicleWidth * 0.5) {
        warnings.push('Standing arm chain is laterally asymmetric.')
      }
      if (pose.id === 'standing-arms-crossed') {
        const forwardDistance = Math.min(
          leftWrist.clone().sub(center).dot(basis.forward),
          rightWrist.clone().sub(center).dot(basis.forward),
        )
        const rootScaleY = Math.abs(root.getWorldScale(new THREE.Vector3()).y) || 1
        metrics.leftWristCrossing = -leftWristOutward / rootScaleY
        metrics.rightWristCrossing = -rightWristOutward / rootScaleY
        metrics.crossedForearmOverlap = Math.min(metrics.leftWristCrossing, metrics.rightWristCrossing)
        metrics.crossedForearmForwardDistance = forwardDistance / rootScaleY
        if (metrics.crossedForearmOverlap < 0.025 || metrics.crossedForearmForwardDistance < 0.02) {
          warnings.push('Arms Crossed does not place both forearms across the front of the torso.')
        }
      }
      if (pose.id === 'standing-hands-on-hips') {
        const rootScaleY = Math.abs(root.getWorldScale(new THREE.Vector3()).y) || 1
        metrics.leftHandToHipDistance = leftWrist.distanceTo(hips) / rootScaleY
        metrics.rightHandToHipDistance = rightWrist.distanceTo(hips) / rootScaleY
        metrics.handsOnHipsOutward = Math.min(leftWristOutward, rightWristOutward) / rootScaleY
        metrics.handsOnHipsHeightError = Math.max(
          Math.abs(leftWrist.y - hips.y),
          Math.abs(rightWrist.y - hips.y),
        ) / rootScaleY
        if (Math.max(metrics.leftHandToHipDistance, metrics.rightHandToHipDistance) > 0.55 || metrics.handsOnHipsOutward < 0.08 || metrics.handsOnHipsHeightError > 0.5) {
          warnings.push('Hands on Hips does not place both hands near the waist and hips.')
        }
      }
      if (pose.id === 'standing-weight-shift') {
        const rootScaleY = Math.abs(root.getWorldScale(new THREE.Vector3()).y) || 1
        metrics.weightShiftAsymmetry = Math.max(
          Math.abs(shape.hipFlexionL - shape.hipFlexionR) / 45,
          Math.abs(shape.kneeFlexionL - shape.kneeFlexionR) / 45,
          Math.abs(leftElbowOutward - rightElbowOutward) / Math.max(0.001, clavicleWidth),
        )
        metrics.weightShiftPelvisOffset = Math.abs(leftShoulder.y - rightShoulder.y) / rootScaleY
        if (metrics.weightShiftAsymmetry < 0.08) warnings.push('Weight Shift does not create a readable asymmetry between the two sides.')
      }
    } else {
      warnings.push('Missing arm chain required for standing silhouette validation.')
    }
  }

  if (pose.category === 'sitting') {
    const hipL = positionOf(root, 'upperLeg.L')
    const hipR = positionOf(root, 'upperLeg.R')
    const kneeL = positionOf(root, 'lowerLeg.L')
    const kneeR = positionOf(root, 'lowerLeg.R')
    const footL = positionOf(root, 'foot.L')
    const footR = positionOf(root, 'foot.R')
    metrics.kneeDrop = Math.min((kneeL?.clone().sub(hipL ?? new THREE.Vector3()).dot(basis.up) ?? 0), (kneeR?.clone().sub(hipR ?? new THREE.Vector3()).dot(basis.up) ?? 0))
    metrics.hipFlexion = (shape.hipFlexionL + shape.hipFlexionR) / 2
    metrics.kneeFlexion = (shape.kneeFlexionL + shape.kneeFlexionR) / 2
    if (hipL && hipR && kneeL && kneeR && footL && footR && pelvis) {
      const rootScaleY = Math.abs(root.getWorldScale(new THREE.Vector3()).y) || 1
      const kneeForwardL = kneeL.clone().sub(hipL).dot(basis.forward)
      const kneeForwardR = kneeR.clone().sub(hipR).dot(basis.forward)
      const seatGrounding = pose.grounding.type === 'seat' ? pose.grounding : undefined
      const expectedFloor = pelvis.y - ((seatGrounding?.referenceHeight ?? 0) * rootScaleY)
      metrics.kneeForwardDisplacement = Math.min(kneeForwardL, kneeForwardR) / rootScaleY
      metrics.kneeHeight = Math.min(kneeL.clone().sub(hipL).dot(basis.up), kneeR.clone().sub(hipR).dot(basis.up)) / rootScaleY
      metrics.ankleBelowKnee = Math.min(
        footL.clone().sub(kneeL).dot(basis.up),
        footR.clone().sub(kneeR).dot(basis.up),
      ) / rootScaleY
      metrics.ankleHeight = Math.min(footL.y, footR.y) - expectedFloor
      const leftSupportOffset = seatGrounding?.secondaryContact?.supportOffsets?.['foot.L'] ?? 0
      const rightSupportOffset = seatGrounding?.secondaryContact?.supportOffsets?.['foot.R'] ?? 0
      const leftFootContact = footL.y - leftSupportOffset * rootScaleY
      const rightFootContact = footR.y - rightSupportOffset * rootScaleY
      metrics.footFloorDistance = Math.max(Math.abs(leftFootContact - expectedFloor), Math.abs(rightFootContact - expectedFloor)) / rootScaleY
      metrics.legSideSeparation = Math.abs((kneeL.x - kneeR.x)) / rootScaleY
      metrics.hipFlexionSymmetryError = Math.abs(shape.hipFlexionL - shape.hipFlexionR)
      metrics.kneeFlexionSymmetryError = Math.abs(shape.kneeFlexionL - shape.kneeFlexionR)
      if (metrics.kneeForwardDisplacement < 0.08) warnings.push('Sitting knees do not travel forward from the hip origins.')
      if (seatGrounding?.secondaryContact && metrics.footFloorDistance > 0.12) warnings.push('Sitting feet are too far from the floor contact target.')
      if (metrics.legSideSeparation < 0.03) warnings.push('Sitting leg chains are crossing or collapsed together.')
      if (metrics.ankleBelowKnee >= -0.03) warnings.push('Sitting ankles do not descend below the knees.')
      if (shape.hipKneeHorizontalL < 0.5 || shape.hipKneeHorizontalR < 0.5) warnings.push('Sitting thighs remain too vertical.')
      if (shape.kneeAnkleHorizontalL > 0.75 || shape.kneeAnkleHorizontalR > 0.75) warnings.push('Sitting lower legs remain too horizontal.')
      if (metrics.hipFlexionSymmetryError > 12 || metrics.kneeFlexionSymmetryError > 12) warnings.push('Sitting leg flexion is asymmetrical.')
      if (pose.id === 'sitting-legs-crossed') {
        const lateral = basis.right.clone().negate()
        const leftKneeSigned = kneeL.clone().sub(pelvis).dot(lateral) / rootScaleY
        const rightKneeSigned = kneeR.clone().sub(pelvis).dot(lateral) / rootScaleY
        metrics.leftKneeCrossing = -leftKneeSigned
        metrics.rightKneeCrossing = rightKneeSigned
        metrics.legCrossingOverlap = Math.min(metrics.leftKneeCrossing, metrics.rightKneeCrossing)
        if (metrics.legCrossingOverlap < 0.025) warnings.push('Legs Crossed does not place the knees across the body midline.')
      }
    }
    if (metrics.hipFlexion < 45 || metrics.hipFlexion > 135) warnings.push('Sitting hip flexion is outside the plausible range.')
    if (metrics.kneeFlexion < 35 || metrics.kneeFlexion > 145) warnings.push('Sitting knee flexion is outside the plausible range.')
    if (metrics.kneeDrop > 0.15) warnings.push('Sitting knees remain too high relative to the hip origins.')
    if (shape.heightRatio > 0.98) warnings.push('Sitting pre-contact height still resembles Standing.')
  }

  if (pose.category === 'lying' && pelvis && head) {
    metrics.headPelvisHeightDifference = Math.abs(head.y - pelvis.y)
    if (pose.id !== 'lying-reclined' && metrics.headPelvisHeightDifference > 0.35) warnings.push('Lying head and pelvis are not at a similar vertical level.')
    const bodyDirection = directionBetween(root, 'hips', 'head')
    const pelvisChestDirection = directionBetween(root, 'hips', 'chest')
    const chestHeadDirection = directionBetween(root, 'chest', 'head')
    const hipKneeL = directionBetween(root, 'upperLeg.L', 'lowerLeg.L')
    const hipKneeR = directionBetween(root, 'upperLeg.R', 'lowerLeg.R')
    const kneeAnkleL = directionBetween(root, 'lowerLeg.L', 'foot.L')
    const kneeAnkleR = directionBetween(root, 'lowerLeg.R', 'foot.R')
    const authoredForward = (root.userData.rigDiagnosticReport as RigDiagnosticReport | undefined)?.characterAxes.forward ?? [0, 0, 1]
    const worldForward = fromVec3(authoredForward).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize()
    const worldUp = new THREE.Vector3(0, 1, 0)
    const worldDown = new THREE.Vector3(0, -1, 0)
    const supportFrame = pose.grounding.type === 'back' ? (pose.grounding.supportFrame ?? 'posterior') : 'posterior'
    const rootScaleY = Math.abs(root.getWorldScale(new THREE.Vector3()).y) || 1
    metrics.bodyLongitudinalHorizontal = bodyDirection ? 1 - Math.abs(bodyDirection.y) : 0
    metrics.pelvisChestHorizontal = horizontalAlignment(pelvisChestDirection, worldUp)
    metrics.chestHeadHorizontal = horizontalAlignment(chestHeadDirection, worldUp)
    metrics.hipKneeHorizontal = Math.min(horizontalAlignment(hipKneeL, worldUp), horizontalAlignment(hipKneeR, worldUp))
    metrics.kneeAnkleHorizontal = Math.min(horizontalAlignment(kneeAnkleL, worldUp), horizontalAlignment(kneeAnkleR, worldUp))
    metrics.chestFrontUp = worldForward.y
    metrics.backDirectionDown = worldForward.clone().negate().dot(worldDown)
    const sideDirection = basis.right.clone().negate()
    const shoulderAxis = directionBetween(root, 'shoulder.L', 'shoulder.R')
    metrics.shoulderStacking = shoulderAxis ? Math.abs(shoulderAxis.dot(worldUp)) : 0
    metrics.supportOrientationAlignment = supportFrame === 'posterior'
      ? Math.min(worldForward.dot(worldUp), metrics.backDirectionDown)
      : supportFrame === 'anterior'
        ? worldForward.dot(worldDown)
        : supportFrame === 'left-lateral'
          ? sideDirection.dot(worldDown)
          : supportFrame === 'right-lateral'
            ? basis.right.dot(worldDown)
            : supportFrame === 'posterior-inclined'
              ? Math.min(worldForward.dot(worldUp), metrics.backDirectionDown)
              : Math.max(sideDirection.dot(worldDown), basis.right.dot(worldDown))
    metrics.supportSurface = supportFrame === 'posterior' || supportFrame === 'posterior-inclined'
      ? metrics.backDirectionDown
      : supportFrame === 'anterior'
        ? worldForward.dot(worldDown)
        : Math.max(sideDirection.dot(worldDown), basis.right.dot(worldDown))
    if (metrics.supportOrientationAlignment < (supportFrame === 'posterior-inclined' ? 0.3 : 0.55)) warnings.push('Lying support orientation does not match the intended support frame.')

    const isReclined = pose.id === 'lying-reclined'
    const isCurled = pose.id === 'lying-curled'
    const horizontalThreshold = isReclined ? 0.35 : isCurled ? 0.4 : 0.65
    if (metrics.bodyLongitudinalHorizontal < horizontalThreshold) warnings.push('Lying body axis is not sufficiently horizontal.')
    if (metrics.pelvisChestHorizontal < horizontalThreshold || metrics.chestHeadHorizontal < horizontalThreshold) warnings.push('Lying pelvis, torso, and head chain is not sufficiently horizontal.')
    if (metrics.hipKneeHorizontal < (isCurled ? 0.4 : 0.65) || metrics.kneeAnkleHorizontal < (isCurled ? 0.4 : 0.65)) warnings.push('Lying leg chains are not sufficiently horizontal.')
    if (supportFrame === 'posterior' && metrics.chestFrontUp < 0.65) warnings.push('Lying chest/front direction is not face-up.')
    if (supportFrame === 'anterior' && worldForward.dot(worldDown) < 0.65) warnings.push('Prone chest/front direction is not toward the support surface.')
    if ((supportFrame === 'left-lateral' || supportFrame === 'right-lateral' || supportFrame === 'lateral') && metrics.shoulderStacking < 0.55) warnings.push('Side-lying shoulders do not stack over the support side.')
    if (shape.heightRatio > (isReclined ? 0.95 : isCurled ? 0.85 : (supportFrame === 'left-lateral' || supportFrame === 'right-lateral' ? 0.85 : 0.7))) warnings.push('Lying pre-contact height still resembles Standing.')
    if (shape.horizontalLengthRatio < (isCurled ? 0.35 : 0.75)) warnings.push('Lying pre-contact longitudinal extent is too short.')

    if (pose.id === 'lying-prone') {
      refreshDiagnosticSkinnedBounds(root)
      const bounds = new THREE.Box3().setFromObject(root)
      metrics.headSupportClearance = (head.y - bounds.min.y) / rootScaleY
      if (metrics.headSupportClearance < 0.02) warnings.push('Prone head is too close to or below the support surface.')
    }
    if (pose.id === 'lying-reclined') {
      metrics.torsoElevation = metrics.torsoVerticality
      metrics.pelvisSupportRelationship = Math.abs((pelvis.y - new THREE.Box3().setFromObject(root).min.y) / rootScaleY)
      if (metrics.torsoElevation < 0.2 || metrics.torsoElevation > 0.8) warnings.push('Reclined torso elevation is outside the intended semi-lying range.')
    }
    if (pose.id === 'lying-curled') {
      metrics.curledHipFlexion = Math.min(shape.hipFlexionL, shape.hipFlexionR)
      metrics.curledKneeFlexion = Math.min(shape.kneeFlexionL, shape.kneeFlexionR)
      const reconstructed = root.userData.reconstructedPoses as Record<string, PoseDefinition> | undefined
      const supine = reconstructed?.['lying-supine']
      let supineLengthRatio = 0
      if (supine) {
        applyActorPose(root, actor, 'humanoid-v1', supine)
        supineLengthRatio = measureCurrentPoseShape(root, supine.id).horizontalLengthRatio
        applyActorPose(root, actor, 'humanoid-v1', pose)
      }
      metrics.curledCompactness = supineLengthRatio > 0 ? shape.horizontalLengthRatio / supineLengthRatio : shape.horizontalLengthRatio
      if (metrics.curledHipFlexion < 25) warnings.push('Curled hips do not flex meaningfully toward the torso.')
      if (metrics.curledKneeFlexion < 45) warnings.push('Curled knees do not flex meaningfully.')
      if (metrics.curledCompactness > 0.9) warnings.push('Curled body spread is not sufficiently compact.')
    }
    if (pose.grounding.type === 'back') {
      refreshDiagnosticSkinnedBounds(root)
      const bounds = new THREE.Box3().setFromObject(root)
      const support = positionOf(root, pose.grounding.referenceJoint)
      metrics.backContactDistance = support ? Math.abs((support.y - bounds.min.y) / rootScaleY - pose.grounding.contactOffset) : Number.POSITIVE_INFINITY
      if (supportFrame === 'posterior' && metrics.backContactDistance > 0.12) warnings.push('Lying back contact reference is separated from the support surface.')
    }
  }

  return { poseId: pose.id, valid: warnings.length === 0, warnings, metrics }
}
