type V2TopBarProps = {
  view: 'blocking' | 'camera'
  onViewChange: (view: 'blocking' | 'camera') => void
}

export function V2TopBar({ view, onViewChange }: V2TopBarProps) {
  return (
    <header className="v2-topbar">
      <div className="v2-brand">
        <span className="v2-brand-mark">ND</span>
        <span>ND Blocking &amp; Previs</span>
      </div>
      <div className="v2-scene-title">Scene 01</div>
      <div className="v2-topbar-actions">
        <div className="v2-segmented" aria-label="View mode">
          <button className={view === 'blocking' ? 'is-active' : ''} onClick={() => onViewChange('blocking')}>Blocking View</button>
          <button className={view === 'camera' ? 'is-active' : ''} disabled title="Camera work is paused during Stage recovery">Camera View</button>
        </div>
        <button className="v2-button v2-button-primary" disabled title="Scene export arrives in a later milestone">Export</button>
      </div>
    </header>
  )
}
