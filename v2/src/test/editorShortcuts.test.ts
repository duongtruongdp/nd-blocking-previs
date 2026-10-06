import { describe, expect, it } from 'vitest'
import { timelineMarkShortcutForKey, timelinePlayPauseShortcut } from '../core/editorShortcuts'

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
