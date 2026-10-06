import type { RecentProjectEntry } from '../platform/projectLibrary'
import { basename, parentFolderName } from '../platform/projectLibrary'

type V2ProjectLibraryProps = {
  entries: readonly RecentProjectEntry[]
  loading: boolean
  error: string | null
  onNewProject: () => void
  onOpenProject: () => void
  onOpenRecent: (entry: RecentProjectEntry) => void
  onLocate: (entry: RecentProjectEntry) => void
  onRemove: (entry: RecentProjectEntry) => void
  onRename: (entry: RecentProjectEntry) => void
  onDuplicate: (entry: RecentProjectEntry) => void
  onDelete: (entry: RecentProjectEntry) => void
}

export function V2ProjectLibrary({ entries, loading, error, onNewProject, onOpenProject, onOpenRecent, onLocate, onRemove, onRename, onDuplicate, onDelete }: V2ProjectLibraryProps) {
  return (
    <main className="v2-library-shell">
      <header className="v2-library-header">
        <div className="v2-brand"><span className="v2-brand-mark">ND</span><span>Blocking &amp; Previs</span></div>
        <span className="v2-library-header-label">Project Library</span>
      </header>
      <section className="v2-library-content" aria-labelledby="v2-library-title">
        <div className="v2-library-intro">
          <span className="v2-eyebrow">Workspace</span>
          <h1 id="v2-library-title">Projects</h1>
          <p>Open a Project or continue planning from a recent file.</p>
        </div>
        <div className="v2-library-primary-actions">
          <button className="v2-library-primary-action" onClick={onNewProject} type="button"><span className="v2-library-action-icon">＋</span><span><strong>New Project</strong><small>Start a new blocking session</small></span></button>
          <button className="v2-library-primary-action" onClick={onOpenProject} type="button"><span className="v2-library-action-icon">↗</span><span><strong>Open Project</strong><small>Open an .ndblock file</small></span></button>
        </div>
        <div className="v2-library-section-heading"><div><span className="v2-eyebrow">Local files</span><h2>Recent Projects</h2></div><span className="v2-library-limit">{entries.length} / 16</span></div>
        {error ? <div className="v2-library-notice" role="status">Recent Projects could not be loaded. You can still create or open a Project.</div> : null}
        {loading ? <div className="v2-library-empty"><strong>Loading Recent Projects…</strong></div> : entries.length === 0 ? <div className="v2-library-empty"><span className="v2-library-empty-mark">◇</span><strong>No recent Projects yet.</strong><p>Create a new Project or open an existing .ndblock file.</p><div className="v2-library-empty-actions"><button className="v2-small-action" onClick={onNewProject} type="button">New Project</button><button className="v2-small-action" onClick={onOpenProject} type="button">Open Project</button></div></div> : <div className="v2-library-list">{entries.map((entry) => <RecentProjectCard key={entry.id} entry={entry} onOpen={() => onOpenRecent(entry)} onLocate={() => onLocate(entry)} onRemove={() => onRemove(entry)} onRename={() => onRename(entry)} onDuplicate={() => onDuplicate(entry)} onDelete={() => onDelete(entry)} />)}</div>}
      </section>
      <footer className="v2-library-footer">Projects are stored locally on this device.</footer>
    </main>
  )
}

function RecentProjectCard({ entry, onOpen, onLocate, onRemove, onRename, onDuplicate, onDelete }: { entry: RecentProjectEntry; onOpen: () => void; onLocate: () => void; onRemove: () => void; onRename: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const openedAt = formatRecentTime(entry.lastOpenedAt)
  const folder = parentFolderName(entry.path)
  return <article className={`v2-library-card${entry.missing ? ' is-missing' : ''}`}>
    <button className="v2-library-card-open" onClick={onOpen} type="button">
      <span className="v2-library-project-icon">ND</span>
      <span className="v2-library-card-copy"><strong>{entry.displayName || basename(entry.path)}</strong><small>{entry.lastKnownSceneCount === null ? 'Scene count unavailable' : `${entry.lastKnownSceneCount} ${entry.lastKnownSceneCount === 1 ? 'Scene' : 'Scenes'} · Last opened ${openedAt}`}</small><small className="v2-library-path" title={entry.path}>{folder ? `${folder} · ` : ''}{basename(entry.path)}</small></span>
      {entry.missing ? <span className="v2-library-missing">Missing</span> : entry.modifiedSinceLastOpen ? <span className="v2-library-modified">Modified</span> : null}
    </button>
    <div className="v2-library-card-actions" aria-label={`Actions for ${entry.displayName}`}>
      {entry.missing ? <button className="v2-library-card-action" onClick={onLocate} type="button">Locate…</button> : null}
      <button className="v2-library-card-action" onClick={onRename} type="button">Rename File</button>
      <button className="v2-library-card-action" onClick={onDuplicate} type="button">Duplicate</button>
      <button className="v2-library-card-action" onClick={onRemove} type="button">Remove from Recent</button>
      <button className="v2-library-card-action is-danger" onClick={onDelete} type="button">Delete Project File</button>
    </div>
  </article>
}

function formatRecentTime(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'recently'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
