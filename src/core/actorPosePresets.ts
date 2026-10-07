import type { ActorJointName, ActorPose, ActorPosePreset, ActorVector3 } from './sceneDocument'

export type ActorPoseDefinition = {
  id: ActorPosePreset
  label: string
  pose: ActorPose
  /** Local visual offset applied below ActorRoot. The authored Actor position is unchanged. */
  rootOffsetY: number
  /** Local visual orientation applied below ActorRoot. The authored Actor rotation is unchanged. */
  bodyRotation: ActorVector3
}

const zero: ActorVector3 = [0, 0, 0]

const standing: ActorPose = {
  pelvis: [...zero], torso: [...zero], head: [...zero],
  leftShoulder: [0, 0, -0.12], leftElbow: [0, 0, 0.08],
  rightShoulder: [0, 0, 0.12], rightElbow: [0, 0, -0.08],
  leftHip: [...zero], leftKnee: [...zero], rightHip: [...zero], rightKnee: [...zero],
}

function pose(overrides: Partial<ActorPose>): ActorPose {
  return {
    ...clonePose(standing),
    ...overrides,
  }
}

const definitions: Record<ActorPosePreset, ActorPoseDefinition> = {
  standing: { id: 'standing', label: 'Standing', pose: standing, rootOffsetY: 0, bodyRotation: [...zero] },
  relaxed: {
    id: 'relaxed', label: 'Relaxed',
    pose: pose({ torso: [0.03, 0, -0.06], head: [0, 0, 0.04], leftShoulder: [0.05, 0, -0.24], rightShoulder: [-0.03, 0, 0.18], leftHip: [0.04, 0, -0.08], rightHip: [-0.05, 0, 0.06] }),
    rootOffsetY: 0, bodyRotation: [...zero],
  },
  walking: {
    id: 'walking', label: 'Walking',
    pose: pose({ torso: [-0.06, 0, 0], leftShoulder: [0.36, 0, -0.16], rightShoulder: [-0.42, 0, 0.18], leftHip: [-0.52, 0, 0], rightHip: [0.52, 0, 0], leftKnee: [0.14, 0, 0], rightKnee: [-0.14, 0, 0] }),
    rootOffsetY: 0, bodyRotation: [...zero],
  },
  sitting: {
    id: 'sitting', label: 'Sitting',
    pose: pose({ torso: [-0.08, 0, 0], leftHip: [1.22, 0, 0], rightHip: [1.22, 0, 0], leftKnee: [-1.22, 0, 0], rightKnee: [-1.22, 0, 0], leftShoulder: [0.14, 0, -0.18], rightShoulder: [0.14, 0, 0.18] }),
    rootOffsetY: -0.22, bodyRotation: [...zero],
  },
  kneeling: {
    id: 'kneeling', label: 'Kneeling',
    // Left knee rests below the pelvis; the right thigh reaches forward and the right shin returns to a planted foot.
    pose: pose({ torso: [-0.15, 0, 0], head: [0.05, 0, 0], leftHip: [0, 0, 0], rightHip: [1.42, 0, 0], leftKnee: [-1.55, 0, 0], rightKnee: [-1.42, 0, 0], leftShoulder: [0.14, 0, -0.22], rightShoulder: [0.14, 0, 0.22], leftElbow: [0.18, 0, 0.08], rightElbow: [0.18, 0, -0.08] }),
    rootOffsetY: -0.34, bodyRotation: [...zero],
  },
  crouching: {
    id: 'crouching', label: 'Crouching',
    pose: pose({ torso: [-0.45, 0, 0], head: [0.22, 0, 0], leftHip: [0.75, 0, 0], rightHip: [0.75, 0, 0], leftKnee: [0.75, 0, 0], rightKnee: [0.75, 0, 0], leftShoulder: [0.42, 0, -0.25], rightShoulder: [0.42, 0, 0.25], leftElbow: [0.34, 0, 0.08], rightElbow: [0.34, 0, -0.08] }),
    rootOffsetY: -0.4, bodyRotation: [...zero],
  },
  lying: {
    id: 'lying', label: 'Lying',
    pose: pose({ leftShoulder: [0.12, 0, -0.18], rightShoulder: [0.12, 0, 0.18], leftElbow: [0.08, 0, 0.12], rightElbow: [0.08, 0, -0.12] }),
    rootOffsetY: 0.16, bodyRotation: [Math.PI / 2, 0, 0],
  },
  reaching: {
    id: 'reaching', label: 'Reaching',
    pose: pose({ torso: [-0.12, 0, 0], rightShoulder: [0.82, 0, 0.42], rightElbow: [0.34, 0, -0.12], leftShoulder: [0.05, 0, -0.2] }),
    rootOffsetY: 0, bodyRotation: [...zero],
  },
  'arms-crossed': {
    id: 'arms-crossed', label: 'Arms Crossed',
    pose: pose({ leftShoulder: [0.28, 0, 0.82], rightShoulder: [0.28, 0, -0.82], leftElbow: [0.92, 0, 0.16], rightElbow: [0.92, 0, -0.16] }),
    rootOffsetY: 0, bodyRotation: [...zero],
  },
  'hands-on-hips': {
    id: 'hands-on-hips', label: 'Hands on Hips',
    pose: pose({ leftShoulder: [0.28, 0, -0.5], rightShoulder: [0.28, 0, 0.5], leftElbow: [0.9, 0, -0.08], rightElbow: [0.9, 0, 0.08] }),
    rootOffsetY: 0, bodyRotation: [...zero],
  },
}

export const ACTOR_POSE_PRESETS = Object.values(definitions)

export function normalizeActorPosePreset(value: unknown): ActorPosePreset {
  return typeof value === 'string' && value in definitions ? value as ActorPosePreset : 'standing'
}

export function isActorPosePreset(value: unknown): value is ActorPosePreset {
  return typeof value === 'string' && value in definitions
}

export function getActorPoseDefinition(value: unknown): ActorPoseDefinition {
  return definitions[normalizeActorPosePreset(value)]
}

export function createActorPoseForPreset(value: unknown): ActorPose {
  return clonePose(getActorPoseDefinition(value).pose)
}

export function clonePose(value: ActorPose): ActorPose {
  return Object.fromEntries(Object.entries(value).map(([key, rotation]) => [key, [...rotation]])) as ActorPose
}

export function isActorPose(value: unknown): value is ActorPose {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return (['pelvis', 'torso', 'head', 'leftShoulder', 'leftElbow', 'rightShoulder', 'rightElbow', 'leftHip', 'leftKnee', 'rightHip', 'rightKnee'] as ActorJointName[]).every((joint) => {
    const rotation = (value as Record<string, unknown>)[joint]
    return Array.isArray(rotation) && rotation.length === 3 && rotation.every((item) => typeof item === 'number' && Number.isFinite(item))
  })
}
