import { useEffect, useMemo, useState, type DragEvent } from 'react'
import type { ProjectDocument } from '../core/projectDocument'
import { addShotListOption, removeShotListOption, SHOT_LIST_COLUMNS, updateShotListOption, type ShotListColumn, type ShotListSettings } from '../core/shotListSettings'
import { buildShotListCards, filterShotListCards, shotListSettingsForProject, type ShotListCardModel } from '../core/shotListModel'
import { buildShotListPrintModel, defaultShotListPrintLayout, shotListPrintColumnWidths, shotListPrintValue, SHOT_LIST_EXPORT_COLUMN_LABELS, type ShotListExportRow, type ShotListExportScope, type ShotListPrintLayout, type ShotListPrintModel } from '../core/shotListExport'
import { formatShotDisplayIdentity } from '../core/shotDocument'
import { frameToTimecode } from '../timeline/timelineMath'

type ShotListView = 'grid' | 'list'
type OptionField = 'shotSizeOptions' | 'angleOptions' | 'movementOptions' | 'equipmentOptions'
type ShotListExportFormat = 'csv' | 'xlsx'

const COLUMN_LABELS: Record<ShotListColumn, string> = { thumbnail: 'Thumbnail', scene: 'Scene', shot: 'Shot', camera: 'Camera', lens: 'Lens', shotSize: 'Shot Size', angle: 'Angle', movement: 'Movement', equipment: 'Equipment', duration: 'Duration', notes: 'Notes' }
const OPTION_LABELS: Record<OptionField, string> = { shotSizeOptions: 'Shot Size', angleOptions: 'Angle', movementOptions: 'Movement', equipmentOptions: 'Equipment' }

type V2ShotListWorkspaceProps = {
  project: ProjectDocument
  selectedShotId: string | null
  presentation: boolean
  onSelectShot: (id: string) => void
  onPresentationChange: (presentation: boolean) => void
  onOpenShot: (id: string) => void
  onPreviewShot: (id: string) => void
  onCaptureThumbnail: (id: string) => void
  onRenameShot: (id: string, name: string) => void
  onNotesChange: (id: string, notes: string) => void
  onShotMetadataChange: (id: string, patch: { shotSize?: string | null; angle?: string | null; movement?: string | null; equipment?: string | null }) => void
  onShotCameraChange: (id: string, cameraId: string) => void
  canEditShotCamera: boolean
  shotCameraEditDisabledReason?: string | null
  onDuplicateShot: (id: string) => void
  onDeleteShot: (id: string) => void
  onReorderShot: (id: string, targetIndex: number) => void
  onShotListSettingsChange: (settings: ShotListSettings) => void
  onExportShotList: (format: ShotListExportFormat, scope: ShotListExportScope) => void
  onOpenBlocking: () => void
  controlledView?: ShotListView
  controlledSceneFilter?: string | null
  onViewChange?: (view: ShotListView) => void
  onSceneFilterChange?: (sceneId: string | null) => void
}

export function V2ShotListWorkspace({ project, selectedShotId, presentation, onSelectShot, onPresentationChange, onOpenShot, onPreviewShot, onCaptureThumbnail, onRenameShot, onNotesChange, onShotMetadataChange, onShotCameraChange, canEditShotCamera, shotCameraEditDisabledReason, onDuplicateShot, onDeleteShot, onReorderShot, onShotListSettingsChange, onExportShotList, onOpenBlocking, controlledView, controlledSceneFilter, onViewChange, onSceneFilterChange }: V2ShotListWorkspaceProps) {
  const [viewState, setViewState] = useState<ShotListView>('grid')
  const [sceneFilterState, setSceneFilterState] = useState<string | null>(null)
  const view = controlledView ?? viewState
  const sceneFilter = controlledSceneFilter === undefined ? sceneFilterState : controlledSceneFilter
  const setView = (next: ShotListView) => { setViewState(next); onViewChange?.(next) }
  const setSceneFilter = (next: string | null) => { setSceneFilterState(next); onSceneFilterChange?.(next) }
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [printPayload, setPrintPayload] = useState<ShotListPrintModel | null>(null)
  const cards = useMemo(() => buildShotListCards(project), [project])
  const settings = useMemo(() => shotListSettingsForProject(project), [project])
  const visibleCards = useMemo(() => filterShotListCards(cards, sceneFilter), [cards, sceneFilter])
  const selectedCard = cards.find((card) => card.shot.id === selectedShotId) ?? null
  const dropShot = (event: DragEvent<HTMLElement>, targetCard: ShotListCardModel) => { event.preventDefault(); if (!draggedShotId || draggedShotId === targetCard.shot.id) return; onReorderShot(draggedShotId, targetCard.orderIndex); setDraggedShotId(null) }
  useEffect(() => {
    const clearPrintPayload = () => setPrintPayload(null)
    window.addEventListener('afterprint', clearPrintPayload)
    return () => window.removeEventListener('afterprint', clearPrintPayload)
  }, [])
  const printShotList = (scope: ShotListExportScope, layout: ShotListPrintLayout) => {
    setExportOpen(false)
    setPrintPayload(buildShotListPrintModel(project, settings, scope, layout))
    window.setTimeout(() => window.print(), 0)
  }

  return <>
    <section className={`v2-shot-list-workspace${presentation ? ' is-presentation' : ''}`} aria-label="Shot List">
    <header className="v2-shot-list-header">
      <div className="v2-shot-list-title">{!presentation ? <span className="v2-eyebrow">Visual Planning</span> : null}<h1>{project.name || 'Untitled Project'}</h1><p>Shot List · {cards.length} {cards.length === 1 ? 'Shot' : 'Shots'}</p></div>
      <div className="v2-shot-list-header-actions">{!presentation ? <><div className="v2-segmented" aria-label="Shot List view"><button className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} type="button">Grid</button><button className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} type="button">List</button></div><button className="v2-button" onClick={() => setOptionsOpen((open) => !open)} aria-expanded={optionsOpen} type="button">Options</button><button className="v2-button" onClick={() => setExportOpen(true)} type="button">Export Shot List</button></> : null}<button className="v2-button v2-button-primary" onClick={() => onPresentationChange(!presentation)} type="button">{presentation ? 'Exit Present' : 'Present'}</button></div>
      {!presentation && optionsOpen ? <ShotListOptionsPanel settings={settings} onChange={onShotListSettingsChange} onClose={() => setOptionsOpen(false)} /> : null}
    </header>
    {!presentation ? <div className="v2-shot-list-controls"><label>Scene <select value={sceneFilter ?? ''} onChange={(event) => setSceneFilter(event.target.value || null)}><option value="">All Scenes</option>{project.scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.name}</option>)}</select></label><span className="v2-shot-list-count">Showing {visibleCards.length} of {cards.length}</span></div> : null}
    {cards.length === 0 ? <div className="v2-shot-list-empty"><strong>No shots yet.</strong><span>Create Shots from the Blocking workspace.</span><button className="v2-button" onClick={onOpenBlocking} type="button">Go to Blocking</button></div> : presentation || view === 'grid' ? <div className="v2-shot-storyboard-grid">{visibleCards.map((card) => <ShotCard key={card.shot.id} card={card} selected={card.shot.id === selectedShotId} visibleColumns={settings.visibleColumns} presentation={presentation} onSelect={onSelectShot} onOpen={onOpenShot} onPreview={onPreviewShot} onCapture={onCaptureThumbnail} onDragStart={setDraggedShotId} onDrop={dropShot} />)}</div> : <ShotListTable cards={visibleCards} visibleColumns={settings.visibleColumns} selectedShotId={selectedShotId} presentation={presentation} onSelect={onSelectShot} onOpen={onOpenShot} onDragStart={setDraggedShotId} onDrop={dropShot} />}
    {!presentation ? <ShotInspector card={selectedCard} settings={settings} onOpen={onOpenShot} onPreview={onPreviewShot} onCapture={onCaptureThumbnail} onRename={onRenameShot} onNotesChange={onNotesChange} onShotMetadataChange={onShotMetadataChange} onShotCameraChange={onShotCameraChange} canEditShotCamera={canEditShotCamera} shotCameraEditDisabledReason={shotCameraEditDisabledReason} onDuplicate={onDuplicateShot} onDelete={onDeleteShot} /> : null}
    {printPayload ? <ShotListPrintLayout payload={printPayload} /> : null}
    </section>
    {exportOpen ? <ShotListExportDialog defaultLayout={defaultShotListPrintLayout(view)} currentSceneId={sceneFilter} currentSceneName={sceneFilter ? project.scenes.find((scene) => scene.id === sceneFilter)?.name ?? null : null} onClose={() => setExportOpen(false)} onPrint={printShotList} onFileExport={(format, scope) => { setExportOpen(false); onExportShotList(format, scope) }} /> : null}
  </>
}

function ShotCard({ card, selected, visibleColumns, presentation, onSelect, onOpen, onPreview, onCapture, onDragStart, onDrop }: { card: ShotListCardModel; selected: boolean; visibleColumns: readonly ShotListColumn[]; presentation: boolean; onSelect: (id: string) => void; onOpen: (id: string) => void; onPreview: (id: string) => void; onCapture: (id: string) => void; onDragStart: (id: string) => void; onDrop: (event: DragEvent<HTMLElement>, card: ShotListCardModel) => void }) {
  const columns = new Set(visibleColumns)
  const identity = formatShotDisplayIdentity(card.orderIndex, card.shot.name)
  const cameraLabel = columns.has('camera') && columns.has('lens') ? `${card.cameraName} · ${card.lensLabel}` : columns.has('camera') ? card.cameraName : columns.has('lens') ? card.lensLabel : ''
  const framingLabel = [columns.has('shotSize') ? card.shot.shotSize : null, columns.has('angle') ? card.shot.angle : null].filter(Boolean).join(' · ')
  const rigLabel = [columns.has('movement') ? card.shot.movement : null, columns.has('equipment') ? card.shot.equipment : null].filter(Boolean).join(' · ')
  return <article className={`v2-shot-card${selected ? ' is-selected' : ''}`} draggable={!presentation} onDragStart={() => onDragStart(card.shot.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, card)}><button className="v2-shot-card-select" onClick={() => onSelect(card.shot.id)} type="button">{columns.has('thumbnail') ? <div className="v2-shot-card-thumbnail">{card.shot.thumbnail ? <img src={card.shot.thumbnail.dataUrl} alt={`${card.shot.name} thumbnail`} /> : <span>No thumbnail</span>}</div> : null}<div className="v2-shot-card-heading"><span className="v2-shot-number">{identity.heading}</span>{!presentation && card.masterUseCount > 0 ? <span className="v2-shot-master-status">Master ×{card.masterUseCount}</span> : null}</div>{!identity.isDefaultName ? <strong className="v2-shot-card-name">{card.shot.name}</strong> : null}<div className="v2-shot-card-meta">{columns.has('scene') ? <span>{card.sceneName}</span> : null}{cameraLabel ? <span>{cameraLabel}</span> : null}{framingLabel ? <span>{framingLabel}</span> : null}{rigLabel ? <span>{rigLabel}</span> : null}{columns.has('duration') ? <span>{card.durationLabel}</span> : null}</div>{columns.has('notes') ? <p>{card.shot.notes.trim() || 'No notes'}</p> : null}</button>{!presentation ? <div className="v2-shot-card-actions"><button onClick={() => onOpen(card.shot.id)} type="button">Open Shot</button><button onClick={() => onPreview(card.shot.id)} type="button">Preview</button><button onClick={() => onCapture(card.shot.id)} type="button">Capture</button></div> : null}</article>
}

function ShotListExportDialog({ defaultLayout, currentSceneId, currentSceneName, onClose, onPrint, onFileExport }: { defaultLayout: ShotListPrintLayout; currentSceneId: string | null; currentSceneName: string | null; onClose: () => void; onPrint: (scope: ShotListExportScope, layout: ShotListPrintLayout) => void; onFileExport: (format: ShotListExportFormat, scope: ShotListExportScope) => void }) {
  const [format, setFormat] = useState<'print' | ShotListExportFormat>('print')
  const [scopeKind, setScopeKind] = useState<'all' | 'currentView'>('all')
  const [printLayout, setPrintLayout] = useState<ShotListPrintLayout>(defaultLayout)
  const exportScope: ShotListExportScope = scopeKind === 'currentView' ? { kind: 'currentView', sceneId: currentSceneId } : { kind: 'all' }
  return <div className="v2-modal-backdrop" role="presentation"><div className="v2-shot-export-dialog" role="dialog" aria-modal="true" aria-labelledby="v2-shot-export-title"><div className="v2-modal-heading"><div><span className="v2-eyebrow">Shot List</span><h2 id="v2-shot-export-title">Export Shot List</h2></div><button className="v2-modal-close" onClick={onClose} type="button" aria-label="Close export dialog">×</button></div><fieldset><legend>Format</legend><label><input type="radio" name="shot-list-export-format" checked={format === 'print'} onChange={() => setFormat('print')} /> PDF / Print</label><label><input type="radio" name="shot-list-export-format" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} /> Excel (.xlsx)</label><label><input type="radio" name="shot-list-export-format" checked={format === 'csv'} onChange={() => setFormat('csv')} /> CSV (.csv)</label></fieldset>{format === 'print' ? <fieldset><legend>Layout</legend><label><input type="radio" name="shot-list-print-layout" checked={printLayout === 'storyboard'} onChange={() => setPrintLayout('storyboard')} /> Storyboard</label><label><input type="radio" name="shot-list-print-layout" checked={printLayout === 'list'} onChange={() => setPrintLayout('list')} /> Shot List</label></fieldset> : null}<fieldset><legend>Scope</legend><label><input type="radio" name="shot-list-export-scope" checked={scopeKind === 'all'} onChange={() => setScopeKind('all')} /> All Shots</label><label><input type="radio" name="shot-list-export-scope" checked={scopeKind === 'currentView'} onChange={() => setScopeKind('currentView')} /> Current View{currentSceneName ? ` · ${currentSceneName}` : ' · All Scenes'}</label></fieldset><div className="v2-modal-actions"><button className="v2-button" onClick={onClose} type="button">Cancel</button><button className="v2-button v2-button-primary" onClick={() => format === 'print' ? onPrint(exportScope, printLayout) : onFileExport(format, exportScope)} type="button">Export</button></div></div></div>
}

function ShotListPrintLayout({ payload }: { payload: ShotListPrintModel }) {
  return <div className="v2-shot-print-layout v2-shot-print-document" aria-hidden="true"><header><h1>{payload.projectName}</h1><h2>{payload.title}</h2><small>{payload.rows.length} {payload.rows.length === 1 ? 'Shot' : 'Shots'}</small></header>{payload.layout === 'storyboard' ? <div className="v2-shot-print-grid">{payload.rows.map((row) => <ShotPrintCard key={row.shotId} row={row} columns={payload.columns} />)}</div> : <ShotPrintTable rows={payload.rows} columns={payload.columns} />}</div>
}

function ShotPrintCard({ row, columns }: { row: ShotListExportRow; columns: readonly ShotListColumn[] }) {
  const metadataColumns = columns.filter((column) => column !== 'thumbnail' && column !== 'shot' && column !== 'notes')
  return <article className="v2-shot-print-card">{columns.includes('thumbnail') ? <div className="v2-shot-print-thumbnail">{row.thumbnailDataUrl ? <img src={row.thumbnailDataUrl} alt="" /> : <span>No thumbnail</span>}</div> : null}<h3>{formatShotDisplayIdentity(row.order, row.shotName).heading}</h3><dl>{metadataColumns.map((column) => { const value = shotListPrintValue(row, column); return value ? <div key={column}><dt>{SHOT_LIST_EXPORT_COLUMN_LABELS[column]}</dt><dd>{value}</dd></div> : null })}</dl>{columns.includes('notes') && row.notes ? <div className="v2-shot-print-notes"><strong>Notes</strong><p>{row.notes}</p></div> : null}</article>
}

function ShotPrintTable({ rows, columns }: { rows: readonly ShotListExportRow[]; columns: readonly ShotListColumn[] }) {
  const widths = shotListPrintColumnWidths(columns)
  return <div className="v2-shot-print-table-wrap"><table className="v2-shot-print-table"><colgroup>{columns.map((column) => <col className={`v2-shot-print-col-${column}`} key={column} style={{ width: widths[column] }} />)}</colgroup><thead><tr>{columns.map((column) => <th className={`v2-shot-print-col-${column}`} key={column}>{SHOT_LIST_EXPORT_COLUMN_LABELS[column]}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.shotId}>{columns.map((column) => { const value = shotListPrintValue(row, column); const nowrap = column === 'duration' || (column !== 'notes' && value.length <= (column === 'shotSize' || column === 'angle' || column === 'movement' || column === 'equipment' ? 14 : 20)); return <td className={`v2-shot-print-col-${column}${nowrap ? ' is-nowrap' : ''}`} key={column}>{column === 'thumbnail' ? row.thumbnailDataUrl ? <img src={row.thumbnailDataUrl} alt="" /> : <span>No thumbnail</span> : value || '—'}</td> })}</tr>)}</tbody></table></div>
}

function ShotListTable({ cards, visibleColumns, selectedShotId, presentation, onSelect, onOpen, onDragStart, onDrop }: { cards: readonly ShotListCardModel[]; visibleColumns: readonly ShotListColumn[]; selectedShotId: string | null; presentation: boolean; onSelect: (id: string) => void; onOpen: (id: string) => void; onDragStart: (id: string) => void; onDrop: (event: DragEvent<HTMLElement>, card: ShotListCardModel) => void }) {
  return <div className="v2-shot-list-table-wrap"><table className="v2-shot-list-table"><thead><tr>{visibleColumns.map((column) => <th key={column}>{COLUMN_LABELS[column]}</th>)}{!presentation ? <th>Actions</th> : null}</tr></thead><tbody>{cards.map((card) => <tr className={card.shot.id === selectedShotId ? 'is-selected' : ''} draggable={!presentation} key={card.shot.id} onDragStart={() => onDragStart(card.shot.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, card)}>{visibleColumns.map((column) => <ShotListCell key={column} card={card} column={column} onSelect={onSelect} />)}{!presentation ? <td><button className="v2-small-action" onClick={() => onOpen(card.shot.id)} type="button">Open</button></td> : null}</tr>)}</tbody></table></div>
}

function ShotListCell({ card, column, onSelect }: { card: ShotListCardModel; column: ShotListColumn; onSelect: (id: string) => void }) {
  if (column === 'thumbnail') return <td><button className="v2-shot-list-thumbnail" onClick={() => onSelect(card.shot.id)} type="button">{card.shot.thumbnail ? <img src={card.shot.thumbnail.dataUrl} alt="" /> : <span>No thumbnail</span>}</button></td>
  if (column === 'shot') return <td><button className="v2-shot-list-name" onClick={() => onSelect(card.shot.id)} type="button"><strong>{formatShotDisplayIdentity(card.orderIndex, card.shot.name).table}</strong></button></td>
  const value = column === 'scene' ? card.sceneName : column === 'camera' ? card.cameraName : column === 'lens' ? card.lensLabel : column === 'shotSize' ? card.shot.shotSize : column === 'angle' ? card.shot.angle : column === 'movement' ? card.shot.movement : column === 'equipment' ? card.shot.equipment : column === 'duration' ? card.durationLabel : card.shot.notes.trim() || '—'
  return <td className={column === 'notes' ? 'v2-shot-list-notes' : undefined}>{value || '—'}</td>
}

function ShotInspector({ card, settings, onOpen, onPreview, onCapture, onRename, onNotesChange, onShotMetadataChange, onShotCameraChange, canEditShotCamera, shotCameraEditDisabledReason, onDuplicate, onDelete }: { card: ShotListCardModel | null; settings: ShotListSettings; onOpen: (id: string) => void; onPreview: (id: string) => void; onCapture: (id: string) => void; onRename: (id: string, name: string) => void; onNotesChange: (id: string, notes: string) => void; onShotMetadataChange: (id: string, patch: { shotSize?: string | null; angle?: string | null; movement?: string | null; equipment?: string | null }) => void; onShotCameraChange: (id: string, cameraId: string) => void; canEditShotCamera: boolean; shotCameraEditDisabledReason?: string | null; onDuplicate: (id: string) => void; onDelete: (id: string) => void }) {
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  if (!card) return <aside className="v2-shot-list-inspector"><span className="v2-eyebrow">Details</span><h2>Select a Shot</h2><p>Select a storyboard card to review its range, lens, planning metadata, notes, and actions.</p></aside>
  const beginRename = () => { setNameDraft(card.shot.name); setEditingName(true) }
  const commitRename = () => { const trimmed = nameDraft.trim(); if (trimmed) onRename(card.shot.id, trimmed); setEditingName(false) }
  const rate = card.scene?.scene.timeline.frameRate ?? { numerator: 24, denominator: 1 }
  const cameraOptions = card.scene?.scene.cameras ?? []
  const cameraControlTitle = shotCameraEditDisabledReason ?? (canEditShotCamera ? 'Assign this Shot to a Camera in its Scene' : undefined)
  return <aside className="v2-shot-list-inspector"><span className="v2-eyebrow">Shot</span>{editingName ? <input className="v2-shot-inspector-name-input" autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onBlur={commitRename} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitRename() } if (event.key === 'Escape') setEditingName(false) }} /> : <button className="v2-shot-inspector-name" onClick={beginRename} type="button">{card.shot.name}</button>}<div className="v2-shot-inspector-grid"><span>Scene</span><strong>{card.sceneName}</strong><span>Camera</span>{canEditShotCamera ? <select className="v2-shot-inspector-camera-select" value={card.camera?.id ?? ''} onChange={(event) => { if (event.target.value) onShotCameraChange(card.shot.id, event.target.value) }} disabled={cameraOptions.length === 0 || Boolean(shotCameraEditDisabledReason)} title={cameraControlTitle} aria-label="Shot Camera"><option value="">Missing Camera</option>{cameraOptions.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}</select> : <strong>{card.cameraName}</strong>}<span>Lens</span><strong>{card.lensLabel}</strong><span>Range</span><strong>{formatShotRange(card)}</strong><span>Duration</span><strong>{card.durationLabel}</strong><span>Thumbnail</span><strong>{card.shot.thumbnail ? `Captured at ${frameToTimecode(card.shot.thumbnail.frame, rate)}` : 'No thumbnail'}</strong></div><div className="v2-shot-inspector-metadata"><ShotMetadataSelect label="Shot Size" value={card.shot.shotSize} options={settings.shotSizeOptions} onChange={(value) => onShotMetadataChange(card.shot.id, { shotSize: value })} /><ShotMetadataSelect label="Angle" value={card.shot.angle} options={settings.angleOptions} onChange={(value) => onShotMetadataChange(card.shot.id, { angle: value })} /><ShotMetadataSelect label="Movement" value={card.shot.movement} options={settings.movementOptions} onChange={(value) => onShotMetadataChange(card.shot.id, { movement: value })} /><ShotMetadataSelect label="Equipment" value={card.shot.equipment} options={settings.equipmentOptions} onChange={(value) => onShotMetadataChange(card.shot.id, { equipment: value })} /></div><label className="v2-shot-inspector-notes"><span>Notes</span><textarea value={card.shot.notes} onChange={(event) => onNotesChange(card.shot.id, event.target.value)} placeholder="Shot notes" /></label><div className="v2-shot-inspector-actions"><button className="v2-button v2-button-primary" onClick={() => onOpen(card.shot.id)} type="button">Open Shot</button><button className="v2-button" onClick={() => onPreview(card.shot.id)} type="button">Preview Shot</button><button className="v2-button" onClick={() => onCapture(card.shot.id)} type="button">Capture Thumbnail</button><button className="v2-button" onClick={() => onDuplicate(card.shot.id)} type="button">Duplicate</button><button className="v2-button is-danger" onClick={() => onDelete(card.shot.id)} type="button">Delete</button></div></aside>
}

function ShotMetadataSelect({ label, value, options, onChange }: { label: string; value: string | null; options: readonly string[]; onChange: (value: string | null) => void }) {
  const values = value && !options.includes(value) ? [value, ...options] : options
  return <label className="v2-shot-metadata-select"><span>{label}</span><select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}><option value="">—</option>{values.map((option) => <option key={option} value={option}>{option}{option === value && !options.includes(option) ? ' (current)' : ''}</option>)}</select></label>
}

function ShotListOptionsPanel({ settings, onChange, onClose }: { settings: ShotListSettings; onChange: (settings: ShotListSettings) => void; onClose: () => void }) {
  const [newValues, setNewValues] = useState<Partial<Record<OptionField, string>>>({})
  const apply = (next: ShotListSettings | null) => { if (next) onChange(next) }
  return <div className="v2-shot-list-options" role="dialog" aria-label="Shot List Options"><div className="v2-shot-list-options-header"><div><span className="v2-eyebrow">Configuration</span><strong>Shot List Options</strong></div><button className="v2-small-action" onClick={onClose} type="button">Done</button></div><fieldset><legend>Columns</legend><div className="v2-shot-column-options">{SHOT_LIST_COLUMNS.map((column) => <label key={column}><input type="checkbox" checked={settings.visibleColumns.includes(column)} disabled={column === 'shot'} onChange={(event) => { const enabled = new Set(settings.visibleColumns); if (event.target.checked) enabled.add(column); else enabled.delete(column); const visibleColumns = SHOT_LIST_COLUMNS.filter((item) => enabled.has(item)); onChange({ ...settings, visibleColumns }) }} />{COLUMN_LABELS[column]}{column === 'shot' ? ' (required)' : ''}</label>)}</div></fieldset>{(Object.keys(OPTION_LABELS) as OptionField[]).map((field) => <fieldset key={field}><legend>{OPTION_LABELS[field]}</legend><div className="v2-shot-options-list">{settings[field].map((option, index) => <div className="v2-shot-option-row" key={`${field}-${option}`}><input defaultValue={option} aria-label={`${OPTION_LABELS[field]} option`} onBlur={(event) => apply(updateShotListOption(settings, field, index, event.currentTarget.value))} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /><button className="v2-small-action" onClick={() => apply(removeShotListOption(settings, field, index))} type="button" aria-label={`Delete ${option}`}>×</button></div>)}</div><div className="v2-shot-option-add"><input value={newValues[field] ?? ''} onChange={(event) => setNewValues((current) => ({ ...current, [field]: event.target.value }))} placeholder={`Add ${OPTION_LABELS[field]}`} /><button className="v2-small-action" onClick={() => { const next = addShotListOption(settings, field, newValues[field] ?? ''); if (next) { onChange(next); setNewValues((current) => ({ ...current, [field]: '' })) } }} type="button">+ Add</button></div></fieldset>)}</div>
}

function formatShotRange(card: ShotListCardModel): string {
  const rate = card.scene?.scene.timeline.frameRate ?? { numerator: 24, denominator: 1 }
  return `${frameToTimecode(card.shot.startFrame, rate)} → ${frameToTimecode(card.shot.endFrame, rate)}`
}
