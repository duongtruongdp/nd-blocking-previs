import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import type { RationalFrameRate, TimelineDocument, TimelineEasingMode, TimelineProperty, TimelineTrack } from '../core/sceneDocument'
import type { TimelineWorkspaceViewPatch, TimelineWorkspaceViewState } from '../core/timelineWorkspaceSession'
import { DEFAULT_TIMELINE_PIXELS_PER_SECOND, MAX_TIMELINE_PIXELS_PER_SECOND, MIN_TIMELINE_PIXELS_PER_SECOND, TIMELINE_FRAME_RATES, TIMELINE_ZOOM_LEVELS, clampTimelineKeyframeDelta, frameRateLabel, frameToTimecode, timelineCanvasModel, timelineCanvasModelForViewport, timelineCanvasXToFrame, timelineDurationEndX, timelineDurationFrames, timelineEasingMode, timelineFitPixelsPerSecond, timelineFrameToCanvasX, timecodeToFrame, type TimelineKeyframeSelection } from '../timeline/timelineMath'
import { groupTimelineTracks, type TimelineEntityDescriptor } from '../timeline/timelineGroups'
import { timelineRulerLabelAlignment } from '../timeline/timelinePresentation'
import { keyframeGlyphLabel, keyframeGlyphMode } from '../timeline/keyframeGlyph'
import { KeyframeGlyph } from './KeyframeGlyph'
import type { TimelineZoomShortcutHandler } from '../core/editorShortcuts'

type V2TimelineProps = {
  timeline: TimelineDocument
  tracks: readonly TimelineTrack[]
  entities: readonly TimelineEntityDescriptor[]
  selectedEntityId: string | null
  isPlaying: boolean
  isLooping: boolean
  onFrameChange: (frame: number) => void
  onDurationChange: (durationFrames: number) => void
  onFrameRateChange: (frameRate: RationalFrameRate) => void
  onTogglePlayback: () => void
  onStopPlayback: () => void
  onMarkIn: () => void
  onMarkOut: () => void
  onToggleLoop: () => void
  onMoveKeyframes: (selections: readonly TimelineKeyframeSelection[], deltaFrames: number) => void
  onKeyframeInterpolationChange: (selections: readonly TimelineKeyframeSelection[], mode: TimelineEasingMode) => void
  canEditKeyframe?: (selection: TimelineKeyframeSelection) => boolean
  canEditTimelineStructure?: boolean
  canEditTimelineInterpolation?: boolean
  onKeyframeEditStart?: (selection: TimelineKeyframeSelection) => void
  onKeyframeEditActivity?: () => void
  onKeyframeEditEnd?: (committed: boolean) => void
  selectedKeyframes: readonly TimelineKeyframeSelection[]
  onKeyframeSelect: (selection: TimelineKeyframeSelection | null, additive?: boolean) => void
  onEntitySelect: (entityId: string) => void
  onScrubStart: () => void
  onScrubEnd: () => void
  onSwitchToScene: () => void
  onSwitchToMaster: () => void
  initialWorkspaceState?: TimelineWorkspaceViewState
  onWorkspaceStateChange?: (patch: TimelineWorkspaceViewPatch) => void
  onRegisterZoomShortcut?: (handler: TimelineZoomShortcutHandler | null) => void
}

type KeyframeDrag = { selection: readonly TimelineKeyframeSelection[]; anchor: TimelineKeyframeSelection; sourceFrame: number; deltaFrames: number }
type MarqueeDrag = { startX: number; startY: number; currentX: number; currentY: number; viewportLeft: number; viewportTop: number; additive: boolean }
type TimelineContextMenu = { target: TimelineKeyframeSelection; selection: readonly TimelineKeyframeSelection[]; x: number; y: number }

const propertyLabels: Record<TimelineProperty, string> = { position: 'Position', heading: 'Heading', rotation: 'Rotation', scale: 'Scale', focalLengthMm: 'Focal Length', openAngle: 'Open Angle', azimuth: 'Direction', elevation: 'Height', intensity: 'Intensity', color: 'Color' }
const easingOptions: readonly { mode: TimelineEasingMode; label: string }[] = [{ mode: 'linear', label: 'Linear' }, { mode: 'easeIn', label: 'Ease In' }, { mode: 'easeOut', label: 'Ease Out' }, { mode: 'easeInOut', label: 'Ease In & Out' }]

function selectionKey(selection: TimelineKeyframeSelection): string { return `${selection.trackId}:${selection.keyframeId}` }

function frameFromPointer(clientX: number, element: HTMLElement, timeline: TimelineDocument, pixelsPerSecond: number): number {
  const bounds = element.getBoundingClientRect()
  return timelineCanvasXToFrame(clientX - bounds.left, timeline, timelineCanvasModel(timeline, pixelsPerSecond), false)
}

function rulerStepSeconds(pixelsPerSecond: number): number {
  const candidates = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  return candidates.find((seconds) => seconds * pixelsPerSecond >= 72) ?? 600
}

function rulerTicks(timeline: TimelineDocument, pixelsPerSecond: number, canvasWidth: number): number[] {
  const fps = timeline.frameRate.numerator / timeline.frameRate.denominator
  const durationSeconds = timelineDurationFrames(timeline) / fps
  const visibleSeconds = Math.max(durationSeconds, Math.max(0, canvasWidth - 16 - 8) / pixelsPerSecond)
  const stepSeconds = rulerStepSeconds(pixelsPerSecond)
  const ticks: number[] = []
  for (let seconds = 0; seconds <= visibleSeconds + 1e-6; seconds += stepSeconds) ticks.push(timeline.startFrame + Math.round(seconds * fps))
  ticks.push(timeline.endFrame)
  return Array.from(new Set(ticks)).sort((a, b) => a - b)
}

function rulerLabel(frame: number, rate: RationalFrameRate): string {
  const [hours, minutes, seconds] = frameToTimecode(frame, rate).split(':')
  return hours === '00' ? `${minutes}:${seconds}` : `${hours}:${minutes}:${seconds}`
}

function clampPixelsPerSecond(value: number): number {
  return Math.min(MAX_TIMELINE_PIXELS_PER_SECOND, Math.max(MIN_TIMELINE_PIXELS_PER_SECOND, value))
}

function zoomLevelIndex(pixelsPerSecond: number): number {
  return TIMELINE_ZOOM_LEVELS.reduce((closest, level, index) => Math.abs(level.pixelsPerSecond - pixelsPerSecond) < Math.abs(TIMELINE_ZOOM_LEVELS[closest].pixelsPerSecond - pixelsPerSecond) ? index : closest, 0)
}

export function V2Timeline({ timeline, tracks, entities, selectedEntityId, isPlaying, isLooping, onFrameChange, onDurationChange, onFrameRateChange, onTogglePlayback, onStopPlayback, onMarkIn, onMarkOut, onToggleLoop, onMoveKeyframes, onKeyframeInterpolationChange, canEditKeyframe, canEditTimelineStructure = true, canEditTimelineInterpolation = true, onKeyframeEditStart, onKeyframeEditActivity, onKeyframeEditEnd, selectedKeyframes, onKeyframeSelect, onEntitySelect, onScrubStart, onScrubEnd, onSwitchToScene, onSwitchToMaster, initialWorkspaceState, onWorkspaceStateChange, onRegisterZoomShortcut }: V2TimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const marqueeRef = useRef<MarqueeDrag | null>(null)
  const draggingGroupRef = useRef<KeyframeDrag | null>(null)
  const zoomAnchorRef = useRef<{ screenX: number } | null>(null)
  const frameInputRef = useRef<HTMLInputElement>(null)
  const durationInputRef = useRef<HTMLInputElement>(null)
  const horizontalScrollRef = useRef(Math.max(0, initialWorkspaceState?.horizontalScroll ?? 0))
  const verticalScrollRef = useRef(Math.max(0, initialWorkspaceState?.verticalScroll ?? 0))
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0)
  const [timelineScrollTop, setTimelineScrollTop] = useState(Math.max(0, initialWorkspaceState?.verticalScroll ?? 0))
  const [pixelsPerSecond, setPixelsPerSecond] = useState(initialWorkspaceState?.pixelsPerSecond ?? DEFAULT_TIMELINE_PIXELS_PER_SECOND)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const [draggingGroup, setDraggingGroup] = useState<KeyframeDrag | null>(null)
  const [marquee, setMarquee] = useState<MarqueeDrag | null>(null)
  const [contextMenu, setContextMenu] = useState<TimelineContextMenu | null>(null)
  const groups = groupTimelineTracks(tracks, entities)
  const selectedSet = new Set(selectedKeyframes.map(selectionKey))
  const canvasModel = timelineCanvasModelForViewport(timeline, pixelsPerSecond, timelineViewportWidth)
  const timelineCanvasWidth = canvasModel.contentWidth
  const durationEndX = timelineDurationEndX(canvasModel)
  const frameX = (frame: number) => timelineFrameToCanvasX(frame, timeline, canvasModel)
  const ticks = rulerTicks(timeline, pixelsPerSecond, timelineCanvasWidth)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const update = () => setTimelineViewportWidth(viewport.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const maxScrollLeft = Math.max(0, timelineCanvasWidth - viewport.clientWidth)
    if (viewport.scrollLeft > maxScrollLeft) viewport.scrollLeft = maxScrollLeft
  }, [timelineCanvasWidth])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    const nextScrollLeft = Math.min(maxScrollLeft, horizontalScrollRef.current)
    const nextScrollTop = Math.min(maxScrollTop, verticalScrollRef.current)
    viewport.scrollLeft = nextScrollLeft
    viewport.scrollTop = nextScrollTop
    horizontalScrollRef.current = nextScrollLeft
    verticalScrollRef.current = nextScrollTop
    setTimelineScrollTop(nextScrollTop)
    onWorkspaceStateChange?.({ horizontalScroll: nextScrollLeft, verticalScroll: nextScrollTop })
  }, [timelineCanvasWidth, timelineViewportWidth, onWorkspaceStateChange])

  useEffect(() => {
    onWorkspaceStateChange?.({ pixelsPerSecond })
  }, [onWorkspaceStateChange, pixelsPerSecond])

  useEffect(() => {
    const anchor = zoomAnchorRef.current
    const viewport = viewportRef.current
    if (!anchor || !viewport) return
    const nextModel = timelineCanvasModel(timeline, pixelsPerSecond)
    const nextFrameX = timelineFrameToCanvasX(timeline.currentFrame, timeline, nextModel)
    const maxScrollLeft = Math.max(0, nextModel.contentWidth - viewport.clientWidth)
    const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, nextFrameX - anchor.screenX))
    viewport.scrollLeft = nextScrollLeft
    horizontalScrollRef.current = nextScrollLeft
    onWorkspaceStateChange?.({ horizontalScroll: nextScrollLeft })
    zoomAnchorRef.current = null
  }, [onWorkspaceStateChange, pixelsPerSecond, timeline])

  useEffect(() => {
    if (document.activeElement !== frameInputRef.current && frameInputRef.current) frameInputRef.current.value = frameToTimecode(timeline.currentFrame, timeline.frameRate)
  }, [timeline.currentFrame, timeline.frameRate])

  useEffect(() => {
    if (document.activeElement !== durationInputRef.current && durationInputRef.current) durationInputRef.current.value = frameToTimecode(timelineDurationFrames(timeline), timeline.frameRate)
  }, [timeline])

  useEffect(() => {
    viewportRef.current?.querySelectorAll<HTMLButtonElement>('.v2-timeline-keyframe').forEach((button) => {
      const track = tracks.find((candidate) => candidate.id === button.dataset.trackId)
      const keyframe = track?.keyframes.find((candidate) => candidate.id === button.dataset.keyframeId)
      if (!track || !keyframe) return
      const dragItem = draggingGroup?.selection.some((selection) => selection.trackId === track.id && selection.keyframeId === keyframe.id)
      const displayFrame = dragItem ? keyframe.frame + draggingGroup!.deltaFrames : keyframe.frame
      const label = `${track.entityId} · ${propertyLabels[track.property]} · ${frameToTimecode(displayFrame, timeline.frameRate)}`
      button.title = label
      button.setAttribute('aria-label', `${label} keyframe`)
    })
  }, [tracks, timeline.frameRate, draggingGroup])

  useEffect(() => {
    if (!contextMenu) return
    const dismiss = (event: globalThis.PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('.v2-timeline-context-menu')) return
      setContextMenu(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setContextMenu(null); marqueeRef.current = null; draggingGroupRef.current = null; setMarquee(null); setDraggingGroup(null)
    }
    window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape) }
  }, [contextMenu])

  const setZoomKeepingPlayhead = useCallback((nextValue: number) => {
    const next = clampPixelsPerSecond(nextValue)
    if (next === pixelsPerSecond) return
    const viewport = viewportRef.current
    if (viewport) zoomAnchorRef.current = { screenX: timelineFrameToCanvasX(timeline.currentFrame, timeline, timelineCanvasModelForViewport(timeline, pixelsPerSecond, timelineViewportWidth)) - viewport.scrollLeft }
    setPixelsPerSecond(next)
  }, [pixelsPerSecond, timeline, timelineViewportWidth])

  const stepZoom = useCallback((direction: -1 | 1) => {
    const currentIndex = zoomLevelIndex(pixelsPerSecond)
    const nextIndex = Math.min(TIMELINE_ZOOM_LEVELS.length - 1, Math.max(0, currentIndex + direction))
    setZoomKeepingPlayhead(TIMELINE_ZOOM_LEVELS[nextIndex].pixelsPerSecond)
  }, [pixelsPerSecond, setZoomKeepingPlayhead])

  const fitTimeline = () => {
    const viewportWidth = Math.max(1, timelineViewportWidth || viewportRef.current?.clientWidth || 1)
    setPixelsPerSecond(clampPixelsPerSecond(timelineFitPixelsPerSecond(viewportWidth, timeline)))
    if (viewportRef.current) viewportRef.current.scrollLeft = 0
    horizontalScrollRef.current = 0
    onWorkspaceStateChange?.({ horizontalScroll: 0 })
  }

  useEffect(() => {
    if (!onRegisterZoomShortcut) return
    onRegisterZoomShortcut((direction) => stepZoom(direction))
    return () => onRegisterZoomShortcut(null)
  }, [onRegisterZoomShortcut, stepZoom])

  const commitFrameDraft = () => {
    const draft = frameInputRef.current?.value ?? ''
    const frame = timecodeToFrame(draft, timeline.frameRate)
    if (frame !== null) onFrameChange(frame)
    else if (frameInputRef.current) frameInputRef.current.value = frameToTimecode(timeline.currentFrame, timeline.frameRate)
  }
  const commitDurationDraft = () => {
    const draft = durationInputRef.current?.value ?? ''
    const duration = timecodeToFrame(draft, timeline.frameRate)
    if (duration !== null && duration > 0) onDurationChange(duration)
    else if (durationInputRef.current) durationInputRef.current.value = frameToTimecode(timelineDurationFrames(timeline), timeline.frameRate)
  }

  const handleScroll = () => {
    const viewport = viewportRef.current
    if (!viewport) return
    horizontalScrollRef.current = viewport.scrollLeft
    verticalScrollRef.current = viewport.scrollTop
    setTimelineScrollTop(viewport.scrollTop)
    onWorkspaceStateChange?.({ horizontalScroll: viewport.scrollLeft, verticalScroll: viewport.scrollTop })
  }

  const handleRulerPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isPlaying || !rulerRef.current) return
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onScrubStart(); onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline, pixelsPerSecond))
  }
  const handleRulerPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isPlaying || !rulerRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault(); onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline, pixelsPerSecond))
  }
  const finishRulerScrub = (event: PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onScrubEnd() }

  const completeMarquee = (event: PointerEvent<HTMLDivElement>) => {
    const active = marqueeRef.current
    if (!active) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const left = Math.min(active.startX, active.currentX); const right = Math.max(active.startX, active.currentX); const top = Math.min(active.startY, active.currentY); const bottom = Math.max(active.startY, active.currentY)
    const hits: TimelineKeyframeSelection[] = []
    if (right - left >= 3 && bottom - top >= 3) viewportRef.current?.querySelectorAll<HTMLButtonElement>('.v2-timeline-keyframe').forEach((keyframe) => { const bounds = keyframe.getBoundingClientRect(); const centerX = bounds.left + bounds.width / 2; const centerY = bounds.top + bounds.height / 2; if (centerX >= left && centerX <= right && centerY >= top && centerY <= bottom) { const trackId = keyframe.dataset.trackId; const keyframeId = keyframe.dataset.keyframeId; if (trackId && keyframeId) hits.push({ trackId, keyframeId }) } })
    if (hits.length === 0) onKeyframeSelect(null, active.additive)
    else { onKeyframeSelect(hits[0], active.additive); hits.slice(1).forEach((selection) => onKeyframeSelect(selection, true)) }
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
    if (canEditKeyframe && (!canEditKeyframe(selection) || group.length !== 1)) return
    onKeyframeEditStart?.(selection)
    const next = { selection: group, anchor: selection, sourceFrame: frame, deltaFrames: 0 }; draggingGroupRef.current = next; setDraggingGroup(next); event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handleKeyframePointerMove = (event: PointerEvent<HTMLButtonElement>, trackId: string, keyframeId: string) => {
    const active = draggingGroupRef.current
    if (!active || active.anchor.trackId !== trackId || active.anchor.keyframeId !== keyframeId || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    const lane = event.currentTarget.parentElement
    if (!lane) return
    const rawDelta = frameFromPointer(event.clientX, lane, timeline, pixelsPerSecond) - active.sourceFrame
    onKeyframeEditActivity?.()
    const next = { ...active, deltaFrames: clampTimelineKeyframeDelta(timeline, active.selection, rawDelta) }; draggingGroupRef.current = next; setDraggingGroup(next)
  }
  const finishKeyframeDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = draggingGroupRef.current
    if (!active) return
    draggingGroupRef.current = null; setDraggingGroup(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const committed = active.deltaFrames !== 0
    if (committed) onMoveKeyframes(active.selection, active.deltaFrames)
    onKeyframeEditEnd?.(committed)
  }
  const cancelKeyframeDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const active = draggingGroupRef.current
    if (!active) return
    draggingGroupRef.current = null; setDraggingGroup(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    onKeyframeEditEnd?.(false)
  }

  const marqueeStyle = marquee ? { left: Math.min(marquee.startX, marquee.currentX) - marquee.viewportLeft, top: Math.min(marquee.startY, marquee.currentY) - marquee.viewportTop, width: Math.abs(marquee.currentX - marquee.startX), height: Math.abs(marquee.currentY - marquee.startY) } : undefined
  const rateValue = `${timeline.frameRate.numerator}/${timeline.frameRate.denominator}`
  const scrollLabelStyle = timelineScrollTop > 0 ? { transform: `translateY(${-timelineScrollTop}px)` } : undefined

  return <section className="v2-timeline" aria-label="Timeline">
    <div className="v2-timeline-toolbar">
      <div className="v2-timeline-toolbar-content">
        <div className="v2-timeline-mode-tabs"><button className="is-active" type="button" onClick={onSwitchToScene}>Scene</button><button type="button" onClick={onSwitchToMaster}>Master</button></div>
        <div className="v2-timeline-context">
        {selectedKeyframes.length > 1 ? <span className="v2-timeline-selection-count">{selectedKeyframes.length} selected</span> : null}
        <label className="v2-frame-rate">FPS<select className="v2-select" value={rateValue} onChange={(event) => { const selected = TIMELINE_FRAME_RATES.find((rate) => `${rate.numerator}/${rate.denominator}` === event.target.value); if (selected) onFrameRateChange(selected) }} disabled={isPlaying || !canEditTimelineStructure}>{TIMELINE_FRAME_RATES.map((rate) => <option key={`${rate.numerator}/${rate.denominator}`} value={`${rate.numerator}/${rate.denominator}`}>{frameRateLabel(rate)}</option>)}</select></label>
        <label className="v2-timeline-readout">Duration <input ref={durationInputRef} aria-label="Timeline duration timecode" type="text" defaultValue={frameToTimecode(timelineDurationFrames(timeline), timeline.frameRate)} onBlur={commitDurationDraft} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDurationDraft() } }} disabled={isPlaying || !canEditTimelineStructure} /></label>
        </div>
        <div className="v2-unified-transport" aria-label="Scene transport"><button onClick={() => onFrameChange(timeline.startFrame)} disabled={isPlaying} aria-label="Return to start" title="Return to start" type="button">|&lt;</button><button onClick={onTogglePlayback} disabled={!canEditTimelineStructure} aria-label={isPlaying ? 'Pause' : 'Play'} title={isPlaying ? 'Pause (Space)' : 'Play / Pause (Space)'} type="button">{isPlaying ? '❚❚' : '▶'}</button><button onClick={onStopPlayback} disabled={!canEditTimelineStructure} aria-label="Stop playback" title="Stop playback" type="button">■</button><button className={`v2-timeline-loop${isLooping ? ' is-active' : ''}`} onClick={onToggleLoop} disabled={!canEditTimelineStructure} aria-pressed={isLooping} aria-label={isLooping ? 'Disable Timeline loop' : 'Enable Timeline loop'} title="Loop Playback" type="button">Loop</button></div>
        <label className="v2-timeline-readout v2-timeline-timecode"><span>TC</span><input ref={frameInputRef} aria-label="Current frame timecode" type="text" defaultValue={frameToTimecode(timeline.currentFrame, timeline.frameRate)} onBlur={commitFrameDraft} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitFrameDraft() } }} disabled={isPlaying} /></label>
        <div className="v2-unified-zoom" aria-label="Timeline zoom"><button type="button" aria-label="Zoom out Timeline" onClick={() => stepZoom(-1)} disabled={pixelsPerSecond <= MIN_TIMELINE_PIXELS_PER_SECOND}>−</button><button type="button" onClick={fitTimeline} title="Fit Timeline">Fit</button><button type="button" aria-label="Zoom in Timeline" onClick={() => stepZoom(1)} disabled={pixelsPerSecond >= MAX_TIMELINE_PIXELS_PER_SECOND}>+</button></div>
        <div className="v2-timeline-marks" aria-label="Timeline range"><button onClick={onMarkIn} disabled={!canEditTimelineStructure} aria-label="Mark In" title={`Mark In · ${frameToTimecode(timeline.markIn, timeline.frameRate)} (I)`} type="button">[</button><button onClick={onMarkOut} disabled={!canEditTimelineStructure} aria-label="Mark Out" title={`Mark Out · ${frameToTimecode(timeline.markOut, timeline.frameRate)} (O)`} type="button">]</button></div>
      </div>
    </div>
    <div className="v2-timeline-track-area">
      <div className="v2-track-label">Tracks</div>
      <div className="v2-timeline-labels" ref={labelsRef}><div style={scrollLabelStyle}>{groups.map((group) => { const collapsed = collapsedGroups[group.id] === true; return <div className="v2-timeline-group" key={group.id}><div className={`v2-timeline-group-header${group.id === selectedEntityId ? ' is-selected' : ''}`}><div className="v2-timeline-group-label"><button className="v2-timeline-disclosure" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.displayName}`} aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => ({ ...current, [group.id]: !collapsed }))} type="button">{collapsed ? '▶' : '▼'}</button><button className="v2-timeline-group-name" title={group.name} onClick={() => onEntitySelect(group.id)} type="button"><span>{group.displayName}</span></button></div></div>{!collapsed ? group.tracks.map((track) => <div className={`v2-timeline-track${track.entityId === selectedEntityId ? ' is-selected' : ''}`} key={track.id}><span className="v2-timeline-track-name">{propertyLabels[track.property]}</span></div>) : null}</div> })}</div></div>
      <div className="v2-timeline-time-viewport" ref={viewportRef} onScroll={handleScroll}>
        <div className="v2-timeline-canvas" style={{ width: `${timelineCanvasWidth}px` }}>
          <div className="v2-ruler" ref={rulerRef} onPointerDown={handleRulerPointerDown} onPointerMove={handleRulerPointerMove} onPointerUp={finishRulerScrub} onPointerCancel={finishRulerScrub}>{ticks.map((frame, index) => { const alignment = timelineRulerLabelAlignment(frame, index, ticks, timeline.startFrame, timeline.endFrame); return <span className={alignment === 'start' ? 'is-start' : alignment === 'end' ? 'is-end' : undefined} key={frame} style={{ left: `${frameX(frame)}px` }}>{rulerLabel(frame, timeline.frameRate)}</span> })}</div>
          <div className="v2-timeline-grid">{ticks.map((frame) => <div className="v2-timeline-grid-line" key={frame} style={{ left: `${frameX(frame)}px` }} aria-hidden="true" />)}</div>
          <div className="v2-timeline-lanes">{groups.map((group) => { const collapsed = collapsedGroups[group.id] === true; return <div className="v2-timeline-group" key={group.id}><div className={`v2-timeline-group-header${group.id === selectedEntityId ? ' is-selected' : ''}`}><div className="v2-timeline-group-lane" aria-hidden="true"><span>{group.tracks.reduce((count, track) => count + track.keyframes.length, 0)} keys</span></div></div>{!collapsed ? group.tracks.map((track) => <div className={`v2-timeline-track${track.entityId === selectedEntityId ? ' is-selected' : ''}`} key={track.id}><div className="v2-timeline-track-lane" onPointerDown={handleLanePointerDown} onPointerMove={handleLanePointerMove} onPointerUp={completeMarquee} onPointerCancel={completeMarquee} onLostPointerCapture={completeMarquee}>{track.keyframes.map((keyframe) => { const selection = { trackId: track.id, keyframeId: keyframe.id }; const isSelected = selectedSet.has(selectionKey(selection)); const dragItem = draggingGroup?.selection.some((item) => item.trackId === track.id && item.keyframeId === keyframe.id); const displayFrame = dragItem ? keyframe.frame + draggingGroup!.deltaFrames : keyframe.frame; const glyphMode = keyframeGlyphMode(keyframe); const glyphLabel = keyframeGlyphLabel(glyphMode); return <button className={`v2-timeline-keyframe v2-timeline-keyframe-${glyphMode}${keyframe.frame === timeline.currentFrame ? ' is-current' : ''}${isSelected ? ' is-selected' : ''}${dragItem && draggingGroup!.deltaFrames !== 0 ? ' is-dragging' : ''}`} data-track-id={track.id} data-keyframe-id={keyframe.id} key={keyframe.id} style={{ left: `${frameX(displayFrame)}px` }} title={`${group.displayName} · ${propertyLabels[track.property]} · frame ${displayFrame} · ${glyphLabel}`} aria-label={`${group.displayName} ${propertyLabels[track.property]} keyframe, frame ${displayFrame}, ${glyphLabel}`} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (canEditKeyframe && !canEditKeyframe(selection)) { onKeyframeSelect(selection, false); return } const menuSelection = isSelected ? [...selectedKeyframes] : [selection]; if (!isSelected) onKeyframeSelect(selection, false); setContextMenu({ target: selection, selection: menuSelection, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 190) }) }} onPointerDown={(event) => handleKeyframePointerDown(event, track, keyframe.id, keyframe.frame)} onPointerMove={(event) => handleKeyframePointerMove(event, track.id, keyframe.id)} onPointerUp={finishKeyframeDrag} onPointerCancel={cancelKeyframeDrag} onLostPointerCapture={cancelKeyframeDrag} type="button"><KeyframeGlyph mode={glyphMode} /></button> })}</div></div>) : null}</div> })}</div>
          <div className="v2-timeline-outside-shot" style={{ left: `${durationEndX}px`, width: `${Math.max(0, timelineCanvasWidth - durationEndX)}px` }} aria-hidden="true" />
          <div className="v2-timeline-range-layer" aria-hidden="true"><div className="v2-timeline-range-outside" style={{ left: 0, width: `${frameX(timeline.markIn)}px` }} /><div className="v2-timeline-range-outside" style={{ left: `${frameX(timeline.markOut)}px`, width: `${Math.max(0, timelineCanvasWidth - frameX(timeline.markOut))}px` }} /><div className="v2-timeline-range-active" style={{ left: `${frameX(timeline.markIn)}px`, width: `${Math.max(0, frameX(timeline.markOut) - frameX(timeline.markIn))}px` }} /></div>
          <div className="v2-timeline-mark v2-timeline-mark-in" style={{ left: `${frameX(timeline.markIn)}px` }} aria-hidden="true" /><div className="v2-timeline-mark v2-timeline-mark-out" style={{ left: `${frameX(timeline.markOut)}px` }} aria-hidden="true" />
          <div className="v2-timeline-end-boundary" style={{ left: `${durationEndX}px` }} aria-hidden="true" />
          <div className="v2-timeline-playhead-lane" aria-hidden="true"><div className="v2-timeline-playhead" style={{ left: `${frameX(timeline.currentFrame)}px` }} /></div>
        </div>
        {marquee && marqueeStyle ? <div className={`v2-timeline-marquee${marquee.additive ? ' is-additive' : ''}`} style={marqueeStyle} aria-hidden="true" /> : null}
        {groups.length === 0 ? <div className="v2-timeline-empty">No movement planned yet. Add a keyframe from the Inspector.</div> : null}
      </div>
    </div>
    {contextMenu ? (() => { const targetTrack = tracks.find((track) => track.id === contextMenu.target.trackId); const targetKeyframe = targetTrack?.keyframes.find((keyframe) => keyframe.id === contextMenu.target.keyframeId); if (!targetTrack || !targetKeyframe) return null; const selectedModes = contextMenu.selection.flatMap((selection) => { const track = tracks.find((candidate) => candidate.id === selection.trackId); const keyframe = track?.keyframes.find((candidate) => candidate.id === selection.keyframeId); return keyframe ? [timelineEasingMode(keyframe)] : [] }); const mixed = selectedModes.length > 1 && selectedModes.some((mode) => mode !== selectedModes[0]); const activeMode = mixed ? null : selectedModes[0] ?? timelineEasingMode(targetKeyframe); return <div className="v2-timeline-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" aria-label="Keyframe interpolation"><span className="v2-timeline-context-title">Interpolation{mixed ? ' · Mixed' : ''}</span>{canEditTimelineInterpolation ? easingOptions.map((option) => <button key={option.mode} className="v2-timeline-context-item" onPointerDown={(event) => event.stopPropagation()} onClick={() => { onKeyframeInterpolationChange(contextMenu.selection, option.mode); setContextMenu(null) }} role="menuitem" type="button"><span>{activeMode === option.mode ? '✓' : ''}</span>{option.label}</button>) : <span className="v2-timeline-context-title">Host only</span>}</div> })() : null}
  </section>
}
