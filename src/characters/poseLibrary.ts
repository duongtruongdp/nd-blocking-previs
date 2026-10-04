import type { PoseCategory, Vec3 } from '../domain/types'
import type { SemanticJoint } from './rigProfiles'

export type QuaternionValue = [number, number, number, number]

export type PoseJointTransform = {
  rotationQuaternion?: QuaternionValue
  positionOffset?: Vec3
}

export type SecondaryFootContact = {
  type: 'feet'
  referenceJoints: ['foot.L', 'foot.R']
  floorHeight: number
  supportOffsets: Partial<Record<'foot.L' | 'foot.R', number>>
}

export type LyingSupportFrame = 'posterior' | 'anterior' | 'left-lateral' | 'right-lateral' | 'posterior-inclined' | 'lateral'

export type PoseGrounding =
  | { type: 'feet'; referenceJoint: 'foot.L' | 'foot.R' }
  | { type: 'seat'; referenceJoint: 'hips'; referenceHeight: number; secondaryContact?: SecondaryFootContact }
  | { type: 'body'; referenceJoint: 'spine' | 'chest' }
  | { type: 'back'; referenceJoint: 'spine' | 'chest'; contactOffset: number; supportFrame?: LyingSupportFrame }

export type PoseDefinition = {
  id: string
  label: string
  category: PoseCategory
  rigProfile: 'humanoid-v1'
  status: 'production' | 'temporary' | 'auto-calibrated' | 'artist-reviewed'
  bones: Partial<Record<SemanticJoint, PoseJointTransform>>
  grounding: PoseGrounding
  metadata: {
    source: 'semantic-production' | 'temporary-development' | 'auto-diagnosed' | 'blender-authored'
    calibrated: boolean
  }
  rootOffset?: Vec3
  rootRotationQuaternion?: QuaternionValue
}

type DevelopmentJointTransform = {
  rotationRadians?: Vec3
  position?: Vec3
}

function quaternionFromEuler([x, y, z]: Vec3): QuaternionValue {
  const cx = Math.cos(x / 2)
  const sx = Math.sin(x / 2)
  const cy = Math.cos(y / 2)
  const sy = Math.sin(y / 2)
  const cz = Math.cos(z / 2)
  const sz = Math.sin(z / 2)
  return [
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]
}

function groundingFor(category: PoseCategory): PoseGrounding {
  if (category === 'sitting') return { type: 'seat', referenceJoint: 'hips', referenceHeight: 0.52 }
  if (category === 'lying') return { type: 'body', referenceJoint: 'spine' }
  return { type: 'feet', referenceJoint: 'foot.L' }
}

function pose(
  id: string,
  label: string,
  category: PoseCategory,
  joints: Partial<Record<SemanticJoint, DevelopmentJointTransform>> = {},
  rootRotationRadians?: Vec3,
): PoseDefinition {
  const bones = Object.fromEntries(
    Object.entries(joints).map(([joint, transform]) => [joint, {
      ...(transform.rotationRadians ? { rotationQuaternion: quaternionFromEuler(transform.rotationRadians) } : {}),
      ...(transform.position ? { positionOffset: transform.position } : {}),
    }]),
  ) as Partial<Record<SemanticJoint, PoseJointTransform>>
  return {
    id,
    label,
    category,
    rigProfile: 'humanoid-v1',
    status: 'production',
    bones,
    grounding: groundingFor(category),
    metadata: { source: 'semantic-production', calibrated: true },
    ...(rootRotationRadians ? { rootRotationQuaternion: quaternionFromEuler(rootRotationRadians) } : {}),
  }
}

export const POSE_LIBRARY: readonly PoseDefinition[] = [
  pose('standing-neutral', 'Standing Neutral', 'standing'),
  // Runtime production definitions are reconstructed from the Standing
  // Neutral semantic intent. These descriptors retain stable UI IDs while
  // avoiding a second legacy quaternion implementation.
  pose('standing-relaxed', 'Standing Relaxed', 'standing'),
  pose('standing-arms-crossed', 'Arms Crossed', 'standing'),
  pose('standing-hands-on-hips', 'Hands on Hips', 'standing'),
  pose('standing-weight-shift', 'Casual Weight Shift', 'standing'),
  pose('standing-attention', 'Attention', 'standing'),
  pose('sitting-neutral', 'Sitting Neutral', 'sitting', {
    hips: { rotationRadians: [0.02, 0, 0] },
    'upperLeg.L': { rotationRadians: [1.15, 0, 0] },
    'lowerLeg.L': { rotationRadians: [-1.25, 0, 0] },
    'upperLeg.R': { rotationRadians: [1.15, 0, 0] },
    'lowerLeg.R': { rotationRadians: [-1.25, 0, 0] },
  }),
  // Runtime production definitions are reconstructed from the Sitting
  // Neutral semantic intent. These descriptors retain the stable UI IDs and
  // category while avoiding a second legacy quaternion implementation.
  pose('sitting-relaxed', 'Sitting Relaxed', 'sitting'),
  pose('sitting-forward', 'Sitting Forward', 'sitting'),
  pose('sitting-back', 'Sitting Back', 'sitting'),
  pose('sitting-legs-crossed', 'Sitting Legs Crossed', 'sitting'),
  pose('sitting-stool', 'Sitting Stool', 'sitting'),
  pose('lying-supine', 'Lying Supine', 'lying', {
    hips: { rotationRadians: [0, 0, 1.55] },
    spine: { rotationRadians: [0, 0, 1.55] },
    chest: { rotationRadians: [0, 0, 1.55] },
    neck: { rotationRadians: [0, 0, 1.55] },
    head: { rotationRadians: [0, 0, 1.55] },
  }),
  pose('lying-prone', 'Lying Prone', 'lying'),
  pose('lying-left-side', 'Lying Left Side', 'lying'),
  pose('lying-right-side', 'Lying Right Side', 'lying'),
  pose('lying-reclined', 'Reclined', 'lying'),
  pose('lying-curled', 'Curled', 'lying'),
]

export function getPoseDefinition(poseId: string): PoseDefinition | undefined {
  return POSE_LIBRARY.find((poseDefinition) => poseDefinition.id === poseId)
}

export function serializePoseDefinition(pose: PoseDefinition): string {
  const bones = Object.fromEntries(
    Object.keys(pose.bones).sort().map((joint) => {
      const transform = pose.bones[joint as SemanticJoint]
      return [joint, {
        ...(transform?.rotationQuaternion ? { rotationQuaternion: transform.rotationQuaternion } : {}),
        ...(transform?.positionOffset ? { positionOffset: transform.positionOffset } : {}),
      }]
    }),
  )
  return `${JSON.stringify({ ...pose, bones }, null, 2)}\n`
}

export function posesForCategory(category: PoseCategory): readonly PoseDefinition[] {
  return POSE_LIBRARY.filter((poseDefinition) => poseDefinition.category === category)
}

export function poseCategoryLabel(category: PoseCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1)
}

export const DEFAULT_POSE_ID = 'standing-neutral'
