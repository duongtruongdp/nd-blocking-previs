import { describe, expect, it } from 'vitest'
import { timelinePlayPauseShortcut } from '../core/editorShortcuts'

describe('timeline play/pause shortcut', () => {
  it('handles Space outside text editing controls', () => {
    expect(timelinePlayPauseShortcut(' ', false)).toBe(true)
  })

  it('ignores Space while editing text or numeric controls', () => {
    expect(timelinePlayPauseShortcut(' ', true)).toBe(false)
  })
})
