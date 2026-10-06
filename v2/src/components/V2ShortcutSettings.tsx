import { useEffect, useState } from 'react'
import { isReservedShortcut, SHORTCUT_COMMANDS, shortcutLabel, type ShortcutBinding, type ShortcutCommandId } from '../core/shortcutRegistry'

type Props = {
  bindings: Record<ShortcutCommandId, ShortcutBinding>
  onChange: (id: ShortcutCommandId, binding: ShortcutBinding) => void
  onReset: () => void
  onClose: () => void
}

export function V2ShortcutSettings({ bindings, onChange, onReset, onClose }: Props) {
  const [capturing, setCapturing] = useState<ShortcutCommandId | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!capturing) return
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') { setCapturing(null); return }
      const binding: ShortcutBinding = { key: event.key, metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey }
      if (isReservedShortcut(binding)) { setMessage('Reserved by the operating system.'); return }
      const conflict = SHORTCUT_COMMANDS.find((command) => command.id !== capturing && shortcutLabel(bindings[command.id]) === shortcutLabel(binding))
      if (conflict && !window.confirm(`This shortcut is already used by ${conflict.label}. Reassign it?`)) return
      if (conflict) onChange(conflict.id, conflict.defaultBinding)
      onChange(capturing, binding)
      setCapturing(null)
      setMessage(null)
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [bindings, capturing, onChange])

  return <div className="v2-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="v2-shortcut-modal" role="dialog" aria-modal="true" aria-labelledby="v2-shortcut-title">
      <div className="v2-modal-heading"><div><span className="v2-eyebrow">Preferences</span><h2 id="v2-shortcut-title">Keyboard Shortcuts</h2></div><button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close Keyboard Shortcuts">×</button></div>
      {message ? <p className="v2-shortcut-message" role="status">{message}</p> : null}
      <div className="v2-shortcut-list">{SHORTCUT_COMMANDS.map((command) => <div className="v2-shortcut-row" key={command.id}><div><strong>{command.label}</strong><small>{command.category}</small></div><button className={`v2-shortcut-capture${capturing === command.id ? ' is-active' : ''}`} onClick={() => { setMessage(null); setCapturing(command.id) }} type="button">{capturing === command.id ? 'Press a key…' : shortcutLabel(bindings[command.id])}</button></div>)}</div>
      <div className="v2-modal-actions"><button className="v2-small-action is-muted" onClick={onReset} type="button">Reset All</button><button className="v2-small-action" onClick={onClose} type="button">Done</button></div>
    </section>
  </div>
}
