export type EditorShortcut = 'copy' | 'paste' | 'undo' | 'redo' | 'duplicate'

export type EditorShortcutInput = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

export function editorShortcutForKey(input: EditorShortcutInput): EditorShortcut | null {
  if (!input.metaKey && !input.ctrlKey) return null
  const key = input.key.toLowerCase()
  if (key === 'c' && !input.shiftKey) return 'copy'
  if (key === 'v' && !input.shiftKey) return 'paste'
  if (key === 'd' && !input.shiftKey) return 'duplicate'
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && input.ctrlKey && !input.metaKey && !input.shiftKey) return 'redo'
  return null
}

export function deleteShortcutForKey(key: string, isTextEditing: boolean): boolean {
  return !isTextEditing && (key === 'Delete' || key === 'Backspace')
}

export function destructiveShortcutTarget(key: string, isTextEditing: boolean, hasTimelineKeyframe: boolean, hasEntity: boolean): 'keyframe' | 'entity' | null {
  if (!deleteShortcutForKey(key, isTextEditing)) return null
  if (hasTimelineKeyframe) return 'keyframe'
  if (hasEntity) return 'entity'
  return null
}

export function timelinePlayPauseShortcut(key: string, isTextEditing: boolean): boolean {
  return key === ' ' && !isTextEditing
}

export type TimelineMarkShortcut = 'in' | 'out'

export type TimelineZoomShortcut = 'out' | 'in'

export type TimelineZoomShortcutHandler = (direction: -1 | 1) => void

export function timelineMarkShortcutForKey(key: string, isTextEditing: boolean): TimelineMarkShortcut | null {
  if (isTextEditing) return null
  const normalized = key.toLowerCase()
  if (normalized === 'i') return 'in'
  if (normalized === 'o') return 'out'
  return null
}

export function timelineZoomShortcutForKey(
  key: string,
  isTextEditing: boolean,
  modifiers: Pick<EditorShortcutInput, 'metaKey' | 'ctrlKey'> & { altKey?: boolean; shiftKey?: boolean } = { metaKey: false, ctrlKey: false },
): TimelineZoomShortcut | null {
  if (isTextEditing || modifiers.metaKey || modifiers.ctrlKey || modifiers.altKey || modifiers.shiftKey) return null
  if (key === '1') return 'out'
  if (key === '2') return 'in'
  return null
}
