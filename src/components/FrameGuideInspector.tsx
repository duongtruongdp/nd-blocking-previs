import { useEffect, useState } from 'react'
import type { CameraDocument, FrameGuide } from '../core/sceneDocument'
import { FRAME_GUIDE_PRESETS, createFrameGuide, frameGuideLabel, normalizeFrameGuideColor, type FrameGuidePreset } from '../core/frameGuides'

type FrameGuideInspectorProps = {
  camera: CameraDocument
  selectedGuideId: string | null
  onSelectGuide: (guideId: string | null) => void
  onCameraChange: (cameraId: string, changes: Partial<CameraDocument>) => void
}

export function FrameGuideInspector({ camera, selectedGuideId, onSelectGuide, onCameraChange }: FrameGuideInspectorProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('Custom')
  const [customAspect, setCustomAspect] = useState('2.35')
  const selectedGuide = camera.frameGuides.find((guide) => guide.id === selectedGuideId) ?? null

  useEffect(() => {
    if (!selectedGuide && camera.frameGuides.length > 0) onSelectGuide(camera.frameGuides[0].id)
    if (camera.frameGuides.length === 0 && selectedGuideId !== null) onSelectGuide(null)
  }, [camera.frameGuides, onSelectGuide, selectedGuide, selectedGuideId])

  const updateGuides = (frameGuides: FrameGuide[]) => onCameraChange(camera.id, { frameGuides })
  const nextId = () => {
    let index = camera.frameGuides.length + 1
    let id = `frame-guide-${camera.id}-${index}`
    while (camera.frameGuides.some((guide) => guide.id === id)) id = `frame-guide-${camera.id}-${++index}`
    return id
  }
  const addGuide = (preset: FrameGuidePreset, custom = false) => {
    if (!custom) {
      const duplicate = camera.frameGuides.find((guide) => Math.abs(guide.aspectRatio - preset.aspectRatio) < 0.005)
      if (duplicate) {
        onSelectGuide(duplicate.id)
        setMenuOpen(false)
        return
      }
    }
    const guide = createFrameGuide(nextId(), preset.name, preset.aspectRatio, custom ? { lineStyle: 'solid', color: '#F0B866' } : undefined)
    updateGuides([...camera.frameGuides, guide])
    onSelectGuide(guide.id)
    setMenuOpen(false)
    setCustomOpen(false)
  }
  const addCustomGuide = () => {
    const aspect = Number(customAspect)
    if (!Number.isFinite(aspect) || aspect <= 0) return
    addGuide({ name: customName.trim() || frameGuideLabel(aspect), aspectRatio: aspect, category: 'Custom' }, true)
  }
  const updateSelected = (changes: Partial<FrameGuide>) => {
    if (!selectedGuide) return
    updateGuides(camera.frameGuides.map((guide) => guide.id === selectedGuide.id ? { ...guide, ...changes } : guide))
  }
  const deleteSelected = () => {
    if (!selectedGuide) return
    const nextGuides = camera.frameGuides.filter((guide) => guide.id !== selectedGuide.id)
    updateGuides(nextGuides)
    onSelectGuide(nextGuides[0]?.id ?? null)
  }

  return (
    <section className="v2-frame-guides-section">
      <div className="v2-frame-guides-heading"><span className="v2-eyebrow">Frame Guides</span><div className="v2-add-wrap"><button className="v2-small-action" type="button" onClick={() => setMenuOpen((open) => !open)}>+ Add Guide</button>{menuOpen ? <div className="v2-frame-guide-menu">
        <span className="v2-menu-label">Cinema / Broadcast</span>
        {FRAME_GUIDE_PRESETS.filter((preset) => preset.category === 'Cinema').map((preset) => <button key={`${preset.name}-${preset.aspectRatio}`} type="button" onClick={() => addGuide(preset)}>{preset.name}</button>)}
        <span className="v2-menu-label">Social / Digital</span>
        {FRAME_GUIDE_PRESETS.filter((preset) => preset.category === 'Social').map((preset) => <button key={`${preset.name}-${preset.aspectRatio}`} type="button" onClick={() => addGuide(preset)}>{preset.name}</button>)}
        <button type="button" onClick={() => { setCustomOpen(true); setMenuOpen(false) }}>Custom…</button>
      </div> : null}</div></div>
      {customOpen ? <div className="v2-frame-guide-custom"><label>Name<input value={customName} onChange={(event) => setCustomName(event.target.value)} /></label><label>Aspect<input type="number" min="0.01" step="0.01" value={customAspect} onChange={(event) => setCustomAspect(event.target.value)} /></label><div><button className="v2-small-action" type="button" onClick={addCustomGuide}>Add Custom</button><button className="v2-small-action is-muted" type="button" onClick={() => setCustomOpen(false)}>Cancel</button></div></div> : null}
      {camera.frameGuides.length === 0 ? <p className="v2-frame-guide-empty">No extra guides. Delivery Frame remains the primary frame.</p> : <div className="v2-frame-guide-list">{camera.frameGuides.map((guide) => <button className={`v2-frame-guide-row${guide.id === selectedGuideId ? ' is-selected' : ''}`} key={guide.id} type="button" onClick={() => onSelectGuide(guide.id)}><input aria-label={`Show ${guide.name} guide`} type="checkbox" checked={guide.enabled} onChange={(event) => { event.stopPropagation(); updateGuides(camera.frameGuides.map((item) => item.id === guide.id ? { ...item, enabled: event.target.checked } : item)) }} onClick={(event) => event.stopPropagation()} /><span>{guide.name}</span><small>{guide.aspectRatio.toFixed(2)}:1</small></button>)}</div>}
      {selectedGuide ? <div className="v2-frame-guide-editor">
        <GuideTextInput label="Name" value={selectedGuide.name} onCommit={(value) => updateSelected({ name: value || frameGuideLabel(selectedGuide.aspectRatio) })} />
        <GuideNumberInput label="Aspect" value={selectedGuide.aspectRatio} min={0.01} max={100} step={0.01} onCommit={(value) => updateSelected({ aspectRatio: value, name: selectedGuide.name === frameGuideLabel(selectedGuide.aspectRatio) ? frameGuideLabel(value) : selectedGuide.name })} />
        <div className="v2-frame-guide-editor-grid"><label>Line<select value={selectedGuide.lineStyle} onChange={(event) => updateSelected({ lineStyle: event.target.value as FrameGuide['lineStyle'] })}><option value="solid">Solid</option><option value="dashed">Dashed</option></select></label><GuideColorInput value={selectedGuide.color} onCommit={(color) => updateSelected({ color })} /></div>
        <GuideNumberInput label="Opacity" value={selectedGuide.opacity} min={0.1} max={1} step={0.05} onCommit={(value) => updateSelected({ opacity: value })} />
        <GuideNumberInput label="Line weight" value={selectedGuide.lineWeight} min={0.5} max={4} step={0.5} onCommit={(value) => updateSelected({ lineWeight: value })} />
        <label className="v2-frame-guide-check"><input type="checkbox" checked={selectedGuide.shadeOutside} onChange={(event) => updateSelected({ shadeOutside: event.target.checked })} />Shade outside</label>
        {selectedGuide.shadeOutside ? <GuideNumberInput label="Shade opacity" value={selectedGuide.shadeOpacity} min={0.02} max={0.6} step={0.02} onCommit={(value) => updateSelected({ shadeOpacity: value })} /> : null}
        <GuideNumberInput label="Safe margin %" value={selectedGuide.safeMarginPercent} min={0} max={49} step={1} onCommit={(value) => updateSelected({ safeMarginPercent: value })} />
        <button className="v2-frame-guide-delete" type="button" onClick={deleteSelected}>Delete Guide</button>
      </div> : null}
    </section>
  )
}

function GuideTextInput({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draftState, setDraftState] = useState({ source: value, draft: value })
  const draft = draftState.source === value ? draftState.draft : value
  return <label className="v2-frame-guide-field">{label}<input value={draft} onChange={(event) => setDraftState({ source: value, draft: event.target.value })} onBlur={() => onCommit(draft.trim())} /></label>
}

function GuideNumberInput({ label, value, min, max, step, onCommit }: { label: string; value: number; min: number; max: number; step: number; onCommit: (value: number) => void }) {
  const source = String(value)
  const [draftState, setDraftState] = useState({ source, draft: source })
  const draft = draftState.source === source ? draftState.draft : source
  const commit = () => {
    const parsed = Math.min(max, Math.max(min, Number(draft)))
    if (Number.isFinite(parsed)) onCommit(parsed)
    else setDraftState({ source, draft: source })
  }
  return <label className="v2-frame-guide-field">{label}<input type="number" min={min} max={max} step={step} value={draft} onChange={(event) => setDraftState({ source, draft: event.target.value })} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur() } }} /></label>
}

function GuideColorInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const source = normalizeFrameGuideColor(value)
  const [draftState, setDraftState] = useState({ source, draft: source })
  const draft = draftState.source === source ? draftState.draft : source
  const commit = (next: string) => {
    const color = normalizeFrameGuideColor(next, source)
    setDraftState({ source, draft: color })
    if (color !== source) onCommit(color)
  }
  return <div className="v2-frame-guide-color"><span>Color</span><div><input aria-label="Frame guide color swatch" type="color" value={source} onChange={(event) => commit(event.target.value)} /><input aria-label="Frame guide hex color" value={draft} onChange={(event) => setDraftState({ source, draft: event.target.value })} onBlur={() => commit(draft)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(draft); event.currentTarget.blur() } }} /></div></div>
}
