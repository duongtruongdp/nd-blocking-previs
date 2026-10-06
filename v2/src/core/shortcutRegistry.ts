export type ShortcutCommandId = 'select' | 'move' | 'rotate' | 'scale' | 'frameSelected' | 'playPause' | 'markIn' | 'markOut' | 'save' | 'saveAs' | 'open' | 'newProject'

export type ShortcutBinding = {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

export type ShortcutCommand = {
  id: ShortcutCommandId
  label: string
  category: 'Tools' | 'Timeline' | 'Project'
  defaultBinding: ShortcutBinding
}

export const SHORTCUT_COMMANDS: readonly ShortcutCommand[] = [
  { id: 'select', label: 'Select', category: 'Tools', defaultBinding: { key: 'e' } },
  { id: 'move', label: 'Move', category: 'Tools', defaultBinding: { key: 'q' } },
  { id: 'rotate', label: 'Rotate', category: 'Tools', defaultBinding: { key: 'r' } },
  { id: 'scale', label: 'Scale', category: 'Tools', defaultBinding: { key: 's' } },
  { id: 'frameSelected', label: 'Frame Selected', category: 'Tools', defaultBinding: { key: 'f' } },
  { id: 'playPause', label: 'Play / Pause', category: 'Timeline', defaultBinding: { key: ' ' } },
  { id: 'markIn', label: 'Mark In', category: 'Timeline', defaultBinding: { key: 'i' } },
  { id: 'markOut', label: 'Mark Out', category: 'Timeline', defaultBinding: { key: 'o' } },
  { id: 'save', label: 'Save Project', category: 'Project', defaultBinding: { key: 's', metaKey: true, ctrlKey: true } },
  { id: 'saveAs', label: 'Save Project As', category: 'Project', defaultBinding: { key: 's', metaKey: true, ctrlKey: true, shiftKey: true } },
  { id: 'open', label: 'Open Project', category: 'Project', defaultBinding: { key: 'o', metaKey: true, ctrlKey: true } },
  { id: 'newProject', label: 'New Project', category: 'Project', defaultBinding: { key: 'n', metaKey: true, ctrlKey: true } },
]

export type ShortcutPreferences = Partial<Record<ShortcutCommandId, ShortcutBinding>>

export function shortcutPreferencesWithDefaults(preferences: ShortcutPreferences = {}): Record<ShortcutCommandId, ShortcutBinding> {
  return Object.fromEntries(SHORTCUT_COMMANDS.map((command) => [command.id, { ...command.defaultBinding, ...(preferences[command.id] ?? {}) }])) as Record<ShortcutCommandId, ShortcutBinding>
}

export function shortcutMatches(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>, binding: ShortcutBinding): boolean {
  const commandModifier = binding.metaKey && binding.ctrlKey ? Boolean(event.metaKey || event.ctrlKey) : Boolean(event.metaKey) === Boolean(binding.metaKey) && Boolean(event.ctrlKey) === Boolean(binding.ctrlKey)
  return event.key.toLowerCase() === binding.key.toLowerCase()
    && commandModifier
    && Boolean(event.altKey) === Boolean(binding.altKey)
    && Boolean(event.shiftKey) === Boolean(binding.shiftKey)
}

export function shortcutLabel(binding: ShortcutBinding): string {
  const modifiers = [binding.metaKey && binding.ctrlKey ? '⌘ / Ctrl' : binding.metaKey ? '⌘' : '', binding.altKey ? '⌥' : '', binding.shiftKey ? '⇧' : ''].filter(Boolean)
  const key = binding.key === ' ' ? 'Space' : binding.key.length === 1 ? binding.key.toUpperCase() : binding.key
  return [...modifiers, key].join(' + ')
}

export function isReservedShortcut(binding: ShortcutBinding): boolean {
  const key = binding.key.toLowerCase()
  const modifier = Boolean(binding.metaKey || binding.ctrlKey)
  return modifier && ['q', 'w', 'h', 's', 'o', 'n'].includes(key)
}
