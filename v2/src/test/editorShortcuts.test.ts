import { describe, expect, it } from 'vitest'
import { editorShortcutForKey } from '../core/editorShortcuts'

describe('V2 editor shortcuts', () => {
  it.each([
    [{ key: 'c', metaKey: true, ctrlKey: false, shiftKey: false }, 'copy'],
    [{ key: 'v', metaKey: false, ctrlKey: true, shiftKey: false }, 'paste'],
    [{ key: 'z', metaKey: true, ctrlKey: false, shiftKey: false }, 'undo'],
    [{ key: 'Z', metaKey: false, ctrlKey: true, shiftKey: true }, 'redo'],
  ] as const)('maps %j', (input, expected) => {
    expect(editorShortcutForKey(input)).toBe(expected)
  })

  it('does not claim ordinary typing or shifted copy/paste', () => {
    expect(editorShortcutForKey({ key: 'c', metaKey: false, ctrlKey: false, shiftKey: false })).toBeNull()
    expect(editorShortcutForKey({ key: 'v', metaKey: true, ctrlKey: false, shiftKey: true })).toBeNull()
  })
})
