import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { RationalFrameRate, TimelineDocument, TimelineEasingMode, TimelineProperty, TimelineTrack } from '../core/sceneDocument'
import { TIMELINE_FRAME_RATES, clampTimelineKeyframeDelta, frameRateLabel, frameToTimelinePercent, timelineEasingMode, timelineXToFrame, type TimelineKeyframeSelection } from '../timeline/timelineMath'
import { groupTimelineTracks, type TimelineEntityDescriptor } from '../timeline/timelineGroups'
import { KeyframeGlyph } from './KeyframeGlyph'
import { keyframeGlyphLabel, keyframeGlyphMode } from '../timeline/keyframeGlyph'

type V2TimelineProps = {
  timeline: TimelineDocument
  tracks: readonly TimelineTrack[]
  entities: readonly TimelineEntityDescriptor[]
  selectedEntityId: string | null
  isPlaying: boolean
  onFrameChange: (frame: number) => void
  onFrameRateChange: (frameRate: RationalFrameRate) => void
  onTogglePlayback: () => void
  onStepFrame: (amount: number) => void
  onMarkIn: () => void
  onMarkOut: () => void
  onMoveKeyframes: (selections: readonly TimelineKeyframeSelection[], deltaFrames: number) => void
  onKeyframeInterpolationChange: (selections: readonly TimelineKeyframeSelection[], mode: TimelineEasingMode) => void
  selectedKeyframes: readonly TimelineKeyframeSelection[]
  onKeyframeSelect: (selection: TimelineKeyframeSelection | null, additive?: boolean) => void
  onEntitySelect: (entityId: string) => void
  onScrubStart: () => void
  onScrubEnd: () => void
}

type KeyframeDrag = { selection: readonly TimelineKeyframeSelection[]; anchor: TimelineKeyframeSelection; sourceFrame: number; deltaFrames: number }
type MarqueeDrag = { startX: number; startY: number; currentX: number; currentY: number; viewportLeft: number; viewportTop: number; additive: boolean }
type TimelineContextMenu = { target: TimelineKeyframeSelection; selection: readonly TimelineKeyframeSelection[]; x: number; y: number }

const propertyLabels: Record<TimelineProperty, string> = { position: 'Position', heading: 'Heading', rotation: 'Rotation', focalLengthMm: 'Focal Length', openAngle: 'Open Angle', azimuth: 'Direction', elevation: 'Height', intensity: 'Intensity', color: 'Color' }
const easingOptions: readonly { mode: TimelineEasingMode; label: string }[] = [{ mode: 'linear', label: 'Linear' }, { mode: 'easeIn', label: 'Ease In' }, { mode: 'easeOut', label: 'Ease Out' }, { mode: 'easeInOut', label: 'Ease In & Out' }]

function frameFromPointer(clientX: number, element: HTMLElement, timeline: TimelineDocument): number {
  const bounds = element.getBoundingClientRect()
  return timelineXToFrame(clientX, { left: bounds.left, width: bounds.width, startFrame: timeline.startFrame, endFrame: timeline.endFrame })
}

function selectionKey(selection: TimelineKeyframeSelection): string { return `${selection.trackId}:${selection.keyframeId}` }
export function V2Timeline({ timeline, tracks, entities, selectedEntityId, isPlaying, onFrameChange, onFrameRateChange, onTogglePlayback, onStepFrame, onMarkIn, onMarkOut, onMoveKeyframes, onKeyframeInterpolationChange, selectedKeyframes, onKeyframeSelect, onEntitySelect, onScrubStart, onScrubEnd }: V2TimelineProps) {
  const rulerRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [draggingGroup, setDraggingGroup] = useState<KeyframeDrag | null>(null)
  const draggingGroupRef = useRef<KeyframeDrag | null>(null)
  const [marquee, setMarquee] = useState<MarqueeDrag | null>(null)
  const marqueeRef = useRef<MarqueeDrag | null>(null)
  const [contextMenu, setContextMenu] = useState<TimelineContextMenu | null>(null)
  const groups = groupTimelineTracks(tracks, entities)
  const selectedSet = new Set(selectedKeyframes.map(selectionKey))

  useEffect(() => {
    if (!contextMenu) return
    const dismiss = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.v2-timeline-context-menu')) return
      setContextMenu(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setContextMenu(null)
      marqueeRef.current = null
      draggingGroupRef.current = null
      setMarquee(null)
      setDraggingGroup(null)
    }
    window.addEventListener('pointerdown', dismiss)
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape) }
  }, [contextMenu])

  const handleRulerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isPlaying || !rulerRef.current) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onScrubStart(); onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline))
  }
  const handleRulerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isPlaying || !rulerRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault(); onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline))
  }
  const finishRulerScrub = (event: PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onScrubEnd() }

  const completeMarquee = (event: PointerEvent<HTMLDivElement>) => {
    const active = marqueeRef.current
    if (!active) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const left = Math.min(active.startX, active.currentX); const right = Math.max(active.startX, active.currentX)
    const top = Math.min(active.startY, active.currentY); const bottom = Math.max(active.startY, active.currentY)
    const hits: TimelineKeyframeSelection[] = []
    if (right - left >= 3 && bottom - top >= 3) {
      viewportRef.current?.querySelectorAll<HTMLButtonElement>('.v2-timeline-keyframe').forEach((keyframe) => {
        const bounds = keyframe.getBoundingClientRect(); const centerX = bounds.left + bounds.width / 2; const centerY = bounds.top + bounds.height / 2
        if (centerX >= left && centerX <= right && centerY >= top && centerY <= bottom) {
          const trackId = keyframe.dataset.trackId; const keyframeId = keyframe.dataset.keyframeId
          if (trackId && keyframeId) hits.push({ trackId, keyframeId })
        }
      })
    }
    if (hits.length === 0) onKeyframeSelect(null, active.additive)
    else {
      // Marquee hit testing uses keyframe center points. Build the full set in
      // one deterministic replacement/additive sequence.
      onKeyframeSelect(hits[0], active.additive)
      hits.slice(1).forEach((selection) => onKeyframeSelect(selection, true))
    }
    marqueeRef.current = null; setMarquee(null)
  }
  const handleLanePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isPlaying) return
    event.preventDefault(); event.stopPropagation()
    const bounds = viewportRef.current?.getBoundingClientRect()
    if (!bounds) return
    const next = { startX: event.clientX, startY: event.clientY, currentX: event.clientX, currentY: event.clientY, viewportLeft: bounds.left, viewportTop: bounds.top, additive: event.shiftKey }
    marqueeRef.current = next; setMarquee(next); event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleLanePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = marqueeRef.current
    if (!active || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const next = { ...active, currentX: event.clientX, currentY: event.clientY }; marqueeRef.current = next; setMarquee(next)
  }

  const handleKeyframePointerDown = (event: PointerEvent<HTMLButtonElement>, track: TimelineTrack, keyframeId: string, frame: number) => {
    if (isPlaying) return
    event.preventDefault(); event.stopPropagation()
    const selection = { trackId: track.id, keyframeId }
    if (event.shiftKey) { onKeyframeSelect(selection, true); return }
    const isSelected = selectedSet.has(selectionKey(selection)); const group = isSelected ? [...selectedKeyframes] : [selection]
    if (!isSelected) onKeyframeSelect(selection, false)
    const next = { selection: group, anchor: selection, sourceFrame: frame, deltaFrames: 0 }; draggingGroupRef.current = next; setDraggingGroup(next); event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleKeyframePointerMove = (event: PointerEvent<HTMLButtonElement>, trackId: string, keyframeId: string) => {
    const active = draggingGroupRef.current
    if (!active || active.anchor.trackId !== trackId || active.anchor.keyframeId !== keyframeId || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const lane = event.currentTarget.parentElement
    if (!lane) return
    const rawDelta = frameFromPointer(event.clientX, lane, timeline) - active.sourceFrame
    const next = { ...active, deltaFrames: clampTimelineKeyframeDelta(timeline, active.selection, rawDelta) }; draggingGroupRef.current = next; setDraggingGroup(next)
  }
  const finishKeyframeDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = draggingGroupRef.current
    if (!active) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    draggingGroupRef.current = null; setDraggingGroup(null)
    if (active.deltaFrames !== 0) onMoveKeyframes(active.selection, active.deltaFrames)
  }

  const ticks = Array.from({ length: 6 }, (_, index) => Math.round(timeline.startFrame + (timeline.endFrame - timeline.startFrame) * index / 5))
  const rateValue = `${timeline.frameRate.numerator}/${timeline.frameRate.denominator}`
  const rangeIn = frameToTimelinePercent(timeline.markIn, timeline); const rangeOut = frameToTimelinePercent(timeline.markOut, timeline)
  const marqueeStyle = marquee ? { left: Math.min(marquee.startX, marquee.currentX) - marquee.viewportLeft, top: Math.min(marquee.startY, marquee.currentY) - marquee.viewportTop, width: Math.abs(marquee.currentX - marquee.startX), height: Math.abs(marquee.currentY - marquee.startY) } : undefined

  return <section className="v2-timeline" aria-label="Timeline">
    <div className="v2-timeline-toolbar"><div><span className="v2-eyebrow">Shot Planning</span><h2>Timeline</h2></div>{selectedKeyframes.length > 1 ? <span className="v2-timeline-selection-count">{selectedKeyframes.length} keyframes selected</span> : null}<label className="v2-frame-rate">FPS<select className="v2-select" value={rateValue} onChange={(event) => { const selected = TIMELINE_FRAME_RATES.find((rate) => `${rate.numerator}/${rate.denominator}` === event.target.value); if (selected) onFrameRateChange(selected) }} disabled={isPlaying}>{TIMELINE_FRAME_RATES.map((rate) => <option key={`${rate.numerator}/${rate.denominator}`} value={`${rate.numerator}/${rate.denominator}`}>{frameRateLabel(rate)}</option>)}</select></label><div className="v2-transport"><button onClick={() => onStepFrame(-1)} disabled={isPlaying} aria-label="Previous frame" type="button">|&lt;</button><button onClick={onTogglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause (Space)' : 'Play / Pause (Space)'} type="button">{isPlaying ? 'Ⅱ' : '▶'}</button><button onClick={() => onStepFrame(1)} disabled={isPlaying} aria-label="Next frame" type="button">&gt;|</button></div><label className="v2-frame-readout">Frame <input aria-label="Current frame" type="number" min={timeline.startFrame} max={timeline.endFrame} step={1} value={timeline.currentFrame} onChange={(event) => onFrameChange(Number(event.target.value))} disabled={isPlaying} /></label><div className="v2-timeline-marks"><button onClick={onMarkIn} disabled={isPlaying} title="Mark In (I)" type="button">Mark In</button><button onClick={onMarkOut} disabled={isPlaying} title="Mark Out (O)" type="button">Mark Out</button></div></div>
    <div className="v2-timeline-track-area"><div className="v2-track-label">Tracks</div><div className="v2-ruler" ref={rulerRef} onPointerDown={handleRulerPointerDown} onPointerMove={handleRulerPointerMove} onPointerUp={finishRulerScrub} onPointerCancel={finishRulerScrub}><div className="v2-timeline-ruler-range" style={{ left: `${rangeIn}%`, width: `${Math.max(0, rangeOut - rangeIn)}%` }} aria-hidden="true" /><div className="v2-timeline-mark v2-timeline-mark-in" style={{ left: `${rangeIn}%` }}><span>IN</span></div><div className="v2-timeline-mark v2-timeline-mark-out" style={{ left: `${rangeOut}%` }}><span>OUT</span></div>{ticks.map((frame) => <span key={frame} style={{ left: `${frameToTimelinePercent(frame, timeline)}%` }}>{String(frame).padStart(2, '0')}</span>)}</div>
      <div className="v2-timeline-track-viewport" ref={viewportRef}><div className="v2-timeline-track-scroll"><div className="v2-timeline-tracks">{groups.map((group) => { const collapsed = collapsedGroups[group.id] === true; return <div className="v2-timeline-group" key={group.id}><div className={`v2-timeline-group-header${group.id === selectedEntityId ? ' is-selected' : ''}`}><div className="v2-timeline-group-label"><button className="v2-timeline-disclosure" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.name}`} aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => ({ ...current, [group.id]: !collapsed }))} type="button">{collapsed ? '▶' : '▼'}</button><button className="v2-timeline-group-name" onClick={() => onEntitySelect(group.id)} type="button"><span>{group.name}</span><small>{group.entityType}</small></button></div><div className="v2-timeline-group-lane" aria-hidden="true"><span>{group.tracks.reduce((count, track) => count + track.keyframes.length, 0)} keys</span></div></div>{!collapsed ? group.tracks.map((track) => <div className={`v2-timeline-track${track.entityId === selectedEntityId ? ' is-selected' : ''}`} key={track.id}><span className="v2-timeline-track-name">{propertyLabels[track.property]}</span><div className="v2-timeline-track-lane" onPointerDown={handleLanePointerDown} onPointerMove={handleLanePointerMove} onPointerUp={completeMarquee} onPointerCancel={completeMarquee} onLostPointerCapture={completeMarquee}>{track.keyframes.map((keyframe) => { const selection = { trackId: track.id, keyframeId: keyframe.id }; const isSelected = selectedSet.has(selectionKey(selection)); const dragItem = draggingGroup?.selection.some((item) => item.trackId === track.id && item.keyframeId === keyframe.id); const displayFrame = dragItem ? keyframe.frame + draggingGroup!.deltaFrames : keyframe.frame; const glyphMode = keyframeGlyphMode(keyframe); const glyphLabel = keyframeGlyphLabel(glyphMode); return <button className={`v2-timeline-keyframe v2-timeline-keyframe-${glyphMode}${keyframe.frame === timeline.currentFrame ? ' is-current' : ''}${isSelected ? ' is-selected' : ''}${dragItem && draggingGroup!.deltaFrames !== 0 ? ' is-dragging' : ''}`} data-track-id={track.id} data-keyframe-id={keyframe.id} key={keyframe.id} style={{ left: `${frameToTimelinePercent(displayFrame, timeline)}%` }} title={`${group.name} · ${propertyLabels[track.property]} · frame ${displayFrame} · ${glyphLabel}`} aria-label={`${group.name} ${propertyLabels[track.property]} keyframe, frame ${displayFrame}, ${glyphLabel}`} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); const menuSelection = isSelected ? [...selectedKeyframes] : [selection]; if (!isSelected) onKeyframeSelect(selection, false); setContextMenu({ target: selection, selection: menuSelection, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 190) }) }} onPointerDown={(event) => handleKeyframePointerDown(event, track, keyframe.id, keyframe.frame)} onPointerMove={(event) => handleKeyframePointerMove(event, track.id, keyframe.id)} onPointerUp={finishKeyframeDrag} onPointerCancel={finishKeyframeDrag} onLostPointerCapture={finishKeyframeDrag} type="button"><KeyframeGlyph mode={glyphMode} /></button> })}</div></div>) : null}</div> })}</div></div>{marquee && marqueeStyle ? <div className={`v2-timeline-marquee${marquee.additive ? ' is-additive' : ''}`} style={marqueeStyle} aria-hidden="true" /> : null}<div className="v2-timeline-range-layer" aria-hidden="true"><div className="v2-timeline-range-outside" style={{ left: 0, width: `${rangeIn}%` }} /><div className="v2-timeline-range-outside" style={{ left: `${rangeOut}%`, right: 0 }} /><div className="v2-timeline-range-active" style={{ left: `${rangeIn}%`, width: `${Math.max(0, rangeOut - rangeIn)}%` }} /></div><div className="v2-timeline-playhead-lane" aria-hidden="true"><div className="v2-timeline-playhead" style={{ left: `${frameToTimelinePercent(timeline.currentFrame, timeline)}%` }} /></div>{groups.length === 0 ? <div className="v2-timeline-empty">No movement planned yet. Add a keyframe from the Inspector.</div> : null}</div></div>
    {contextMenu ? (() => { const targetTrack = tracks.find((track) => track.id === contextMenu.target.trackId); const targetKeyframe = targetTrack?.keyframes.find((keyframe) => keyframe.id === contextMenu.target.keyframeId); if (!targetTrack || !targetKeyframe) return null; const selectedModes = contextMenu.selection.flatMap((selection) => { const track = tracks.find((candidate) => candidate.id === selection.trackId); const keyframe = track?.keyframes.find((candidate) => candidate.id === selection.keyframeId); return keyframe ? [timelineEasingMode(keyframe)] : [] }); const mixed = selectedModes.length > 1 && selectedModes.some((mode) => mode !== selectedModes[0]); const activeMode = mixed ? null : selectedModes[0] ?? timelineEasingMode(targetKeyframe); return <div className="v2-timeline-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" aria-label="Keyframe interpolation"><span className="v2-timeline-context-title">Interpolation{mixed ? ' · Mixed' : ''}</span>{easingOptions.map((option) => <button key={option.mode} className="v2-timeline-context-item" onPointerDown={(event) => event.stopPropagation()} onClick={() => { onKeyframeInterpolationChange(contextMenu.selection, option.mode); setContextMenu(null) }} role="menuitem" type="button"><span>{activeMode === option.mode ? '✓' : ''}</span>{option.label}</button>)}</div> })() : null}
  </section>
}
