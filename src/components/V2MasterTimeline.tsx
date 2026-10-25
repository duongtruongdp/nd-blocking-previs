import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { MasterClipDocument, MasterImageClipDocument, MasterSequenceDocument } from '../core/masterSequence'
import { effectiveMasterRenderRange, MASTER_SHOT_DRAG_TYPE, masterClipDurationFrames, masterMusicTrackPresent, masterSequenceDurationFrames, masterSequenceFrameRate, masterSequenceVisualDurationFrames, musicClipDurationFrames, orderedMasterClips } from '../core/masterSequence'
import type { ShotDocument } from '../core/shotDocument'
import { frameToTimecode } from '../timeline/timelineMath'
import { fitMasterPixelsPerFrame, masterFrameRangeToPixels, masterFrameToPixel, masterRulerFrames, pixelToMasterFrame } from '../core/masterTimelineMath'
import { masterShotSnapTargets, masterTimelineOrderStartFrames, snapMasterFrame } from '../core/masterTimelineDrag'
import { moveMasterTimelineSelection, previewMasterClipTrim, type MasterTimelineItem, type MasterTrimLimit } from '../core/masterTimelineEditing'
import { masterClipEdgeHitZonePx, masterClipInteractionMode, MASTER_CLIP_EDGE_HIT_ZONE_PX, type MasterClipInteractionMode } from '../core/masterTimelineHitTesting'
import { clampMasterTrackHeight, DEFAULT_GRAPHICS_TRACK_HEIGHT, DEFAULT_MUSIC_TRACK_HEIGHT, DEFAULT_SHOTS_TRACK_HEIGHT, masterTrackPopoverPosition } from '../core/masterGraphics'
import type { MasterTimelineWorkspacePatch, MasterTimelineWorkspaceState } from '../core/timelineWorkspaceSession'
import type { TimelineZoomShortcutHandler } from '../core/editorShortcuts'
import type { ImageAssetHealth } from '../core/mediaHealth'
import { buildIdentity, desktopRuntimeAvailable, MASTER_TIMELINE_DIAGNOSTICS_REFRESH_EVENT, MASTER_TIMELINE_DIAGNOSTICS_TOGGLE_EVENT } from '../runtime/buildIdentity'

const MASTER_TRACK_PADDING = 8
const DRAG_THRESHOLD_PX = 5
const AUTO_SCROLL_EDGE_PX = 56

type ClipDragState = {
  clipId: string
  mode: MasterClipInteractionMode
  selection: MasterTimelineItem[]
  pointerId: number
  startClientX: number
  startClientY: number
  currentClientX: number
  currentClientY: number
  currentTimelineX: number
  grabOffsetPx: number
  startFrame: number
  currentStartFrame: number
  currentSourceStartFrame: number
  currentSourceEndFrame: number
  valid: boolean
  active: boolean
  trimDiagnostics: MasterTrimDiagnostics | null
}

type MasterGeometryRect = {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

type MasterGeometryCss = {
  width: string
  minWidth: string
  maxWidth: string
  boxSizing: string
  display: string
  flex: string
  flexShrink: string
  flexGrow: string
  flexBasis: string
  padding: string
  border: string
  margin: string
  transform: string
  overflow: string
  gap: string
}

type MasterShotGeometryDiagnostic = {
  index: number
  clipId: string
  startFrame: number
  endFrame: number
  expectedLeftX: number
  expectedRightX: number
  actualLeftX: number
  actualRightX: number
  actualWidth: number
  leftErrorPx: number
  rightErrorPx: number
  overlapsPrevious: boolean
  childOverflow: boolean
}

type MasterGeometryDiagnostics = {
  build: typeof buildIdentity
  capturedAt: string
  timelineMode: 'master'
  zoom: number
  frameRate: { numerator: number; denominator: number }
  sequenceEndFrame: number
  lastShotEndFrame: number
  lastShotStartFrame: number
  markInFrame: number
  markOutFrame: number
  horizontalScroll: number
  timelineOriginX: number
  viewportRect: MasterGeometryRect
  contentRect: MasterGeometryRect
  rulerRect: MasterGeometryRect | null
  shotTrackRect: MasterGeometryRect | null
  markOutRect: MasterGeometryRect | null
  lastShotOuterRect: MasterGeometryRect | null
  lastShotVisibleContentRect: MasterGeometryRect | null
  lastShotInnerContentRect: MasterGeometryRect | null
  lastShotCss: MasterGeometryCss | null
  shotTrackCss: MasterGeometryCss | null
  expectedLastShotEdgeX: number
  actualLastShotEdgeX: number | null
  expectedMarkOutX: number
  actualMarkOutX: number | null
  lastShotVsMarkOutFrameDifference: number
  lastShotVsMarkOutDOMPixelDifference: number | null
  expectedVsActualShotPixelDifference: number | null
  maximumMismatchPx: number
  overlapCount: number
  childOverflow: boolean
  errorsAccumulate: boolean
  firstOffendingClipId: string | null
  responsibleCssProperty: string
  shots: MasterShotGeometryDiagnostic[]
}

type MasterTrimDiagnostics = {
  clipId: string
  mode: Exclude<MasterClipInteractionMode, 'move'>
  pointerdownLocalX: number
  clipWidth: number
  edgeHitZoneWidth: number
  pointerStartX: number
  currentPointerX: number
  desiredFrame: number
  snappedFrame: number
  clampedFrame: number
  sourceIn: number
  sourceOut: number
  sourceMaximumDuration: number | null
  neighborCollisionBoundary: number | null
  activeLimitingConstraint: MasterTrimLimit
  previewValid: boolean
  finalCommittedTiming: { startMasterFrame: number; sourceStartFrame: number; sourceEndFrame: number } | null
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
  onSelectClip: (clipId: string, frame: number, extend?: boolean) => void
  selectedItems: readonly MasterTimelineItem[]
  onClearSelection: () => void
  onTimelineFocusChange?: (focused: boolean) => void
  onTrimClip: (clipId: string, sourceStartFrame: number, sourceEndFrame: number, timelineStartFrame?: number) => void
  onSelectMusic: () => void
  onDeleteMusicTrack: () => void
  onAddMusicTrack: () => void
  onSetMasterFrame: (frame: number) => void
  onReturnToStart: () => void
  onAddShot: (shotId: string, startMasterFrame?: number) => void
  onMoveClip: (clipId: string, startMasterFrame: number) => void
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
  onSelectImage: (clipId: string, extend?: boolean) => void
  onAddGraphicsTrack: () => void
  onImportImage: (trackId: string, file: File) => void
  imageHealth?: readonly ImageAssetHealth[]
  onMoveImage: (clipId: string, startMasterFrame: number, snapEnabled?: boolean) => void
  onTrimImage: (clipId: string, startMasterFrame: number, durationFrames: number) => void
  onChangeImageFade: (clipId: string, fadeInFrames: number, fadeOutFrames: number) => void
  onGraphicsTrackChange: (trackId: string, patch: { name?: string; visible?: boolean }) => void
  onDeleteGraphicsTrack: (trackId: string) => void
  initialWorkspaceState?: MasterTimelineWorkspaceState
  onWorkspaceStateChange?: (patch: MasterTimelineWorkspacePatch) => void
  onRegisterZoomShortcut?: (handler: TimelineZoomShortcutHandler | null) => void
}

export function V2MasterTimeline({ projectId, sequence, shots, scenes, activeClipId, masterFrame, fallbackRate, isPlaying, isLooping, musicPeaks, onSelectClip, selectedItems, onClearSelection, onTimelineFocusChange, onTrimClip, onSelectMusic, onDeleteMusicTrack, onAddMusicTrack, onSetMasterFrame, onReturnToStart, onAddShot, onMoveClip, onImportMusic, onPlay, onPause, onStop, onToggleLoop, onMarkIn, onMarkOut, onSwitchToScene, onSwitchToMaster, activeImageClipId, onSelectImage, onAddGraphicsTrack, onImportImage, onMoveImage, onTrimImage, onChangeImageFade, onGraphicsTrackChange, onDeleteGraphicsTrack, imageHealth = [], initialWorkspaceState, onWorkspaceStateChange, onRegisterZoomShortcut }: V2MasterTimelineProps) {
  const clips = orderedMasterClips(sequence)
  const rate = masterSequenceFrameRate(sequence, shots, scenes, fallbackRate).rate
  const shotDuration = masterSequenceDurationFrames(sequence)
  const contentDuration = Math.max(1, masterSequenceVisualDurationFrames(sequence, rate))
  const renderRange = effectiveMasterRenderRange(sequence, contentDuration)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [pixelsPerFrame, setPixelsPerFrame] = useState(() => initialWorkspaceState?.pixelsPerFrame ?? fitMasterPixelsPerFrame(typeof window === 'undefined' ? 900 : window.innerWidth, contentDuration, rate))
  const [dragOver, setDragOver] = useState<{ frame: number; left: number } | null>(null)
  const [snapEnabled, setSnapEnabled] = useState(initialWorkspaceState?.snapEnabled ?? true)
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
  const [geometryDiagnostics, setGeometryDiagnostics] = useState<MasterGeometryDiagnostics | null>(null)
  const [geometryDiagnosticsCopied, setGeometryDiagnosticsCopied] = useState(false)
  const [trimDiagnostics, setTrimDiagnostics] = useState<MasterTrimDiagnostics | null>(null)
  const [geometryDiagnosticsOpen, setGeometryDiagnosticsOpen] = useState(import.meta.env.DEV)
  const [geometryRevision, setGeometryRevision] = useState(0)
  const scrubPointerRef = useRef<number | null>(null)
  const clipDragRef = useRef<ClipDragState | null>(null)
  const horizontalScrollRef = useRef(Math.max(0, initialWorkspaceState?.horizontalScroll ?? 0))
  const verticalScrollRef = useRef(Math.max(0, initialWorkspaceState?.verticalScroll ?? 0))
  const finishClipDragRef = useRef<(cancelled: boolean) => void>(() => undefined)
  const onMoveClipRef = useRef(onMoveClip)
  const suppressClipClickRef = useRef(false)
  const autoScrollFrameRef = useRef<number | null>(null)
  const timelineFocusedRef = useRef(false)
  const onClearSelectionRef = useRef(onClearSelection)

  useEffect(() => {
    onClearSelectionRef.current = onClearSelection
  }, [onClearSelection])

  useEffect(() => {
    setTrackMenu(null)
    setAddTrackMenuOpen(false)
  }, [projectId])

  useEffect(() => {
    onMoveClipRef.current = onMoveClip
  }, [onMoveClip])
  const scale = pixelsPerFrame
  const canvasWidth = Math.max(viewportWidth, masterFrameToPixel(contentDuration, scale) + MASTER_TRACK_PADDING * 2 + 24)
  const renderedClips = clips
  const renderedStarts = masterTimelineOrderStartFrames(renderedClips)
  const draggedClip = clipDrag ? clips.find((clip) => clip.id === clipDrag.clipId) ?? null : null
  const lastRenderedClip = renderedClips.reduce<MasterClipDocument | null>((last, clip) => !last || (renderedStarts.get(clip.id) ?? 0) + masterClipDurationFrames(clip) > (renderedStarts.get(last.id) ?? 0) + masterClipDurationFrames(last) ? clip : last, null)
  const lastRenderedClipStart = lastRenderedClip ? renderedStarts.get(lastRenderedClip.id) ?? 0 : 0
  const lastShotEndFrame = lastRenderedClip ? lastRenderedClipStart + masterClipDurationFrames(lastRenderedClip) : 0
  const lastShotRightEdgeX = MASTER_TRACK_PADDING + masterFrameToPixel(lastShotEndFrame, scale)
  const markOutLineX = MASTER_TRACK_PADDING + masterFrameToPixel(renderRange.endFrame, scale)
  const geometryPixelDiff = markOutLineX - lastShotRightEdgeX
  const geometryDiagnosticsRef = useRef('')
  const diagnosticsAvailable = import.meta.env.DEV || desktopRuntimeAvailable()

  useEffect(() => {
    if (!diagnosticsAvailable) return
    const toggle = () => setGeometryDiagnosticsOpen((open) => !open)
    const refresh = () => {
      setGeometryDiagnosticsOpen(true)
      setGeometryRevision((revision) => revision + 1)
    }
    window.addEventListener(MASTER_TIMELINE_DIAGNOSTICS_TOGGLE_EVENT, toggle)
    window.addEventListener(MASTER_TIMELINE_DIAGNOSTICS_REFRESH_EVENT, refresh)
    return () => {
      window.removeEventListener(MASTER_TIMELINE_DIAGNOSTICS_TOGGLE_EVENT, toggle)
      window.removeEventListener(MASTER_TIMELINE_DIAGNOSTICS_REFRESH_EVENT, refresh)
    }
  }, [diagnosticsAvailable])

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

  const captureGeometryDiagnostics = useCallback((): MasterGeometryDiagnostics | null => {
    const canvas = canvasRef.current
    const track = trackRef.current
    if (!canvas || !track) return null
    const canvasRect = canvas.getBoundingClientRect()
    const timelineOriginX = canvasRect.left
    const clipById = new Map(renderedClips.map((clip) => [clip.id, clip]))
    const readRect = (element: Element | null): MasterGeometryRect | null => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left - timelineOriginX, right: rect.right - timelineOriginX, top: rect.top - canvasRect.top, bottom: rect.bottom - canvasRect.top, width: rect.width, height: rect.height }
    }
    const readCss = (element: Element | null): MasterGeometryCss | null => {
      if (!element) return null
      const style = window.getComputedStyle(element)
      return { width: style.width, minWidth: style.minWidth, maxWidth: style.maxWidth, boxSizing: style.boxSizing, display: style.display, flex: style.flex, flexShrink: style.flexShrink, flexGrow: style.flexGrow, flexBasis: style.flexBasis, padding: style.padding, border: style.border, margin: style.margin, transform: style.transform, overflow: style.overflow, gap: style.gap }
    }
    const shotElements = Array.from(canvas.querySelectorAll<HTMLElement>('[data-master-clip]'))
      .filter((element) => !element.classList.contains('is-floating'))
      .slice(0, 500)
    const measuredShots = shotElements.map((element, index) => {
        const clipId = element.dataset.masterClip ?? ''
        const clip = clipById.get(clipId)
        const startFrame = renderedStarts.get(clipId) ?? 0
        const endFrame = startFrame + (clip ? masterClipDurationFrames(clip) : 0)
        const geometry = masterFrameRangeToPixels(startFrame, endFrame, scale)
        const rect = element.getBoundingClientRect()
        const previous = shotElements[index - 1] ?? null
        const previousRight = previous?.getBoundingClientRect().right ?? null
        const actualLeftX = rect.left - timelineOriginX
        const actualRightX = rect.right - timelineOriginX
        return {
          index,
          clipId,
          startFrame,
          endFrame,
          expectedLeftX: MASTER_TRACK_PADDING + geometry.startPx,
          expectedRightX: MASTER_TRACK_PADDING + geometry.endPx,
          actualLeftX,
          actualRightX,
          actualWidth: rect.width,
          leftErrorPx: actualLeftX - (MASTER_TRACK_PADDING + geometry.startPx),
          rightErrorPx: actualRightX - (MASTER_TRACK_PADDING + geometry.endPx),
          overlapsPrevious: previousRight !== null && rect.left < previousRight - 0.5,
          childOverflow: Array.from(element.children).some((child) => { const childRect = child.getBoundingClientRect(); return childRect.left < rect.left - 0.5 || childRect.right > rect.right + 0.5 }),
        } satisfies MasterShotGeometryDiagnostic
      })
    const markOutElement = canvas.querySelector<HTMLElement>('.v2-master-mark-out')
    const lastShotElement = shotElements.at(-1) ?? null
    const lastShot = measuredShots.at(-1)
    const actualMarkOutX = markOutElement ? markOutElement.getBoundingClientRect().left - timelineOriginX : null
    const actualLastShotEdgeX = lastShot?.actualRightX ?? null
    const firstOffending = measuredShots.find((shot) => Math.abs(shot.leftErrorPx) > 0.5 || Math.abs(shot.rightErrorPx) > 0.5)
    const maximumMismatchPx = measuredShots.reduce((max, shot) => Math.max(max, Math.abs(shot.leftErrorPx), Math.abs(shot.rightErrorPx)), 0)
    const overlapCount = measuredShots.filter((shot) => shot.overlapsPrevious).length
    const childOverflow = measuredShots.some((shot) => shot.childOverflow)
    const firstError = measuredShots[0]?.rightErrorPx ?? 0
    const errorsAccumulate = measuredShots.length > 1 && Math.abs(measuredShots.at(-1)?.rightErrorPx ?? 0) > Math.abs(firstError) + 0.5
    const lastShotStartFrame = lastShot?.startFrame ?? 0
    const lastShotVsMarkOutDOMPixelDifference = actualMarkOutX !== null && actualLastShotEdgeX !== null ? actualMarkOutX - actualLastShotEdgeX : null
    const next = {
      build: buildIdentity,
      capturedAt: new Date().toISOString(),
      timelineMode: 'master' as const,
      zoom: scale,
      frameRate: rate,
      sequenceEndFrame: shotDuration,
      lastShotEndFrame,
      lastShotStartFrame,
      markInFrame: renderRange.startFrame,
      markOutFrame: renderRange.endFrame,
      horizontalScroll: track.scrollLeft,
      timelineOriginX,
      viewportRect: readRect(track)!,
      contentRect: readRect(canvas)!,
      rulerRect: readRect(canvas.querySelector('.v2-master-ruler')),
      shotTrackRect: readRect(canvas.querySelector('.v2-master-shots-row')),
      markOutRect: readRect(markOutElement),
      lastShotOuterRect: readRect(lastShotElement),
      lastShotVisibleContentRect: readRect(lastShotElement?.querySelector('[data-master-clip-content="label"]') ?? null),
      lastShotInnerContentRect: readRect(lastShotElement?.querySelector('[data-master-clip-content="duration"]') ?? null),
      lastShotCss: readCss(lastShotElement),
      shotTrackCss: readCss(canvas.querySelector('.v2-master-shots-row')),
      expectedLastShotEdgeX: lastShot?.expectedRightX ?? lastShotRightEdgeX,
      actualLastShotEdgeX,
      expectedMarkOutX: markOutLineX,
      actualMarkOutX,
      lastShotVsMarkOutFrameDifference: lastShotEndFrame - renderRange.endFrame,
      lastShotVsMarkOutDOMPixelDifference,
      expectedVsActualShotPixelDifference: lastShot?.rightErrorPx ?? null,
      maximumMismatchPx,
      overlapCount,
      childOverflow,
      errorsAccumulate,
      firstOffendingClipId: firstOffending?.clipId ?? null,
      responsibleCssProperty: firstOffending ? identifyGeometryCssProperty(readCss(shotElements[firstOffending.index])) : 'none detected',
      shots: measuredShots,
    } satisfies MasterGeometryDiagnostics
    geometryDiagnosticsRef.current = JSON.stringify(next)
    return next
  }, [lastShotEndFrame, lastShotRightEdgeX, markOutLineX, rate, renderRange.endFrame, renderRange.startFrame, renderedClips, renderedStarts, scale, shotDuration])

  useLayoutEffect(() => {
    if (!diagnosticsAvailable) return
    const frame = window.requestAnimationFrame(() => {
      const next = captureGeometryDiagnostics()
      if (next) setGeometryDiagnostics(next)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [captureGeometryDiagnostics, diagnosticsAvailable, geometryRevision])

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
    onClearSelection()
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

  const handleLostPointerCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (clipDragRef.current?.pointerId === event.pointerId) {
      finishClipDrag(true)
      return
    }
    if (scrubPointerRef.current !== event.pointerId) return
    scrubPointerRef.current = null
    setScrubbing(false)
  }

  const pointerTimelineX = (clientX: number) => {
    const track = trackRef.current
    if (!track) return 0
    const bounds = track.getBoundingClientRect()
    return Math.max(0, clientX - bounds.left + track.scrollLeft - MASTER_TRACK_PADDING)
  }

  const draggedLeft = clipDrag && draggedClip ? Math.max(0, MASTER_TRACK_PADDING + masterFrameToPixel(clipDrag.currentStartFrame, scale)) : 0

  const placementForTimelineX = (timelineX: number) => {
    const frame = Math.max(0, Math.round(timelineX / Math.max(0.01, scale)))
    return { frame, left: MASTER_TRACK_PADDING + masterFrameToPixel(frame, scale) }
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

  const beginClipDrag = (event: PointerEvent<HTMLElement>, clip: MasterClipDocument, requestedMode?: MasterClipInteractionMode) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const mode = requestedMode ?? masterClipInteractionMode({ left: rect.left, width: rect.width }, event.clientX)
    const shot = shots.find((candidate) => candidate.id === clip.shotId)
    const timelineX = pointerTimelineX(event.clientX)
    const starts = masterTimelineOrderStartFrames(clips)
    const startPx = masterFrameToPixel(starts.get(clip.id) ?? 0, scale)
    const startFrame = starts.get(clip.id) ?? 0
    const selected = mode === 'move' && selectedItems.some((item) => item.kind === 'clip' && item.id === clip.id) && selectedItems.length > 1 ? [...selectedItems] : [{ kind: 'clip' as const, id: clip.id }]
    const sourceStart = clip.sourceStartFrame
    const sourceEnd = clip.sourceEndFrame
    const trimDiagnostics = import.meta.env.DEV && mode !== 'move' ? {
      clipId: clip.id,
      mode,
      pointerdownLocalX: event.clientX - rect.left,
      clipWidth: rect.width,
      edgeHitZoneWidth: masterClipEdgeHitZonePx(rect.width),
      pointerStartX: event.clientX,
      currentPointerX: event.clientX,
      desiredFrame: startFrame,
      snappedFrame: startFrame,
      clampedFrame: startFrame,
      sourceIn: sourceStart,
      sourceOut: sourceEnd,
      sourceMaximumDuration: shot ? Math.max(0, Math.round(shot.endFrame) - sourceStart) : null,
      neighborCollisionBoundary: null,
      activeLimitingConstraint: null,
      previewValid: true,
      finalCommittedTiming: null,
    } satisfies MasterTrimDiagnostics : null
    if (trimDiagnostics) setTrimDiagnostics(trimDiagnostics)
    const next: ClipDragState = { clipId: clip.id, mode, selection: selected, pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, currentClientX: event.clientX, currentClientY: event.clientY, currentTimelineX: timelineX, grabOffsetPx: mode === 'move' ? Math.max(0, timelineX - startPx) : 0, startFrame, currentStartFrame: startFrame, currentSourceStartFrame: sourceStart, currentSourceEndFrame: sourceEnd, valid: true, active: false, trimDiagnostics }
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
    const dragged = clips.find((clip) => clip.id === current.clipId)
    if (!dragged) return
    const rawBoundary = Math.max(0, Math.round(timelineX / Math.max(0.01, scale)))
    const snapThreshold = Math.max(1, Math.round(8 / Math.max(0.01, scale)))
    const targets = masterShotSnapTargets(sequence, current.mode === 'move' ? current.clipId : current.clipId, masterFrame, sequence.markInFrame ?? null, sequence.markOutFrame ?? null)
    const snappedBoundary = snapEnabled ? snapMasterFrame(rawBoundary, targets, snapThreshold) : rawBoundary
    let currentStartFrame = current.startFrame
    let currentSourceStartFrame = current.currentSourceStartFrame
    let currentSourceEndFrame = current.currentSourceEndFrame
    let trimPreview = null
    if (current.mode === 'move') currentStartFrame = Math.max(0, Math.round((timelineX - current.grabOffsetPx) / Math.max(0.01, scale)))
    const originalClip = dragged
    const shot = shots.find((candidate) => candidate.id === originalClip.shotId)
    if (current.mode !== 'move' && shot) {
      trimPreview = previewMasterClipTrim(sequence, current.clipId, shot, current.mode, snappedBoundary)
      if (trimPreview) {
        currentStartFrame = trimPreview.startMasterFrame
        currentSourceStartFrame = trimPreview.sourceStartFrame
        currentSourceEndFrame = trimPreview.sourceEndFrame
      }
    }
    const nextTrimDiagnostics = current.trimDiagnostics
      ? trimPreview ? { ...current.trimDiagnostics, currentPointerX: clientX, desiredFrame: rawBoundary, snappedFrame: snappedBoundary, clampedFrame: trimPreview.boundary, sourceIn: trimPreview.sourceStartFrame, sourceOut: trimPreview.sourceEndFrame, neighborCollisionBoundary: trimPreview.neighborCollisionBoundary, activeLimitingConstraint: trimPreview.limitingConstraint, previewValid: true } : { ...current.trimDiagnostics, currentPointerX: clientX, desiredFrame: rawBoundary, snappedFrame: snappedBoundary, previewValid: false }
      : null
    if (nextTrimDiagnostics) setTrimDiagnostics(nextTrimDiagnostics)
    if (current.mode === 'move' && snapEnabled) currentStartFrame = snapMasterFrame(currentStartFrame, targets, snapThreshold)
    const proposed = current.mode === 'move' ? moveMasterTimelineSelection(sequence, current.selection, { kind: 'clip', id: current.clipId }, currentStartFrame) : null
    const next = { ...current, currentClientX: clientX, currentClientY: clientY, currentTimelineX: timelineX, currentStartFrame, currentSourceStartFrame, currentSourceEndFrame, valid: current.mode === 'move' ? Boolean(proposed) : Boolean(trimPreview), active: true, trimDiagnostics: nextTrimDiagnostics }
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
    if (import.meta.env.DEV && current.trimDiagnostics) setTrimDiagnostics({ ...current.trimDiagnostics, previewValid: !cancelled && current.valid, finalCommittedTiming: !cancelled && current.active && current.valid ? { startMasterFrame: current.currentStartFrame, sourceStartFrame: current.currentSourceStartFrame, sourceEndFrame: current.currentSourceEndFrame } : null })
    if (cancelled || !current.active) return
    suppressClipClickRef.current = true
    if (current.valid) {
      if (current.mode === 'move') onMoveClipRef.current(current.clipId, current.currentStartFrame)
      else onTrimClip(current.clipId, current.currentSourceStartFrame, current.currentSourceEndFrame, current.mode === 'trim-left' ? current.currentStartFrame : undefined)
    }
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
      } else if (event.key === 'Escape' && !clipDragRef.current && timelineFocusedRef.current) {
        onClearSelectionRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      finishClipDragRef.current(true)
      stopAutoScroll()
    }
  }, [])

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(MASTER_SHOT_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(MASTER_SHOT_DRAG_TYPE) ? 'copy' : 'move'
    setDragOver(placementForTimelineX(pointerTimelineX(event.clientX)))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const placement = dragOver ?? placementForTimelineX(pointerTimelineX(event.clientX))
    const shotId = event.dataTransfer.getData(MASTER_SHOT_DRAG_TYPE)
    if (shotId) onAddShot(shotId, placement.frame)
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
    if (diagnosticsAvailable) setGeometryRevision((revision) => revision + 1)
    onWorkspaceStateChange?.({ horizontalScroll: track.scrollLeft, verticalScroll: track.scrollTop })
  }
  const openTrackMenu = (kind: 'graphics' | 'music', event: PointerEvent<HTMLButtonElement>, id?: string) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    const position = masterTrackPopoverPosition({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, { width: window.innerWidth, height: window.innerHeight })
    setTrackMenu((current) => current?.kind === kind && current.id === id ? null : { kind, id, position })
  }

  const refreshGeometryDiagnostics = () => {
    const next = captureGeometryDiagnostics()
    if (next) setGeometryDiagnostics(next)
  }

  const copyGeometryDiagnostics = () => {
    const next = captureGeometryDiagnostics()
    if (!next || typeof navigator === 'undefined' || !navigator.clipboard) return
    setGeometryDiagnostics(next)
    void navigator.clipboard.writeText(formatGeometryDiagnostics(next)).then(() => {
      setGeometryDiagnosticsCopied(true)
      window.setTimeout(() => setGeometryDiagnosticsCopied(false), 1400)
    }).catch(() => {})
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

  return <section className="v2-master-timeline" aria-label="Master Timeline" tabIndex={-1} onFocusCapture={() => { timelineFocusedRef.current = true; onTimelineFocusChange?.(true) }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { timelineFocusedRef.current = false; onTimelineFocusChange?.(false) } }}>
    <div className="v2-master-timeline-toolbar">
      <div className="v2-timeline-toolbar-content">
        <div className="v2-timeline-mode-tabs"><button type="button" onClick={onSwitchToScene}>Scene</button><button className="is-active" type="button" onClick={onSwitchToMaster}>Master</button></div>
        <div className="v2-timeline-context"><output className="v2-timeline-readout v2-master-duration" title="Master video sequence duration">Duration {frameToTimecode(shotDuration, rate)}</output></div>
        <div className="v2-unified-transport" aria-label="Master transport"><button type="button" onClick={onReturnToStart} title="Return to start">|&lt;</button><button type="button" onClick={isPlaying ? onPause : onPlay} disabled={shotDuration <= 0} title={isPlaying ? 'Pause Master playback' : 'Play Master playback'}>{isPlaying ? '❚❚' : '▶'}</button><button type="button" onClick={onStop} title="Stop Master playback">■</button><button className={`v2-timeline-loop${isLooping ? ' is-active' : ''}`} type="button" onClick={onToggleLoop} aria-pressed={isLooping} aria-label={isLooping ? 'Disable Master loop' : 'Enable Master loop'} title="Loop Playback">Loop</button></div>
        <output className="v2-timeline-readout v2-master-timecode" title="Master timecode"><span>TC</span>{frameToTimecode(masterFrame, rate)}</output>
        <div className="v2-unified-zoom" aria-label="Timeline zoom"><button type="button" onClick={() => zoomBy(0.8)} title="Zoom out">−</button><button type="button" onClick={fitSequence} title="Fit all Master content">Fit</button><button type="button" onClick={() => zoomBy(1.25)} title="Zoom in">+</button></div>
        <button type="button" className={`v2-master-snap-toggle${snapEnabled ? ' is-active' : ''}`} onClick={() => { const next = !snapEnabled; setSnapEnabled(next); onWorkspaceStateChange?.({ snapEnabled: next }) }} aria-pressed={snapEnabled} title={snapEnabled ? 'Snap On' : 'Snap Off'}>⌁ Snap</button>
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
      <div className="v2-master-track-scroll" ref={trackRef} data-master-drag-mode={clipDrag?.active ? clipDrag.mode : undefined} onScroll={handleScroll} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={handleLostPointerCapture} onDragOver={handleDragOver} onDragLeave={() => setDragOver(null)} onDrop={handleDrop}>
        <div
          className={`v2-master-canvas${scrubbing ? ' is-scrubbing' : ''}`}
          ref={canvasRef}
          style={{ width: `${canvasWidth}px` }}
          {...(diagnosticsAvailable ? {
            'data-master-zoom': scale,
            'data-master-sequence-end-frame': shotDuration,
            'data-master-last-shot-end-frame': lastShotEndFrame,
            'data-master-mark-out-frame': renderRange.endFrame,
            'data-master-last-shot-right-edge-x': lastShotRightEdgeX,
            'data-master-mark-out-line-x': markOutLineX,
            'data-master-geometry-pixel-diff': geometryPixelDiff,
          } : {})}
        >
          <div className="v2-master-ruler" aria-hidden="true">{rulerFrames.map((frame) => <span key={frame} style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(frame, scale)}px` } as CSSProperties}>{frameToTimecode(frame, rate)}</span>)}</div>
          <div className="v2-master-row v2-master-shots-row" style={{ minHeight: `${shotsTrackHeight}px`, height: `${shotsTrackHeight}px` }}>
            {clips.length === 0 ? <div className="v2-master-drop-empty">Drag shots here to build your sequence.</div> : renderedClips.map((clip) => {
              const startFrame = renderedStarts.get(clip.id) ?? 0
              const geometry = masterFrameRangeToPixels(startFrame, startFrame + masterClipDurationFrames(clip), scale)
              if (clipDrag?.active && clipDrag.selection.some((item) => item.kind === 'clip' && item.id === clip.id)) return <MasterClipPlaceholder key={clip.id} clip={clip} shot={shots.find((candidate) => candidate.id === clip.shotId)} rate={rate} geometry={geometry} rowHeight={shotsTrackHeight} invalid={!clipDrag.valid} />
              return <MasterClipBlock key={clip.id} clip={clip} shot={shots.find((candidate) => candidate.id === clip.shotId)} rate={rate} geometry={geometry} selected={selectedItems.some((item) => item.kind === 'clip' && item.id === clip.id) || clip.id === activeClipId} startFrame={startFrame} rowHeight={shotsTrackHeight} onSelect={(frame, extend) => { if (!suppressClipClickRef.current) onSelectClip(clip.id, frame, extend) }} onPointerDown={beginClipDrag} />
            })}
            {dragOver ? <span className="v2-master-drop-indicator" style={{ left: `${dragOver.left}px` }} aria-hidden="true" /> : null}
            {clipDrag?.active && draggedClip ? <MasterClipBlock clip={{ ...draggedClip, sourceStartFrame: clipDrag.currentSourceStartFrame, sourceEndFrame: clipDrag.currentSourceEndFrame, startMasterFrame: clipDrag.currentStartFrame }} shot={shots.find((candidate) => candidate.id === draggedClip.shotId)} rate={rate} geometry={masterFrameRangeToPixels(clipDrag.currentStartFrame, clipDrag.currentStartFrame + clipDrag.currentSourceEndFrame - clipDrag.currentSourceStartFrame, scale)} selected={false} startFrame={clipDrag.currentStartFrame} rowHeight={shotsTrackHeight} floating leftPx={draggedLeft} widthPx={masterFrameRangeToPixels(0, clipDrag.currentSourceEndFrame - clipDrag.currentSourceStartFrame, scale).widthPx} invalid={!clipDrag.valid} onSelect={() => {}} /> : null}
            <MasterTrackResizeHandle kind="shots" height={shotsTrackHeight} label="Resize Shots Track" onHeightChange={(height) => setTrackHeight('shots', 'shots', height)} />
          </div>
          {(sequence.graphicsTracks ?? []).map((track) => <div className="v2-master-row v2-master-graphics-row" key={track.id} data-master-graphics-track={track.id} style={{ minHeight: `${graphicsTrackHeight(track.id)}px`, height: `${graphicsTrackHeight(track.id)}px` }}>
            {(sequence.imageClips ?? []).filter((clip) => clip.trackId === track.id).map((clip) => <MasterImageClipBlock key={clip.id} clip={clip} assetName={(sequence.imageAssets ?? []).find((asset) => asset.id === clip.assetId)?.fileName ?? 'Image'} health={imageHealth.find((item) => item.assetId === clip.assetId)?.status} rate={rate} scale={scale} snapEnabled={snapEnabled} snapFrame={(frame, clipId) => snapMasterFrame(frame, [...masterShotSnapTargets(sequence, null, masterFrame, sequence.markInFrame ?? null, sequence.markOutFrame ?? null), ...(sequence.imageClips ?? []).filter((candidate) => candidate.id !== clipId).flatMap((candidate) => [{ frame: candidate.startMasterFrame, kind: 'clip-start' as const }, { frame: candidate.startMasterFrame + candidate.durationFrames, kind: 'clip-end' as const }])], Math.max(1, Math.round(8 / Math.max(0.01, scale))))} selected={selectedItems.some((item) => item.kind === 'image' && item.id === clip.id) || clip.id === activeImageClipId} onSelect={(extend) => onSelectImage(clip.id, extend)} onMove={onMoveImage} onTrim={onTrimImage} onFade={onChangeImageFade} />)}
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
    {diagnosticsAvailable && geometryDiagnosticsOpen && geometryDiagnostics ? <aside className="v2-master-geometry-debug" aria-label="Master Timeline Diagnostics">
      <div className="v2-master-geometry-debug-heading"><strong>Master Timeline Diagnostics</strong><span>{geometryDiagnostics.firstOffendingClipId ? `First mismatch: ${geometryDiagnostics.firstOffendingClipId}` : 'No mismatch &gt; 0.5px'}</span></div>
      <div className="v2-master-geometry-debug-grid">
        <span>Build</span><b>{geometryDiagnostics.build.id}</b>
        <span>Captured</span><b>{geometryDiagnostics.capturedAt}</b>
        <span>Frame rate</span><b>{geometryDiagnostics.frameRate.numerator}/{geometryDiagnostics.frameRate.denominator}</b>
        <span>Zoom</span><b>{geometryDiagnostics.zoom.toFixed(4)} px/frame</b>
        <span>Sequence end</span><b>{geometryDiagnostics.sequenceEndFrame}</b>
        <span>Last Shot start / end</span><b>{geometryDiagnostics.lastShotStartFrame} / {geometryDiagnostics.lastShotEndFrame}</b>
        <span>Mark In / Out</span><b>{geometryDiagnostics.markInFrame} / {geometryDiagnostics.markOutFrame}</b>
        <span>Scroll X</span><b>{geometryDiagnostics.horizontalScroll.toFixed(2)} px</b>
        <span>Expected last edge</span><b>{geometryDiagnostics.expectedLastShotEdgeX.toFixed(3)} px</b>
        <span>Actual last edge</span><b>{geometryDiagnostics.actualLastShotEdgeX === null ? '—' : `${geometryDiagnostics.actualLastShotEdgeX.toFixed(3)} px`}</b>
        <span>Expected / actual Mark Out</span><b>{geometryDiagnostics.expectedMarkOutX.toFixed(3)} / {geometryDiagnostics.actualMarkOutX === null ? '—' : geometryDiagnostics.actualMarkOutX.toFixed(3)} px</b>
        <span>Frame difference</span><b>{geometryDiagnostics.lastShotVsMarkOutFrameDifference}</b>
        <span>DOM pixel difference</span><b>{geometryDiagnostics.lastShotVsMarkOutDOMPixelDifference === null ? '—' : `${geometryDiagnostics.lastShotVsMarkOutDOMPixelDifference.toFixed(3)} px`}</b>
        <span>Shot pixel difference</span><b>{geometryDiagnostics.expectedVsActualShotPixelDifference === null ? '—' : `${geometryDiagnostics.expectedVsActualShotPixelDifference.toFixed(3)} px`}</b>
        <span>Max mismatch / overlaps</span><b>{geometryDiagnostics.maximumMismatchPx.toFixed(3)} px / {geometryDiagnostics.overlapCount}</b>
        <span>Child overflow / accumulates</span><b>{String(geometryDiagnostics.childOverflow)} / {String(geometryDiagnostics.errorsAccumulate)}</b>
        <span>CSS finding</span><b>{geometryDiagnostics.responsibleCssProperty}</b>
        {import.meta.env.DEV && trimDiagnostics ? <>
          <span>Trim clip / mode</span><b>{trimDiagnostics.clipId} / {trimDiagnostics.mode}</b>
          <span>Pointer local X / width</span><b>{trimDiagnostics.pointerdownLocalX.toFixed(1)} / {trimDiagnostics.clipWidth.toFixed(1)} px</b>
          <span>Edge zone / pointer X</span><b>{trimDiagnostics.edgeHitZoneWidth.toFixed(1)} / {trimDiagnostics.pointerStartX.toFixed(1)} → {trimDiagnostics.currentPointerX.toFixed(1)} px</b>
          <span>Desired / snapped / clamped</span><b>{trimDiagnostics.desiredFrame} / {trimDiagnostics.snappedFrame} / {trimDiagnostics.clampedFrame}</b>
          <span>Source In / Out / max duration</span><b>{trimDiagnostics.sourceIn} / {trimDiagnostics.sourceOut} / {trimDiagnostics.sourceMaximumDuration ?? '—'}</b>
          <span>Neighbor / limit / valid</span><b>{trimDiagnostics.neighborCollisionBoundary ?? '—'} / {trimDiagnostics.activeLimitingConstraint ?? '—'} / {String(trimDiagnostics.previewValid)}</b>
          <span>Committed timing</span><b>{trimDiagnostics.finalCommittedTiming ? `${trimDiagnostics.finalCommittedTiming.startMasterFrame} · ${trimDiagnostics.finalCommittedTiming.sourceStartFrame}–${trimDiagnostics.finalCommittedTiming.sourceEndFrame}` : '—'}</b>
        </> : null}
      </div>
      <div className="v2-master-geometry-debug-actions"><button className="v2-small-action" type="button" onClick={copyGeometryDiagnostics}>{geometryDiagnosticsCopied ? 'Copied' : 'Copy Geometry Diagnostics'}</button><button className="v2-small-action" type="button" onClick={refreshGeometryDiagnostics}>Refresh Measurements</button><button className="v2-small-action" type="button" onClick={() => setGeometryDiagnosticsOpen(false)}>Close</button></div>
    </aside> : null}
    {trackMenu && typeof document !== 'undefined' ? createPortal(<MasterTrackMenuPopover position={trackMenu.position} kind={trackMenu.kind} confirmDelete={Boolean(sequence.musicClip)} onClose={() => setTrackMenu(null)} onRename={trackMenu.kind === 'graphics' && trackMenu.id ? () => { const track = (sequence.graphicsTracks ?? []).find((candidate) => candidate.id === trackMenu.id); const name = track ? window.prompt('Graphics track name', track.name)?.trim() : ''; if (name && trackMenu.id) onGraphicsTrackChange(trackMenu.id, { name }); setTrackMenu(null) } : undefined} onToggleVisibility={trackMenu.kind === 'graphics' && trackMenu.id ? () => { const track = (sequence.graphicsTracks ?? []).find((candidate) => candidate.id === trackMenu.id); if (track) onGraphicsTrackChange(track.id, { visible: !track.visible }); setTrackMenu(null) } : undefined} onDelete={() => { if (trackMenu.kind === 'graphics' && trackMenu.id) onDeleteGraphicsTrack(trackMenu.id); else if (trackMenu.kind === 'music') onDeleteMusicTrack(); setTrackMenu(null) }} onReplace={trackMenu.kind === 'music' && sequence.musicClip ? () => { fileInputRef.current?.click(); setTrackMenu(null) } : undefined} />, document.body) : null}
    <input ref={fileInputRef} className="v2-hidden-file-input" type="file" accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/aac,.wav,.mp3,.m4a,.aac" onChange={chooseMusic} />
    <input ref={imageFileInputRef} className="v2-hidden-file-input" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={chooseImage} />
  </section>
}

function identifyGeometryCssProperty(css: MasterGeometryCss | null): string {
  if (!css) return 'unavailable'
  if (css.minWidth !== '0px') return `min-width: ${css.minWidth}`
  if (css.boxSizing !== 'border-box') return `box-sizing: ${css.boxSizing}`
  if (css.display !== 'block' && css.display !== 'flex') return `display: ${css.display}`
  if (css.flexShrink !== '1' && css.flexShrink !== '0') return `flex-shrink: ${css.flexShrink}`
  if (css.margin !== '0px') return `margin: ${css.margin}`
  if (css.transform !== 'none') return `transform: ${css.transform}`
  return `computed box (${css.width}, ${css.padding}, ${css.border})`
}

function formatGeometryDiagnostics(diagnostics: MasterGeometryDiagnostics): string {
  return JSON.stringify(diagnostics, null, 2)
}

function MasterLaneAction({ children, className = '', style, onClick }: { children: string; className?: string; style?: CSSProperties; onClick: () => void }) {
  return <button type="button" className={`v2-master-lane-action ${className}`} style={style} onClick={onClick}>{children}</button>
}

function MasterClipPlaceholder({ clip, shot, rate, geometry, rowHeight, invalid = false }: { clip: MasterClipDocument; shot: ShotDocument | undefined; rate: { numerator: number; denominator: number }; geometry: ReturnType<typeof masterFrameRangeToPixels>; rowHeight: number; invalid?: boolean }) {
  const isNarrow = geometry.widthPx < 32
  return <span className={`v2-master-clip-placeholder${isNarrow ? ' is-narrow' : ''}${invalid ? ' is-invalid' : ''}`} style={{ left: `${MASTER_TRACK_PADDING + geometry.startPx}px`, width: `${geometry.widthPx}px`, height: `${Math.max(48, rowHeight - 10)}px` }} aria-hidden="true"><span data-master-clip-content="label">{shot?.name ?? 'Missing Shot'}</span><small data-master-clip-content="duration">{frameToTimecode(masterClipDurationFrames(clip), rate)}</small></span>
}

function MasterClipBlock({ clip, shot, rate, geometry, selected, startFrame, rowHeight, onSelect, onPointerDown, floating = false, leftPx, widthPx, invalid = false }: { clip: MasterClipDocument; shot: ShotDocument | undefined; rate: { numerator: number; denominator: number }; geometry: ReturnType<typeof masterFrameRangeToPixels>; selected: boolean; startFrame: number; rowHeight: number; onSelect: (frame: number, extend?: boolean) => void; onPointerDown?: (event: PointerEvent<HTMLElement>, clip: MasterClipDocument, mode?: MasterClipInteractionMode) => void; floating?: boolean; leftPx?: number; widthPx?: number; invalid?: boolean }) {
  const duration = masterClipDurationFrames(clip)
  const visualWidth = widthPx ?? geometry.widthPx
  const isNarrow = visualWidth < 32
  const [hoverMode, setHoverMode] = useState<MasterClipInteractionMode>('move')
  const handleHoverMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (floating) return
    const rect = event.currentTarget.getBoundingClientRect()
    const nextMode = masterClipInteractionMode({ left: rect.left, width: rect.width }, event.clientX)
    if (nextMode !== hoverMode) setHoverMode(nextMode)
  }
  const clipStyle = { left: `${leftPx ?? MASTER_TRACK_PADDING + geometry.startPx}px`, width: `${visualWidth}px`, height: `${Math.max(48, rowHeight - 10)}px`, '--master-clip-edge-hit-zone': `${MASTER_CLIP_EDGE_HIT_ZONE_PX}px` } as CSSProperties
  return <button type="button" className={`v2-master-clip${selected ? ' is-selected' : ''}${floating ? ' is-floating' : ''}${isNarrow ? ' is-narrow' : ''}${invalid ? ' is-invalid' : ''}`} data-master-clip={clip.id} data-hover-mode={floating ? undefined : hoverMode} aria-hidden={floating || undefined} tabIndex={floating ? -1 : undefined} onPointerMove={handleHoverMove} onPointerLeave={() => { if (!floating) setHoverMode('move') }} onPointerDown={(event) => { if (!floating) onPointerDown?.(event, clip) }} onClick={(event) => { event.stopPropagation(); if (!floating) onSelect(startFrame, event.shiftKey) }} style={clipStyle} title={invalid ? 'Invalid placement: overlaps another Shot' : shot?.name ?? 'Missing Shot'}><span className="v2-master-clip-handle is-trim-left" aria-hidden="true" /><span data-master-clip-content="label">{shot?.name ?? 'Missing Shot'}</span><small data-master-clip-content="duration">{frameToTimecode(duration, rate)}</small><span className="v2-master-clip-handle is-trim-right" aria-hidden="true" /></button>
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

function MasterImageClipBlock({ clip, assetName, health, rate, scale, snapEnabled, snapFrame, selected, onSelect, onMove, onTrim, onFade }: { clip: MasterImageClipDocument; assetName: string; health?: ImageAssetHealth['status']; rate: { numerator: number; denominator: number }; scale: number; snapEnabled: boolean; snapFrame?: (frame: number, clipId: string) => number; selected: boolean; onSelect: (extend?: boolean) => void; onMove: (clipId: string, start: number, snapEnabled?: boolean) => void; onTrim: (clipId: string, start: number, duration: number) => void; onFade: (clipId: string, fadeIn: number, fadeOut: number) => void }) {
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
    if (drag.mode === 'move') updateDraft((current) => { const raw = Math.max(0, drag.startFrame + delta); return { ...current, start: snapEnabled && snapFrame ? snapFrame(raw, clip.id) : raw } })
    if (drag.mode === 'trim-left') { const nextStart = Math.max(0, Math.min(drag.startFrame + drag.duration - 1, drag.startFrame + delta)); updateDraft((current) => ({ ...current, start: nextStart, duration: drag.startFrame + drag.duration - nextStart })) }
    if (drag.mode === 'trim-right') updateDraft((current) => ({ ...current, duration: Math.max(1, drag.duration + delta) }))
    if (drag.mode === 'fade-in') updateDraft((current) => ({ ...current, fadeIn: Math.max(0, Math.min(drag.duration - drag.fadeOut, drag.fadeIn + delta)) }))
    if (drag.mode === 'fade-out') updateDraft((current) => ({ ...current, fadeOut: Math.max(0, Math.min(drag.duration - drag.fadeIn, drag.fadeOut + delta)) }))
  }
  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => { const drag = dragRef.current; if (!drag || drag.pointerId !== event.pointerId) return; const finalDraft = draftRef.current; if (!cancelled) { if (drag.mode === 'move') onMove(clip.id, finalDraft.start, snapEnabled); else if (drag.mode === 'trim-left' || drag.mode === 'trim-right') onTrim(clip.id, finalDraft.start, finalDraft.duration); else onFade(clip.id, finalDraft.fadeIn, finalDraft.fadeOut) } if (buttonRef.current?.hasPointerCapture(event.pointerId)) buttonRef.current.releasePointerCapture(event.pointerId); dragRef.current = null; if (cancelled) commitDraft({ start: clip.startMasterFrame, duration: clip.durationFrames, fadeIn: clip.fadeInFrames, fadeOut: clip.fadeOutFrames }) }
  return <button ref={buttonRef} type="button" className={`v2-master-image-clip${selected ? ' is-selected' : ''}${health && health !== 'available' ? ' is-missing-media' : ''}`} data-master-image={clip.id} onClick={(event) => { event.stopPropagation(); onSelect(event.shiftKey) }} onPointerDown={(event) => begin(event, 'move')} onPointerMove={update} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)} style={{ left: `${MASTER_TRACK_PADDING + masterFrameToPixel(draft.start, scale)}px`, width: `${Math.max(30, masterFrameToPixel(draft.duration, scale))}px` }} title={`${assetName}${health && health !== 'available' ? ` · ${health}` : ''}`}><span className="v2-master-image-name">{assetName}</span><small>{health && health !== 'available' ? 'Missing' : frameToTimecode(draft.duration, rate)}</small><span className="v2-master-image-handle is-fade-in" onPointerDown={(event) => begin(event, 'fade-in')} title="Fade in" /><span className="v2-master-image-handle is-fade-out" onPointerDown={(event) => begin(event, 'fade-out')} title="Fade out" /><span className="v2-master-image-handle is-trim-left" onPointerDown={(event) => begin(event, 'trim-left')} /><span className="v2-master-image-handle is-trim-right" onPointerDown={(event) => begin(event, 'trim-right')} /></button>
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
