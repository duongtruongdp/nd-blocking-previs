export function V2Timeline() {
  return (
    <section className="v2-timeline" aria-label="Timeline">
      <div className="v2-timeline-toolbar">
        <div>
          <span className="v2-eyebrow">Shot Planning</span>
          <h2>Timeline</h2>
        </div>
        <div className="v2-transport">
          <button disabled aria-label="Previous frame">|&lt;</button>
          <button disabled aria-label="Play">▶</button>
          <button disabled aria-label="Next frame">&gt;|</button>
        </div>
        <span className="v2-frame-readout">Frame <strong>0000</strong></span>
        <div className="v2-timeline-marks">
          <button disabled>Mark In</button>
          <button disabled>Mark Out</button>
        </div>
      </div>
      <div className="v2-timeline-track-area">
        <div className="v2-track-label">Tracks</div>
        <div className="v2-ruler">
          {[0, 24, 48, 72, 96, 120].map((frame) => <span key={frame} style={{ left: `${(frame / 120) * 100}%` }}>{String(frame).padStart(2, '0')}</span>)}
        </div>
        <div className="v2-timeline-empty">No movement planned yet</div>
      </div>
    </section>
  )
}
