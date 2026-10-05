import { useEffect, useRef, useState } from 'react'
import type { RationalFrameRate, TimelineDocument, TimelineProperty, TimelineTrack } from '../core/sceneDocument'
import { TIMELINE_FRAME_RATES, clampTimelineFrame, frameRateLabel, frameToTimelinePercent } from '../timeline/timelineMath'

type V2TimelineProps = {
  timeline: TimelineDocument
  tracks: readonly TimelineTrack[]
  entityNames: Readonly<Record<string, string>>
  selectedEntityId: string | null
  isPlaying: boolean
  onFrameChange: (frame: number) => void
  onFrameRateChange: (frameRate: RationalFrameRate) => void
  onTogglePlayback: () => void
  onStepFrame: (amount: number) => void
  onMarkIn: () => void
  onMarkOut: () => void
  onDeleteKeyframe: (trackId: string, keyframeId: string) => void
  onScrubStart: () => void
  onScrubEnd: () => void
}

const propertyLabels: Record<TimelineProperty, string> = {
  position: 'Position',
  heading: 'Heading',
  rotation: 'Rotation',
  focalLengthMm: 'Focal Length',
}

function frameFromPointer(clientX: number, element: HTMLDivElement, timeline: TimelineDocument): number {
  const bounds = element.getBoundingClientRect()
  const amount = Math.min(1, Math.max(0, (clientX - bounds.left) / Math.max(1, bounds.width)))
  return clampTimelineFrame(timeline.startFrame + amount * (timeline.endFrame - timeline.startFrame), timeline.startFrame, timeline.endFrame)
}

function trackTitle(track: TimelineTrack, entityNames: Readonly<Record<string, string>>): string {
  return `${entityNames[track.entityId] ?? track.entityId} · ${propertyLabels[track.property]}`
}

export function V2Timeline({ timeline, tracks, entityNames, selectedEntityId, isPlaying, onFrameChange, onFrameRateChange, onTogglePlayback, onStepFrame, onMarkIn, onMarkOut, onDeleteKeyframe, onScrubStart, onScrubEnd }: V2TimelineProps) {
  const rulerRef = useRef<HTMLDivElement>(null)
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ trackId: string; keyframeId: string } | null>(null)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPlaying || !selectedKeyframe || (event.target instanceof HTMLElement && (event.target instanceof HTMLInputElement || event.target.isContentEditable))) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      event.preventDefault()
      onDeleteKeyframe(selectedKeyframe.trackId, selectedKeyframe.keyframeId)
      setSelectedKeyframe(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, onDeleteKeyframe, selectedKeyframe])
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying || !rulerRef.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    onScrubStart()
    onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline))
  }
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying || !rulerRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline))
  }
  const ticks = Array.from({ length: 6 }, (_, index) => Math.round(timeline.startFrame + (timeline.endFrame - timeline.startFrame) * index / 5))
  const rateValue = `${timeline.frameRate.numerator}/${timeline.frameRate.denominator}`

  return (
    <section className="v2-timeline" aria-label="Timeline">
      <div className="v2-timeline-toolbar">
        <div>
          <span className="v2-eyebrow">Shot Planning</span>
          <h2>Timeline</h2>
        </div>
        <label className="v2-frame-rate">FPS<select value={rateValue} onChange={(event) => {
          const selected = TIMELINE_FRAME_RATES.find((rate) => `${rate.numerator}/${rate.denominator}` === event.target.value)
          if (selected) onFrameRateChange(selected)
        }} disabled={isPlaying}>{TIMELINE_FRAME_RATES.map((rate) => <option key={`${rate.numerator}/${rate.denominator}`} value={`${rate.numerator}/${rate.denominator}`}>{frameRateLabel(rate)}</option>)}</select></label>
        <div className="v2-transport">
          <button onClick={() => onStepFrame(-1)} disabled={isPlaying} aria-label="Previous frame" type="button">|&lt;</button>
          <button onClick={onTogglePlayback} aria-label={isPlaying ? 'Pause' : 'Play'} type="button">{isPlaying ? 'Ⅱ' : '▶'}</button>
          <button onClick={() => onStepFrame(1)} disabled={isPlaying} aria-label="Next frame" type="button">&gt;|</button>
        </div>
        <label className="v2-frame-readout">Frame <input aria-label="Current frame" type="number" min={timeline.startFrame} max={timeline.endFrame} step={1} value={timeline.currentFrame} onChange={(event) => onFrameChange(Number(event.target.value))} disabled={isPlaying} /></label>
        <div className="v2-timeline-marks">
          <button onClick={onMarkIn} disabled={isPlaying} type="button">Mark In</button>
          <button onClick={onMarkOut} disabled={isPlaying} type="button">Mark Out</button>
        </div>
      </div>
      <div className="v2-timeline-track-area">
        <div className="v2-track-label">Tracks</div>
        <div className="v2-timeline-range-layer" aria-hidden="true">
          <div className="v2-timeline-range-outside" style={{ left: 0, width: `${frameToTimelinePercent(timeline.markIn, timeline)}%` }} />
          <div className="v2-timeline-range-outside" style={{ left: `${frameToTimelinePercent(timeline.markOut, timeline)}%`, right: 0 }} />
          <div className="v2-timeline-range-active" style={{ left: `${frameToTimelinePercent(timeline.markIn, timeline)}%`, width: `${Math.max(0, frameToTimelinePercent(timeline.markOut, timeline) - frameToTimelinePercent(timeline.markIn, timeline))}%` }} />
        </div>
        <div className="v2-ruler" ref={rulerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onScrubEnd() }} onPointerCancel={onScrubEnd}>
          <div className="v2-timeline-ruler-range" style={{ left: `${frameToTimelinePercent(timeline.markIn, timeline)}%`, width: `${Math.max(0, frameToTimelinePercent(timeline.markOut, timeline) - frameToTimelinePercent(timeline.markIn, timeline))}%` }} aria-hidden="true" />
          <div className="v2-timeline-mark v2-timeline-mark-in" style={{ left: `${frameToTimelinePercent(timeline.markIn, timeline)}%` }}><span>IN</span></div>
          <div className="v2-timeline-mark v2-timeline-mark-out" style={{ left: `${frameToTimelinePercent(timeline.markOut, timeline)}%` }}><span>OUT</span></div>
          {ticks.map((frame) => <span key={frame} style={{ left: `${frameToTimelinePercent(frame, timeline)}%` }}>{String(frame).padStart(2, '0')}</span>)}
          <div className="v2-timeline-playhead" style={{ left: `${frameToTimelinePercent(timeline.currentFrame, timeline)}%` }} aria-hidden="true" />
        </div>
        <div className="v2-timeline-tracks">
          {tracks.map((track) => <div className={`v2-timeline-track${track.entityId === selectedEntityId ? ' is-selected' : ''}`} key={track.id}>
            <span className="v2-timeline-track-name">{trackTitle(track, entityNames)}</span>
            <div className="v2-timeline-track-lane">
              {track.keyframes.map((keyframe) => <button className={`v2-timeline-keyframe${keyframe.frame === timeline.currentFrame ? ' is-current' : ''}${selectedKeyframe?.trackId === track.id && selectedKeyframe.keyframeId === keyframe.id ? ' is-selected' : ''}`} key={keyframe.id} style={{ left: `${frameToTimelinePercent(keyframe.frame, timeline)}%` }} title={`${trackTitle(track, entityNames)} · frame ${keyframe.frame}`} aria-label={`Select ${trackTitle(track, entityNames)} keyframe at frame ${keyframe.frame}`} onClick={() => setSelectedKeyframe({ trackId: track.id, keyframeId: keyframe.id })} type="button" />)}
            </div>
          </div>)}
        </div>
        {tracks.length === 0 ? <div className="v2-timeline-empty">No movement planned yet. Add a keyframe from the Inspector.</div> : null}
      </div>
    </section>
  )
}
