export type EditorShortcut = 'copy' | 'paste' | 'undo' | 'redo'

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
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo'
  return null
}
