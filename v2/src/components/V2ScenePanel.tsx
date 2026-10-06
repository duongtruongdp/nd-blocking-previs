import { useRef, useState } from 'react'
import type { ActorDocument, CameraDocument, PropDocument } from '../core/sceneDocument'
import type { ProjectSceneEntry } from '../core/projectDocument'

type V2ScenePanelProps = {
  projectName: string
  scenes: readonly ProjectSceneEntry[]
  activeSceneId: string
  actors: readonly ActorDocument[]
  props: readonly PropDocument[]
  cameras: readonly CameraDocument[]
  activeCameraId: string | null
  selectedEntityId: string | null
  onProjectNameChange: (name: string) => void
  onSelectScene: (sceneId: string) => void
  onAddScene: () => void
  onRenameScene: (sceneId: string, name: string) => void
  onDuplicateScene: (sceneId: string) => void
  onDeleteScene: (sceneId: string) => void
  onImportScene: (file: File) => void
  onExportScene: (sceneId?: string) => void
  onAddActor: () => void
  onAddCamera: () => void
  onSetActiveCamera: (cameraId: string) => void
  onSelectEntity: (entityId: string) => void
}

export function V2ScenePanel({ projectName, scenes, activeSceneId, actors, props, cameras, activeCameraId, selectedEntityId, onProjectNameChange, onSelectScene, onAddScene, onRenameScene, onDuplicateScene, onDeleteScene, onImportScene, onExportScene, onAddActor, onAddCamera, onSetActiveCamera, onSelectEntity }: V2ScenePanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [sceneMenuId, setSceneMenuId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const renameScene = (scene: ProjectSceneEntry) => {
    const name = window.prompt('Scene name', scene.name)
    if (name !== null) onRenameScene(scene.id, name)
    setSceneMenuId(null)
  }

  const addActor = () => { onAddActor(); setAddOpen(false) }
  const addCamera = () => { onAddCamera(); setAddOpen(false) }

  return (
    <aside className="v2-panel v2-scene-panel" aria-label="Scene">
      <div className="v2-panel-heading">
        <div><span className="v2-eyebrow">Workspace</span><h2>Project</h2></div>
        <div className="v2-add-wrap">
          <button className="v2-add-button" onClick={() => setAddOpen((open) => !open)} type="button">+ Add</button>
          {addOpen ? <div className="v2-add-menu">
            <button onClick={() => { onAddScene(); setAddOpen(false) }} type="button"><span className="v2-menu-icon">▤</span>Scene</button>
            <button onClick={addActor} type="button"><span className="v2-menu-icon">○</span>Actor</button>
            <button onClick={addCamera} type="button"><span className="v2-menu-icon">▣</span>Camera</button>
            <span className="v2-add-menu-label">Props</span><button disabled type="button">Cube</button><button disabled type="button">Sphere</button><button disabled type="button">Cylinder</button>
          </div> : null}
        </div>
      </div>
      <section className="v2-project-section"><span className="v2-eyebrow">Project</span><input className="v2-project-name-input" aria-label="Project name" value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} /></section>
      <section className="v2-scenes-section">
        <div className="v2-section-title"><span>Scenes</span><span className="v2-count">{scenes.length}</span></div>
        <div className="v2-scene-list">
          {scenes.map((scene, index) => <div className={`v2-scene-row${scene.id === activeSceneId ? ' is-active' : ''}`} key={scene.id}>
            <button className="v2-scene-select" onClick={() => onSelectScene(scene.id)} type="button"><span className="v2-scene-index">{String(index + 1).padStart(2, '0')}</span><span>{scene.name}</span></button>
            <button className="v2-scene-menu-button" aria-label={`Actions for ${scene.name}`} aria-expanded={sceneMenuId === scene.id} onClick={() => setSceneMenuId((current) => current === scene.id ? null : scene.id)} type="button">•••</button>
            {sceneMenuId === scene.id ? <div className="v2-scene-row-menu"><button onClick={() => renameScene(scene)} type="button">Rename</button><button onClick={() => { onDuplicateScene(scene.id); setSceneMenuId(null) }} type="button">Duplicate</button><button onClick={() => { onExportScene(scene.id); setSceneMenuId(null) }} type="button">Export Scene</button><button className="is-danger" disabled={scenes.length <= 1} onClick={() => { onDeleteScene(scene.id); setSceneMenuId(null) }} type="button">Delete</button></div> : null}
          </div>)}
        </div>
        <div className="v2-scene-actions"><button className="v2-small-action" onClick={onAddScene} type="button">+ Add Scene</button><button className="v2-small-action" onClick={() => importInputRef.current?.click()} type="button">Import Scene</button><button className="v2-small-action" onClick={() => onExportScene()} type="button">Export Scene</button><input ref={importInputRef} className="v2-hidden-file-input" type="file" accept=".ndscene,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportScene(file); event.currentTarget.value = '' }} /></div>
      </section>
      <div className="v2-scene-sections">
        <section className="v2-scene-section"><div className="v2-section-title"><span>Actors</span><span className="v2-count">{actors.length}</span></div>{actors.length === 0 ? <p>No actors in this Scene</p> : <div className="v2-entity-list">{actors.map((actor) => <button className={`v2-entity-row${selectedEntityId === actor.id ? ' is-selected' : ''}`} key={actor.id} onClick={() => onSelectEntity(actor.id)} type="button"><span className="v2-entity-swatch v2-actor-swatch" /><span>{actor.name}</span></button>)}</div>}</section>
        <section className="v2-scene-section"><div className="v2-section-title"><span>Props</span><span className="v2-count">{props.length}</span></div><div className="v2-entity-list">{props.map((entity) => <button className={`v2-entity-row${selectedEntityId === entity.id ? ' is-selected' : ''}`} key={entity.id} onClick={() => onSelectEntity(entity.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: entity.primaryColor }} /><span>{entity.name}</span></button>)}</div></section>
        <section className="v2-scene-section"><div className="v2-section-title"><span>Cameras</span><span className="v2-count">{cameras.length}</span></div>{cameras.length === 0 ? <p>No cameras in this Scene</p> : <div className="v2-entity-list">{cameras.map((camera) => <div className={`v2-camera-row${selectedEntityId === camera.id ? ' is-selected' : ''}`} key={camera.id}><button className="v2-camera-select" onClick={() => onSelectEntity(camera.id)} type="button"><span className="v2-entity-swatch v2-camera-swatch" /><span>{camera.name}</span></button><button className={`v2-camera-active${activeCameraId === camera.id ? ' is-active' : ''}`} onClick={() => onSetActiveCamera(camera.id)} type="button" title={activeCameraId === camera.id ? 'Active Camera' : 'Set Active Camera'}>{activeCameraId === camera.id ? 'A' : '·'}</button></div>)}</div>}</section>
        <section className="v2-scene-section"><div className="v2-section-title"><span>Lights</span><span className="v2-count">0</span></div><p>No lights in this Scene</p></section>
      </div>
    </aside>
  )
}
