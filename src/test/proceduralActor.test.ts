import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createActorDocument, createStandingActorPose } from '../core/sceneDocument'
import { ProceduralActorRuntime } from '../runtime/actor/proceduralActor'
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
})
