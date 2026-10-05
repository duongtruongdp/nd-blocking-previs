import { describe, expect, it } from 'vitest'
import { createEditorClipboard, pasteEditorClipboard } from '../core/editorClipboard'
import { createActorDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createDefaultProps } from '../scene/testEntities'

describe('V2 editor clipboard', () => {
  it('stores only a serializable Actor domain snapshot', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const clipboard = createEditorClipboard(actor)

    expect(clipboard.entity).toEqual(actor)
    expect(clipboard.entity).not.toHaveProperty('root')
    expect(JSON.stringify(clipboard)).not.toContain('Object3D')
  })

  it('pastes an Actor with a unique ID, preserved pose/appearance, offset, and grounding', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [1, 0, -2])
    actor.pose.head = [0.2, 0.1, 0]
    actor.appearance.primaryColor = '#d27777'
    const document = { ...createEmptySceneDocument(), actors: [actor] }
    const result = pasteEditorClipboard(document, createEditorClipboard(actor))

    expect(result.entity.id).toBe('actor-02')
    expect(result.entity.name).toBe('Actor 02')
    expect(result.entity.position).toEqual([1.5, 0, -1.5])
    expect(result.entity).toMatchObject({ pose: actor.pose, appearance: actor.appearance })
  })

  it('pastes a Prop with its shape and appearance and a deterministic offset', () => {
    const prop = createDefaultProps()[0]
    const document = { ...createEmptySceneDocument(), props: [prop] }
    const result = pasteEditorClipboard(document, createEditorClipboard(prop))

    expect(result.entity.id).not.toBe(prop.id)
    expect(result.entity.name).toBe('Cube 02')
    expect(result.entity.position).toEqual([prop.position[0] + 0.5, prop.position[1], prop.position[2] + 0.5])
    expect(result.entity).toMatchObject({ shape: prop.shape, primaryColor: prop.primaryColor })
  })
})
