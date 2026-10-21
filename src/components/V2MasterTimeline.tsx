import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { MasterClipDocument, MasterSequenceDocument } from '../core/masterSequence'
import { effectiveMasterRenderRange, MASTER_SHOT_DRAG_TYPE, masterClipDurationFrames, masterSequenceDurationFrames, masterSequenceFrameRate, masterSequenceVisualDurationFrames, musicClipDurationFrames, orderedMasterClips } from '../core/masterSequence'
import type { ShotDocument } from '../core/shotDocument'
import { frameToTimecode } from '../timeline/timelineMath'
import { fitMasterPixelsPerFrame, masterFrameToPixel, masterRulerFrames, pixelToMasterFrame } from '../core/masterTimelineMath'
import { masterTimelineInsertionIndex, masterTimelineOrderStartFrames, previewMasterClipOrder } from '../core/masterTimelineDrag'

const MASTER_TRACK_PADDING = 8
const DRAG_THRESHOLD_PX = 5
const AUTO_SCROLL_EDGE_PX = 56

type ClipDragState = {
  clipId: string
  pointerId: number
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
  currentTimelineX: number
  grabOffsetPx: number
  previewIndex: number
  active: boolean
}

type V2MasterTimelineProps = {
  sequence: MasterSequenceDocument
  shots: readonly ShotDocument[]
  scenes: readonly ProjectSceneEntry[]
  activeClipId: string | null
  masterFrame: number
  fallbackRate: { numerator: number; denominator: number }
  isPlaying: boolean
  isLooping: boolean
  musicPeaks: readonly number[] | null
  onSelectClip: (clipId: string, frame: number) => void
  onSelectMusic: () => void
  onSetMasterFrame: (frame: number) => void
  onReturnToStart: () => void
  onAddShot: (shotId: string, index?: number) => void
  onReorderClip: (clipId: string, index: number) => void
  onImportMusic: (file: File) => void
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onToggleLoop: () => void
  onMarkIn: () => void
  onMarkOut: () => void
  onSwitchToScene: () => void
  onSwitchToMaster: () => void
}

export function V2MasterTimeline({ sequence, shots, scenes, activeClipId, masterFrame, fallbackRate, isPlaying, isLooping, musicPeaks, onSelectClip, onSelectMusic, onSetMasterFrame, onReturnToStart, onAddShot, onReorderClip, onImportMusic, onPlay, onPause, onStop, onToggleLoop, onMarkIn, onMarkOut, onSwitchToScene, onSwitchToMaster }: V2MasterTimelineProps) {
  const clips = orderedMasterClips(sequence)
  const rate = masterSequenceFrameRate(sequence, shots, scenes, fallbackRate).rate
  const shotDuration = masterSequenceDurationFrames(sequence)
  const contentDuration = Math.max(1, masterSequenceVisualDurationFrames(sequence, rate))
  const renderRange = effectiveMasterRenderRange(sequence)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [pixelsPerFrame, setPixelsPerFrame] = useState(() => fitMasterPixelsPerFrame(typeof window === 'undefined' ? 900 : window.innerWidth, contentDuration, rate))
  const [dragOver, setDragOver] = useState<{ index: number; left: number } | null>(null)
  const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrubPointerRef = useRef<number | null>(null)
  const clipDragRef = useRef<ClipDragState | null>(null)
  const finishClipDragRef = useRef<(cancelled: boolean) => void>(() => undefined)
  const onReorderClipRef = useRef(onReorderClip)
  const suppressClipClickRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)

  useEffect(() => {
    onReorderClipRef.current = onReorderClip
  }, [onReorderClip])
  const scale = pixelsPerFrame
  const canvasWidth = Math.max(viewportWidth, masterFrameToPixel(contentDuration, scale) + MASTER_TRACK_PADDING * 2 + 24)
  const renderedClips = clipDrag?.active ? previewMasterClipOrder(clips, clipDrag.clipId, clipDrag.previewIndex) : clips
  const renderedStarts = masterTimelineOrderStartFrames(renderedClips)
  const draggedClip = clipDrag ? clips.find((clip) => clip.id === clipDrag.clipId) ?? null : null
  const draggedWidth = draggedClip ? clipVisualWidth(draggedClip, scale) : 0

  useEffect(() => {
    const element = trackRef.current
    if (!element) return
    const update = () => setViewportWidth(element.clientWidth)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(element)
    return () => observer?.disconnect()
  }, [])

  const frameAtClientX = (clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const bounds = track.getBoundingClientRect()
    return pixelToMasterFrame(clientX - bounds.left + track.scrollLeft - MASTER_TRACK_PADDING, scale, shotDuration > 0 ? shotDuration - 1 : 0)
  }

  const setFrameFromPointer = (clientX: number) => onSetMasterFrame(frameAtClientX(clientX))

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-master-music], button')) return
    event.preventDefault()
    scrubPointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubbing(true)
    setFrameFromPointer(event.clientX)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const activeClipDrag = clipDragRef.current
    if (activeClipDrag?.pointerId === event.pointerId) {
      updateClipDrag(event.clientX, event.clientY)
      return
    }
    if (scrubPointerRef.current !== event.pointerId) return
    setFrameFromPointer(event.clientX)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (clipDragRef.current?.pointerId === event.pointerId) {
      finishClipDrag(false)
      return
    }
    if (scrubPointerRef.current !== event.pointerId) return
    scrubPointerRef.current = null
    setScrubbing(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    if (clipDragRef.current?.pointerId === event.pointerId) {
      finishClipDrag(true)
      return
    }
    if (scrubPointerRef.current !== event.pointerId) return
    scrubPointerRef.current = null
    setScrubbing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const pointerTimelineX = (clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const bounds = track.getBoundingClientRect()
    return Math.max(0, clientX - bounds.left + track.scrollLeft - MASTER_TRACK_PADDING)
  }

  const draggedLeft = clipDrag && draggedClip ? Math.max(0, MASTER_TRACK_PADDING + clipDrag.currentTimelineX - clipDrag.grabOffsetPx) : 0

  const insertionForTimelineX = (timelineX: number, draggedClipId: string | null = null) => {
    const index = masterTimelineInsertionIndex(clips, timelineX, scale, draggedClipId)
    const visibleClips = draggedClipId ? clips.filter((clip) => clip.id !== draggedClipId) : clips
    const frame = visibleClips.slice(0, index).reduce((total, clip) => total + masterClipDurationFrames(clip), 0)
    return { index, left: MASTER_TRACK_PADDING + masterFrameToPixel(frame, scale) }
  }

  const stopAutoScroll = () => {
    if (autoScrollFrameRef.current !== null && typeof window !== 'undefined') window.cancelAnimationFrame(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
  }

  const autoScroll = () => {
    const state = clipDragRef.current
    const track = trackRef.current
    if (!state?.active || !track || typeof window === 'undefined') {
      stopAutoScroll()
      return
    }
    const bounds = track.getBoundingClientRect()
    let delta = 0
    if (state.currentClientX < bounds.left + AUTO_SCROLL_EDGE_PX) {
      delta = -Math.max(2, Math.round((bounds.left + AUTO_SCROLL_EDGE_PX - state.currentClientX) / 8))
    } else if (state.currentClientX > bounds.right - AUTO_SCROLL_EDGE_PX) {
      delta = Math.max(2, Math.round((state.currentClientX - (bounds.right - AUTO_SCROLL_EDGE_PX)) / 8))
    }
    if (delta !== 0) {
      track.scrollLeft = Math.max(0, track.scrollLeft + delta)
      updateClipDrag(state.currentClientX, state.currentClientY)
    }
    autoScrollFrameRef.current = window.requestAnimationFrame(autoScroll)
  }

  const startAutoScroll = () => {
    stopAutoScroll()
    if (typeof window !== 'undefined') autoScrollFrameRef.current = window.requestAnimationFrame(autoScroll)
  }

  const beginClipDrag = (event: PointerEvent<HTMLButtonElement>, clip: MasterClipDocument) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const timelineX = pointerTimelineX(event.clientX)
    const starts = masterTimelineOrderStartFrames(clips)
    const startPx = masterFrameToPixel(starts.get(clip.id) ?? 0, scale)
    const next: ClipDragState = { clipId: clip.id, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, currentClientX: event.clientX, currentClientY: event.clientY, currentTimelineX: timelineX, grabOffsetPx: Math.max(0, timelineX - startPx), previewIndex: clips.findIndex((candidate) => candidate.id === clip.id), active: false }
    clipDragRef.current = next
    setClipDrag(next)
    trackRef.current?.setPointerCapture(event.pointerId)
  }

  const updateClipDrag = (clientX: number, clientY: number) => {
    const current = clipDragRef.current
    if (!current) return
    const movedX = clientX - current.startClientX
    const movedY = clientY - current.startClientY
    const active = current.active || (Math.hypot(movedX, movedY) >= DRAG_THRESHOLD_PX && Math.abs(movedX) >= Math.abs(movedY))
    if (!active) return
    const timelineX = pointerTimelineX(clientX)
    const previewIndex = masterTimelineInsertionIndex(clips, timelineX, scale, current.clipId)
    const next = { ...current, currentClientX: clientX, currentClientY: clientY, currentTimelineX: timelineX, previewIndex, active: true }
    clipDragRef.current = next
    setClipDrag(next)
    if (!current.active) startAutoScroll()
  }

  const finishClipDrag = (cancelled: boolean) => {
    const current = clipDragRef.current
    if (!current) return
    stopAutoScroll()
    clipDragRef.current = null
    setClipDrag(null)
    if (trackRef.current?.hasPointerCapture(current.pointerId)) trackRef.current.releasePointerCapture(current.pointerId)
    if (cancelled || !current.active) return
    suppressClipClickRef.current = true
    const targetIndex = current.previewIndex
    onReorderClipRef.current(current.clipId, targetIndex)
    if (typeof window !== 'undefined') window.setTimeout(() => { suppressClipClickRef.current = false }, 0)
  }

  useEffect(() => {
    finishClipDragRef.current = finishClipDrag
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && clipDragRef.current?.active) {
        event.preventDefault()
        finishClipDragRef.current(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      stopAutoScroll()
    }
  }, [])

  const insertionForX = (clientX: number) => {
    return insertionForTimelineX(pointerTimelineX(clientX))
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(MASTER_SHOT_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(MASTER_SHOT_DRAG_TYPE) ? 'copy' : 'move'
    setDragOver(insertionForX(event.clientX))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const insertion = dragOver ?? insertionForX(event.clientX)
    const shotId = event.dataTransfer.getData(MASTER_SHOT_DRAG_TYPE)
    if (shotId) onAddShot(shotId, insertion.index)
    setDragOver(null)
  }

  const chooseMusic = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onImportMusic(file)
  }

  const zoomBy = (factor: number) => {
    const track = trackRef.current
    const nextScale = Math.max(0.02, Math.min(24, scale * factor))
    const anchorInViewport = track ? masterFrameToPixel(masterFrame, scale) - track.scrollLeft : 0
    setPixelsPerFrame(nextScale)
    if (track && typeof window !== 'undefined') window.requestAnimationFrame(() => { track.scrollLeft = Math.max(0, masterFrameToPixel(masterFrame, nextScale) - anchorInViewport) })
  }
  const fitSequence = () => setPixelsPerFrame(fitMasterPixelsPerFrame(viewportWidth || 900, contentDuration, rate))
  const rulerFrames = masterRulerFrames(contentDuration, scale, rate)

  return <section className="v2-master-timeline" aria-label="Master Timeline">
    <div className="v2-master-timeline-toolbar">
      <div className="v2-timeline-toolbar-content">
        <div className="v2-timeline-mode-tabs"><button type="button" onClick={onSwitchToScene}>Scene</button><button className="is-active" type="button" onClick={onSwitchToMaster}>Master</button></div>
        <div className="v2-timeline-context"><output className="v2-timeline-readout v2-master-duration" title="Master video sequence duration">Duration {frameToTimecode(shotDuration, rate)}</output></div>
        <div className="v2-unified-transport" aria-label="Master transport"><button type="button" onClick={onReturnToStart} title="Return to start">|&lt;</button><button type="button" onClick={isPlaying ? onPause : onPlay} disabled={shotDuration <= 0} title={isPlaying ? 'Pause Master playback' : 'Play Master playback'}>{isPlaying ? '❚❚' : '▶'}</button><button type="button" onClick={onStop} title="Stop Master playback">■</button><button className={`v2-timeline-loop${isLooping ? ' is-active' : ''}`} type="button" onClick={onToggleLoop} aria-pressed={isLooping} aria-label={isLooping ? 'Disable Master loop' : 'Enable Master loop'} title="Loop Playback">Loop</button></div>
        <output className="v2-timeline-readout v2-master-timecode" title="Master timecode"><span>TC</span>{frameToTimecode(masterFrame, rate)}</output>
        <div className="v2-unified-zoom" aria-label="Timeline zoom"><button type="button" onClick={() => zoomBy(0.8)} title="Zoom out">−</button><button type="button" onClick={fitSequence} title="Fit all Master content">Fit</button><button type="button" onClick={() => zoomBy(1.25)} title="Zoom in">+</button></div>
        <div className="v2-timeline-marks" aria-label="Master render range"><button type="button" onClick={onMarkIn} aria-label="Mark In" title={`Mark In · ${frameToTimecode(renderRange.startFrame, rate)}`}>[</button><button type="button" onClick={onMarkOut} aria-label="Mark Out" title={`Mark Out · ${frameToTimecode(renderRange.endFrame, rate)}`}>]</button></div>
        <button type="button" className="v2-small-action v2-master-add-shot" onClick={() => setPickerOpen((open) => !open)}>+ Add Shot</button>
      </div>
    </div>
    {pickerOpen ? <div className="v2-master-shot-picker">{shots.length === 0 ? <span>No Shots available.</span> : shots.map((shot) => <button type="button" key={shot.id} onClick={() => { onAddShot(shot.id); setPickerOpen(false) }}>{shot.name}</button>)}</div> : null}
    <div className="v2-master-track-layout">
      <div className="v2-master-track-labels"><span aria-hidden="true" /><span>SHOTS</span><span className="v2-master-music-label"><span>MUSIC</span></span></div>
      <div className="v2-master-track-scroll" ref={trackRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onDragOver={handleDragOver} onDragLeave={() => setDragOver(null)} onDrop={handleDrop}>
        <div className={`v2-master-canvas${scrubbing ? ' is-scrubbing' : ''}`} ref={canvasRef} style={{ width: `${canvasWidth}px` }}>
          <div className="v2-master-ruler" aria-hidden="true">{rulerFrames.map((frame) => <span key={frame} style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(frame, scale)}px` } as CSSProperties}>{frameToTimecode(frame, rate)}</span>)}</div>
          <div className="v2-master-row v2-master-shots-row">
            {clips.length === 0 ? <div className="v2-master-drop-empty">Drag shots here to build your sequence.</div> : renderedClips.map((clip) => {
              const startFrame = renderedStarts.get(clip.id) ?? 0
              if (clipDrag?.active && clip.id === clipDrag.clipId) return <MasterClipPlaceholder key={clip.id} clip={clip} shot={shots.find((candidate) => candidate.id === clip.shotId)} rate={rate} scale={scale} startFrame={startFrame} />
              return <MasterClipBlock key={clip.id} clip={clip} shot={shots.find((candidate) => candidate.id === clip.shotId)} rate={rate} scale={scale} selected={clip.id === activeClipId} startFrame={startFrame} onSelect={(frame) => { if (!suppressClipClickRef.current) onSelectClip(clip.id, frame) }} onPointerDown={beginClipDrag} />
            })}
            {dragOver ? <span className="v2-master-drop-indicator" style={{ left: `${dragOver.left}px` }} aria-hidden="true" /> : null}
            {clipDrag?.active && draggedClip ? <MasterClipBlock clip={draggedClip} shot={shots.find((candidate) => candidate.id === draggedClip.shotId)} rate={rate} scale={scale} selected={false} startFrame={0} floating leftPx={draggedLeft} widthPx={draggedWidth} onSelect={() => {}} /> : null}
          </div>
          <div className="v2-master-row v2-master-music-row">
            {sequence.musicClip ? <div className="v2-master-music-clip-shell" data-master-music style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(sequence.musicClip.startMasterFrame, scale)}px`, width: `${Math.max(80, masterFrameToPixel(musicClipDurationFrames(sequence.musicClip, rate), scale))}px` }}><button type="button" className="v2-master-music-clip" onClick={(event) => { event.stopPropagation(); onSelectMusic() }}><WaveformCanvas peaks={musicPeaks} sourceStart={sequence.musicClip.sourceStartSeconds} sourceEnd={sequence.musicClip.sourceEndSeconds} duration={sequence.musicClip.durationSeconds} /><span className="v2-master-music-name">{sequence.musicClip.asset.fileName}</span></button><button type="button" className="v2-master-music-replace" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click() }}>Replace</button></div> : <button type="button" className="v2-master-music-empty" onClick={() => fileInputRef.current?.click()}>+ Import Music</button>}
          </div>
          {shotDuration > 0 ? <span className="v2-master-mark v2-master-mark-in" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(renderRange.startFrame, scale)}px` }} aria-hidden="true" /> : null}
          {shotDuration > 0 ? <span className="v2-master-mark v2-master-mark-out" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(renderRange.endFrame, scale)}px` }} aria-hidden="true" /> : null}
          <span className="v2-master-playhead" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(masterFrame, scale)}px` }} aria-hidden="true" />
        </div>
      </div>
    </div>
    <input ref={fileInputRef} className="v2-hidden-file-input" type="file" accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/aac,.wav,.mp3,.m4a,.aac" onChange={chooseMusic} />
  </section>
}

function clipVisualWidth(clip: MasterClipDocument, scale: number): number {
  return Math.max(24, masterFrameToPixel(masterClipDurationFrames(clip), scale))
}

function MasterClipPlaceholder({ clip, shot, rate, scale, startFrame }: { clip: MasterClipDocument; shot: ShotDocument | undefined; rate: { numerator: number; denominator: number }; scale: number; startFrame: number }) {
  return <span className="v2-master-clip-placeholder" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(startFrame, scale)}px`, width: `${clipVisualWidth(clip, scale)}px` }} aria-hidden="true"><span>{shot?.name ?? 'Missing Shot'}</span><small>{frameToTimecode(masterClipDurationFrames(clip), rate)}</small></span>
}

function MasterClipBlock({ clip, shot, rate, scale, selected, startFrame, onSelect, onPointerDown, floating = false, leftPx, widthPx }: { clip: MasterClipDocument; shot: ShotDocument | undefined; rate: { numerator: number; denominator: number }; scale: number; selected: boolean; startFrame: number; onSelect: (frame: number) => void; onPointerDown?: (event: PointerEvent<HTMLButtonElement>, clip: MasterClipDocument) => void; floating?: boolean; leftPx?: number; widthPx?: number }) {
  const duration = masterClipDurationFrames(clip)
  return <button type="button" className={`v2-master-clip${selected ? ' is-selected' : ''}${floating ? ' is-floating' : ''}`} data-master-clip={clip.id} aria-hidden={floating || undefined} tabIndex={floating ? -1 : undefined} onPointerDown={(event) => { if (!floating) onPointerDown?.(event, clip) }} onClick={(event) => { event.stopPropagation(); if (!floating) onSelect(startFrame) }} style={{ left: `${leftPx ?? MASTER_TRACK_PADDING + masterFrameToPixel(startFrame, scale)}px`, width: `${widthPx ?? clipVisualWidth(clip, scale)}px` }} title={shot?.name ?? 'Missing Shot'}><span>{shot?.name ?? 'Missing Shot'}</span><small>{frameToTimecode(duration, rate)}</small></button>
}

function WaveformCanvas({ peaks, sourceStart, sourceEnd, duration }: { peaks: readonly number[] | null; sourceStart: number; sourceEnd: number; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const width = Math.max(1, Math.floor(canvas.clientWidth))
      const height = Math.max(1, Math.floor(canvas.clientHeight))
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, width, height)
      if (!peaks?.length || duration <= 0) return
      const start = Math.max(0, sourceStart / duration)
      const end = Math.min(1, sourceEnd / duration)
      context.strokeStyle = 'rgba(74, 119, 166, .72)'
      context.lineWidth = 1
      for (let x = 0; x < width; x += 1) {
        const source = start + (end - start) * (x / Math.max(1, width - 1))
        const peak = peaks[Math.min(peaks.length - 1, Math.max(0, Math.floor(source * peaks.length)))] ?? 0
        const amplitude = Math.max(1, peak * height * .46)
        context.beginPath()
        context.moveTo(x + .5, height / 2 - amplitude)
        context.lineTo(x + .5, height / 2 + amplitude)
        context.stroke()
      }
    }
    draw()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw)
    observer?.observe(canvas)
    return () => observer?.disconnect()
  }, [duration, peaks, sourceEnd, sourceStart])
  return <canvas ref={canvasRef} className="v2-master-waveform" aria-hidden="true" />
}
