import { useMemo, useRef, useState } from 'react'
import type { MasterImageAssetDocument, MasterSequenceDocument } from '../core/masterSequence'
import { buildRelinkMatches, imageAssetReferences, selectedRelinkFiles, type ImageAssetHealth, type RelinkMatch } from '../core/mediaHealth'
import { buildMissingMediaReport, missingMediaReportCsv } from '../core/missingMediaReport'

type V2MediaManagerProps = {
  projectName: string
  sequence: MasterSequenceDocument
  health: readonly ImageAssetHealth[]
  scanning: boolean
  readOnly?: boolean
  onRefresh: () => void
  onRelinkAsset: (assetId: string, file: File) => Promise<void>
  onRelinkAll: (files: Map<string, File>) => Promise<{ recovered: number; failed: string[] }>
  error?: string | null
  onClose: () => void
}

export function V2MediaManager({ projectName, sequence, health, scanning, readOnly = false, onRefresh, onRelinkAsset, onRelinkAll, error, onClose }: V2MediaManagerProps) {
  const [filter, setFilter] = useState<'missing' | 'all'>('missing')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [matches, setMatches] = useState<RelinkMatch[] | null>(null)
  const [working, setWorking] = useState(false)
  const [batchSummary, setBatchSummary] = useState<string | null>(null)
  const singleInputRef = useRef<HTMLInputElement>(null)
  const batchInputRef = useRef<HTMLInputElement>(null)
  const missingCount = health.filter((item) => item.status !== 'available').length
  const availableCount = health.filter((item) => item.status === 'available').length
  const problemCount = health.filter((item) => item.status === 'corrupt' || item.status === 'unsupported').length
  const healthById = useMemo(() => new Map(health.map((item) => [item.assetId, item])), [health])
  const assets = sequence.imageAssets ?? []
  const visibleAssets = assets.filter((asset) => filter === 'all' || healthById.get(asset.id)?.status !== 'available')
  const rows = useMemo(() => buildMissingMediaReport(sequence, health), [health, sequence])
  const selectedAsset = assets.find((asset) => asset.id === selectedId) ?? visibleAssets[0] ?? null

  const chooseSingle = (asset: MasterImageAssetDocument) => {
    setSelectedId(asset.id)
    singleInputRef.current?.click()
  }

  const onSingleFile = async (file: File | undefined) => {
    const assetId = selectedId
    if (!file || !assetId) return
    setWorking(true)
    try { await onRelinkAsset(assetId, file) } finally { setWorking(false); if (singleInputRef.current) singleInputRef.current.value = '' }
  }

  const prepareBatch = (files: FileList | null) => {
    if (!files) return
    setMatches(buildRelinkMatches(assets.filter((asset) => healthById.get(asset.id)?.status !== 'available'), [...files]))
    if (batchInputRef.current) batchInputRef.current.value = ''
  }

  const updateMatch = (assetId: string, selectedIndex: number) => setMatches((current) => current?.map((match) => match.assetId === assetId ? { ...match, selectedIndex, reason: 'ambiguous' } : match) ?? null)
  const applyBatch = async () => {
    if (!matches) return
    const files = selectedRelinkFiles(matches)
    if (files.size === 0) return
    setWorking(true)
    try {
      const result = await onRelinkAll(files)
      const skipped = matches.filter((match) => match.candidates.length === 0).length
      setBatchSummary(`Recovered ${result.recovered} · Still Missing ${result.failed.length + skipped} · Skipped ${skipped}`)
      setMatches(null)
    } finally { setWorking(false) }
  }

  const downloadReport = () => {
    const blob = new Blob([missingMediaReportCsv(rows)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${projectName.replace(/[^a-z0-9]+/gi, '_') || 'project'}-missing-media.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <div className="v2-modal-backdrop" role="presentation">
    <section className="v2-media-manager" role="dialog" aria-modal="true" aria-labelledby="v2-media-manager-title">
      <header className="v2-media-manager-heading"><div><span className="v2-eyebrow">Project Media</span><h2 id="v2-media-manager-title">Missing Media Manager</h2><p>{missingCount > 0 ? `${missingCount} asset${missingCount === 1 ? '' : 's'} need attention.` : 'All Graphics images are available.'} · Total {assets.length} · Available {availableCount} · Missing {health.filter((item) => item.status === 'missing').length} · Corrupt / Unsupported {problemCount}</p></div><button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close Media Manager">×</button></header>
      <div className="v2-media-manager-toolbar"><div className="v2-segmented" aria-label="Media filter"><button className={filter === 'missing' ? 'is-active' : ''} type="button" onClick={() => setFilter('missing')}>Missing Only {missingCount > 0 ? `(${missingCount})` : ''}</button><button className={filter === 'all' ? 'is-active' : ''} type="button" onClick={() => setFilter('all')}>All Media ({assets.length})</button></div><div className="v2-media-manager-actions"><button className="v2-small-action" type="button" onClick={onRefresh} disabled={scanning || working}>↻ Refresh</button><button className="v2-small-action" type="button" onClick={() => batchInputRef.current?.click()} disabled={readOnly || missingCount === 0 || scanning || working}>Relink All…</button><button className="v2-small-action" type="button" onClick={downloadReport} disabled={assets.length === 0}>CSV Report</button></div></div>
      {batchSummary ? <p className="v2-media-batch-summary" role="status">{batchSummary} · Refresh to verify current availability.</p> : null}
      {error ? <p className="v2-media-manager-error" role="alert">{error}</p> : null}
      {matches ? <RelinkReview matches={matches} working={working} onChange={updateMatch} onApply={applyBatch} onCancel={() => setMatches(null)} /> : <div className="v2-media-manager-body"><div className="v2-media-list" role="list" aria-label="Graphics media assets">{visibleAssets.length === 0 ? <div className="v2-media-empty">{assets.length === 0 ? 'No Graphics image assets in this Project.' : 'No missing media.'}</div> : visibleAssets.map((asset) => { const item = healthById.get(asset.id); const refs = imageAssetReferences(sequence, asset.id); return <button type="button" role="listitem" className={`v2-media-row${asset.id === selectedAsset?.id ? ' is-selected' : ''}`} key={asset.id} onClick={() => setSelectedId(asset.id)}><span className={`v2-media-status is-${item?.status ?? 'loading'}`} aria-label={item?.status ?? 'loading'} /><span className="v2-media-row-main"><strong>{asset.fileName}</strong><small>{asset.mimeType} · {asset.width} × {asset.height} · {refs.length} clip{refs.length === 1 ? '' : 's'}</small></span><span className="v2-media-row-state">{item?.status ?? 'loading'}</span></button> })}</div><div className="v2-media-detail">{selectedAsset ? <MediaDetail asset={selectedAsset} sequence={sequence} health={healthById.get(selectedAsset.id)} onRelink={() => chooseSingle(selectedAsset)} disabled={readOnly || working} /> : <div className="v2-media-empty">Select a media asset.</div>}</div></div>}
      <input ref={singleInputRef} hidden type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => { void onSingleFile(event.target.files?.[0]) }} />
      <input ref={batchInputRef} hidden multiple type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => prepareBatch(event.target.files)} />
      <p className="v2-media-manager-note">Project files store image metadata separately from IndexedDB sidecars; recovered images are not embedded in the .ndblock file.</p>
    </section>
  </div>
}

function MediaDetail({ asset, sequence, health, onRelink, disabled }: { asset: MasterImageAssetDocument; sequence: MasterSequenceDocument; health?: ImageAssetHealth; onRelink: () => void; disabled: boolean }) {
  const refs = imageAssetReferences(sequence, asset.id)
  return <div className="v2-media-detail-content"><div className="v2-media-detail-title"><span className={`v2-media-status is-${health?.status ?? 'loading'}`} /><div><span className="v2-eyebrow">{health?.status ?? 'loading'}</span><h3>{asset.fileName}</h3></div></div><dl><div><dt>Type</dt><dd>{asset.mimeType}</dd></div><div><dt>Expected</dt><dd>{asset.width} × {asset.height}</dd></div><div><dt>Source</dt><dd>IndexedDB image sidecar</dd></div><div><dt>Used by</dt><dd>{refs.length} Graphics clip{refs.length === 1 ? '' : 's'}</dd></div></dl><p className="v2-media-message">{health?.message ?? 'Scan pending.'}</p>{refs.length > 0 ? <div className="v2-media-refs"><strong>Locations</strong>{refs.map((ref) => <span key={ref.clipId}>{ref.trackName} · {ref.clipId}</span>)}</div> : null}<button className="v2-button v2-button-primary" type="button" disabled={disabled} onClick={onRelink}>{health?.status === 'available' ? 'Replace Source Asset…' : 'Relink…'}</button></div>
}

function RelinkReview({ matches, working, onChange, onApply, onCancel }: { matches: RelinkMatch[]; working: boolean; onChange: (assetId: string, selectedIndex: number) => void; onApply: () => void; onCancel: () => void }) {
  const matched = matches.filter((match) => match.selectedIndex !== null).length
  return <div className="v2-media-review"><div className="v2-media-review-heading"><div><span className="v2-eyebrow">Relink All</span><h3>{matched} of {matches.length} missing assets matched</h3></div><span>{matches.some((match) => match.reason === 'ambiguous' && match.selectedIndex === null) ? 'Choose ambiguous files before applying.' : 'Review matches before applying.'}</span></div>{matches.map((match) => <div className="v2-media-match" key={match.assetId}><span>{match.originalFileName}</span>{match.candidates.length === 0 ? <em>No exact filename match</em> : match.reason === 'ambiguous' ? <select value={match.selectedIndex ?? ''} onChange={(event) => onChange(match.assetId, Number(event.target.value))}><option value="">Choose a file…</option>{match.candidates.map((file, index) => <option key={`${file.name}-${index}`} value={index}>{file.name} · {file.size} bytes</option>)}</select> : <strong>{match.candidates[0].name}</strong>}</div>)}<div className="v2-modal-actions"><button className="v2-button" type="button" onClick={onCancel} disabled={working}>Cancel</button><button className="v2-button v2-button-primary" type="button" onClick={onApply} disabled={working || matched === 0}>{working ? 'Relinking…' : `Relink ${matched}`}</button></div></div>
}
