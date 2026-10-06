import { describe, expect, it } from 'vitest'
import { createActorDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { creativeSceneChanged, creativeSceneFingerprint } from '../core/sceneDirty'

describe('V2.8 creative scene dirty state', () => {
  it('marks creative edits dirty but ignores playback/current-frame changes', () => {
    const scene = createEmptySceneDocument()
    const moved = { ...scene, actors: [createActorDocument('actor-01', 'Actor 01', [1, 0, 0])] }
    const scrubbed = { ...scene, timeline: { ...scene.timeline, currentFrame: 48 } }
    expect(creativeSceneChanged(scene, moved)).toBe(true)
    expect(creativeSceneChanged(scene, scrubbed)).toBe(false)
    expect(creativeSceneFingerprint(scene)).toBe(creativeSceneFingerprint({ ...scene, metadata: { ...scene.metadata, updatedAt: 'later' } }))
  })
})
