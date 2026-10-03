import type { CharacterType } from '../domain/types'
import type { RigProfileId } from './characterRegistry'

export type SemanticJoint =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'shoulder.L'
  | 'upperArm.L'
  | 'lowerArm.L'
  | 'hand.L'
  | 'shoulder.R'
  | 'upperArm.R'
  | 'lowerArm.R'
  | 'hand.R'
  | 'upperLeg.L'
  | 'lowerLeg.L'
  | 'foot.L'
  | 'upperLeg.R'
  | 'lowerLeg.R'
  | 'foot.R'

export type RigProfile = {
  id: RigProfileId
  label: string
  jointNames: Record<SemanticJoint, readonly string[]>
  poseJointNames?: Partial<Record<SemanticJoint, readonly string[]>>
  supportBoneNames?: Partial<Record<'L' | 'R', readonly string[]>>
}

const humanoidNames = {
  hips: ['PELVIS_CENTRAL', 'Hips', 'hips', 'Pelvis', 'pelvis', 'mixamorigHips'],
  spine: ['BELLY', 'Spine', 'spine', 'Torso', 'mixamorigSpine'],
  chest: ['CHEST_CENTRAL', 'Chest', 'chest', 'Spine2', 'UpperChest', 'mixamorigSpine2'],
  neck: ['NECK', 'Neck', 'neck', 'mixamorigNeck'],
  head: ['HEAD', 'Head', 'head', 'mixamorigHead'],
  'shoulder.L': ['SHOULDERL', 'LeftShoulder', 'shoulder.L', 'Shoulder_L', 'mixamorigLeftShoulder'],
  'upperArm.L': ['ARML', 'LeftUpperArm', 'upperArm.L', 'UpperArm_L', 'mixamorigLeftArm'],
  'lowerArm.L': ['FOREARML', 'LeftForearm', 'lowerArm.L', 'Forearm_L', 'mixamorigLeftForeArm'],
  'hand.L': ['HAND_MAINL', 'LeftHand', 'hand.L', 'Hand_L', 'mixamorigLeftHand'],
  'shoulder.R': ['SHOULDERR', 'RightShoulder', 'shoulder.R', 'Shoulder_R', 'mixamorigRightShoulder'],
  'upperArm.R': ['ARMR', 'RightUpperArm', 'upperArm.R', 'UpperArm_R', 'mixamorigRightArm'],
  'lowerArm.R': ['FOREARMR', 'RightForearm', 'lowerArm.R', 'Forearm_R', 'mixamorigRightForeArm'],
  'hand.R': ['HAND_MAINR', 'RightHand', 'hand.R', 'Hand_R', 'mixamorigRightHand'],
  'upperLeg.L': ['THIGHL', 'LeftUpperLeg', 'upperLeg.L', 'Thigh_L', 'mixamorigLeftUpLeg'],
  'lowerLeg.L': ['CALFL', 'LeftLowerLeg', 'lowerLeg.L', 'Shin_L', 'mixamorigLeftLeg'],
  'foot.L': ['FOOTL', 'LeftFoot', 'foot.L', 'Foot_L', 'mixamorigLeftFoot'],
  'upperLeg.R': ['THIGHR', 'RightUpperLeg', 'upperLeg.R', 'Thigh_R', 'mixamorigRightUpLeg'],
  'lowerLeg.R': ['CALFR', 'RightLowerLeg', 'lowerLeg.R', 'Shin_R', 'mixamorigRightLeg'],
  'foot.R': ['FOOTR', 'RightFoot', 'foot.R', 'Foot_R', 'mixamorigRightFoot'],
} satisfies Record<SemanticJoint, readonly string[]>

export const RIG_PROFILES: Record<RigProfileId, RigProfile> = {
  'humanoid-v1': {
    id: 'humanoid-v1',
    label: 'ND Humanoid v1',
    jointNames: humanoidNames,
    // The authored rig inserts KNEE between THIGH and CALF. Drive that
    // intermediate joint for useful leg bending while retaining CALF as the
    // semantic lower-leg mapping above.
    poseJointNames: {
      'lowerLeg.L': ['KNEEL'],
      'lowerLeg.R': ['KNEER'],
    },
    supportBoneNames: {
      L: ['TOEL', 'LeftToeBase', 'Toe_L', 'mixamorigLeftToeBase'],
      R: ['TOER', 'RightToeBase', 'Toe_R', 'mixamorigRightToeBase'],
    },
  },
}

export function getRigProfile(id: RigProfileId): RigProfile {
  return RIG_PROFILES[id]
}

export function fallbackJointName(joint: SemanticJoint): string {
  const directNames: Partial<Record<SemanticJoint, string>> = {
    hips: 'Pelvis',
    spine: 'Torso',
    chest: 'Chest',
    neck: 'Neck',
    head: 'Head',
    'shoulder.L': 'LeftShoulder',
    'upperArm.L': 'LeftUpperArm',
    'lowerArm.L': 'LeftForearm',
    'hand.L': 'LeftHand',
    'shoulder.R': 'RightShoulder',
    'upperArm.R': 'RightUpperArm',
    'lowerArm.R': 'RightForearm',
    'hand.R': 'RightHand',
    'upperLeg.L': 'LeftUpperLeg',
    'lowerLeg.L': 'LeftLowerLeg',
    'foot.L': 'LeftFoot',
    'upperLeg.R': 'RightUpperLeg',
    'lowerLeg.R': 'RightLowerLeg',
    'foot.R': 'RightFoot',
  }
  return directNames[joint] ?? joint
}

export function characterTypeLabel(type: CharacterType): string {
  return type === 'female' ? 'Female' : 'Male'
}
