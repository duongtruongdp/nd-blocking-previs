const rulerMarks = ['00', '24', '48', '72', '96', '120']

export function TimelinePanel() {
  return (
    <section className="timeline-panel" aria-label="Timeline">
      <div className="timeline-header">
        <div className="timeline-title">
          <span className="panel-kicker">Shot planning</span>
          <h2>TIMELINE</h2>
        </div>
        <div className="timeline-actions" aria-label="Timeline controls">
          <button type="button" className="transport-button" disabled aria-label="Previous frame">|&lt;</button>
          <button type="button" className="transport-button" disabled aria-label="Play">▶</button>
          <button type="button" className="transport-button" disabled aria-label="Next frame">&gt;|</button>
          <span className="timeline-readout">— / —</span>
        </div>
        <div className="mark-actions">
          <button type="button" className="timeline-button" disabled>Mark In</button>
          <button type="button" className="timeline-button" disabled>Mark Out</button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="track-labels">
          <span>Tracks</span>
        </div>
        <div className="timeline-ruler" aria-label="Frame ruler">
          {rulerMarks.map((mark) => <span key={mark}>{mark}</span>)}
        </div>
        <div className="timeline-empty">
          <span className="timeline-empty-line" aria-hidden="true" />
          <span>No movement planned yet</span>
        </div>
      </div>
    </section>
  )
}
