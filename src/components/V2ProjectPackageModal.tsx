import type { ProjectPackageErrorCode } from '../core/projectPackage'

export type ProjectPackageModalStatus = 'checking' | 'collecting' | 'building' | 'saving' | 'completed' | 'error'

export type ProjectPackageModalResult = {
  fileName: string
  byteLength: number
  assetCount: number
  path: string | null
}

type V2ProjectPackageModalProps = {
  status: ProjectPackageModalStatus
  result: ProjectPackageModalResult | null
  error: { message: string; code?: ProjectPackageErrorCode; assetName?: string; referenceCount?: number } | null
  revealError: string | null
  revealLabel: string
  onRetry: () => void
  onCancel: () => void
  onClose: () => void
  onReveal: () => void
  onOpenMediaManager: () => void
}

export function V2ProjectPackageModal({ status, result, error, revealError, revealLabel, onRetry, onCancel, onClose, onReveal, onOpenMediaManager }: V2ProjectPackageModalProps) {
  const active = status !== 'completed' && status !== 'error'
  const statusLabel = status === 'checking' ? 'Checking Media…' : status === 'collecting' ? 'Collecting Assets…' : status === 'building' ? 'Building Package…' : status === 'saving' ? 'Saving Package…' : status === 'completed' ? 'Package completed' : null
  return <div className="v2-modal-backdrop" role="presentation">
    <section className="v2-project-package-modal" role="dialog" aria-modal="true" aria-labelledby="v2-project-package-title">
      <div className="v2-modal-heading">
        <div><span className="v2-eyebrow">Project Portability</span><h2 id="v2-project-package-title">Export Project Package</h2></div>
        {!active ? <button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close Project Package panel">×</button> : null}
      </div>
      {status === 'completed' && result ? <div className="v2-project-package-success" role="status" aria-live="polite">
        <div className="v2-project-package-success-heading"><span className="v2-export-success-icon" aria-hidden="true">✓</span><div><strong>Project Package Ready</strong><p>{result.fileName}</p></div></div>
        <div className="v2-export-success-grid"><PackageReadout label="Size" value={formatBytes(result.byteLength)} /><PackageReadout label="Media assets" value={String(result.assetCount)} /></div>
        {result.path ? <div className="v2-export-success-reveal"><button className="v2-small-action" type="button" onClick={onReveal}>{revealLabel}</button>{revealError ? <p role="alert">{revealError}</p> : null}</div> : <p className="v2-export-success-note">Download handoff completed. Your browser manages the download location.</p>}
      </div> : null}
      {status === 'error' && error ? <div className="v2-project-package-error" role="alert"><strong>Package export failed</strong><p>{error.message}</p>{error.assetName ? <p>{error.assetName} · {error.referenceCount ?? 0} reference{error.referenceCount === 1 ? '' : 's'}</p> : null}<div className="v2-project-package-error-actions">{error.code === 'missing-media' ? <button className="v2-small-action" type="button" onClick={onOpenMediaManager}>Open Media Manager</button> : null}<button className="v2-small-action" type="button" onClick={onRetry}>Retry Scan</button></div></div> : null}
      {statusLabel ? <div className="v2-project-package-progress" role="status" aria-live="polite"><span>{statusLabel}</span><span className="v2-project-package-spinner" aria-hidden="true" /></div> : null}
      <div className="v2-modal-actions"><button className="v2-button" onClick={active ? onCancel : onClose} type="button">{status === 'completed' ? 'Done' : status === 'error' ? 'Close' : 'Cancel'}</button>{status === 'completed' ? <button className="v2-button v2-button-primary" onClick={onRetry} type="button">Export Again</button> : null}</div>
    </section>
  </div>
}

function PackageReadout({ label, value }: { label: string; value: string }) {
  return <div className="v2-export-readout"><span>{label}</span><strong>{value}</strong></div>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return String(bytes) + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
