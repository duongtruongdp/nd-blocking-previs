import { useEffect, useState } from 'react'
import { isReservedShortcut, SHORTCUT_COMMANDS, shortcutLabel, type ShortcutBinding, type ShortcutCommandId } from '../core/shortcutRegistry'
import type { UpdatePlatform } from '../platform/updateChecker'

export type AboutUpdateState = {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  downloadPlatform?: UpdatePlatform | null
  message?: string
}

type Props = {
  bindings: Record<ShortcutCommandId, ShortcutBinding>
  onChange: (id: ShortcutCommandId, binding: ShortcutBinding) => void
  onReset: () => void
  onClose: () => void
  recoveryEnabled?: boolean
  onRecoveryEnabledChange?: (enabled: boolean) => void
  showMacosBetaHelp?: boolean
  appVersion: string
  websiteUrl: string
  contactEmail: string
  onOpenExternalUrl: (url: string) => void
  updateState: AboutUpdateState
  onCheckForUpdates: () => void
  onDownloadUpdate: () => void
  onLaterUpdate: () => void
  autoUpdateChecks?: boolean
  onAutoUpdateChecksChange?: (enabled: boolean) => void
}

export function V2ShortcutSettings({ bindings, onChange, onReset, onClose, recoveryEnabled = true, onRecoveryEnabledChange, showMacosBetaHelp = false, appVersion, websiteUrl, contactEmail, onOpenExternalUrl, updateState, onCheckForUpdates, onDownloadUpdate, onLaterUpdate, autoUpdateChecks = true, onAutoUpdateChecksChange }: Props) {
  const [capturing, setCapturing] = useState<ShortcutCommandId | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [betaHelpOpen, setBetaHelpOpen] = useState(false)

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
      {onRecoveryEnabledChange ? <label className="v2-preference-toggle"><span><strong>Recovery snapshots</strong><small>Keep one local recovery copy of unsaved desktop work.</small></span><input checked={recoveryEnabled} onChange={(event) => onRecoveryEnabledChange(event.target.checked)} type="checkbox" /></label> : null}
      {onAutoUpdateChecksChange ? <label className="v2-preference-toggle"><span><strong>Check for updates automatically</strong><small>Check once when the desktop app starts.</small></span><input checked={autoUpdateChecks} onChange={(event) => onAutoUpdateChecksChange(event.target.checked)} type="checkbox" /></label> : null}
      {showMacosBetaHelp ? <div className="v2-beta-help"><button className="v2-small-action" type="button" aria-expanded={betaHelpOpen} onClick={() => setBetaHelpOpen((open) => !open)}>Beta Installation Help</button>{betaHelpOpen ? <div className="v2-beta-help-content"><strong>macOS Beta</strong><p>This beta is currently distributed outside the Mac App Store.</p><p>If macOS prevents the app from opening:</p><ol><li>Try opening ND Blocking &amp; Previs once.</li><li>Open System Settings → Privacy &amp; Security.</li><li>Scroll down to Security.</li><li>Click Open Anyway.</li><li>Confirm Open.</li></ol><p>You normally only need to do this once.</p></div> : null}</div> : null}
      <section className="v2-about-section" aria-labelledby="v2-about-title"><span className="v2-eyebrow">About</span><h3 id="v2-about-title">ND Blocking &amp; Previs <span>Beta</span></h3><p>A simple blocking and previs tool for filmmakers.</p><small>Developed by</small><strong>Dương Trương (Andy)</strong><button className="v2-about-link" type="button" onClick={() => onOpenExternalUrl(websiteUrl)}>duongtruongdp.net</button><button className="v2-about-link" type="button" onClick={() => onOpenExternalUrl(`mailto:${contactEmail}`)}>{contactEmail}</button><small>Version {appVersion}</small><button className="v2-small-action" type="button" onClick={onCheckForUpdates} disabled={updateState.status === 'checking'}>{updateState.status === 'checking' ? 'Checking…' : 'Check for Updates'}</button>{updateState.status === 'up-to-date' ? <p className="v2-update-result" role="status">You&apos;re up to date.<br />ND Blocking &amp; Previs {updateState.currentVersion} is the latest version.</p> : null}{updateState.status === 'available' ? <div className="v2-update-result" role="status"><strong>Update available</strong><p>ND Blocking &amp; Previs {updateState.latestVersion} is available.<br />You&apos;re currently using {updateState.currentVersion}.</p>{updateState.notes ? <p>{updateState.notes}</p> : null}{!updateState.downloadPlatform ? <p>No download is available for this platform yet.</p> : null}<div className="v2-update-actions"><button className="v2-small-action" type="button" onClick={onDownloadUpdate} disabled={!updateState.downloadPlatform}>Download Update</button><button className="v2-small-action is-muted" type="button" onClick={onLaterUpdate}>Later</button></div></div> : null}{updateState.status === 'error' ? <p className="v2-update-error" role="status">Unable to check for updates right now.<br />Please check your internet connection and try again.</p> : null}</section>
      <div className="v2-modal-actions"><button className="v2-small-action is-muted" onClick={onReset} type="button">Reset All</button><button className="v2-small-action" onClick={onClose} type="button">Done</button></div>
    </section>
  </div>
}
