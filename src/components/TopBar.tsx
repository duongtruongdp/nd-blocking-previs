import { blockingStore, useBlockingSelector, type BlockingTool } from '../state/blockingStore'

const tools: Array<{ label: string; value: BlockingTool; shortcut: string }> = [
  { label: 'Select', value: 'select', shortcut: 'Q' },
  { label: 'Move', value: 'move', shortcut: 'W' },
  { label: 'Rotate', value: 'rotate', shortcut: 'E' },
]

export function TopBar() {
  const state = useBlockingSelector((snapshot) => snapshot)
  const activeTool = state.tool
  const shot = state.project.shots.find((entry) => entry.id === state.project.activeShotId)
  const projectContext = { projectName: state.project.name, shotName: shot?.name ?? 'Shot' }

  return (
    <header className="top-bar">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">ND</span>
        <span className="brand-name">ND Blocking &amp; Previs</span>
      </div>

      <nav className="project-context" aria-label="Project context">
        <button type="button" className="toolbar-button" disabled title="Project controls arrive in a later milestone">
          {projectContext.projectName}
        </button>
        <span className="context-divider" aria-hidden="true">/</span>
        <button type="button" className="toolbar-button" disabled title="Shot controls arrive in a later milestone">
          {projectContext.shotName}
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
        {tools.map((tool) => (
          <button
            key={tool.value}
            type="button"
            className={`tool-button ${activeTool === tool.value ? 'is-active' : ''}`}
            aria-pressed={activeTool === tool.value}
            onClick={() => blockingStore.setTool(tool.value)}
            title={`${tool.label} (${tool.shortcut})`}
          >
            {tool.label}
          </button>
        ))}
      </div>
    </header>
  )
}
