import type { PoseCategory } from '../domain/types'
import type { LyingSupportFrame, PoseGrounding } from '../characters/poseLibrary'
import type { SemanticJoint } from '../characters/rigProfiles'

export type AnatomicalRotationIntent = {
  flexionDeg?: number
  extensionDeg?: number
  abductionDeg?: number
  adductionDeg?: number
  twistDeg?: number
  pitchDeg?: number
  sideBendDeg?: number
  yawDeg?: number
  rollDeg?: number
}

export type AnatomicalDirectionIntent = {
  characterRight: number
  characterUp: number
  characterForward: number
}

export type AnatomicalJointIntent = {
  rotation?: AnatomicalRotationIntent
  targetDirection?: AnatomicalDirectionIntent
  targetFrame?: 'character-rest'
}

export type AnatomicalPoseIntent = {
  id: string
  label: string
  category: PoseCategory
  joints: Partial<Record<SemanticJoint, AnatomicalJointIntent>>
  contact: 'feet' | 'seat' | 'back'
  rootRotation?: {
    axis: 'characterRight' | 'characterUp' | 'characterForward'
    degrees: number
  }
}

export type AnatomicalPoseVariantIntent = {
  id: string
  label: string
  category: PoseCategory
  basePoseId: string
  joints: Partial<Record<SemanticJoint, AnatomicalJointIntent>>
  groundingReferenceHeightDelta?: number
  releaseFeet?: boolean
  supportFrame?: LyingSupportFrame
  rootRotation?: AnatomicalPoseIntent['rootRotation']
}

export function referencePoseIntents(): readonly AnatomicalPoseIntent[] {
  return [
    {
      id: 'standing-neutral',
      label: 'Standing Neutral',
      category: 'standing',
      contact: 'feet',
      joints: {
        spine: { rotation: { flexionDeg: 2, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: -1, yawDeg: 0, rollDeg: 0 } },
        'upperArm.L': { targetDirection: { characterRight: -0.25, characterUp: -0.96, characterForward: 0.04 } },
        'lowerArm.L': { targetDirection: { characterRight: -0.16, characterUp: -0.38, characterForward: 0.91 } },
        'upperArm.R': { targetDirection: { characterRight: 0.25, characterUp: -0.96, characterForward: 0.04 } },
        'lowerArm.R': { targetDirection: { characterRight: 0.16, characterUp: -0.38, characterForward: 0.91 } },
      },
    },
    {
      id: 'sitting-neutral',
      label: 'Sitting Neutral',
      category: 'sitting',
      contact: 'seat',
      joints: {
        spine: { rotation: { flexionDeg: 1, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: -1, yawDeg: 0, rollDeg: 0 } },
        // The clavicle establishes the socket position; the humerus establishes
        // the arm direction. Keeping the clavicle in its diagnosed rest frame
        // prevents the shoulder girdle from collapsing toward the chest.
        'shoulder.L': { targetFrame: 'character-rest' },
        'upperArm.L': { targetDirection: { characterRight: -0.28, characterUp: -0.96, characterForward: 0.02 } },
        'lowerArm.L': { targetDirection: { characterRight: -0.08, characterUp: -0.32, characterForward: 0.94 } },
        'shoulder.R': { targetFrame: 'character-rest' },
        'upperArm.R': { targetDirection: { characterRight: 0.28, characterUp: -0.96, characterForward: 0.02 } },
        'lowerArm.R': { targetDirection: { characterRight: 0.08, characterUp: -0.32, characterForward: 0.94 } },
        'upperLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.24, characterForward: 0.97 } },
        'lowerLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.97, characterForward: -0.24 } },
        'foot.L': { targetFrame: 'character-rest' },
        'upperLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.24, characterForward: 0.97 } },
        'lowerLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.97, characterForward: -0.24 } },
        'foot.R': { targetFrame: 'character-rest' },
      },
    },
    {
      id: 'lying-supine',
      label: 'Lying Supine',
      category: 'lying',
      contact: 'back',
      rootRotation: { axis: 'characterRight', degrees: 90 },
      joints: {
        // Keep the head and neck in the diagnosed neutral frame while the
        // body is rotated supine; this prevents a future pose edit from
        // introducing a visible lateral head tilt.
        neck: { targetFrame: 'character-rest' },
        head: { targetFrame: 'character-rest' },
        'shoulder.L': { targetFrame: 'character-rest' },
        'upperArm.L': { targetDirection: { characterRight: -0.24, characterUp: -0.97, characterForward: 0.05 } },
        'lowerArm.L': { targetDirection: { characterRight: -0.34, characterUp: -0.94, characterForward: 0.05 } },
        'shoulder.R': { targetFrame: 'character-rest' },
        'upperArm.R': { targetDirection: { characterRight: 0.24, characterUp: -0.97, characterForward: 0.05 } },
        'lowerArm.R': { targetDirection: { characterRight: 0.34, characterUp: -0.94, characterForward: 0.05 } },
        'upperLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.995, characterForward: 0.05 } },
        'lowerLeg.L': { targetDirection: { characterRight: 0, characterUp: -1, characterForward: 0 } },
        'upperLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.995, characterForward: 0.05 } },
        'lowerLeg.R': { targetDirection: { characterRight: 0, characterUp: -1, characterForward: 0 } },
      },
    },
  ]
}

/**
 * Batch A production Sitting variants. These are intentionally sparse: the
 * accepted Sitting Neutral intent supplies the pelvis, leg, seat, and baseline
 * arm relationship, while each variant only describes its visual difference.
 */
export function sittingPoseVariantIntents(): readonly AnatomicalPoseVariantIntent[] {
  return [
    {
      id: 'sitting-relaxed',
      label: 'Sitting Relaxed',
      category: 'sitting',
      basePoseId: 'sitting-neutral',
      joints: {
        spine: { rotation: { flexionDeg: -10, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: -2, yawDeg: 0, rollDeg: 0 } },
        'upperArm.L': { targetDirection: { characterRight: -0.34, characterUp: -0.94, characterForward: 0.04 } },
        'upperArm.R': { targetDirection: { characterRight: 0.34, characterUp: -0.94, characterForward: 0.04 } },
      },
    },
    {
      id: 'sitting-forward',
      label: 'Sitting Forward',
      category: 'sitting',
      basePoseId: 'sitting-neutral',
      joints: {
        spine: { rotation: { flexionDeg: 18, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: -8, yawDeg: 0, rollDeg: 0 } },
        'upperArm.L': { targetDirection: { characterRight: -0.24, characterUp: -0.90, characterForward: 0.34 } },
        'lowerArm.L': { targetDirection: { characterRight: -0.12, characterUp: -0.25, characterForward: 0.96 } },
        'upperArm.R': { targetDirection: { characterRight: 0.24, characterUp: -0.90, characterForward: 0.34 } },
        'lowerArm.R': { targetDirection: { characterRight: 0.12, characterUp: -0.25, characterForward: 0.96 } },
      },
    },
    {
      id: 'sitting-back',
      label: 'Sitting Back',
      category: 'sitting',
      basePoseId: 'sitting-neutral',
      joints: {
        spine: { rotation: { flexionDeg: -16, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: 2, yawDeg: 0, rollDeg: 0 } },
        'upperArm.L': { targetDirection: { characterRight: -0.30, characterUp: -0.95, characterForward: -0.04 } },
        'upperArm.R': { targetDirection: { characterRight: 0.30, characterUp: -0.95, characterForward: -0.04 } },
      },
    },
    {
      id: 'sitting-legs-crossed',
      label: 'Sitting Legs Crossed',
      category: 'sitting',
      basePoseId: 'sitting-neutral',
      releaseFeet: true,
      joints: {
        'upperLeg.L': { targetDirection: { characterRight: 0.42, characterUp: -0.28, characterForward: 0.86 } },
        'lowerLeg.L': { targetDirection: { characterRight: 0.30, characterUp: -0.95, characterForward: 0.08 } },
        'upperLeg.R': { targetDirection: { characterRight: -0.42, characterUp: -0.28, characterForward: 0.86 } },
        'lowerLeg.R': { targetDirection: { characterRight: -0.30, characterUp: -0.95, characterForward: 0.08 } },
      },
    },
    {
      id: 'sitting-stool',
      label: 'Sitting Stool',
      category: 'sitting',
      basePoseId: 'sitting-neutral',
      groundingReferenceHeightDelta: 0.12,
      releaseFeet: true,
      joints: {
        'upperLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.18, characterForward: 0.98 } },
        'lowerLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.99, characterForward: -0.04 } },
        'upperLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.18, characterForward: 0.98 } },
        'lowerLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.99, characterForward: -0.04 } },
      },
    },
  ]
}

/**
 * Standing variants inherit the accepted Neutral body solve and describe only
 * the blocking intention that makes each silhouette distinct.
 */
export function standingPoseVariantIntents(): readonly AnatomicalPoseVariantIntent[] {
  return [
    {
      id: 'standing-relaxed',
      label: 'Standing Relaxed',
      category: 'standing',
      basePoseId: 'standing-neutral',
      joints: {
        spine: { rotation: { flexionDeg: -3, sideBendDeg: 2, twistDeg: 0 } },
        head: { rotation: { pitchDeg: -1, yawDeg: 0, rollDeg: 0 } },
        'upperArm.L': { targetDirection: { characterRight: -0.30, characterUp: -0.95, characterForward: 0.03 } },
        'lowerArm.L': { targetDirection: { characterRight: -0.20, characterUp: -0.40, characterForward: 0.89 } },
        'upperArm.R': { targetDirection: { characterRight: 0.27, characterUp: -0.96, characterForward: 0.03 } },
        'lowerArm.R': { targetDirection: { characterRight: 0.14, characterUp: -0.38, characterForward: 0.92 } },
      },
    },
    {
      id: 'standing-arms-crossed',
      label: 'Arms Crossed',
      category: 'standing',
      basePoseId: 'standing-neutral',
      joints: {
        'upperArm.L': { targetDirection: { characterRight: 0.28, characterUp: -0.70, characterForward: 0.66 } },
        'lowerArm.L': { targetDirection: { characterRight: 0.92, characterUp: -0.18, characterForward: 0.36 } },
        'upperArm.R': { targetDirection: { characterRight: -0.28, characterUp: -0.70, characterForward: 0.66 } },
        'lowerArm.R': { targetDirection: { characterRight: -0.92, characterUp: -0.18, characterForward: 0.36 } },
      },
    },
    {
      id: 'standing-hands-on-hips',
      label: 'Hands on Hips',
      category: 'standing',
      basePoseId: 'standing-neutral',
      joints: {
        'upperArm.L': { targetDirection: { characterRight: -0.48, characterUp: -0.82, characterForward: -0.20 } },
        'lowerArm.L': { targetDirection: { characterRight: 0.45, characterUp: -0.35, characterForward: 0.82 } },
        'upperArm.R': { targetDirection: { characterRight: 0.48, characterUp: -0.82, characterForward: -0.20 } },
        'lowerArm.R': { targetDirection: { characterRight: -0.45, characterUp: -0.35, characterForward: 0.82 } },
      },
    },
    {
      id: 'standing-weight-shift',
      label: 'Casual Weight Shift',
      category: 'standing',
      basePoseId: 'standing-neutral',
      joints: {
        hips: { rotation: { sideBendDeg: 5, twistDeg: -4 } },
        spine: { rotation: { sideBendDeg: -3, twistDeg: 2 } },
        'upperLeg.L': { rotation: { sideBendDeg: -4, flexionDeg: 1 } },
        'lowerLeg.L': { rotation: { flexionDeg: -2 } },
        'upperLeg.R': { rotation: { sideBendDeg: 7, flexionDeg: 5 } },
        'lowerLeg.R': { rotation: { flexionDeg: 8 } },
      },
    },
    {
      id: 'standing-attention',
      label: 'Attention',
      category: 'standing',
      basePoseId: 'standing-neutral',
      joints: {
        spine: { rotation: { flexionDeg: 0, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: 0, yawDeg: 0, rollDeg: 0 } },
        'upperArm.L': { targetDirection: { characterRight: -0.20, characterUp: -0.98, characterForward: 0.02 } },
        'lowerArm.L': { targetDirection: { characterRight: -0.12, characterUp: -0.40, characterForward: 0.91 } },
        'upperArm.R': { targetDirection: { characterRight: 0.20, characterUp: -0.98, characterForward: 0.02 } },
        'lowerArm.R': { targetDirection: { characterRight: 0.12, characterUp: -0.40, characterForward: 0.91 } },
      },
    },
  ]
}

const leftSideLyingJoints: Partial<Record<SemanticJoint, AnatomicalJointIntent>> = {
  spine: { rotation: { flexionDeg: 2, sideBendDeg: 0, twistDeg: 0 } },
  chest: { rotation: { flexionDeg: 2, sideBendDeg: 0, twistDeg: 0 } },
  neck: { targetFrame: 'character-rest' },
  head: { targetFrame: 'character-rest' },
  'shoulder.L': { targetFrame: 'character-rest' },
  'shoulder.R': { targetFrame: 'character-rest' },
  'upperArm.L': { targetDirection: { characterRight: -0.82, characterUp: -0.40, characterForward: 0.12 } },
  'lowerArm.L': { targetDirection: { characterRight: -0.82, characterUp: -0.25, characterForward: 0.48 } },
  'upperArm.R': { targetDirection: { characterRight: 0.32, characterUp: -0.78, characterForward: 0.16 } },
  'lowerArm.R': { targetDirection: { characterRight: 0.18, characterUp: -0.48, characterForward: 0.86 } },
  'upperLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.96, characterForward: 0.27 } },
  'lowerLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.88, characterForward: 0.48 } },
  'foot.L': { targetFrame: 'character-rest' },
  'upperLeg.R': { targetDirection: { characterRight: 0.10, characterUp: -0.94, characterForward: 0.31 } },
  'lowerLeg.R': { targetDirection: { characterRight: 0.10, characterUp: -0.84, characterForward: 0.54 } },
  'foot.R': { targetFrame: 'character-rest' },
}

function mirroredSideLyingJoints(source: Partial<Record<SemanticJoint, AnatomicalJointIntent>>): Partial<Record<SemanticJoint, AnatomicalJointIntent>> {
  const mirrored: Partial<Record<SemanticJoint, AnatomicalJointIntent>> = {}
  Object.entries(source).forEach(([joint, intent]) => {
    const mirroredJoint = joint.endsWith('.L')
      ? `${joint.slice(0, -2)}.R` as SemanticJoint
      : joint.endsWith('.R')
        ? `${joint.slice(0, -2)}.L` as SemanticJoint
        : joint as SemanticJoint
    const direction = intent.targetDirection
    mirrored[mirroredJoint] = direction
      ? { ...intent, targetDirection: { ...direction, characterRight: -direction.characterRight } }
      : { ...intent }
  })
  return mirrored
}

export function lyingPoseVariantIntents(): readonly AnatomicalPoseVariantIntent[] {
  const prone: AnatomicalPoseVariantIntent = {
    id: 'lying-prone',
    label: 'Lying Prone',
    category: 'lying',
    basePoseId: 'lying-supine',
    supportFrame: 'anterior',
    rootRotation: { axis: 'characterRight', degrees: -90 },
    joints: {
      spine: { rotation: { flexionDeg: 1, sideBendDeg: 0, twistDeg: 0 } },
      chest: { rotation: { flexionDeg: 1, sideBendDeg: 0, twistDeg: 0 } },
      neck: { targetFrame: 'character-rest' },
      head: { rotation: { pitchDeg: -1, yawDeg: 12, rollDeg: 0 } },
      'shoulder.L': { targetFrame: 'character-rest' },
      'shoulder.R': { targetFrame: 'character-rest' },
      'upperArm.L': { targetDirection: { characterRight: -0.24, characterUp: -0.96, characterForward: 0.08 } },
      'lowerArm.L': { targetDirection: { characterRight: -0.18, characterUp: -0.96, characterForward: 0.18 } },
      'upperArm.R': { targetDirection: { characterRight: 0.24, characterUp: -0.96, characterForward: 0.08 } },
      'lowerArm.R': { targetDirection: { characterRight: 0.18, characterUp: -0.96, characterForward: 0.18 } },
      'upperLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.995, characterForward: 0.08 } },
      'lowerLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.98, characterForward: 0.18 } },
      'foot.L': { targetFrame: 'character-rest' },
      'upperLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.995, characterForward: 0.08 } },
      'lowerLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.98, characterForward: 0.18 } },
      'foot.R': { targetFrame: 'character-rest' },
    },
  }
  const leftSide: AnatomicalPoseVariantIntent = {
    id: 'lying-left-side',
    label: 'Lying Left Side',
    category: 'lying',
    basePoseId: 'lying-supine',
    supportFrame: 'left-lateral',
    rootRotation: { axis: 'characterForward', degrees: -90 },
    joints: leftSideLyingJoints,
  }
  const rightSide: AnatomicalPoseVariantIntent = {
    id: 'lying-right-side',
    label: 'Lying Right Side',
    category: 'lying',
    basePoseId: 'lying-supine',
    supportFrame: 'right-lateral',
    rootRotation: { axis: 'characterForward', degrees: 90 },
    joints: mirroredSideLyingJoints(leftSideLyingJoints),
  }
  return [
    prone,
    leftSide,
    rightSide,
    {
      id: 'lying-reclined',
      label: 'Reclined',
      category: 'lying',
      basePoseId: 'lying-supine',
      supportFrame: 'posterior-inclined',
      rootRotation: { axis: 'characterRight', degrees: 62 },
      joints: {
        spine: { rotation: { flexionDeg: 8, sideBendDeg: 0, twistDeg: 0 } },
        chest: { rotation: { flexionDeg: 12, sideBendDeg: 0, twistDeg: 0 } },
        neck: { rotation: { flexionDeg: -4, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: -3, yawDeg: 0, rollDeg: 0 } },
        'shoulder.L': { targetFrame: 'character-rest' },
        'shoulder.R': { targetFrame: 'character-rest' },
        'upperArm.L': { targetDirection: { characterRight: -0.27, characterUp: -0.95, characterForward: 0.05 } },
        'lowerArm.L': { targetDirection: { characterRight: -0.20, characterUp: -0.94, characterForward: 0.20 } },
        'upperArm.R': { targetDirection: { characterRight: 0.27, characterUp: -0.95, characterForward: 0.05 } },
        'lowerArm.R': { targetDirection: { characterRight: 0.20, characterUp: -0.94, characterForward: 0.20 } },
        'upperLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.98, characterForward: 0.20 } },
        'lowerLeg.L': { targetDirection: { characterRight: 0, characterUp: -0.92, characterForward: 0.38 } },
        'foot.L': { targetFrame: 'character-rest' },
        'upperLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.98, characterForward: 0.20 } },
        'lowerLeg.R': { targetDirection: { characterRight: 0, characterUp: -0.92, characterForward: 0.38 } },
        'foot.R': { targetFrame: 'character-rest' },
      },
    },
    {
      id: 'lying-curled',
      label: 'Curled',
      category: 'lying',
      basePoseId: 'lying-supine',
      supportFrame: 'lateral',
      rootRotation: { axis: 'characterForward', degrees: -90 },
      joints: {
        spine: { rotation: { flexionDeg: 14, sideBendDeg: 0, twistDeg: 0 } },
        chest: { rotation: { flexionDeg: 18, sideBendDeg: 0, twistDeg: 0 } },
        neck: { rotation: { flexionDeg: -6, sideBendDeg: 0, twistDeg: 0 } },
        head: { rotation: { pitchDeg: -8, yawDeg: 12, rollDeg: 0 } },
        'shoulder.L': { targetFrame: 'character-rest' },
        'shoulder.R': { targetFrame: 'character-rest' },
        'upperArm.L': { targetDirection: { characterRight: 0.12, characterUp: -0.74, characterForward: 0.66 } },
        'lowerArm.L': { targetDirection: { characterRight: 0.18, characterUp: -0.48, characterForward: 0.86 } },
        'upperArm.R': { targetDirection: { characterRight: -0.20, characterUp: -0.80, characterForward: 0.56 } },
        'lowerArm.R': { targetDirection: { characterRight: -0.12, characterUp: -0.50, characterForward: 0.86 } },
        'upperLeg.L': { targetDirection: { characterRight: 0.06, characterUp: 0.55, characterForward: 0.80 } },
        'lowerLeg.L': { targetDirection: { characterRight: 0.04, characterUp: 0.35, characterForward: -0.94 } },
        'foot.L': { targetFrame: 'character-rest' },
        'upperLeg.R': { targetDirection: { characterRight: -0.06, characterUp: 0.55, characterForward: 0.80 } },
        'lowerLeg.R': { targetDirection: { characterRight: -0.04, characterUp: 0.35, characterForward: -0.94 } },
        'foot.R': { targetFrame: 'character-rest' },
      },
    },
  ]
}

export function productionPoseIntents(): readonly (AnatomicalPoseIntent | AnatomicalPoseVariantIntent)[] {
  const references = referencePoseIntents()
  const variants = [...standingPoseVariantIntents(), ...sittingPoseVariantIntents(), ...lyingPoseVariantIntents()].map((variant) => {
    const base = references.find((intent) => intent.id === variant.basePoseId)
    return {
      ...variant,
      joints: { ...(base?.joints ?? {}), ...variant.joints },
    }
  })
  return [...references, ...variants]
}

export function groundingTypeForIntent(intent: AnatomicalPoseIntent): PoseGrounding['type'] {
  return intent.contact
}
