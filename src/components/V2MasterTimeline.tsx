import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { MasterClipDocument, MasterImageClipDocument, MasterSequenceDocument } from '../core/masterSequence'
import { effectiveMasterRenderRange, MASTER_SHOT_DRAG_TYPE, masterClipDurationFrames, masterMusicTrackPresent, masterSequenceDurationFrames, masterSequenceFrameRate, masterSequenceVisualDurationFrames, musicClipDurationFrames, orderedMasterClips } from '../core/masterSequence'
import type { ShotDocument } from '../core/shotDocument'
import { frameToTimecode } from '../timeline/timelineMath'
import { fitMasterPixelsPerFrame, masterFrameToPixel, masterRulerFrames, pixelToMasterFrame } from '../core/masterTimelineMath'
import { masterTimelineInsertionIndex, masterTimelineOrderStartFrames, previewMasterClipOrder } from '../core/masterTimelineDrag'
import { clampMasterTrackHeight, DEFAULT_GRAPHICS_TRACK_HEIGHT, DEFAULT_MUSIC_TRACK_HEIGHT, DEFAULT_SHOTS_TRACK_HEIGHT, masterTrackPopoverPosition } from '../core/masterGraphics'
import type { MasterTimelineWorkspacePatch, MasterTimelineWorkspaceState } from '../core/timelineWorkspaceSession'
import type { TimelineZoomShortcutHandler } from '../core/editorShortcuts'
import type { ImageAssetHealth } from '../core/mediaHealth'

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
  projectId: string
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
  onDeleteMusicTrack: () => void
  onAddMusicTrack: () => void
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
  activeImageClipId: string | null
  onSelectImage: (clipId: string) => void
  onAddGraphicsTrack: () => void
  onImportImage: (trackId: string, file: File) => void
  imageHealth?: readonly ImageAssetHealth[]
  onMoveImage: (clipId: string, startMasterFrame: number) => void
  onTrimImage: (clipId: string, startMasterFrame: number, durationFrames: number) => void
  onChangeImageFade: (clipId: string, fadeInFrames: number, fadeOutFrames: number) => void
  onGraphicsTrackChange: (trackId: string, patch: { name?: string; visible?: boolean }) => void
  onDeleteGraphicsTrack: (trackId: string) => void
  initialWorkspaceState?: MasterTimelineWorkspaceState
  onWorkspaceStateChange?: (patch: MasterTimelineWorkspacePatch) => void
  onRegisterZoomShortcut?: (handler: TimelineZoomShortcutHandler | null) => void
}

export function V2MasterTimeline({ projectId, sequence, shots, scenes, activeClipId, masterFrame, fallbackRate, isPlaying, isLooping, musicPeaks, onSelectClip, onSelectMusic, onDeleteMusicTrack, onAddMusicTrack, onSetMasterFrame, onReturnToStart, onAddShot, onReorderClip, onImportMusic, onPlay, onPause, onStop, onToggleLoop, onMarkIn, onMarkOut, onSwitchToScene, onSwitchToMaster, activeImageClipId, onSelectImage, onAddGraphicsTrack, onImportImage, onMoveImage, onTrimImage, onChangeImageFade, onGraphicsTrackChange, onDeleteGraphicsTrack, imageHealth = [], initialWorkspaceState, onWorkspaceStateChange, onRegisterZoomShortcut }: V2MasterTimelineProps) {
  const clips = orderedMasterClips(sequence)
  const rate = masterSequenceFrameRate(sequence, shots, scenes, fallbackRate).rate
  const shotDuration = masterSequenceDurationFrames(sequence)
  const contentDuration = Math.max(1, masterSequenceVisualDurationFrames(sequence, rate))
  const renderRange = effectiveMasterRenderRange(sequence)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [pixelsPerFrame, setPixelsPerFrame] = useState(() => initialWorkspaceState?.pixelsPerFrame ?? fitMasterPixelsPerFrame(typeof window === 'undefined' ? 900 : window.innerWidth, contentDuration, rate))
  const [dragOver, setDragOver] = useState<{ index: number; left: number } | null>(null)
  const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const [imageTrackPicker, setImageTrackPicker] = useState<string | null>(null)
  const [trackHeights, setTrackHeights] = useState<Record<string, number>>(() => ({ shots: initialWorkspaceState?.trackHeights.shots ?? DEFAULT_SHOTS_TRACK_HEIGHT, music: initialWorkspaceState?.trackHeights.music ?? DEFAULT_MUSIC_TRACK_HEIGHT, ...(initialWorkspaceState?.trackHeights ?? {}) }))
  const [trackMenu, setTrackMenu] = useState<{ kind: 'graphics' | 'music'; id?: string; position: { left: number; top: number } } | null>(null)
  const [addTrackMenuOpen, setAddTrackMenuOpen] = useState(false)
  const scrubPointerRef = useRef<number | null>(null)
  const clipDragRef = useRef<ClipDragState | null>(null)
  const horizontalScrollRef = useRef(Math.max(0, initialWorkspaceState?.horizontalScroll ?? 0))
  const verticalScrollRef = useRef(Math.max(0, initialWorkspaceState?.verticalScroll ?? 0))
  const finishClipDragRef = useRef<(cancelled: boolean) => void>(() => undefined)
  const onReorderClipRef = useRef(onReorderClip)
  const suppressClipClickRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)

  useEffect(() => {
    setTrackMenu(null)
    setAddTrackMenuOpen(false)
  }, [projectId])

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

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth)
    const nextScrollLeft = Math.min(maxScrollLeft, horizontalScrollRef.current)
    track.scrollLeft = nextScrollLeft
    horizontalScrollRef.current = nextScrollLeft
    track.scrollTop = Math.min(Math.max(0, track.scrollHeight - track.clientHeight), verticalScrollRef.current)
    onWorkspaceStateChange?.({ horizontalScroll: nextScrollLeft, verticalScroll: track.scrollTop })
  }, [canvasWidth, onWorkspaceStateChange, viewportWidth])

  useEffect(() => {
    onWorkspaceStateChange?.({ pixelsPerFrame })
  }, [onWorkspaceStateChange, pixelsPerFrame])

  const frameAtClientX = (clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const bounds = track.getBoundingClientRect()
    return pixelToMasterFrame(clientX - bounds.left + track.scrollLeft - MASTER_TRACK_PADDING, scale, contentDuration)
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

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && imageTrackPicker) onImportImage(imageTrackPicker, file)
    setImageTrackPicker(null)
  }

  const zoomBy = useCallback((factor: number) => {
    const track = trackRef.current
    const nextScale = Math.max(0.02, Math.min(24, scale * factor))
    const anchorInViewport = track ? masterFrameToPixel(masterFrame, scale) - track.scrollLeft : 0
    setPixelsPerFrame(nextScale)
    if (track && typeof window !== 'undefined') window.requestAnimationFrame(() => {
      const nextScrollLeft = Math.max(0, masterFrameToPixel(masterFrame, nextScale) - anchorInViewport)
      track.scrollLeft = nextScrollLeft
      horizontalScrollRef.current = nextScrollLeft
      onWorkspaceStateChange?.({ horizontalScroll: nextScrollLeft })
    })
  }, [masterFrame, onWorkspaceStateChange, scale])
  const fitSequence = () => {
    setPixelsPerFrame(fitMasterPixelsPerFrame(viewportWidth || 900, contentDuration, rate))
    if (trackRef.current) trackRef.current.scrollLeft = 0
    horizontalScrollRef.current = 0
    onWorkspaceStateChange?.({ horizontalScroll: 0 })
  }

  useEffect(() => {
    if (!onRegisterZoomShortcut) return
    onRegisterZoomShortcut((direction) => zoomBy(direction === -1 ? 0.8 : 1.25))
    return () => onRegisterZoomShortcut(null)
  }, [onRegisterZoomShortcut, zoomBy])
  const rulerFrames = masterRulerFrames(contentDuration, scale, rate)
  const shotsTrackHeight = clampMasterTrackHeight('shots', trackHeights.shots ?? DEFAULT_SHOTS_TRACK_HEIGHT)
  const graphicsTrackHeight = (trackId: string) => clampMasterTrackHeight('graphics', trackHeights[trackId] ?? DEFAULT_GRAPHICS_TRACK_HEIGHT)
  const musicTrackHeight = clampMasterTrackHeight('music', trackHeights.music ?? DEFAULT_MUSIC_TRACK_HEIGHT)
  const musicPresent = masterMusicTrackPresent(sequence)
  const trackGridRows = `26px ${shotsTrackHeight}px ${(sequence.graphicsTracks ?? []).map((track) => `${graphicsTrackHeight(track.id)}px`).join(' ')} ${musicPresent ? `${musicTrackHeight}px` : ''} 30px`
  const requestImageImport = (trackId: string) => { setImageTrackPicker(trackId); imageFileInputRef.current?.click() }
  const setTrackHeight = (key: string, kind: 'shots' | 'graphics' | 'music', height: number) => {
    const next = { ...trackHeights, [key]: clampMasterTrackHeight(kind, height) }
    setTrackHeights(next)
    onWorkspaceStateChange?.({ trackHeights: next })
  }

  useEffect(() => {
    const validTrackIds = new Set(['shots', 'music', ...(sequence.graphicsTracks ?? []).map((track) => track.id)])
    const next = Object.fromEntries(Object.entries(trackHeights).filter(([key]) => validTrackIds.has(key)))
    const changed = Object.keys(next).length !== Object.keys(trackHeights).length || Object.entries(next).some(([key, height]) => trackHeights[key] !== height)
    if (changed) {
      setTrackHeights(next)
      onWorkspaceStateChange?.({ trackHeights: next })
    }
  }, [onWorkspaceStateChange, sequence.graphicsTracks, trackHeights])

  const handleScroll = () => {
    const track = trackRef.current
    if (!track) return
    horizontalScrollRef.current = track.scrollLeft
    verticalScrollRef.current = track.scrollTop
    onWorkspaceStateChange?.({ horizontalScroll: track.scrollLeft, verticalScroll: track.scrollTop })
  }
  const openTrackMenu = (kind: 'graphics' | 'music', event: PointerEvent<HTMLButtonElement>, id?: string) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = masterTrackPopoverPosition({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, { width: window.innerWidth, height: window.innerHeight })
    setTrackMenu((current) => current?.kind === kind && current.id === id ? null : { kind, id, position })
  }

  useEffect(() => {
    if (!trackMenu) return
    const close = (event: globalThis.PointerEvent | MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('.v2-master-track-menu-popover, .v2-master-track-menu-button')) setTrackMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setTrackMenu(null) }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKeyDown) }
  }, [trackMenu])

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
    <div className="v2-master-track-layout" style={{ gridTemplateColumns: '132px minmax(0, 1fr)' }}>
      <div className="v2-master-track-labels" style={{ gridTemplateRows: trackGridRows }}>
        <span aria-hidden="true" />
        <span className="v2-master-track-label">SHOTS</span>
        {(sequence.graphicsTracks ?? []).map((track) => <span className="v2-master-graphics-label" key={track.id}>
          <span className="v2-master-graphics-label-top"><button className="v2-master-track-name" type="button" title="Rename Graphics Track" onClick={() => { const name = window.prompt('Graphics track name', track.name)?.trim(); if (name) onGraphicsTrackChange(track.id, { name }) }}>{track.name}</button><button className="v2-master-track-visibility" type="button" aria-label={track.visible ? `Hide ${track.name}` : `Show ${track.name}`} onClick={() => onGraphicsTrackChange(track.id, { visible: !track.visible })}>{track.visible ? '◉' : '○'}</button><button className="v2-master-track-menu-button" type="button" aria-label={`Open ${track.name} menu`} aria-expanded={trackMenu?.kind === 'graphics' && trackMenu.id === track.id} onPointerDown={(event) => openTrackMenu('graphics', event, track.id)}>⋯</button></span>
        </span>)}
        {musicPresent ? <span className="v2-master-music-label"><span>MUSIC</span><button className="v2-master-track-menu-button" type="button" aria-label="Open Music menu" aria-expanded={trackMenu?.kind === 'music'} onPointerDown={(event) => openTrackMenu('music', event)}>⋯</button></span> : null}
        <span className="v2-master-add-track-wrap"><button className="v2-master-add-track" type="button" aria-expanded={addTrackMenuOpen} onClick={() => setAddTrackMenuOpen((open) => !open)}>+ Add Track</button>{addTrackMenuOpen ? <span className="v2-master-add-track-menu" role="menu"><button type="button" onClick={() => { onAddGraphicsTrack(); setAddTrackMenuOpen(false) }}>Graphics</button><button type="button" disabled={musicPresent} onClick={() => { onAddMusicTrack(); setAddTrackMenuOpen(false) }}>Music{musicPresent ? ' · already added' : ''}</button></span> : null}</span>
      </div>
      <div className="v2-master-track-scroll" ref={trackRef} onScroll={handleScroll} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onDragOver={handleDragOver} onDragLeave={() => setDragOver(null)} onDrop={handleDrop}>
        <div className={`v2-master-canvas${scrubbing ? ' is-scrubbing' : ''}`} ref={canvasRef} style={{ width: `${canvasWidth}px` }}>
          <div className="v2-master-ruler" aria-hidden="true">{rulerFrames.map((frame) => <span key={frame} style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(frame, scale)}px` } as CSSProperties}>{frameToTimecode(frame, rate)}</span>)}</div>
          <div className="v2-master-row v2-master-shots-row" style={{ minHeight: `${shotsTrackHeight}px`, height: `${shotsTrackHeight}px` }}>
            {clips.length === 0 ? <div className="v2-master-drop-empty">Drag shots here to build your sequence.</div> : renderedClips.map((clip) => {
              const startFrame = renderedStarts.get(clip.id) ?? 0
              if (clipDrag?.active && clip.id === clipDrag.clipId) return <MasterClipPlaceholder key={clip.id} clip={clip} shot={shots.find((candidate) => candidate.id === clip.shotId)} rate={rate} scale={scale} startFrame={startFrame} rowHeight={shotsTrackHeight} />
              return <MasterClipBlock key={clip.id} clip={clip} shot={shots.find((candidate) => candidate.id === clip.shotId)} rate={rate} scale={scale} selected={clip.id === activeClipId} startFrame={startFrame} rowHeight={shotsTrackHeight} onSelect={(frame) => { if (!suppressClipClickRef.current) onSelectClip(clip.id, frame) }} onPointerDown={beginClipDrag} />
            })}
            {dragOver ? <span className="v2-master-drop-indicator" style={{ left: `${dragOver.left}px` }} aria-hidden="true" /> : null}
            {clipDrag?.active && draggedClip ? <MasterClipBlock clip={draggedClip} shot={shots.find((candidate) => candidate.id === draggedClip.shotId)} rate={rate} scale={scale} selected={false} startFrame={0} rowHeight={shotsTrackHeight} floating leftPx={draggedLeft} widthPx={draggedWidth} onSelect={() => {}} /> : null}
            <MasterTrackResizeHandle kind="shots" height={shotsTrackHeight} label="Resize Shots Track" onHeightChange={(height) => setTrackHeight('shots', 'shots', height)} />
          </div>
          {(sequence.graphicsTracks ?? []).map((track) => <div className="v2-master-row v2-master-graphics-row" key={track.id} data-master-graphics-track={track.id} style={{ minHeight: `${graphicsTrackHeight(track.id)}px`, height: `${graphicsTrackHeight(track.id)}px` }}>
            {(sequence.imageClips ?? []).filter((clip) => clip.trackId === track.id).map((clip) => <MasterImageClipBlock key={clip.id} clip={clip} assetName={(sequence.imageAssets ?? []).find((asset) => asset.id === clip.assetId)?.fileName ?? 'Image'} health={imageHealth.find((item) => item.assetId === clip.assetId)?.status} rate={rate} scale={scale} selected={clip.id === activeImageClipId} onSelect={() => onSelectImage(clip.id)} onMove={onMoveImage} onTrim={onTrimImage} onFade={onChangeImageFade} />)}
            <MasterLaneAction className={`v2-master-lane-add-image${(sequence.imageClips ?? []).some((clip) => clip.trackId === track.id) ? ' is-after-clips' : ''}`} style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(Math.max(0, ...(sequence.imageClips ?? []).filter((clip) => clip.trackId === track.id).map((clip) => clip.startMasterFrame + clip.durationFrames)), scale) + 12}px`, right: 'auto' }} onClick={() => requestImageImport(track.id)}>+ Add Image</MasterLaneAction>
            {!track.visible ? <span className="v2-master-track-hidden">Hidden</span> : null}
            <MasterTrackResizeHandle kind="graphics" height={graphicsTrackHeight(track.id)} label={`Resize ${track.name}`} onHeightChange={(height) => setTrackHeight(track.id, 'graphics', height)} />
          </div>)}
          {musicPresent ? <div className="v2-master-row v2-master-music-row" style={{ minHeight: `${musicTrackHeight}px`, height: `${musicTrackHeight}px` }}>
            {sequence.musicClip ? <div className="v2-master-music-clip-shell" data-master-music style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(sequence.musicClip.startMasterFrame, scale)}px`, width: `${Math.max(80, masterFrameToPixel(musicClipDurationFrames(sequence.musicClip, rate), scale))}px` }}><button type="button" className="v2-master-music-clip" onClick={(event) => { event.stopPropagation(); onSelectMusic() }}><WaveformCanvas peaks={musicPeaks} sourceStart={sequence.musicClip.sourceStartSeconds} sourceEnd={sequence.musicClip.sourceEndSeconds} duration={sequence.musicClip.durationSeconds} /><span className="v2-master-music-name">{sequence.musicClip.asset.fileName}</span></button><button type="button" className="v2-master-music-replace" onClick={(event) => { event.stopPropagation(); fileInputRef.current?.click() }}>Replace</button></div> : <MasterLaneAction className="v2-master-music-empty" onClick={() => fileInputRef.current?.click()}>+ Import Music</MasterLaneAction>}
            <MasterTrackResizeHandle kind="music" height={musicTrackHeight} label="Resize Music Track" onHeightChange={(height) => setTrackHeight('music', 'music', height)} />
          </div> : null}
          <div className="v2-master-add-track-lane" aria-hidden="true" style={{ height: '30px' }} />
          {shotDuration > 0 ? <span className="v2-master-mark v2-master-mark-in" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(renderRange.startFrame, scale)}px` }} aria-hidden="true" /> : null}
          {shotDuration > 0 ? <span className="v2-master-mark v2-master-mark-out" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(renderRange.endFrame, scale)}px` }} aria-hidden="true" /> : null}
          <span className="v2-master-playhead" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(masterFrame, scale)}px` }} aria-hidden="true" />
        </div>
      </div>
    </div>
    {trackMenu && typeof document !== 'undefined' ? createPortal(<MasterTrackMenuPopover position={trackMenu.position} kind={trackMenu.kind} confirmDelete={Boolean(sequence.musicClip)} onClose={() => setTrackMenu(null)} onRename={trackMenu.kind === 'graphics' && trackMenu.id ? () => { const track = (sequence.graphicsTracks ?? []).find((candidate) => candidate.id === trackMenu.id); const name = track ? window.prompt('Graphics track name', track.name)?.trim() : ''; if (name && trackMenu.id) onGraphicsTrackChange(trackMenu.id, { name }); setTrackMenu(null) } : undefined} onToggleVisibility={trackMenu.kind === 'graphics' && trackMenu.id ? () => { const track = (sequence.graphicsTracks ?? []).find((candidate) => candidate.id === trackMenu.id); if (track) onGraphicsTrackChange(track.id, { visible: !track.visible }); setTrackMenu(null) } : undefined} onDelete={() => { if (trackMenu.kind === 'graphics' && trackMenu.id) onDeleteGraphicsTrack(trackMenu.id); else if (trackMenu.kind === 'music') onDeleteMusicTrack(); setTrackMenu(null) }} onReplace={trackMenu.kind === 'music' && sequence.musicClip ? () => { fileInputRef.current?.click(); setTrackMenu(null) } : undefined} />, document.body) : null}
    <input ref={fileInputRef} className="v2-hidden-file-input" type="file" accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/aac,.wav,.mp3,.m4a,.aac" onChange={chooseMusic} />
    <input ref={imageFileInputRef} className="v2-hidden-file-input" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={chooseImage} />
  </section>
}

function clipVisualWidth(clip: MasterClipDocument, scale: number): number {
  return Math.max(24, masterFrameToPixel(masterClipDurationFrames(clip), scale))
}

function MasterLaneAction({ children, className = '', style, onClick }: { children: string; className?: string; style?: CSSProperties; onClick: () => void }) {
  return <button type="button" className={`v2-master-lane-action ${className}`} style={style} onClick={onClick}>{children}</button>
}

function MasterClipPlaceholder({ clip, shot, rate, scale, startFrame, rowHeight }: { clip: MasterClipDocument; shot: ShotDocument | undefined; rate: { numerator: number; denominator: number }; scale: number; startFrame: number; rowHeight: number }) {
  return <span className="v2-master-clip-placeholder" style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(startFrame, scale)}px`, width: `${clipVisualWidth(clip, scale)}px`, height: `${Math.max(48, rowHeight - 10)}px` }} aria-hidden="true"><span>{shot?.name ?? 'Missing Shot'}</span><small>{frameToTimecode(masterClipDurationFrames(clip), rate)}</small></span>
}

function MasterClipBlock({ clip, shot, rate, scale, selected, startFrame, rowHeight, onSelect, onPointerDown, floating = false, leftPx, widthPx }: { clip: MasterClipDocument; shot: ShotDocument | undefined; rate: { numerator: number; denominator: number }; scale: number; selected: boolean; startFrame: number; rowHeight: number; onSelect: (frame: number) => void; onPointerDown?: (event: PointerEvent<HTMLButtonElement>, clip: MasterClipDocument) => void; floating?: boolean; leftPx?: number; widthPx?: number }) {
  const duration = masterClipDurationFrames(clip)
  return <button type="button" className={`v2-master-clip${selected ? ' is-selected' : ''}${floating ? ' is-floating' : ''}`} data-master-clip={clip.id} aria-hidden={floating || undefined} tabIndex={floating ? -1 : undefined} onPointerDown={(event) => { if (!floating) onPointerDown?.(event, clip) }} onClick={(event) => { event.stopPropagation(); if (!floating) onSelect(startFrame) }} style={{ left: `${leftPx ?? MASTER_TRACK_PADDING + masterFrameToPixel(startFrame, scale)}px`, width: `${widthPx ?? clipVisualWidth(clip, scale)}px`, height: `${Math.max(48, rowHeight - 10)}px` }} title={shot?.name ?? 'Missing Shot'}><span>{shot?.name ?? 'Missing Shot'}</span><small>{frameToTimecode(duration, rate)}</small></button>
}

function MasterTrackResizeHandle({ kind, height, label, onHeightChange }: { kind: 'shots' | 'graphics' | 'music'; height: number; label: string; onHeightChange: (height: number) => void }) {
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null)
  useEffect(() => () => { dragRef.current = null }, [])
  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!cancelled) onHeightChange(drag.startHeight + event.clientY - drag.startY)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }
  return <button className={`v2-master-track-resize v2-master-track-resize-${kind}`} type="button" aria-label={label} onPointerDown={(event) => { event.stopPropagation(); if (event.button !== 0) return; dragRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight: height }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { event.stopPropagation(); const drag = dragRef.current; if (drag?.pointerId === event.pointerId) onHeightChange(drag.startHeight + event.clientY - drag.startY) }} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => { if (dragRef.current?.pointerId === event.pointerId) finish(event, true) }}><span /></button>
}

function MasterTrackMenuPopover({ position, kind, confirmDelete, onClose, onRename, onToggleVisibility, onDelete, onReplace }: { position: { left: number; top: number }; kind: 'graphics' | 'music'; confirmDelete: boolean; onClose: () => void; onRename?: () => void; onToggleVisibility?: () => void; onDelete: () => void; onReplace?: () => void }) {
  return <div className="v2-master-track-menu-popover" role="menu" style={{ left: `${position.left}px`, top: `${position.top}px` }} onPointerDown={(event) => event.stopPropagation()}>
    {kind === 'graphics' ? <><button type="button" role="menuitem" onClick={onRename}>Rename</button><button type="button" role="menuitem" onClick={onToggleVisibility}>{onToggleVisibility ? 'Hide / Show' : 'Visibility'}</button></> : null}
    {kind === 'music' && onReplace ? <button type="button" role="menuitem" onClick={onReplace}>Replace Music</button> : null}
    <button type="button" role="menuitem" onClick={() => { if (kind === 'music' && confirmDelete && !window.confirm('Delete Music Track?\n\nThis will remove the music from the Master Timeline.')) return; onDelete(); onClose() }}>Delete Track</button>
  </div>
}

function MasterImageClipBlock({ clip, assetName, health, rate, scale, selected, onSelect, onMove, onTrim, onFade }: { clip: MasterImageClipDocument; assetName: string; health?: ImageAssetHealth['status']; rate: { numerator: number; denominator: number }; scale: number; selected: boolean; onSelect: () => void; onMove: (clipId: string, start: number) => void; onTrim: (clipId: string, start: number, duration: number) => void; onFade: (clipId: string, fadeIn: number, fadeOut: number) => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dragRef = useRef<{ mode: 'move' | 'trim-left' | 'trim-right' | 'fade-in' | 'fade-out'; startX: number; startFrame: number; duration: number; fadeIn: number; fadeOut: number; pointerId: number } | null>(null)
  const [draft, setDraft] = useState({ start: clip.startMasterFrame, duration: clip.durationFrames, fadeIn: clip.fadeInFrames, fadeOut: clip.fadeOutFrames })
  const draftRef = useRef(draft)
  const commitDraft = (next: typeof draft) => { draftRef.current = next; setDraft(next) }
  const updateDraft = (update: (current: typeof draft) => typeof draft) => setDraft((current) => { const next = update(current); draftRef.current = next; return next })
  useEffect(() => commitDraft({ start: clip.startMasterFrame, duration: clip.durationFrames, fadeIn: clip.fadeInFrames, fadeOut: clip.fadeOutFrames }), [clip.durationFrames, clip.fadeInFrames, clip.fadeOutFrames, clip.startMasterFrame])
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !dragRef.current) return
      const pointerId = dragRef.current.pointerId
      if (buttonRef.current?.hasPointerCapture(pointerId)) buttonRef.current.releasePointerCapture(pointerId)
      dragRef.current = null
      commitDraft({ start: clip.startMasterFrame, duration: clip.durationFrames, fadeIn: clip.fadeInFrames, fadeOut: clip.fadeOutFrames })
    }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [clip.durationFrames, clip.fadeInFrames, clip.fadeOutFrames, clip.startMasterFrame])
  const begin = (event: PointerEvent<HTMLElement>, mode: 'move' | 'trim-left' | 'trim-right' | 'fade-in' | 'fade-out') => {
    event.stopPropagation()
    if (event.button !== 0) return
    dragRef.current = { mode, startX: event.clientX, startFrame: clip.startMasterFrame, duration: clip.durationFrames, fadeIn: clip.fadeInFrames, fadeOut: clip.fadeOutFrames, pointerId: event.pointerId }
    buttonRef.current?.setPointerCapture(event.pointerId)
  }
  const update = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = Math.round((event.clientX - drag.startX) / Math.max(0.01, scale))
    if (drag.mode === 'move') updateDraft((current) => ({ ...current, start: Math.max(0, drag.startFrame + delta) }))
    if (drag.mode === 'trim-left') { const nextStart = Math.max(0, Math.min(drag.startFrame + drag.duration - 1, drag.startFrame + delta)); updateDraft((current) => ({ ...current, start: nextStart, duration: drag.startFrame + drag.duration - nextStart })) }
    if (drag.mode === 'trim-right') updateDraft((current) => ({ ...current, duration: Math.max(1, drag.duration + delta) }))
    if (drag.mode === 'fade-in') updateDraft((current) => ({ ...current, fadeIn: Math.max(0, Math.min(drag.duration - drag.fadeOut, drag.fadeIn + delta)) }))
    if (drag.mode === 'fade-out') updateDraft((current) => ({ ...current, fadeOut: Math.max(0, Math.min(drag.duration - drag.fadeIn, drag.fadeOut + delta)) }))
  }
  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const finalDraft = draftRef.current; if (!cancelled) { if (drag.mode === 'move') onMove(clip.id, finalDraft.start); else if (drag.mode === 'trim-left' || drag.mode === 'trim-right') onTrim(clip.id, finalDraft.start, finalDraft.duration); else onFade(clip.id, finalDraft.fadeIn, finalDraft.fadeOut) } if (buttonRef.current?.hasPointerCapture(event.pointerId)) buttonRef.current.releasePointerCapture(event.pointerId); dragRef.current = null; if (cancelled) commitDraft({ start: clip.startMasterFrame, duration: clip.durationFrames, fadeIn: clip.fadeInFrames, fadeOut: clip.fadeOutFrames }) }
  return <button ref={buttonRef} type="button" className={`v2-master-image-clip${selected ? ' is-selected' : ''}${health && health !== 'available' ? ' is-missing-media' : ''}`} data-master-image={clip.id} onClick={(event) => { event.stopPropagation(); onSelect() }} onPointerDown={(event) => begin(event, 'move')} onPointerMove={update} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)} style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(draft.start, scale)}px`, width: `${Math.max(30, masterFrameToPixel(draft.duration, scale))}px` }} title={`${assetName}${health && health !== 'available' ? ` · ${health}` : ''}`}><span className="v2-master-image-name">{assetName}</span><small>{health && health !== 'available' ? 'Missing' : frameToTimecode(draft.duration, rate)}</small><span className="v2-master-image-handle is-fade-in" onPointerDown={(event) => begin(event, 'fade-in')} title="Fade in" /><span className="v2-master-image-handle is-fade-out" onPointerDown={(event) => begin(event, 'fade-out')} title="Fade out" /><span className="v2-master-image-handle is-trim-left" onPointerDown={(event) => begin(event, 'trim-left')} /><span className="v2-master-image-handle is-trim-right" onPointerDown={(event) => begin(event, 'trim-right')} /></button>
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
