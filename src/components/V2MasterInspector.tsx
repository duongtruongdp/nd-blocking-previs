import { useEffect, useRef } from 'react'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { MasterSequenceDocument } from '../core/masterSequence'
import { masterClipDurationFrames, musicClipDurationSeconds } from '../core/masterSequence'
import type { ShotDocument } from '../core/shotDocument'
import { frameToTimecode, timecodeToFrame } from '../timeline/timelineMath'
import { resolveShotCamera } from '../core/shotCameraResolver'

export type MasterInspectorSelection = { kind: 'clip' | 'music'; id: string } | null

type V2MasterInspectorProps = {
  sequence: MasterSequenceDocument
  shots: readonly ShotDocument[]
  scenes: readonly ProjectSceneEntry[]
  selection: MasterInspectorSelection
  rate: { numerator: number; denominator: number }
  onOpenShot: (clipId: string) => void
  onDuplicateClip: (clipId: string) => void
  onRemoveClip: (clipId: string) => void
  onTrimClip: (clipId: string, start: number, end: number) => void
  onMusicChange: (patch: { startMasterFrame?: number; sourceStartSeconds?: number; sourceEndSeconds?: number }) => void
  onRemoveMusic: () => void
}

export function V2MasterInspector({ sequence, shots, scenes, selection, rate, onOpenShot, onDuplicateClip, onRemoveClip, onTrimClip, onMusicChange, onRemoveMusic }: V2MasterInspectorProps) {
  if (!selection) return <aside className="v2-panel v2-details-panel v2-master-inspector" aria-label="Master Inspector"><div className="v2-master-inspector-empty"><span className="v2-eyebrow">Master Inspector</span><strong>Select a clip in the Master Timeline.</strong><span>Shot details will appear here.</span></div></aside>
  if (selection.kind === 'music') return <MusicInspector sequence={sequence} selectionId={selection.id} rate={rate} onChange={onMusicChange} onRemove={onRemoveMusic} />
  const clip = sequence.clips.find((candidate) => candidate.id === selection.id)
  if (!clip) return <aside className="v2-panel v2-details-panel v2-master-inspector" aria-label="Master Inspector"><div className="v2-master-inspector-empty"><strong>Missing Master Clip.</strong></div></aside>
  const shot = shots.find((candidate) => candidate.id === clip.shotId) ?? null
  const scene = shot ? scenes.find((entry) => entry.id === shot.sceneId) ?? null : null
  const camera = shot ? resolveShotCamera({ scenes }, shot).camera : null
  return <aside className="v2-panel v2-details-panel v2-master-inspector" aria-label="Master Clip Inspector">
    <div className="v2-panel-heading"><div><span className="v2-eyebrow">Master Clip</span><h2>{shot?.name ?? 'Missing Shot'}</h2></div></div>
    <div className="v2-master-inspector-fields"><InspectorValue label="Shot" value={shot?.name ?? 'Missing Shot'} /><InspectorValue label="Scene" value={scene?.name ?? 'Missing Scene'} /><InspectorValue label="Camera" value={camera?.name ?? 'Missing Camera'} /><InspectorValue label="Duration" value={frameToTimecode(masterClipDurationFrames(clip), scene?.scene.timeline.frameRate ?? rate)} /></div>
    {shot ? <div className="v2-master-inspector-range"><MasterTimecodeField label="Source Start" value={clip.sourceStartFrame} rate={scene?.scene.timeline.frameRate ?? rate} min={shot.startFrame} max={clip.sourceEndFrame - 1} onCommit={(value) => onTrimClip(clip.id, value, clip.sourceEndFrame)} /><MasterTimecodeField label="Source End" value={clip.sourceEndFrame} rate={scene?.scene.timeline.frameRate ?? rate} min={clip.sourceStartFrame + 1} max={shot.endFrame} onCommit={(value) => onTrimClip(clip.id, clip.sourceStartFrame, value)} /></div> : <p className="v2-master-inspector-error">This clip references a Shot that is no longer available.</p>}
    <div className="v2-master-inspector-actions"><button className="v2-small-action" type="button" disabled={!shot} onClick={() => onOpenShot(clip.id)}>Open Shot</button><button className="v2-small-action" type="button" disabled={!shot} onClick={() => onDuplicateClip(clip.id)}>Duplicate Clip</button><button className="v2-small-action is-muted" type="button" onClick={() => onRemoveClip(clip.id)}>Remove from Master</button></div>
  </aside>
}

function MusicInspector({ sequence, selectionId, rate, onChange, onRemove }: { sequence: MasterSequenceDocument; selectionId: string; rate: { numerator: number; denominator: number }; onChange: (patch: { startMasterFrame?: number; sourceStartSeconds?: number; sourceEndSeconds?: number }) => void; onRemove: () => void }) {
  const clip = sequence.musicClip && sequence.musicClip.id === selectionId ? sequence.musicClip : null
  if (!clip) return <aside className="v2-panel v2-details-panel v2-master-inspector" aria-label="Music Inspector"><div className="v2-master-inspector-empty"><strong>Missing Music Clip.</strong></div></aside>
  return <aside className="v2-panel v2-details-panel v2-master-inspector" aria-label="Music Inspector">
    <div className="v2-panel-heading"><div><span className="v2-eyebrow">Music</span><h2>{clip.asset.fileName}</h2></div></div>
    <div className="v2-master-inspector-fields"><InspectorValue label="File" value={clip.asset.fileName} /><InspectorValue label="Duration" value={`${musicClipDurationSeconds(clip).toFixed(2)} s`} /><InspectorValue label="Type" value={clip.asset.mimeType} /></div>
    <label className="v2-master-inspector-label">Start on Master<input type="text" defaultValue={frameToTimecode(clip.startMasterFrame, rate)} onBlur={(event) => { const frame = timecodeToFrame(event.currentTarget.value, rate); if (frame !== null) onChange({ startMasterFrame: frame }); else event.currentTarget.value = frameToTimecode(clip.startMasterFrame, rate) }} /></label>
    <div className="v2-master-inspector-range"><SecondsField label="Source Start" value={clip.sourceStartSeconds} min={0} max={clip.sourceEndSeconds - 0.01} onCommit={(value) => onChange({ sourceStartSeconds: value })} /><SecondsField label="Source End" value={clip.sourceEndSeconds} min={clip.sourceStartSeconds + 0.01} max={clip.durationSeconds} onCommit={(value) => onChange({ sourceEndSeconds: value })} /></div>
    <p className="v2-master-inspector-note">Metadata persists without embedded audio. Current-session audition and waveform are runtime-only; cross-Scene playback/export is deferred to M4C.</p>
    <button className="v2-small-action is-muted" type="button" onClick={onRemove}>Remove Music</button>
  </aside>
}

function InspectorValue({ label, value }: { label: string; value: string }) {
  return <div className="v2-master-inspector-value"><span>{label}</span><strong>{value}</strong></div>
}

function MasterTimecodeField({ label, value, rate, min, max, onCommit }: { label: string; value: number; rate: { numerator: number; denominator: number }; min: number; max: number; onCommit: (value: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (inputRef.current && document.activeElement !== inputRef.current) inputRef.current.value = frameToTimecode(value, rate) }, [value, rate])
  const commit = () => {
    const parsed = inputRef.current ? timecodeToFrame(inputRef.current.value, rate) : null
    if (parsed !== null && parsed >= min && parsed <= max) onCommit(parsed)
    else if (inputRef.current) inputRef.current.value = frameToTimecode(value, rate)
  }
  return <label>{label}<input ref={inputRef} type="text" inputMode="numeric" defaultValue={frameToTimecode(value, rate)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit(); inputRef.current?.blur() } }} /></label>
}

function SecondsField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (value: number) => void }) {
  return <label>{label}<input type="number" min={min} max={max} step="0.01" value={value.toFixed(2)} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next) && next >= min && next <= max) onCommit(next) }} /></label>
}
