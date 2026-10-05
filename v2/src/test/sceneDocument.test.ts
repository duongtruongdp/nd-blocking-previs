import { describe, expect, it } from 'vitest'
import { applySceneEntityTransform, createActorDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createDefaultProps } from '../scene/testEntities'

describe('V2 transform document commits', () => {
  it('commits Actor X pitch and Y heading without Three.js objects', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const document = { ...createEmptySceneDocument(), actors: [actor] }
    const result = applySceneEntityTransform(document, { entityId: actor.id, position: [1, 0, -2], rotation: [0.2, 0.6, 0] })

    expect(result.actors[0].position).toEqual([1, 0, -2])
    expect(result.actors[0].rotation).toEqual([0.2, 0.6, 0])
    expect(result.actors[0]).not.toHaveProperty('root')
  })

  it('commits Prop X and Y rotation with Z preserved', () => {
    const prop = createDefaultProps()[0]
    const document = { ...createEmptySceneDocument(), props: [prop] }
    const result = applySceneEntityTransform(document, { entityId: prop.id, position: [2, 1, 3], rotation: [0.4, -0.3, prop.rotation[2]] })

    expect(result.props[0].position).toEqual([2, 1, 3])
    expect(result.props[0].rotation).toEqual([0.4, -0.3, 0])
  })
})
