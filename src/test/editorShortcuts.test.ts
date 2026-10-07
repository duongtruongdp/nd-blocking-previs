import { describe, expect, it } from 'vitest'
import { deleteShortcutForKey, destructiveShortcutTarget, editorShortcutForKey, timelineMarkShortcutForKey, timelinePlayPauseShortcut } from '../core/editorShortcuts'
import { shortcutMatches } from '../core/shortcutRegistry'

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

  it('prioritizes a selected keyframe over the selected scene entity', () => {
    expect(destructiveShortcutTarget('Delete', false, true, true)).toBe('keyframe')
    expect(destructiveShortcutTarget('Delete', false, false, true)).toBe('entity')
    expect(destructiveShortcutTarget('Delete', true, true, true)).toBeNull()
  })
})

describe('application shortcut registry', () => {
  it('does not match a plain tool binding while an OS modifier is held', () => {
    expect(shortcutMatches({ key: 'q', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, { key: 'q' })).toBe(false)
    expect(shortcutMatches({ key: 'q', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }, { key: 'q' })).toBe(true)
  })

  it('supports Cmd/Ctrl project bindings without making Cmd+Q an editor tool', () => {
    expect(shortcutMatches({ key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, { key: 's', metaKey: true, ctrlKey: true })).toBe(true)
    expect(shortcutMatches({ key: 'q', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }, { key: 'q', metaKey: true, ctrlKey: true })).toBe(true)
  })
})
