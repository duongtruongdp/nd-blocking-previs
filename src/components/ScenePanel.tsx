import { useState } from 'react'
import { blockingStore, useBlockingSelector } from '../state/blockingStore'
import type { PropType } from '../domain/blockingCommands'

const propOptions: Array<{ label: string; value: PropType }> = [
  { label: 'Cube', value: 'cube' },
  { label: 'Cylinder', value: 'cylinder' },
  { label: 'Wall', value: 'wall' },
  { label: 'Floor', value: 'floor' },
  { label: 'Table', value: 'table' },
  { label: 'Chair', value: 'chair' },
]

export function ScenePanel() {
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const state = useBlockingSelector((snapshot) => snapshot)
  const shot = state.project.shots.find((entry) => entry.id === state.project.activeShotId)
  const actors = shot?.actors ?? []
  const props = shot?.props ?? []
  const cameras = shot?.cameras ?? []

  return (
    <aside className="side-panel scene-panel" aria-label="Scene">
      <div className="panel-heading">
        <div className="panel-heading-row">
          <div>
            <span className="panel-kicker">Workspace</span>
            <h2>SCENE</h2>
          </div>
          <div className="add-control">
            <button type="button" className="add-button" aria-haspopup="menu" aria-expanded={addMenuOpen} onClick={() => setAddMenuOpen((open) => !open)}>
              + Add
            </button>
            {addMenuOpen ? (
              <div className="add-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { blockingStore.addActor(); setAddMenuOpen(false) }}>Actor</button>
                <button type="button" role="menuitem" onClick={() => { blockingStore.addCamera(); setAddMenuOpen(false) }}>Camera</button>
                <div className="add-menu-label">SET &amp; PROPS</div>
                {propOptions.map((option) => (
                  <button key={option.value} type="button" role="menuitem" onClick={() => { blockingStore.addProp(option.value); setAddMenuOpen(false) }}>
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="scene-list">
        <section className="scene-category">
          <div className="category-heading"><span>Actors</span><span className="category-count">{actors.length}</span></div>
          {actors.length === 0 ? <p className="empty-line">No actors yet</p> : actors.map((actor) => <EntityRow key={actor.id} id={actor.id} name={actor.name} kind="actor" selected={state.selection.entityId === actor.id} />)}
        </section>
        <section className="scene-category">
          <div className="category-heading"><span>Props</span><span className="category-count">{props.length}</span></div>
          {props.length === 0 ? <p className="empty-line">No props yet</p> : props.map((prop) => <EntityRow key={prop.id} id={prop.id} name={prop.name} kind="prop" selected={state.selection.entityId === prop.id} />)}
        </section>
        <section className="scene-category">
          <div className="category-heading"><span>Cameras</span><span className="category-count">{cameras.length}</span></div>
          {cameras.length === 0 ? <p className="empty-line">No cameras yet</p> : cameras.map((camera) => <EntityRow key={camera.id} id={camera.id} name={camera.name} kind="camera" selected={state.selection.entityId === camera.id} />)}
        </section>
        <section className="scene-category">
          <div className="category-heading"><span>Lights</span><span className="category-count">0</span></div>
          <p className="empty-line">No lights yet</p>
        </section>
      </div>
      <div className="panel-footer">{state.selection.entityId ? 'Selected in Stage' : 'Nothing selected'}</div>
    </aside>
  )
}

function EntityRow({ id, name, kind, selected }: { id: string; name: string; kind: 'actor' | 'prop' | 'camera'; selected: boolean }) {
  return (
    <button type="button" className={`entity-row ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => blockingStore.selectEntity(id)}>
      <span className={`entity-dot ${kind}`} aria-hidden="true" />
      <span>{name}</span>
    </button>
  )
}
