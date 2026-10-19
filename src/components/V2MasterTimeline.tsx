import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { MasterClipDocument, MasterSequenceDocument } from '../core/masterSequence'
import { effectiveMasterRenderRange, MASTER_CLIP_DRAG_TYPE, MASTER_SHOT_DRAG_TYPE, masterClipDurationFrames, masterClipStartFrame, masterSequenceDurationFrames, masterSequenceFrameRate, masterSequenceVisualDurationFrames, musicClipDurationFrames, orderedMasterClips } from '../core/masterSequence'
import type { ShotDocument } from '../core/shotDocument'
import { frameToTimecode } from '../timeline/timelineMath'
import { fitMasterPixelsPerFrame, masterFrameToPixel, masterRulerFrames, pixelToMasterFrame } from '../core/masterTimelineMath'

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
  const [scrubbing, setScrubbing] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrubPointerRef = useRef<number | null>(null)
  const scale = pixelsPerFrame
  const canvasWidth = Math.max(viewportWidth, masterFrameToPixel(contentDuration, scale) + 24)

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
    return pixelToMasterFrame(clientX - bounds.left + track.scrollLeft, scale, shotDuration > 0 ? shotDuration - 1 : 0)
  }

  const setFrameFromPointer = (clientX: number) => onSetMasterFrame(frameAtClientX(clientX))

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-master-clip], [data-master-music], button')) return
    event.preventDefault()
    scrubPointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setScrubbing(true)
    setFrameFromPointer(event.clientX)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (scrubPointerRef.current !== event.pointerId) return
    setFrameFromPointer(event.clientX)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (scrubPointerRef.current !== event.pointerId) return
    scrubPointerRef.current = null
    setScrubbing(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const insertionForX = (clientX: number) => {
    const track = trackRef.current
    const canvas = canvasRef.current
    if (!track || !canvas) return { index: clips.length, left: masterFrameToPixel(shotDuration, scale) }
    const bounds = track.getBoundingClientRect()
    const x = Math.max(0, clientX - bounds.left + track.scrollLeft)
    let index = clips.length
    for (let i = 0; i < clips.length; i += 1) {
      const element = canvas.querySelector<HTMLElement>(`[data-master-clip="${clips[i].id}"]`)
      if (element && x < element.offsetLeft + element.offsetWidth / 2) { index = i; break }
    }
    const previous = index === 0 ? 0 : (() => {
      const element = canvas.querySelector<HTMLElement>(`[data-master-clip="${clips[index - 1]?.id}"]`)
      return element ? element.offsetLeft + element.offsetWidth : masterFrameToPixel(shotDuration, scale)
    })()
    return { index, left: previous }
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(MASTER_SHOT_DRAG_TYPE) && !event.dataTransfer.types.includes(MASTER_CLIP_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = event.dataTransfer.types.includes(MASTER_SHOT_DRAG_TYPE) ? 'copy' : 'move'
    setDragOver(insertionForX(event.clientX))
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const insertion = dragOver ?? insertionForX(event.clientX)
    const shotId = event.dataTransfer.getData(MASTER_SHOT_DRAG_TYPE)
    const clipId = event.dataTransfer.getData(MASTER_CLIP_DRAG_TYPE)
    if (shotId) onAddShot(shotId, insertion.index)
    else if (clipId) onReorderClip(clipId, insertion.index)
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
      <div className="v2-master-track-labels"><span aria-hidden="true" /><span>SHOTS</span><span className="v2-master-music-label"><span>MUSIC</span><button type="button" onClick={() => fileInputRef.current?.click()}>{sequence.musicClip ? 'Replace' : '+ Import'}</button></span></div>
      <div className="v2-master-track-scroll" ref={trackRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onDragOver={handleDragOver} onDragLeave={() => setDragOver(null)} onDrop={handleDrop}>
        <div className={`v2-master-canvas${scrubbing ? ' is-scrubbing' : ''}`} ref={canvasRef} style={{ width: `${canvasWidth}px` }}>
          <div className="v2-master-ruler" aria-hidden="true">{rulerFrames.map((frame) => <span key={frame} style={{ left: `${masterFrameToPixel(frame, scale)}px` } as CSSProperties}>{frameToTimecode(frame, rate)}</span>)}</div>
          <div className="v2-master-row v2-master-shots-row">
            {clips.length === 0 ? <div className="v2-master-drop-empty">Drag shots here to build your sequence.</div> : clips.map((clip) => <MasterClipBlock key={clip.id} clip={clip} shot={shots.find((candidate) => candidate.id === clip.shotId)} rate={rate} scale={scale} selected={clip.id === activeClipId} startFrame={masterClipStartFrame(sequence, clip.id) ?? 0} onSelect={(frame) => onSelectClip(clip.id, frame)} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData(MASTER_CLIP_DRAG_TYPE, clip.id) }} />)}
            {dragOver ? <span className="v2-master-drop-indicator" style={{ left: `${dragOver.left}px` }} aria-hidden="true" /> : null}
          </div>
          <div className="v2-master-row v2-master-music-row">
            {sequence.musicClip ? <button type="button" className="v2-master-music-clip" data-master-music onClick={(event) => { event.stopPropagation(); onSelectMusic() }} style={{ left: `${masterFrameToPixel(sequence.musicClip.startMasterFrame, scale)}px`, width: `${Math.max(80, masterFrameToPixel(musicClipDurationFrames(sequence.musicClip, rate), scale))}px` }}><WaveformCanvas peaks={musicPeaks} sourceStart={sequence.musicClip.sourceStartSeconds} sourceEnd={sequence.musicClip.sourceEndSeconds} duration={sequence.musicClip.durationSeconds} /><span className="v2-master-music-name">{sequence.musicClip.asset.fileName}</span></button> : <button type="button" className="v2-master-music-empty" onClick={() => fileInputRef.current?.click()}>+ Import Music</button>}
          </div>
          {shotDuration > 0 ? <span className="v2-master-mark v2-master-mark-in" style={{ left: `${masterFrameToPixel(renderRange.startFrame, scale)}px` }} aria-hidden="true" /> : null}
          {shotDuration > 0 ? <span className="v2-master-mark v2-master-mark-out" style={{ left: `${masterFrameToPixel(renderRange.endFrame, scale)}px` }} aria-hidden="true" /> : null}
          <span className="v2-master-playhead" style={{ left: `${masterFrameToPixel(masterFrame, scale)}px` }} aria-hidden="true" />
        </div>
      </div>
    </div>
    <input ref={fileInputRef} className="v2-hidden-file-input" type="file" accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/aac,.wav,.mp3,.m4a,.aac" onChange={chooseMusic} />
  </section>
}

function MasterClipBlock({ clip, shot, rate, scale, selected, startFrame, onSelect, onDragStart }: { clip: MasterClipDocument; shot: ShotDocument | undefined; rate: { numerator: number; denominator: number }; scale: number; selected: boolean; startFrame: number; onSelect: (frame: number) => void; onDragStart: (event: DragEvent<HTMLButtonElement>) => void }) {
  const duration = masterClipDurationFrames(clip)
  return <button type="button" className={`v2-master-clip${selected ? ' is-selected' : ''}`} data-master-clip={clip.id} draggable onDragStart={onDragStart} onClick={(event) => { event.stopPropagation(); onSelect(startFrame) }} style={{ left: `${masterFrameToPixel(startFrame, scale)}px`, width: `${Math.max(44, masterFrameToPixel(duration, scale))}px` }} title={shot?.name ?? 'Missing Shot'}><span>{shot?.name ?? 'Missing Shot'}</span><small>{frameToTimecode(duration, rate)}</small></button>
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
