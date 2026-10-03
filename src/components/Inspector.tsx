export function Inspector() {
  return (
    <aside className="side-panel inspector-panel" aria-label="Inspector">
      <div className="panel-heading">
        <span className="panel-kicker">Details</span>
        <h2>INSPECTOR</h2>
      </div>
      <div className="inspector-empty">
        <span className="empty-icon" aria-hidden="true">○</span>
        <strong>Select something in the scene</strong>
        <p>Its settings will appear here.</p>
      </div>
    </aside>
  )
}
