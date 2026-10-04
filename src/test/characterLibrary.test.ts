import { describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { applyActorPose, findSemanticJoint, hasRequiredSemanticJoints } from '../runtime/characterPose'
import type { ActorDocument } from '../domain/types'
import { CHARACTER_REGISTRY, getCharacterDefinition, resolveCharacterDefinition } from '../characters/characterRegistry'
import { DEFAULT_POSE_ID, getPoseDefinition, POSE_LIBRARY, posesForCategory, serializePoseDefinition } from '../characters/poseLibrary'
import { getRigProfile } from '../characters/rigProfiles'
import { attachCharacterInstance, computeBlockingBounds, updateActorRuntimeAppearance } from '../runtime/characterAssets'
import { anatomicalRotationToLocalOffset, auditPoseDefinition, diagnoseRig, mirrorPoseOffset, reconstructReferencePoses, validatePoseDefinition } from '../runtime/rigDiagnostics'
import { lyingPoseVariantIntents } from '../runtime/anatomicalPose'

async function loadProductionRig(asset: 'male-01' | 'female-01'): Promise<THREE.Object3D> {
  const data = await fs.readFile(new URL(`../../public/assets/characters/${asset}.glb`, import.meta.url))
  const array = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const loader = new GLTFLoader()
  const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => loader.parse(array, '', resolve, reject))
  return gltf.scene
}

describe('character and pose registries', () => {
  it('provides data-driven Male and Female character slots', () => {
    expect(CHARACTER_REGISTRY.map((character) => character.id)).toEqual(['male-01', 'female-01'])
    expect(getCharacterDefinition('male-01')?.type).toBe('male')
    expect(getCharacterDefinition('female-01')?.type).toBe('female')
    expect(getCharacterDefinition('male-01')?.assetPath).toBe('/assets/characters/male-01.glb')
    expect(getCharacterDefinition('female-01')?.assetPath).toBe('/assets/characters/female-01.glb')
    expect(getCharacterDefinition('missing-character')).toBeUndefined()
    expect(resolveCharacterDefinition('missing-character').id).toBe('male-01')
  })

  it('provides standing, sitting, and lying pose choices', () => {
    expect(POSE_LIBRARY.map((pose) => pose.id)).toEqual([
      'standing-neutral', 'standing-relaxed', 'standing-arms-crossed', 'standing-hands-on-hips', 'standing-weight-shift', 'standing-attention',
      'sitting-neutral', 'sitting-relaxed', 'sitting-forward', 'sitting-back', 'sitting-legs-crossed', 'sitting-stool',
      'lying-supine', 'lying-prone', 'lying-left-side', 'lying-right-side', 'lying-reclined', 'lying-curled',
    ])
    expect(getPoseDefinition(DEFAULT_POSE_ID)?.category).toBe('standing')
    expect(posesForCategory('standing').length).toBe(6)
    expect(posesForCategory('sitting').length).toBe(6)
    expect(posesForCategory('lying').length).toBe(6)
    expect(POSE_LIBRARY.every((pose) => pose.rigProfile === 'humanoid-v1')).toBe(true)
    expect(POSE_LIBRARY.every((pose) => pose.status === 'production')).toBe(true)
    expect(POSE_LIBRARY.every((pose) => pose.metadata.source === 'semantic-production')).toBe(true)
    expect(getPoseDefinition('standing-neutral')?.grounding.type).toBe('feet')
    expect(getPoseDefinition('sitting-neutral')?.grounding.type).toBe('seat')
    expect(getPoseDefinition('lying-supine')?.grounding.type).toBe('body')
    ;(['standing-relaxed', 'standing-arms-crossed', 'standing-hands-on-hips', 'standing-weight-shift', 'standing-attention', 'sitting-relaxed', 'sitting-forward', 'sitting-back', 'sitting-legs-crossed', 'sitting-stool', 'lying-prone', 'lying-left-side', 'lying-right-side', 'lying-reclined', 'lying-curled'] as const).forEach((poseId) => {
      expect(getPoseDefinition(poseId)?.bones).toEqual({})
    })
    const pose = POSE_LIBRARY.find((entry) => entry.id === 'standing-relaxed')!
    const reordered = { ...pose, bones: Object.fromEntries(Object.entries(pose.bones).reverse()) }
    expect(serializePoseDefinition(pose)).toBe(serializePoseDefinition(reordered))
    expect(getPoseDefinition('missing-pose')).toBeUndefined()
  })

  it('maps the production rig through semantic joints and preserves knee intermediates', () => {
    const profile = getRigProfile('humanoid-v1')
    expect(profile.jointNames.hips).toContain('PELVIS_CENTRAL')
    expect(profile.jointNames['upperArm.R']).toContain('ARMR')
    expect(profile.jointNames['lowerLeg.L']).toContain('CALFL')
    expect(profile.poseJointNames?.['lowerLeg.L']).toEqual(['KNEEL'])
    expect(profile.poseJointNames?.['lowerLeg.R']).toEqual(['KNEER'])
  })

  it('rejects a rig with invalid or missing semantic references', () => {
    const incomplete = new THREE.Group()
    incomplete.add(new THREE.Bone())
    expect(hasRequiredSemanticJoints(incomplete, 'humanoid-v1')).toBe(false)
  })

  it('extracts finite production diagnostics for both real GLBs', async () => {
    for (const asset of ['male-01', 'female-01'] as const) {
      const rig = await loadProductionRig(asset)
      const report = diagnoseRig(rig)
      expect(report.warnings).toEqual([])
      expect(report.joints.hips?.bone).toBe('PELVIS_CENTRAL')
      expect(report.joints['lowerLeg.L']?.bone).toBe('KNEEL')
      expect(report.characterAxes.forward[2]).toBeGreaterThan(0.9)
      expect(report.armFrames.map((frame) => frame.side)).toEqual(['L', 'R'])
      report.armFrames.forEach((frame) => {
        ;[
          frame.shoulderPositionCharacterSpace,
          frame.upperArmOriginCharacterSpace,
          frame.elbowPositionCharacterSpace,
          frame.wristPositionCharacterSpace,
        ].forEach((position) => expect(position.every(Number.isFinite)).toBe(true))
        ;[
          frame.upperArmDirectionCharacterSpace,
          frame.forearmDirectionCharacterSpace,
          frame.bendAxisCharacterSpace,
          frame.twistAxisCharacterSpace,
        ].forEach((axis) => {
          expect(axis.every(Number.isFinite)).toBe(true)
          expect(Math.hypot(...axis)).toBeCloseTo(1, 4)
        })
      })
      Object.values(report.joints).forEach((joint) => {
        if (!joint) return
        ;[
          joint.primaryDirectionCharacterSpace,
          joint.localAxesCharacterSpace.x,
          joint.localAxesCharacterSpace.y,
          joint.localAxesCharacterSpace.z,
        ].forEach((axis) => {
          expect(axis.every(Number.isFinite)).toBe(true)
          expect(Math.hypot(...axis)).toBeCloseTo(1, 4)
        })
      })
    }
  })

  it('derives deterministic symmetry and anatomical quaternion operations', async () => {
    const report = diagnoseRig(await loadProductionRig('male-01'))
    expect(Math.max(...report.symmetry.map((pair) => pair.positionMirrorError))).toBeLessThan(0.03)
    const localOffset = anatomicalRotationToLocalOffset(report, 'upperLeg.L', { flexionDeg: 90 })
    expect(localOffset).toBeDefined()
    expect(localOffset?.every(Number.isFinite)).toBe(true)
    expect(mirrorPoseOffset(report, 'upperArm.L', 'upperArm.R', localOffset!)).toEqual(
      mirrorPoseOffset(report, 'upperArm.L', 'upperArm.R', localOffset!),
    )
  })

  it('reconstructs the locked references and semantic Standing/Sitting variants', async () => {
    const rig = await loadProductionRig('female-01')
    const report = diagnoseRig(rig)
    const poses = reconstructReferencePoses(rig, report)
    expect(poses['standing-neutral'].status).toBe('production')
    expect(poses['sitting-neutral'].status).toBe('production')
    expect(poses['sitting-neutral'].grounding.type).toBe('seat')
    const sittingGrounding = poses['sitting-neutral'].grounding
    if (sittingGrounding.type !== 'seat') throw new Error('Expected sitting seat grounding')
    expect(sittingGrounding.secondaryContact).toMatchObject({ type: 'feet', referenceJoints: ['foot.L', 'foot.R'], floorHeight: 0 })
    expect(sittingGrounding.secondaryContact?.supportOffsets?.['foot.L']).toBeGreaterThan(0)
    expect(sittingGrounding.secondaryContact?.supportOffsets?.['foot.R']).toBeGreaterThan(0)
    expect(poses['lying-supine'].grounding.type).toBe('back')
    expect(poses['lying-supine'].rootRotationQuaternion).toBeDefined()
    expect(Object.keys(poses['sitting-neutral'].bones)).toContain('upperLeg.L')
    ;(['standing-relaxed', 'standing-arms-crossed', 'standing-hands-on-hips', 'standing-weight-shift', 'standing-attention'] as const).forEach((poseId) => {
      expect(poses[poseId].status).toBe('production')
      expect(poses[poseId].metadata.source).toBe('auto-diagnosed')
      expect(poses[poseId].grounding.type).toBe('feet')
    })
    ;(['sitting-relaxed', 'sitting-forward', 'sitting-back', 'sitting-legs-crossed', 'sitting-stool'] as const).forEach((poseId) => {
      expect(poses[poseId].status).toBe('production')
      expect(poses[poseId].metadata.source).toBe('auto-diagnosed')
      expect(poses[poseId].grounding.type).toBe('seat')
    })
    expect(poses['sitting-legs-crossed'].grounding.type === 'seat' ? poses['sitting-legs-crossed'].grounding.secondaryContact : undefined).toBeUndefined()
    expect(poses['sitting-stool'].grounding.type === 'seat' ? poses['sitting-stool'].grounding.secondaryContact : undefined).toBeUndefined()
    expect(poses['sitting-stool'].grounding.type === 'seat' ? poses['sitting-stool'].grounding.referenceHeight : 0)
      .toBeGreaterThan(poses['sitting-neutral'].grounding.type === 'seat' ? poses['sitting-neutral'].grounding.referenceHeight : 0)
    ;(['lying-prone', 'lying-left-side', 'lying-right-side', 'lying-reclined', 'lying-curled'] as const).forEach((poseId) => {
      expect(poses[poseId].status).toBe('production')
      expect(poses[poseId].metadata.source).toBe('auto-diagnosed')
      expect(poses[poseId].grounding.type).toBe('back')
      expect(poses[poseId].grounding.type === 'back' ? poses[poseId].grounding.supportFrame : undefined).toBeTruthy()
    })
  })

  it('keeps Left Side and Right Side as semantic mirrors', () => {
    const variants = lyingPoseVariantIntents()
    const left = variants.find((variant) => variant.id === 'lying-left-side')!
    const right = variants.find((variant) => variant.id === 'lying-right-side')!
    expect(left.supportFrame).toBe('left-lateral')
    expect(right.supportFrame).toBe('right-lateral')
    ;(['upperArm', 'lowerArm', 'upperLeg', 'lowerLeg'] as const).forEach((joint) => {
      const leftDirection = left.joints[`${joint}.L`]?.targetDirection
      const rightDirection = right.joints[`${joint}.R`]?.targetDirection
      expect(rightDirection?.characterRight).toBeCloseTo(-(leftDirection?.characterRight ?? 0), 5)
      expect(rightDirection?.characterUp).toBeCloseTo(leftDirection?.characterUp ?? 0, 5)
      expect(rightDirection?.characterForward).toBeCloseTo(leftDirection?.characterForward ?? 0, 5)
    })
  })

  it('solves and validates the complete pose inventory on Male and Female without NaN output', async () => {
    const actor: ActorDocument = {
      id: 'solver-actor',
      name: 'Solver Actor',
      character: { characterId: 'male-01' },
      appearance: { color: '#c6a574', heightM: 1.75, representation: 'person-proxy' },
      pose: { poseId: 'standing-neutral' },
      placement: { position: [0, 0, 0], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
    }

    let semanticPoseKeys: Record<string, string[]> | undefined
    for (const asset of ['male-01', 'female-01'] as const) {
      const rig = await loadProductionRig(asset)
      const report = diagnoseRig(rig)
      const poses = reconstructReferencePoses(rig, report)
      const currentPoseKeys = Object.fromEntries(Object.entries(poses).map(([poseId, pose]) => [poseId, Object.keys(pose.bones).sort()]))
      if (semanticPoseKeys) expect(currentPoseKeys).toEqual(semanticPoseKeys)
      else semanticPoseKeys = currentPoseKeys
      applyActorPose(rig, { ...actor, character: { characterId: asset } }, 'humanoid-v1', poses['standing-neutral'])
      for (const pose of Object.values(poses)) {
        Object.values(pose.bones).forEach((transform) => {
          expect(transform?.rotationQuaternion?.every(Number.isFinite)).toBe(true)
        })
        const validation = validatePoseDefinition(rig, { ...actor, character: { characterId: asset } }, pose)
        expect(validation.valid, `${asset} ${pose.id}: ${validation.warnings.join(', ')}`).toBe(true)
        if (pose.id === 'standing-neutral') {
          expect(validation.metrics.leftElbowLateral).toBeGreaterThan(0)
          expect(validation.metrics.rightElbowLateral).toBeGreaterThan(0)
          expect(validation.metrics.leftUpperArmMidpointLateral).toBeGreaterThan(0)
          expect(validation.metrics.rightUpperArmMidpointLateral).toBeGreaterThan(0)
          expect(validation.metrics.armTorsoPenetration).toBe(0)
          expect(validation.metrics.armLateralSymmetryError).toBeLessThan(validation.metrics.shoulderWidth * 0.5)
          expect(validation.metrics.elbowLateralSymmetryError).toBeLessThan(validation.metrics.shoulderWidth * 0.5)
        }
        if (pose.id === 'sitting-neutral') {
          expect(validation.metrics.kneeForwardDisplacement).toBeGreaterThan(0.08)
          expect(validation.metrics.footFloorDistance).toBeLessThan(0.12)
          expect(validation.metrics.torsoVerticality).toBeGreaterThan(0.7)
          expect(validation.metrics.legSideSeparation).toBeGreaterThan(0.03)
          expect(pose.grounding.type).toBe('seat')
          expect(pose.grounding.type === 'seat' ? pose.grounding.secondaryContact?.type : undefined).toBe('feet')
          expect(validation.metrics.hipFlexionL).toBeGreaterThan(75)
          expect(validation.metrics.hipFlexionR).toBeGreaterThan(75)
          expect(validation.metrics.kneeFlexionL).toBeGreaterThan(75)
          expect(validation.metrics.kneeFlexionR).toBeGreaterThan(75)
          expect(validation.metrics.preContactHeightRatio).toBeLessThan(0.95)
          expect(validation.metrics.torsoVerticality).toBeGreaterThan(0.7)
          expect(validation.metrics.shoulderWidthRatio).toBeCloseTo(1, 3)
          expect(validation.metrics.minimumArmToTorsoClearance).toBeGreaterThan(0.04)
          expect(validation.metrics.upperArmLengthRatioL).toBeCloseTo(1, 3)
          expect(validation.metrics.upperArmLengthRatioR).toBeCloseTo(1, 3)
          expect(validation.metrics.forearmLengthRatioL).toBeCloseTo(1, 3)
          expect(validation.metrics.forearmLengthRatioR).toBeCloseTo(1, 3)
          expect(validation.metrics.upperArmDropL).toBeGreaterThan(0.55)
          expect(validation.metrics.upperArmDropR).toBeGreaterThan(0.55)
          expect(validation.metrics.elbowDistanceFromCenterlineL).toBeGreaterThan(validation.metrics.shoulderDistanceFromCenterlineL)
          expect(validation.metrics.elbowDistanceFromCenterlineR).toBeGreaterThan(validation.metrics.shoulderDistanceFromCenterlineR)
        }
        if (pose.id === 'standing-arms-crossed') {
          expect(validation.metrics.crossedForearmOverlap).toBeGreaterThan(0.025)
          expect(validation.metrics.crossedForearmForwardDistance).toBeGreaterThan(0.02)
        }
        if (pose.id === 'standing-hands-on-hips') {
          expect(validation.metrics.leftHandToHipDistance).toBeLessThan(0.55)
          expect(validation.metrics.rightHandToHipDistance).toBeLessThan(0.55)
          expect(validation.metrics.handsOnHipsOutward).toBeGreaterThan(0.08)
        }
        if (pose.id === 'standing-weight-shift') {
          expect(validation.metrics.weightShiftAsymmetry).toBeGreaterThan(0.08)
        }
        if (pose.id === 'sitting-legs-crossed') {
          expect(validation.metrics.legCrossingOverlap).toBeGreaterThan(0.025)
        }
        if (pose.id === 'lying-prone') {
          expect(validation.metrics.supportOrientationAlignment).toBeGreaterThan(0.55)
          expect(validation.metrics.headSupportClearance).toBeGreaterThan(0.02)
        }
        if (pose.id === 'lying-left-side' || pose.id === 'lying-right-side') {
          expect(validation.metrics.supportOrientationAlignment).toBeGreaterThan(0.55)
          expect(validation.metrics.shoulderStacking).toBeGreaterThan(0.55)
        }
        if (pose.id === 'lying-reclined') {
          expect(validation.metrics.torsoElevation).toBeGreaterThan(0.2)
          expect(validation.metrics.torsoElevation).toBeLessThan(0.8)
        }
        if (pose.id === 'lying-curled') {
          expect(validation.metrics.curledHipFlexion).toBeGreaterThan(25)
          expect(validation.metrics.curledKneeFlexion).toBeGreaterThan(45)
          expect(validation.metrics.curledCompactness).toBeLessThan(0.9)
        }
        if (pose.id === 'lying-supine') {
          const audit = auditPoseDefinition(rig, { ...actor, character: { characterId: asset } }, pose)
          const upperArm = audit.find((entry) => entry.semanticJoint === 'upperArm.L')
          const lowerArm = audit.find((entry) => entry.semanticJoint === 'lowerArm.L')
          const upperVector = new THREE.Vector3(...(upperArm?.shoulderToElbowVector ?? [0, 0, 0])).normalize()
          const forearmVector = new THREE.Vector3(...(lowerArm?.elbowToWristVector ?? [0, 0, 0])).normalize()
          const elbowBendDegrees = THREE.MathUtils.radToDeg(upperVector.angleTo(forearmVector))
          expect(elbowBendDegrees).toBeGreaterThan(4)
          expect(elbowBendDegrees).toBeLessThan(12)
          expect(validation.metrics.bodyLongitudinalHorizontal).toBeGreaterThan(0.65)
          expect(validation.metrics.chestFrontUp).toBeGreaterThan(0.65)
          expect(validation.metrics.backContactDistance).toBeLessThan(0.12)
          expect(pose.grounding.type).toBe('back')
          expect(validation.metrics.preContactHeightRatio).toBeLessThan(0.7)
          expect(validation.metrics.preContactHorizontalLengthRatio).toBeGreaterThan(0.75)
          expect(validation.metrics.pelvisChestHorizontal).toBeGreaterThan(0.65)
          expect(validation.metrics.chestHeadHorizontal).toBeGreaterThan(0.65)
          expect(validation.metrics.hipKneeHorizontal).toBeGreaterThan(0.65)
          expect(validation.metrics.kneeAnkleHorizontal).toBeGreaterThan(0.65)
          expect(validation.metrics.shoulderWidthRatio).toBeCloseTo(1, 3)
          expect(validation.metrics.minimumArmToTorsoClearance).toBeGreaterThan(0.04)
          expect(validation.metrics.shoulderElbowOutwardL).toBeGreaterThan(0.1)
          expect(validation.metrics.shoulderElbowOutwardR).toBeGreaterThan(0.1)
          expect(validation.metrics.shoulderElbowTowardFeetL).toBeGreaterThan(0.15)
          expect(validation.metrics.shoulderElbowTowardFeetR).toBeGreaterThan(0.15)
          expect(validation.metrics.elbowWristTowardFeetL).toBeGreaterThan(0.15)
          expect(validation.metrics.elbowWristTowardFeetR).toBeGreaterThan(0.15)
          expect(validation.metrics.elbowDistanceFromCenterlineL).toBeGreaterThan(validation.metrics.socketDistanceFromCenterlineL)
          expect(validation.metrics.elbowDistanceFromCenterlineR).toBeGreaterThan(validation.metrics.socketDistanceFromCenterlineR)
          expect(validation.metrics.wristDistanceFromCenterlineL).toBeGreaterThan(validation.metrics.elbowDistanceFromCenterlineL)
          expect(validation.metrics.wristDistanceFromCenterlineR).toBeGreaterThan(validation.metrics.elbowDistanceFromCenterlineR)
          expect(validation.metrics.armLateralSymmetryError).toBeLessThan(0.01)
          expect(validation.metrics.elbowLateralSymmetryError).toBeLessThan(0.01)
          expect(validation.metrics.wristLateralSymmetryError).toBeLessThan(0.01)
        }
      }
    }
  })

  it('keeps contact solving inside the character model and leaves authored pose data unchanged', async () => {
    const rig = await loadProductionRig('male-01')
    const actorRoot = new THREE.Group()
    actorRoot.position.set(2, 0, -3)
    actorRoot.rotation.y = 0.7
    actorRoot.scale.setScalar(1.1)
    const actor: ActorDocument = {
      id: 'contact-actor',
      name: 'Contact Actor',
      character: { characterId: 'male-01' },
      appearance: { color: '#c6a574', heightM: 1.75, representation: 'person-proxy' },
      pose: { poseId: 'sitting-neutral' },
      placement: { position: [2, 0, -3], rotation: { order: 'XYZ', radians: [0, 0.7, 0] } },
    }
    const rootPosition = actorRoot.position.clone()
    const rootRotation = actorRoot.rotation.clone()
    const rootScale = actorRoot.scale.clone()
    const authored = serializePoseDefinition(getPoseDefinition('sitting-neutral')!)

    attachCharacterInstance(actorRoot, rig, actor, 1.75)
    const sittingModel = actorRoot.getObjectByName('CharacterModel')!
    const runtimeValidation = sittingModel.userData.poseValidation as Array<{ poseId: string; valid: boolean; metrics: Record<string, number> }>
    expect(runtimeValidation).toHaveLength(18)
    expect(runtimeValidation.every((report) => report.valid)).toBe(true)
    expect(runtimeValidation.find((report) => report.poseId === 'lying-supine')?.metrics.preContactHorizontalLengthRatio).toBeGreaterThan(0.75)
    ;(['standing-relaxed', 'standing-arms-crossed', 'standing-hands-on-hips', 'standing-weight-shift', 'standing-attention', 'sitting-relaxed', 'sitting-forward', 'sitting-back', 'sitting-legs-crossed', 'sitting-stool', 'lying-prone', 'lying-left-side', 'lying-right-side', 'lying-reclined', 'lying-curled'] as const).forEach((poseId) => {
      expect(runtimeValidation.find((report) => report.poseId === poseId)?.valid).toBe(true)
    })
    const sittingHips = sittingModel.getObjectByName('PELVIS_CENTRAL')!.getWorldPosition(new THREE.Vector3())
    const sittingFootL = sittingModel.getObjectByName('FOOTL')!.getWorldPosition(new THREE.Vector3())
    const sittingFootR = sittingModel.getObjectByName('FOOTR')!.getWorldPosition(new THREE.Vector3())
    const actorScaleY = actorRoot.getWorldScale(new THREE.Vector3()).y
    const resolvedSeatHeight = sittingModel.userData.resolvedSeatHeight as number
    expect(sittingModel.userData.poseContactType).toBe('seat')
    expect(resolvedSeatHeight).toBeGreaterThan(0.2)
    expect(sittingHips.y / actorScaleY).toBeCloseTo(resolvedSeatHeight, 2)
    const sittingPose = (sittingModel.userData.reconstructedPoses as Record<string, typeof POSE_LIBRARY[number]>)['sitting-neutral']
    const leftSupportOffset = sittingPose.grounding.type === 'seat' ? (sittingPose.grounding.secondaryContact?.supportOffsets?.['foot.L'] ?? 0) : 0
    const rightSupportOffset = sittingPose.grounding.type === 'seat' ? (sittingPose.grounding.secondaryContact?.supportOffsets?.['foot.R'] ?? 0) : 0
    expect(sittingFootL.y / actorScaleY).toBeCloseTo(leftSupportOffset, 1)
    expect(sittingFootR.y / actorScaleY).toBeCloseTo(rightSupportOffset, 1)
    const blockingSittingBounds = computeBlockingBounds(actorRoot)
    expect(blockingSittingBounds.min.y).toBeCloseTo(0, 2)
    const sittingRotationSnapshot = ['PELVIS_CENTRAL', 'BELLY', 'CHEST_CENTRAL', 'THIGHL', 'CALFL', 'FOOTL', 'THIGHR', 'CALFR', 'FOOTR']
      .map((name) => [name, sittingModel.getObjectByName(name)?.quaternion.clone()] as const)
    updateActorRuntimeAppearance(actorRoot, actor)
    sittingRotationSnapshot.forEach(([name, quaternion]) => {
      const current = sittingModel.getObjectByName(name)?.quaternion
      if (quaternion && current) expect(current.angleTo(quaternion)).toBeCloseTo(0, 3)
    })
    actor.pose = { poseId: 'lying-supine' }
    updateActorRuntimeAppearance(actorRoot, actor)
    const contactModel = actorRoot.getObjectByName('CharacterModel')!
    expect(contactModel.userData.poseContactType).toBe('back')
    expect(computeBlockingBounds(actorRoot).min.y).toBeCloseTo(0, 2)

    expect(actorRoot.position.toArray()).toEqual(rootPosition.toArray())
    expect(actorRoot.rotation.toArray()).toEqual(rootRotation.toArray())
    expect(actorRoot.scale.toArray()).toEqual(rootScale.toArray())
    expect(serializePoseDefinition(getPoseDefinition('sitting-neutral')!)).toBe(authored)
  })

  it('audits the solved semantic skeleton for both production characters', async () => {
    const actor: ActorDocument = {
      id: 'audit-actor',
      name: 'Audit Actor',
      character: { characterId: 'male-01' },
      appearance: { color: '#c6a574', heightM: 1.75, representation: 'person-proxy' },
      pose: { poseId: 'standing-neutral' },
      placement: { position: [0, 0, 0], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
    }
    const auditedJoints = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulder.L', 'upperArm.L', 'lowerArm.L', 'hand.L', 'shoulder.R', 'upperArm.R', 'lowerArm.R', 'hand.R', 'upperLeg.L', 'lowerLeg.L', 'foot.L', 'upperLeg.R', 'lowerLeg.R', 'foot.R'] as const
    for (const asset of ['male-01', 'female-01'] as const) {
      const rig = await loadProductionRig(asset)
      const report = diagnoseRig(rig)
      const poses = reconstructReferencePoses(rig, report)
      for (const poseId of ['sitting-neutral', 'lying-supine'] as const) {
        const audit = auditPoseDefinition(rig, { ...actor, character: { characterId: asset } }, poses[poseId])
        const byJoint = new Map(audit.map((entry) => [entry.semanticJoint, entry]))
        auditedJoints.forEach((joint) => {
          const entry = byJoint.get(joint)
          expect(entry?.actualBone, `${asset} ${poseId} ${joint}`).toBeTruthy()
          expect(entry?.restWorldPosition?.every(Number.isFinite)).toBe(true)
          expect(entry?.posedWorldPosition?.every(Number.isFinite)).toBe(true)
          expect(entry?.restWorldDirection?.every(Number.isFinite)).toBe(true)
          expect(entry?.posedWorldDirection?.every(Number.isFinite)).toBe(true)
          expect(entry?.restLocalPosition?.every(Number.isFinite)).toBe(true)
          expect(entry?.restLocalQuaternion?.every(Number.isFinite)).toBe(true)
          expect(entry?.primaryBoneAxis?.every(Number.isFinite)).toBe(true)
          if (joint.includes('Arm') || joint.includes('shoulder') || joint.includes('hand')) {
            expect(entry?.bendAxis?.every(Number.isFinite)).toBe(true)
            expect(entry?.twistAxis?.every(Number.isFinite)).toBe(true)
          }
          expect(entry?.childDirection?.every(Number.isFinite)).toBe(true)
          expect(Number.isFinite(entry?.distanceFromCenterline ?? NaN)).toBe(true)
          expect(Number.isFinite(entry?.distanceFromTorso ?? NaN)).toBe(true)
          if (joint === 'upperArm.L' || joint === 'upperArm.R') expect(entry?.shoulderToElbowVector?.every(Number.isFinite)).toBe(true)
          if (joint === 'lowerArm.L' || joint === 'lowerArm.R') expect(entry?.elbowToWristVector?.every(Number.isFinite)).toBe(true)
        })
      }
    }
  })

  it('keeps accepted Standing and Sitting references unchanged while locking Lying for both rigs', async () => {
    const actor: ActorDocument = {
      id: 'locked-reference-actor',
      name: 'Locked Reference Actor',
      character: { characterId: 'male-01' },
      appearance: { color: '#c6a574', heightM: 1.75, representation: 'person-proxy' },
      pose: { poseId: 'standing-neutral' },
      placement: { position: [0, 0, 0], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
    }
    const trackedJoints = ['hips', 'chest', 'head', 'shoulder.L', 'upperArm.L', 'lowerArm.L', 'hand.L', 'shoulder.R', 'upperArm.R', 'lowerArm.R', 'hand.R', 'upperLeg.L', 'lowerLeg.L', 'foot.L', 'upperLeg.R', 'lowerLeg.R', 'foot.R'] as const
    const snapshot = (rig: THREE.Object3D): number[][] => trackedJoints.map((joint) => {
      const object = findSemanticJoint(rig, joint, 'humanoid-v1')
      return object?.getWorldPosition(new THREE.Vector3()).toArray() ?? []
    })
    for (const asset of ['male-01', 'female-01'] as const) {
      const rig = await loadProductionRig(asset)
      const report = diagnoseRig(rig)
      const poses = reconstructReferencePoses(rig, report)
      const assetActor = { ...actor, character: { characterId: asset } }
      applyActorPose(rig, assetActor, 'humanoid-v1', poses['standing-neutral'])
      const standingBefore = snapshot(rig)
      applyActorPose(rig, assetActor, 'humanoid-v1', poses['sitting-neutral'])
      const sittingBefore = snapshot(rig)
      applyActorPose(rig, assetActor, 'humanoid-v1', poses['lying-supine'])
      expect(validatePoseDefinition(rig, assetActor, poses['lying-supine']).valid).toBe(true)
      applyActorPose(rig, assetActor, 'humanoid-v1', poses['standing-neutral'])
      expect(snapshot(rig)).toEqual(standingBefore)
      applyActorPose(rig, assetActor, 'humanoid-v1', poses['sitting-neutral'])
      expect(snapshot(rig)).toEqual(sittingBefore)
    }
  })

  it('switches Male and Female assets while Lying without invalidating the reference', async () => {
    const actorRoot = new THREE.Group()
    const baseActor: ActorDocument = {
      id: 'lying-asset-switch-actor',
      name: 'Lying Asset Switch Actor',
      character: { characterId: 'male-01' },
      appearance: { color: '#c6a574', heightM: 1.75, representation: 'person-proxy' },
      pose: { poseId: 'lying-supine' },
      placement: { position: [0, 0, 0], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
    }
    for (const asset of ['male-01', 'female-01'] as const) {
      const rig = await loadProductionRig(asset)
      attachCharacterInstance(actorRoot, rig, { ...baseActor, character: { characterId: asset } }, 1.75)
      const model = actorRoot.getObjectByName('CharacterModel')!
      const validation = model.userData.poseValidation as Array<{ poseId: string; valid: boolean; metrics: Record<string, number> }>
      expect(validation.find((report) => report.poseId === 'lying-supine')?.valid).toBe(true)
      expect(validation.find((report) => report.poseId === 'lying-supine')?.metrics.preContactHorizontalLengthRatio).toBeGreaterThan(0.75)
    }
  })

  it('keeps reconstructed pose switching non-cumulative and reports structural validation', async () => {
    const rig = await loadProductionRig('male-01')
    const report = diagnoseRig(rig)
    const poses = reconstructReferencePoses(rig, report)
    const actor: ActorDocument = {
      id: 'diagnostic-actor',
      name: 'Diagnostic Actor',
      character: { characterId: 'male-01' },
      appearance: { color: '#c6a574', heightM: 1.75, representation: 'person-proxy' },
      pose: { poseId: 'standing-neutral' },
      placement: { position: [0, 0, 0], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
    }
    applyActorPose(rig, actor, 'humanoid-v1', poses['standing-neutral'])
    const standing = rig.getObjectByName('HEAD')?.quaternion.clone()
    const standingArms = ['ARML', 'FOREARML', 'HAND_MAINL', 'ARMR', 'FOREARMR', 'HAND_MAINR']
      .map((name) => rig.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray())
    applyActorPose(rig, actor, 'humanoid-v1', poses['sitting-neutral'])
    applyActorPose(rig, actor, 'humanoid-v1', poses['lying-supine'])
    applyActorPose(rig, actor, 'humanoid-v1', poses['standing-neutral'])
    expect(rig.getObjectByName('HEAD')?.quaternion.angleTo(standing!)).toBeCloseTo(0, 3)
    const standingArmsAgain = ['ARML', 'FOREARML', 'HAND_MAINL', 'ARMR', 'FOREARMR', 'HAND_MAINR']
      .map((name) => rig.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray())
    expect(standingArmsAgain).toEqual(standingArms)
    const transitions = [
      ['standing-neutral', 'lying-supine'],
      ['sitting-neutral', 'lying-supine'],
      ['lying-supine', 'standing-neutral'],
      ['lying-supine', 'sitting-neutral'],
      ['sitting-neutral', 'standing-neutral'],
      ['sitting-neutral', 'sitting-relaxed'],
      ['sitting-relaxed', 'sitting-forward'],
      ['sitting-forward', 'sitting-back'],
      ['sitting-back', 'sitting-neutral'],
      ['standing-neutral', 'standing-relaxed'],
      ['standing-relaxed', 'standing-arms-crossed'],
      ['standing-arms-crossed', 'standing-hands-on-hips'],
      ['standing-hands-on-hips', 'standing-weight-shift'],
      ['standing-weight-shift', 'standing-attention'],
      ['standing-attention', 'sitting-legs-crossed'],
      ['sitting-legs-crossed', 'sitting-stool'],
      ['sitting-stool', 'standing-neutral'],
      ['lying-supine', 'lying-prone'],
      ['lying-prone', 'lying-left-side'],
      ['lying-left-side', 'lying-right-side'],
      ['lying-right-side', 'lying-reclined'],
      ['lying-reclined', 'lying-curled'],
      ['lying-curled', 'lying-supine'],
    ] as const
    transitions.forEach(([from, to]) => {
      applyActorPose(rig, actor, 'humanoid-v1', poses[from])
      applyActorPose(rig, actor, 'humanoid-v1', poses[to])
      const transitioned = ['ARML', 'FOREARML', 'HAND_MAINL', 'ARMR', 'FOREARMR', 'HAND_MAINR'].map((name) => rig.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray())
      applyActorPose(rig, actor, 'humanoid-v1', poses[to])
      const direct = ['ARML', 'FOREARML', 'HAND_MAINL', 'ARMR', 'FOREARMR', 'HAND_MAINR'].map((name) => rig.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray())
      expect(transitioned).toEqual(direct)
    })
    const validation = validatePoseDefinition(rig, actor, poses['sitting-neutral'])
    const standingValidation = validatePoseDefinition(rig, actor, poses['standing-neutral'])
    const lyingValidation = validatePoseDefinition(rig, actor, poses['lying-supine'])
    expect(standingValidation.valid).toBe(true)
    expect(lyingValidation.valid).toBe(true)
    expect(validation.valid).toBe(true)
    expect(validation.metrics.hipFlexion).toBeGreaterThan(45)
    expect(validation.metrics.kneeFlexion).toBeGreaterThan(35)
  })

  it('applies offsets from a non-identity rest transform without accumulating', () => {
    const root = new THREE.Group()
    const head = new THREE.Bone()
    head.name = 'HEAD'
    head.rotation.x = 0.42
    root.add(head)
    const actor: ActorDocument = {
      id: 'actor-1',
      name: 'Actor 1',
      character: { characterId: 'male-01' },
      appearance: { color: '#c6a574', heightM: 1.75, representation: 'person-proxy' },
      pose: { poseId: 'standing-attention' },
      placement: { position: [0, 0, 0], rotation: { order: 'XYZ', radians: [0, 0, 0] } },
    }

    applyActorPose(root, actor, 'humanoid-v1')
    const first = head.quaternion.clone()
    actor.pose.poseId = 'standing-neutral'
    applyActorPose(root, actor, 'humanoid-v1')
    actor.pose.poseId = 'standing-attention'
    applyActorPose(root, actor, 'humanoid-v1')

    expect(head.quaternion.angleTo(first)).toBeCloseTo(0, 6)
  })
})
