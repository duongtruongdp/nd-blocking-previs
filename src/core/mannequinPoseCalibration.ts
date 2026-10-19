import type { ActorPose, ActorPosePreset } from './sceneDocument'
import { clonePose } from './actorPosePresets'

/**
 * The Character fallback retains its historical pose table. These overrides
 * are only composed by the faceted Mannequin runtime, whose joint lengths and
 * local visual proportions differ from that older presentation model.
 */
const mannequinPoseOverrides: Partial<Record<ActorPosePreset, Partial<ActorPose>>> = {
  crouching: {
    // Hip flexion brings both knees forward; equal and opposite knee flexion
    // returns calves to vertical so both planted feet remain level.
    pelvis: [0.08, 0, 0],
    torso: [-0.22, 0, 0],
    head: [0.16, 0, 0],
    leftHip: [1.1, 0, 0],
    rightHip: [1.1, 0, 0],
    leftKnee: [-1.1, 0, 0],
    rightKnee: [-1.1, 0, 0],
    leftShoulder: [0.18, 0, -0.16],
    rightShoulder: [0.18, 0, 0.16],
    leftElbow: [0.16, 0, 0.06],
    rightElbow: [0.16, 0, -0.06],
  },
  'arms-crossed': {
    // Upper arms move forward and stay slightly lateral. Elbow flexion then
    // carries each forearm across the lower chest, with a restrained height
    // asymmetry that avoids coplanar forearms.
    leftShoulder: [0.36, 0, 0.3],
    rightShoulder: [0.32, 0, -0.3],
    leftElbow: [1.28, 0, 0.92],
    rightElbow: [1.38, 0, -0.86],
  },
}

export function resolveMannequinPose(preset: ActorPosePreset | undefined, source: ActorPose): ActorPose {
  const pose = clonePose(source)
  const overrides = preset ? mannequinPoseOverrides[preset] : undefined
  if (!overrides) return pose
  Object.entries(overrides).forEach(([joint, rotation]) => {
    pose[joint as keyof ActorPose] = [...rotation] as ActorPose[keyof ActorPose]
  })
  return pose
}

export function hasMannequinPoseCalibration(preset: ActorPosePreset | undefined): boolean {
  return Boolean(preset && mannequinPoseOverrides[preset])
}
