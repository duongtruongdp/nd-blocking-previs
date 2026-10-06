import { describe, expect, it } from 'vitest'
import { deleteShortcutForKey, editorShortcutForKey, timelineMarkShortcutForKey, timelinePlayPauseShortcut } from '../core/editorShortcuts'

describe('timeline play/pause shortcut', () => {
  it('handles Space outside text editing controls', () => {
    expect(timelinePlayPauseShortcut(' ', false)).toBe(true)
  })

  it('ignores Space while editing text or numeric controls', () => {
    expect(timelinePlayPauseShortcut(' ', true)).toBe(false)
  })
})

describe('timeline mark shortcuts', () => {
  it('maps I and O to Mark In and Mark Out regardless of case', () => {
    expect(timelineMarkShortcutForKey('i', false)).toBe('in')
    expect(timelineMarkShortcutForKey('I', false)).toBe('in')
    expect(timelineMarkShortcutForKey('o', false)).toBe('out')
    expect(timelineMarkShortcutForKey('O', false)).toBe('out')
  })

  it('ignores mark shortcuts while editing a field', () => {
    expect(timelineMarkShortcutForKey('i', true)).toBeNull()
    expect(timelineMarkShortcutForKey('o', true)).toBeNull()
  })
})

describe('entity editing shortcuts', () => {
  it('maps Cmd/Ctrl+D to duplicate', () => {
    expect(editorShortcutForKey({ key: 'd', metaKey: true, ctrlKey: false, shiftKey: false })).toBe('duplicate')
    expect(editorShortcutForKey({ key: 'D', metaKey: false, ctrlKey: true, shiftKey: false })).toBe('duplicate')
  })

  it('keeps Delete and Backspace out of focused fields', () => {
    expect(deleteShortcutForKey('Delete', false)).toBe(true)
    expect(deleteShortcutForKey('Backspace', false)).toBe(true)
    expect(deleteShortcutForKey('Backspace', true)).toBe(false)
  })
})
