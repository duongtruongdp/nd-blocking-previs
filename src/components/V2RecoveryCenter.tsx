import type { RecoveryInspection } from '../platform/recovery'

type Props = {
  entries: readonly RecoveryInspection[]
  requestedPath: string | null
  onRecover: (entry: RecoveryInspection) => void
  onDiscard: (entry: RecoveryInspection) => void
  onOpenSaved: (entry: RecoveryInspection) => void
  onClose: () => void
}

export function V2RecoveryCenter({ entries, requestedPath, onRecover, onDiscard, onOpenSaved, onClose }: Props) {
  return <div className="v2-modal-backdrop" role="presentation">
    <section className="v2-recovery-modal" role="dialog" aria-modal="true" aria-labelledby="v2-recovery-title">
      <div className="v2-modal-heading">
        <div><span className="v2-eyebrow">Desktop Recovery</span><h2 id="v2-recovery-title">Unsaved work was found</h2></div>
        <button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close Recovery">×</button>
      </div>
      <p className="v2-recovery-intro">Recovery copies are temporary local snapshots. Recovering one keeps the original Project file unchanged until you explicitly Save.</p>
      <div className="v2-recovery-list">
        {entries.map((entry) => {
          const isRequested = Boolean(requestedPath && entry.projectPath && samePath(entry.projectPath, requestedPath))
          const canRecover = entry.status === 'ready' || entry.status === 'changed' || entry.status === 'stale'
          return <article className="v2-recovery-card" key={entry.recoveryId}>
            <div className="v2-recovery-card-heading"><strong>{entry.projectName}</strong><span className={'v2-recovery-status is-' + entry.status}>{statusLabel(entry.status)}</span></div>
            <small>Last recovered {formatRecoveryTime(entry.recoveryWrittenAt)}</small>
            <small>{entry.projectPath ? <>Original file: <span title={entry.projectPath}>{entry.projectPath}</span></> : 'No saved file yet'}</small>
            {entry.status === 'changed' ? <p className="v2-recovery-warning">Original Project changed since this recovery. Recovering will not overwrite it.</p> : null}
            {entry.status === 'stale' ? <p className="v2-recovery-warning">The saved Project is newer than this recovery.</p> : null}
            {entry.status === 'missing' || entry.status === 'corrupt' ? <p className="v2-recovery-warning">This recovery snapshot could not be opened. You can remove it safely.</p> : null}
            <div className="v2-recovery-actions">
              <button className="v2-small-action" disabled={!canRecover} onClick={() => onRecover(entry)} type="button">Recover</button>
              {isRequested ? <button className="v2-small-action is-muted" onClick={() => onOpenSaved(entry)} type="button">Open Saved Version</button> : null}
              <button className="v2-small-action is-muted" onClick={() => onDiscard(entry)} type="button">Discard</button>
            </div>
          </article>
        })}
      </div>
      <div className="v2-modal-actions"><button className="v2-small-action is-muted" onClick={onClose} type="button">Later</button></div>
    </section>
  </div>
}

function statusLabel(status: RecoveryInspection['status']): string {
  if (status === 'changed') return 'Original changed'
  if (status === 'stale') return 'Older than saved Project'
  if (status === 'missing') return 'Unavailable'
  if (status === 'corrupt') return 'Could not open'
  return 'Ready'
}

function formatRecoveryTime(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'recently'
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
  return normalize(left) === normalize(right)
}
