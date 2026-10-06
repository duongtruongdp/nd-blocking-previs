import { useEffect, useRef, useState } from 'react'
import type { RationalFrameRate, TimelineDocument, TimelineProperty, TimelineTrack } from '../core/sceneDocument'
import { TIMELINE_FRAME_RATES, clampTimelineFrame, frameRateLabel, frameToTimelinePercent } from '../timeline/timelineMath'
import { groupTimelineTracks, type TimelineEntityDescriptor } from '../timeline/timelineGroups'

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
  onDeleteKeyframe: (trackId: string, keyframeId: string) => void
  onEntitySelect: (entityId: string) => void
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

export function V2Timeline({ timeline, tracks, entities, selectedEntityId, isPlaying, onFrameChange, onFrameRateChange, onTogglePlayback, onStepFrame, onMarkIn, onMarkOut, onDeleteKeyframe, onEntitySelect, onScrubStart, onScrubEnd }: V2TimelineProps) {
  const rulerRef = useRef<HTMLDivElement>(null)
  const [selectedKeyframe, setSelectedKeyframe] = useState<{ trackId: string; keyframeId: string } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})
  const groups = groupTimelineTracks(tracks, entities)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPlaying || !selectedKeyframe || (event.target instanceof HTMLElement && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target.isContentEditable))) return
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
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    onScrubStart()
    onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline))
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isPlaying || !rulerRef.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    onFrameChange(frameFromPointer(event.clientX, rulerRef.current, timeline))
  }

  const ticks = Array.from({ length: 6 }, (_, index) => Math.round(timeline.startFrame + (timeline.endFrame - timeline.startFrame) * index / 5))
  const rateValue = `${timeline.frameRate.numerator}/${timeline.frameRate.denominator}`
  const rangeIn = frameToTimelinePercent(timeline.markIn, timeline)
  const rangeOut = frameToTimelinePercent(timeline.markOut, timeline)

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
        <div className="v2-ruler" ref={rulerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); onScrubEnd() }} onPointerCancel={onScrubEnd}>
          <div className="v2-timeline-ruler-range" style={{ left: `${rangeIn}%`, width: `${Math.max(0, rangeOut - rangeIn)}%` }} aria-hidden="true" />
          <div className="v2-timeline-mark v2-timeline-mark-in" style={{ left: `${rangeIn}%` }}><span>IN</span></div>
          <div className="v2-timeline-mark v2-timeline-mark-out" style={{ left: `${rangeOut}%` }}><span>OUT</span></div>
          {ticks.map((frame) => <span key={frame} style={{ left: `${frameToTimelinePercent(frame, timeline)}%` }}>{String(frame).padStart(2, '0')}</span>)}
        </div>

        <div className="v2-timeline-track-viewport">
          <div className="v2-timeline-track-scroll">
            <div className="v2-timeline-tracks">
              {groups.map((group) => {
                const collapsed = collapsedGroups[group.id] === true
                return (
                  <div className="v2-timeline-group" key={group.id}>
                    <div className={`v2-timeline-group-header${group.id === selectedEntityId ? ' is-selected' : ''}`}>
                      <div className="v2-timeline-group-label"><button className="v2-timeline-disclosure" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.name}`} aria-expanded={!collapsed} onClick={() => setCollapsedGroups((current) => ({ ...current, [group.id]: !collapsed }))} type="button">{collapsed ? '▶' : '▼'}</button><button className="v2-timeline-group-name" onClick={() => onEntitySelect(group.id)} type="button"><span>{group.name}</span><small>{group.entityType}</small></button></div>
                      <div className="v2-timeline-group-lane" aria-hidden="true"><span>{group.tracks.reduce((count, track) => count + track.keyframes.length, 0)} keys</span></div>
                    </div>
                    {!collapsed ? group.tracks.map((track) => (
                      <div className={`v2-timeline-track${track.entityId === selectedEntityId ? ' is-selected' : ''}`} key={track.id}>
                        <span className="v2-timeline-track-name">{propertyLabels[track.property]}</span>
                        <div className="v2-timeline-track-lane">
                          {track.keyframes.map((keyframe) => <button className={`v2-timeline-keyframe${keyframe.frame === timeline.currentFrame ? ' is-current' : ''}${selectedKeyframe?.trackId === track.id && selectedKeyframe.keyframeId === keyframe.id ? ' is-selected' : ''}`} key={keyframe.id} style={{ left: `${frameToTimelinePercent(keyframe.frame, timeline)}%` }} title={`${group.name} · ${propertyLabels[track.property]} · frame ${keyframe.frame}`} aria-label={`Select ${group.name} ${propertyLabels[track.property]} keyframe at frame ${keyframe.frame}`} onClick={() => setSelectedKeyframe({ trackId: track.id, keyframeId: keyframe.id })} type="button" />)}
                        </div>
                      </div>
                    )) : null}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="v2-timeline-range-layer" aria-hidden="true">
            <div className="v2-timeline-range-outside" style={{ left: 0, width: `${rangeIn}%` }} />
            <div className="v2-timeline-range-outside" style={{ left: `${rangeOut}%`, right: 0 }} />
            <div className="v2-timeline-range-active" style={{ left: `${rangeIn}%`, width: `${Math.max(0, rangeOut - rangeIn)}%` }} />
          </div>
          <div className="v2-timeline-playhead-lane" aria-hidden="true"><div className="v2-timeline-playhead" style={{ left: `${frameToTimelinePercent(timeline.currentFrame, timeline)}%` }} /></div>
          {groups.length === 0 ? <div className="v2-timeline-empty">No movement planned yet. Add a keyframe from the Inspector.</div> : null}
        </div>
      </div>
    </section>
  )
}
