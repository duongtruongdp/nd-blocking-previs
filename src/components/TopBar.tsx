const futureTools = ['Select', 'Move', 'Rotate']

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">ND</span>
        <span className="brand-name">ND Blocking &amp; Previs</span>
      </div>

      <nav className="project-context" aria-label="Project context">
        <button type="button" className="toolbar-button" disabled title="Project controls arrive in a later milestone">
          Project
        </button>
        <span className="context-divider" aria-hidden="true">/</span>
        <button type="button" className="toolbar-button" disabled title="Shot controls arrive in a later milestone">
          Shot
        </button>
      </nav>

      <div className="top-bar-spacer" />

      <div className="view-switcher" aria-label="View mode">
        <button type="button" className="view-button is-active" aria-pressed="true">
          Blocking View
        </button>
        <button type="button" className="view-button" disabled title="Camera View arrives in a later milestone">
          Camera View
        </button>
      </div>

      <div className="tool-strip" aria-label="Stage tools">
        {futureTools.map((tool) => (
          <button key={tool} type="button" className="tool-button" disabled title={`${tool} arrives in a later milestone`}>
            {tool}
          </button>
        ))}
      </div>
    </header>
  )
}
