import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { attachCharacterInstance, computeBlockingBounds, isUsableCharacterInstance } from '../runtime/characterAssets'
import { BlockingAssetLibrary, createBlockingProxy, updateBlockingProxy } from '../runtime/entityAdapters'
import type { ActorDocument } from '../domain/types'

const actor: ActorDocument = {
  id: 'actor-1',
  name: 'Actor 1',
  character: { characterId: 'male-01' },
  appearance: {
    color: '#b96d5a',
    heightM: 1.75,
    representation: 'person-proxy',
  },
  pose: { poseId: 'standing-neutral' },
  placement: {
    position: [0, 0, 0],
    rotation: { order: 'XYZ', radians: [0, 0, 0] },
  },
}

describe('actor proxy', () => {
  it('builds a recognizable articulated hierarchy as one selectable root', () => {
    const library = new BlockingAssetLibrary()
    const proxy = createBlockingProxy(actor, library)

    expect(proxy.name).toBe('ActorRoot')
    expect(proxy.getObjectByName('Pelvis')).toBeTruthy()
    expect(proxy.getObjectByName('Torso')).toBeTruthy()
    expect(proxy.getObjectByName('Chest')).toBeTruthy()
    expect(proxy.getObjectByName('Neck')).toBeTruthy()
    expect(proxy.getObjectByName('Head')).toBeTruthy()
    expect(proxy.getObjectByName('LeftShoulder')).toBeTruthy()
    expect(proxy.getObjectByName('LeftElbow')).toBeTruthy()
    expect(proxy.getObjectByName('LeftHand')).toBeTruthy()
    expect(proxy.getObjectByName('RightShoulder')).toBeTruthy()
    expect(proxy.getObjectByName('LeftHip')).toBeTruthy()
    expect(proxy.getObjectByName('LeftKnee')).toBeTruthy()
    expect(proxy.getObjectByName('LeftFoot')).toBeTruthy()
    expect(proxy.getObjectByName('facing-marker')).toBeUndefined()

    const facingTick = proxy.getObjectByName('facing-tick')
    expect(facingTick?.userData.facingIndicator).toBe(true)
    expect(facingTick?.visible).toBe(false)

    proxy.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(proxy)
    expect(bounds.min.y).toBeCloseTo(0, 3)
    expect(bounds.max.y).toBeCloseTo(actor.appearance.heightM, 3)

    library.dispose()
  })

  it('keeps floor contact and scales the whole mannequin with Actor height', () => {
    const library = new BlockingAssetLibrary()
    const proxy = createBlockingProxy(actor, library)

    actor.appearance.heightM = 2.1
    updateBlockingProxy(proxy, actor)
    proxy.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(proxy)

    expect(bounds.min.y).toBeCloseTo(0, 3)
    expect(bounds.max.y).toBeCloseTo(2.1, 3)

    library.dispose()
  })

  it('replaces the fallback root with a validated production character instance', () => {
    const library = new BlockingAssetLibrary()
    const proxy = createBlockingProxy(actor, library)
    const production = new THREE.Group()
    ;[
      'PELVIS_CENTRAL', 'BELLY', 'CHEST_CENTRAL', 'NECK', 'HEAD',
      'SHOULDERL', 'ARML', 'FOREARML', 'HAND_MAINL',
      'SHOULDERR', 'ARMR', 'FOREARMR', 'HAND_MAINR',
      'THIGHL', 'KNEEL', 'CALFL', 'FOOTL',
      'THIGHR', 'KNEER', 'CALFR', 'FOOTR',
    ].forEach((name) => {
      const bone = new THREE.Bone()
      bone.name = name
      production.add(bone)
    })
    production.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1, 0.2), new THREE.MeshStandardMaterial()))

    expect(isUsableCharacterInstance(production)).toBe(true)
    attachCharacterInstance(proxy, production, actor, 1)

    expect(proxy.getObjectByName('CharacterModel')).toBe(production)
    expect(proxy.getObjectByName('ActorFallback')?.visible).toBe(false)

    library.dispose()
  })

  it('keeps Actor world placement, facing, and height independent from pose changes', () => {
    const library = new BlockingAssetLibrary()
    const proxy = createBlockingProxy({
      ...actor,
      pose: { poseId: 'standing-neutral' },
      placement: { position: [2, 0, -3], rotation: { order: 'XYZ', radians: [0, 0.7, 0] } },
    }, library)
    const position = proxy.position.clone()
    const rotation = proxy.rotation.clone()
    const height = proxy.scale.y
    const next: ActorDocument = { ...actor, pose: { poseId: 'sitting-neutral' }, placement: { position: [2, 0, -3], rotation: { order: 'XYZ', radians: [0, 0.7, 0] } } }

    updateBlockingProxy(proxy, next)

    expect(proxy.position.toArray()).toEqual(position.toArray())
    expect(proxy.rotation.toArray()).toEqual(rotation.toArray())
    expect(proxy.scale.y).toBe(height)
    library.dispose()
  })

  it('excludes the facing indicator from character bounds and contact geometry', () => {
    const library = new BlockingAssetLibrary()
    const proxy = createBlockingProxy(actor, library)
    const facingTick = proxy.getObjectByName('facing-tick')!
    facingTick.position.set(100, 100, 100)
    proxy.updateMatrixWorld(true)
    const bounds = computeBlockingBounds(proxy)
    expect(bounds.max.x).toBeLessThan(3)
    expect(bounds.max.y).toBeLessThan(3)
    expect(bounds.max.z).toBeLessThan(3)
    library.dispose()
  })
})
