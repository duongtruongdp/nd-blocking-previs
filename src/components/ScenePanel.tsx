const sceneCategories = [
  { label: 'Actors', empty: 'No actors yet' },
  { label: 'Props', empty: 'No props yet' },
  { label: 'Cameras', empty: 'No cameras yet' },
  { label: 'Lights', empty: 'No lights yet' },
]

export function ScenePanel() {
  return (
    <aside className="side-panel scene-panel" aria-label="Scene">
      <div className="panel-heading">
        <span className="panel-kicker">Workspace</span>
        <h2>SCENE</h2>
      </div>
      <div className="scene-list">
        {sceneCategories.map((category) => (
          <section className="scene-category" key={category.label}>
            <div className="category-heading">
              <span>{category.label}</span>
              <span className="category-count">0</span>
            </div>
            <p className="empty-line">{category.empty}</p>
          </section>
        ))}
      </div>
      <div className="panel-footer">Nothing selected</div>
    </aside>
  )
}
