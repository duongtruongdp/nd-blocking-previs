import { useState } from 'react'
import type { ActorDocument, CameraDocument, PropDocument } from '../core/sceneDocument'

type V2ScenePanelProps = {
  actors: readonly ActorDocument[]
  props: readonly PropDocument[]
  cameras: readonly CameraDocument[]
  activeCameraId: string | null
  selectedEntityId: string | null
  onAddActor: () => void
  onAddCamera: () => void
  onSetActiveCamera: (cameraId: string) => void
  onSelectEntity: (entityId: string) => void
}

export function V2ScenePanel({ actors, props, cameras, activeCameraId, selectedEntityId, onAddActor, onAddCamera, onSetActiveCamera, onSelectEntity }: V2ScenePanelProps) {
  const [addOpen, setAddOpen] = useState(false)

  const addActor = () => {
    onAddActor()
    setAddOpen(false)
  }

  const addCamera = () => {
    onAddCamera()
    setAddOpen(false)
  }

  return (
    <aside className="v2-panel v2-scene-panel" aria-label="Scene">
      <div className="v2-panel-heading">
        <div>
          <span className="v2-eyebrow">Workspace</span>
          <h2>Scene</h2>
        </div>
        <div className="v2-add-wrap">
          <button className="v2-add-button" onClick={() => setAddOpen((open) => !open)} type="button">+ Add</button>
          {addOpen ? (
            <div className="v2-add-menu">
              <button onClick={addActor} type="button"><span className="v2-menu-icon">○</span>Actor</button>
              <button disabled onClick={addCamera} type="button" title="Camera work is paused during Stage recovery"><span className="v2-menu-icon">▣</span>Camera</button>
              <span className="v2-add-menu-label">Props</span>
              <button disabled type="button">Cube</button>
              <button disabled type="button">Sphere</button>
              <button disabled type="button">Cylinder</button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="v2-scene-sections">
        <section className="v2-scene-section">
          <div className="v2-section-title">
            <span>Actors</span>
            <span className="v2-count">{actors.length}</span>
          </div>
          {actors.length === 0 ? <p>No actors in this scene</p> : (
            <div className="v2-entity-list">
              {actors.map((actor) => (
                <button
                  className={`v2-entity-row${selectedEntityId === actor.id ? ' is-selected' : ''}`}
                  key={actor.id}
                  onClick={() => onSelectEntity(actor.id)}
                  type="button"
                >
                  <span className="v2-entity-swatch v2-actor-swatch" />
                  <span>{actor.name}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="v2-scene-section">
          <div className="v2-section-title">
            <span>Props</span>
            <span className="v2-count">{props.length}</span>
          </div>
          <div className="v2-entity-list">
            {props.map((entity) => (
              <button
                className={`v2-entity-row${selectedEntityId === entity.id ? ' is-selected' : ''}`}
                key={entity.id}
                onClick={() => onSelectEntity(entity.id)}
                type="button"
              >
                <span className="v2-entity-swatch" style={{ backgroundColor: entity.primaryColor }} />
                <span>{entity.name}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="v2-scene-section">
          <div className="v2-section-title">
            <span>Cameras</span>
            <span className="v2-count">{cameras.length}</span>
          </div>
          {cameras.length === 0 ? <p>No cameras in this scene</p> : (
            <div className="v2-entity-list">
              {cameras.map((camera) => (
                <div className={`v2-camera-row${selectedEntityId === camera.id ? ' is-selected' : ''}`} key={camera.id}>
                  <button className="v2-camera-select" disabled onClick={() => onSelectEntity(camera.id)} type="button" title="Camera work is paused during Stage recovery">
                    <span className="v2-entity-swatch v2-camera-swatch" />
                    <span>{camera.name}</span>
                  </button>
                  <button className={`v2-camera-active${activeCameraId === camera.id ? ' is-active' : ''}`} disabled onClick={() => onSetActiveCamera(camera.id)} type="button" title="Camera work is paused during Stage recovery">
                    {activeCameraId === camera.id ? 'A' : '·'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="v2-scene-section">
          <div className="v2-section-title">
            <span>Lights</span>
            <span className="v2-count">0</span>
          </div>
          <p>No lights in this scene</p>
        </section>
      </div>
    </aside>
  )
}
