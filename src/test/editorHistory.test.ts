import { describe, expect, it } from 'vitest'
import { EditorHistory } from '../core/editorHistory'
import { editorShortcutForKey } from '../core/editorShortcuts'
import { createEmptySceneDocument } from '../core/sceneDocument'

function snapshot(value: number) {
  const document = createEmptySceneDocument()
  document.timeline.currentFrame = value
  return { document, selectedEntityId: null }
}

describe('V2 editor history', () => {
  it('interprets project undo/redo shortcuts once and ignores editable text', () => {
    expect(editorShortcutForKey({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false })).toBe('undo')
    expect(editorShortcutForKey({ key: 'z', metaKey: false, ctrlKey: true, shiftKey: false })).toBe('undo')
    expect(editorShortcutForKey({ key: 'z', metaKey: true, ctrlKey: false, shiftKey: true })).toBe('redo')
    expect(editorShortcutForKey({ key: 'z', metaKey: false, ctrlKey: true, shiftKey: true })).toBe('redo')
    expect(editorShortcutForKey({ key: 'y', metaKey: false, ctrlKey: true, shiftKey: false })).toBe('redo')
    expect(editorShortcutForKey({ key: 'z', metaKey: false, ctrlKey: false, shiftKey: false })).toBeNull()
  })

  it('undoes and redoes one transform transaction as one entry', () => {
    const history = new EditorHistory()
    history.record({ label: 'Move Actor 01', before: snapshot(0), after: snapshot(12) })

    expect(history.undoCount).toBe(1)
    expect(history.undo()?.before.document.timeline.currentFrame).toBe(0)
    expect(history.redo()?.after.document.timeline.currentFrame).toBe(12)
  })

  it('undoes and redoes a paste snapshot', () => {
    const history = new EditorHistory()
    history.record({ label: 'Paste Actor 02', before: snapshot(0), after: snapshot(1) })

    expect(history.undo()?.after.document.timeline.currentFrame).toBe(1)
    expect(history.redo()?.after.document.timeline.currentFrame).toBe(1)
  })

  it('clears redo after a new action and respects its limit', () => {
    const history = new EditorHistory(2)
    history.record({ label: 'A', before: snapshot(0), after: snapshot(1) })
    history.record({ label: 'B', before: snapshot(1), after: snapshot(2) })
    history.record({ label: 'C', before: snapshot(2), after: snapshot(3) })

    expect(history.undoCount).toBe(2)
    history.undo()
    expect(history.canRedo()).toBe(true)
    history.record({ label: 'D', before: snapshot(2), after: snapshot(4) })
    expect(history.canRedo()).toBe(false)
  })
})
