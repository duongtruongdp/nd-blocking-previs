import { describe, expect, it } from 'vitest'
import { EditorHistory } from '../core/editorHistory'
import { applySceneEntityTransform, createActorDocument, createEmptySceneDocument } from '../core/sceneDocument'

describe('V2 transform commit history regression', () => {
  it('keeps the final position authoritative, then undoes and redoes it', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const before = { ...createEmptySceneDocument(), actors: [actor] }
    const after = applySceneEntityTransform(before, { entityId: actor.id, position: [2, 0, -1], rotation: [0, 0, 0] })
    const history = new EditorHistory()
    history.record({ label: 'Move Actor 01', before: { document: before, selectedEntityId: actor.id }, after: { document: after, selectedEntityId: actor.id } })

    expect(after.actors[0].position).toEqual([2, 0, -1])
    expect(history.undo()?.before.document.actors[0].position).toEqual([0, 0, 0])
    expect(history.redo()?.after.document.actors[0].position).toEqual([2, 0, -1])
  })

  it('keeps the final rotation authoritative through the same transaction path', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const before = { ...createEmptySceneDocument(), actors: [actor] }
    const after = applySceneEntityTransform(before, { entityId: actor.id, position: [0, 0, 0], rotation: [0.3, 0.7, 0] })
    const history = new EditorHistory()
    history.record({ label: 'Rotate Actor 01', before: { document: before, selectedEntityId: actor.id }, after: { document: after, selectedEntityId: actor.id } })

    expect(after.actors[0].rotation).toEqual([0.3, 0.7, 0])
    expect(history.undo()?.before.document.actors[0].rotation).toEqual([0, 0, 0])
    expect(history.redo()?.after.document.actors[0].rotation).toEqual([0.3, 0.7, 0])
  })
})
