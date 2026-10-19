import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ACTOR_POSE_PRESETS, createActorPoseForPreset } from '../core/actorPosePresets'
import { hasMannequinPoseCalibration, resolveMannequinPose } from '../core/mannequinPoseCalibration'
import { createActorDocument, createStandingActorPose } from '../core/sceneDocument'
import { ProceduralActorRuntime } from '../runtime/actor/proceduralActor'
import { createMannequinMetrics, MannequinActorRuntime } from '../runtime/actor/mannequinActor'
import { actorProportionHeight } from '../runtime/actor/proportions'

describe('V2 procedural Actor foundation', () => {
  it('builds an explicit anatomical hierarchy', () => {
    const runtime = new ProceduralActorRuntime(createActorDocument('actor-01', 'Actor 01', [0, 0, 0]))

    expect(runtime.root.name).toBe('ActorRoot')
    expect(runtime.root.getObjectByName('PelvisJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('TorsoJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('LeftShoulderJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('LeftElbowJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('LeftHipJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('LeftKneeJoint')).toBeDefined()
    runtime.dispose()
  })

  it('keeps the Actor grounded when ActorRoot is at Y zero', () => {
    const runtime = new ProceduralActorRuntime(createActorDocument('actor-01', 'Actor 01', [0, 0, 0]))
    runtime.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(runtime.root)

    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(bounds.max.y).toBeGreaterThan(1.7)
    expect(actorProportionHeight()).toBeGreaterThan(1.75)
    expect(actorProportionHeight()).toBeLessThan(1.8)
    runtime.dispose()
  })

  it('applies serializable Standing pose values to semantic joints', () => {
    const runtime = new ProceduralActorRuntime(createActorDocument('actor-01', 'Actor 01', [0, 0, 0]))
    const pose = createStandingActorPose()
    pose.leftElbow = [0.18, 0.05, -0.22]
    runtime.applyPose(pose)

    const elbow = runtime.root.getObjectByName('LeftElbowJoint')
    expect(elbow?.rotation.x).toBeCloseTo(0.18)
    expect(elbow?.rotation.y).toBeCloseTo(0.05)
    expect(elbow?.rotation.z).toBeCloseTo(-0.22)
    runtime.dispose()
  })

  it('assigns every visible body mesh directly to the Actor entity ID', () => {
    const runtime = new ProceduralActorRuntime(createActorDocument('actor-01', 'Actor 01', [0, 0, 0]))

    expect(runtime.selectableMeshes.length).toBeGreaterThan(10)
    expect(runtime.selectableMeshes.every((mesh) => mesh.userData.entityId === 'actor-01')).toBe(true)
    expect(runtime.selectableMeshes.every((mesh) => mesh.userData.actorJoint)).toBe(true)
    runtime.dispose()
  })

  it('produces complete body bounds without runtime objects in the document', () => {
    const document = createActorDocument('actor-01', 'Actor 01', [1, 0, -2])
    const runtime = new ProceduralActorRuntime(document)
    runtime.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(runtime.root)
    const serialized = JSON.stringify(document)

    expect(bounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(1.7)
    expect(serialized).not.toContain('Object3D')
    expect(serialized).not.toContain('geometry')
    expect(document).not.toHaveProperty('root')
    runtime.dispose()
  })

  it('resolves every static pose preset through the shared procedural hierarchy', () => {
    for (const preset of ACTOR_POSE_PRESETS) {
      const actor = { ...createActorDocument(`actor-${preset.id}`, preset.label, [2, 0, 4]), posePreset: preset.id, pose: createActorPoseForPreset(preset.id) }
      const runtime = new ProceduralActorRuntime(actor)
      runtime.root.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(runtime.root)
      expect(bounds.isEmpty()).toBe(false)
      expect(bounds.getSize(new THREE.Vector3()).length()).toBeGreaterThan(0.1)
      expect(runtime.root.position.toArray()).toEqual([2, 0, 4])
      if (preset.id === 'kneeling' || preset.id === 'crouching') {
        expect(bounds.min.y).toBeGreaterThan(-0.06)
        const pelvis = runtime.root.getObjectByName('PelvisJoint')
        const leftKnee = runtime.root.getObjectByName('LeftKneeJoint')
        const rightKnee = runtime.root.getObjectByName('RightKneeJoint')
        const worldY = (joint: THREE.Object3D | undefined) => joint ? new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld).y : Number.NaN
        expect(worldY(pelvis)).toBeLessThan(0.86)
        if (preset.id === 'kneeling') expect(worldY(leftKnee)).toBeLessThan(worldY(rightKnee) - 0.2)
        if (preset.id === 'crouching') expect(Math.abs(worldY(leftKnee) - worldY(rightKnee))).toBeLessThan(0.01)
      }
      runtime.dispose()
    }
  })

  it('keeps the authored Actor root separate from pose-local body offsets', () => {
    const actor = { ...createActorDocument('actor-01', 'Actor 01', [2, 0, 4]), posePreset: 'lying' as const, pose: createActorPoseForPreset('lying') }
    const runtime = new ProceduralActorRuntime(actor)
    runtime.root.updateMatrixWorld(true)
    const poseRoot = runtime.root.getObjectByName('ActorPoseRoot')

    expect(runtime.root.position.toArray()).toEqual([2, 0, 4])
    expect(poseRoot?.position.y).toBeGreaterThan(0)
    expect(runtime.root.rotation.toArray()).toEqual([0, 0, 0, 'XYZ'])
    runtime.dispose()
  })
})

describe('M2C.2 procedural previs mannequin', () => {
  it('builds a faceted articulated hierarchy with the shared pose joints', () => {
    const actor = createActorDocument('mannequin-01', 'Mannequin 01', [0, 0, 0])
    const runtime = new MannequinActorRuntime(actor)

    expect(runtime.visualStyle).toBe('mannequin')
    expect(runtime.root.getObjectByName('PelvisJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('ChestJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('NeckJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('HeadJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('LeftWristJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('RightAnkleJoint')).toBeDefined()
    expect(runtime.root.getObjectByName('LeftFoot')).toBeDefined()
    expect(runtime.selectableMeshes.length).toBeGreaterThan(20)
    expect(runtime.selectableMeshes.every((mesh) => mesh.userData.entityId === actor.id)).toBe(true)
    runtime.dispose()
  })

  it('keeps the mannequin grounded, directional, and height-scaled', () => {
    const actor = { ...createActorDocument('mannequin-01', 'Mannequin 01', [0, 0, 0]), scale: [1.25, 1.25, 1.25] as [number, number, number] }
    const runtime = new MannequinActorRuntime(actor)
    runtime.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(runtime.root)
    const foot = runtime.root.getObjectByName('LeftFoot')
    const footBox = foot ? new THREE.Box3().setFromObject(foot) : new THREE.Box3()

    expect(bounds.min.y).toBeCloseTo(0, 5)
    expect(bounds.max.y).toBeGreaterThan(2.1)
    expect(footBox.min.z).toBeLessThan(footBox.max.z)
    runtime.dispose()
  })

  it('uses one joint map for neutral, male, and female body variants', () => {
    const runtimes = (['neutral', 'male', 'female'] as const).map((bodyVariant) => new MannequinActorRuntime({ ...createActorDocument(`mannequin-${bodyVariant}`, bodyVariant, [0, 0, 0]), appearance: { bodyVariant, primaryColor: '#7f72c9' } }))
    const required = ['PelvisJoint', 'TorsoJoint', 'LeftShoulderJoint', 'RightShoulderJoint', 'LeftElbowJoint', 'RightElbowJoint', 'LeftHipJoint', 'RightHipJoint', 'LeftKneeJoint', 'RightKneeJoint']
    runtimes.forEach((runtime) => {
      required.forEach((name) => expect(runtime.root.getObjectByName(name)).toBeDefined())
      runtime.dispose()
    })
  })

  it('applies pose rotations without changing ActorRoot placement', () => {
    const actor = createActorDocument('mannequin-01', 'Mannequin 01', [2, 0, -3])
    const runtime = new MannequinActorRuntime(actor)
    const pose = createActorPoseForPreset('sitting')
    pose.leftElbow = [0.2, 0.1, -0.1]
    runtime.applyPose(pose)

    expect(runtime.root.position.toArray()).toEqual([2, 0, -3])
    expect(runtime.root.getObjectByName('LeftElbowJoint')?.rotation.x).toBeCloseTo(0.2)
    runtime.dispose()
  })

  it('keeps every shared pose preset inside a usable grounded hierarchy', () => {
    for (const preset of ACTOR_POSE_PRESETS) {
      const actor = { ...createActorDocument(`mannequin-${preset.id}`, preset.label, [0, 0, 0]), posePreset: preset.id, pose: createActorPoseForPreset(preset.id) }
      const runtime = new MannequinActorRuntime(actor)
      runtime.root.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(runtime.root)
      expect(bounds.isEmpty()).toBe(false)
      expect(bounds.min.y).toBeGreaterThan(-0.06)
      runtime.dispose()
    }
  })

  it('derives a contiguous, human-proportioned neutral body from normalized metrics', () => {
    const metrics = createMannequinMetrics()
    const runtime = new MannequinActorRuntime(createActorDocument('mannequin-01', 'Mannequin 01', [0, 0, 0]))
    runtime.root.updateMatrixWorld(true)
    const position = (name: string) => new THREE.Vector3().setFromMatrixPosition(runtime.root.getObjectByName(name)!.matrixWorld)
    const head = runtime.root.getObjectByName('HeadVisual')!
    const headBounds = new THREE.Box3().setFromObject(head)

    expect(metrics.headHeight / metrics.totalHeight).toBeGreaterThanOrEqual(0.125)
    expect(metrics.headHeight / metrics.totalHeight).toBeLessThanOrEqual(0.13)
    expect(metrics.shoulderWidth / metrics.totalHeight).toBeGreaterThanOrEqual(0.24)
    expect(metrics.shoulderWidth / metrics.totalHeight).toBeLessThanOrEqual(0.26)
    expect(metrics.pelvisWidth / metrics.totalHeight).toBeGreaterThanOrEqual(0.17)
    expect(metrics.pelvisWidth / metrics.totalHeight).toBeLessThanOrEqual(0.2)
    expect(headBounds.min.y).toBeCloseTo(position('HeadJoint').y, 5)
    expect(position('LeftShoulderJoint').x).toBeCloseTo(-position('RightShoulderJoint').x, 5)
    expect(position('LeftHipJoint').x).toBeCloseTo(-position('RightHipJoint').x, 5)
    expect(position('LeftKneeJoint').y).toBeCloseTo(metrics.kneeY, 5)
    expect(position('LeftAnkleJoint').y).toBeCloseTo(metrics.ankleY, 5)
    expect(metrics.shoulderRadius).toBeGreaterThan(metrics.hipRadius)
    expect(metrics.hipRadius).toBeGreaterThan(metrics.elbowRadius)
    expect(metrics.elbowRadius).toBeGreaterThan(metrics.wristRadius)
    runtime.dispose()
  })

  it('keeps mannequin joint transforms finite and feet directed along actor-forward', () => {
    const runtime = new MannequinActorRuntime(createActorDocument('mannequin-01', 'Mannequin 01', [0, 0, 0]))
    runtime.root.updateMatrixWorld(true)
    runtime.root.traverse((object) => {
      if (object.name.endsWith('Joint')) expect(object.position.toArray().every(Number.isFinite)).toBe(true)
    })
    const foot = runtime.root.getObjectByName('LeftFoot')!
    const box = new THREE.Box3().setFromObject(foot)
    expect(box.min.z).toBeLessThan(-box.max.z)
    runtime.dispose()
  })

  it('builds a continuous articulated pelvis, abdomen, and chest chain', () => {
    const runtime = new MannequinActorRuntime(createActorDocument('mannequin-01', 'Mannequin 01', [0, 0, 0]))
    runtime.root.updateMatrixWorld(true)
    const pelvis = runtime.root.getObjectByName('PelvisVisual')!
    const abdomen = runtime.root.getObjectByName('AbdomenVisual')!
    const chest = runtime.root.getObjectByName('ChestVisual')!
    const torsoJoint = runtime.root.getObjectByName('TorsoJoint')!
    const chestJoint = runtime.root.getObjectByName('ChestJoint')!
    const pelvisBounds = new THREE.Box3().setFromObject(pelvis)
    const abdomenBounds = new THREE.Box3().setFromObject(abdomen)
    const chestBounds = new THREE.Box3().setFromObject(chest)

    expect(abdomen.parent).toBe(torsoJoint)
    expect(chest.parent).toBe(chestJoint)
    expect(torsoJoint.parent?.name).toBe('PelvisJoint')
    // A small overlap, rather than merely exact edge contact, hides cracks
    // when the semantic torso pivot rotates for sitting and crouching.
    expect(abdomenBounds.min.y).toBeLessThanOrEqual(pelvisBounds.max.y)
    expect(chestBounds.min.y).toBeLessThanOrEqual(abdomenBounds.max.y + 1e-6)
    expect(chestBounds.max.y).toBeGreaterThan(abdomenBounds.max.y)
    ;[pelvis, abdomen, chest, torsoJoint, chestJoint].forEach((node) => {
      expect(node.position.toArray().every(Number.isFinite)).toBe(true)
    })
    runtime.dispose()
  })

  it('retains the torso hierarchy for sitting, crouching, and lying poses', () => {
    for (const posePreset of ['sitting', 'crouching', 'lying'] as const) {
      const runtime = new MannequinActorRuntime({
        ...createActorDocument(`mannequin-${posePreset}`, posePreset, [0, 0, 0]),
        posePreset,
        pose: createActorPoseForPreset(posePreset),
      })
      runtime.root.updateMatrixWorld(true)
      expect(runtime.root.getObjectByName('AbdomenVisual')?.parent?.name).toBe('TorsoJoint')
      expect(runtime.root.getObjectByName('ChestVisual')?.parent?.name).toBe('ChestJoint')
      expect(new THREE.Box3().setFromObject(runtime.root).isEmpty()).toBe(false)
      runtime.dispose()
    }
  })

  it('uses mannequin-only crouching calibration with symmetric planted-leg flexion', () => {
    const base = createActorPoseForPreset('crouching')
    const calibrated = resolveMannequinPose('crouching', base)
    const actor = { ...createActorDocument('mannequin-crouch', 'Crouching', [2, 0, -3]), posePreset: 'crouching' as const, pose: base }
    const runtime = new MannequinActorRuntime(actor)
    runtime.root.updateMatrixWorld(true)
    const feet = ['LeftFoot', 'RightFoot'].map((name) => new THREE.Box3().setFromObject(runtime.root.getObjectByName(name)!))

    expect(hasMannequinPoseCalibration('crouching')).toBe(true)
    expect(calibrated.leftHip[0]).toBeGreaterThan(1)
    expect(calibrated.leftKnee[0]).toBeLessThan(-1)
    expect(calibrated.leftHip).toEqual(calibrated.rightHip)
    expect(calibrated.leftKnee).toEqual(calibrated.rightKnee)
    expect(feet.every((bounds) => bounds.min.y >= -0.001)).toBe(true)
    expect(runtime.root.position.toArray()).toEqual([2, 0, -3])
    runtime.dispose()
  })

  it('uses mannequin-only elbow folding for Arms Crossed without accumulating pose offsets', () => {
    const base = createActorPoseForPreset('arms-crossed')
    const calibrated = resolveMannequinPose('arms-crossed', base)
    const actor = { ...createActorDocument('mannequin-arms', 'Arms Crossed', [0, 0, 0]), posePreset: 'arms-crossed' as const, pose: base }
    const runtime = new MannequinActorRuntime(actor)
    const neutral = createActorDocument('mannequin-arms', 'Neutral', [0, 0, 0])

    expect(hasMannequinPoseCalibration('arms-crossed')).toBe(true)
    expect(calibrated.leftElbow[0]).toBeGreaterThan(1)
    expect(calibrated.rightElbow[0]).toBeGreaterThan(1)
    expect(calibrated.leftElbow[2]).toBeGreaterThan(0)
    expect(calibrated.rightElbow[2]).toBeLessThan(0)
    runtime.applyDocument(neutral)
    runtime.applyDocument(actor)
    expect(runtime.jointMap.leftElbow.rotation.x).toBeCloseTo(calibrated.leftElbow[0])
    expect(runtime.jointMap.rightElbow.rotation.x).toBeCloseTo(calibrated.rightElbow[0])
    expect(createActorPoseForPreset('arms-crossed')).toEqual(base)
    runtime.dispose()
  })
})
