import { useRef, useState } from 'react'
import type { ActorDocument, CameraDocument, OpeningDocument, PropDocument, SunDocument, WallDocument } from '../core/sceneDocument'
import type { ProjectSceneEntry } from '../core/projectDocument'

type V2ScenePanelProps = {
  scenes: readonly ProjectSceneEntry[]
  activeSceneId: string
  actors: readonly ActorDocument[]
  props: readonly PropDocument[]
  walls: readonly WallDocument[]
  openings: readonly OpeningDocument[]
  lights: readonly SunDocument[]
  cameras: readonly CameraDocument[]
  activeCameraId: string | null
  selectedEntityId: string | null
  onSelectScene: (sceneId: string) => void
  onAddScene: () => void
  onRenameScene: (sceneId: string, name: string) => void
  onDuplicateScene: (sceneId: string) => void
  onDeleteScene: (sceneId: string) => void
  onImportScene: (file: File) => void
  onExportScene: (sceneId?: string) => void
  onAddActor: () => void
  onAddProp: (propType: NonNullable<PropDocument['propType']>) => void
  onAddWall: () => void
  onAddOpening: (openingType: 'door' | 'window') => void
  onAddSun: () => void
  onAddCamera: () => void
  onSetActiveCamera: (cameraId: string) => void
  onSelectEntity: (entityId: string) => void
}

export function V2ScenePanel({ scenes, activeSceneId, actors, props, walls, openings, lights, cameras, activeCameraId, selectedEntityId, onSelectScene, onAddScene, onRenameScene, onDuplicateScene, onDeleteScene, onImportScene, onExportScene, onAddActor, onAddProp, onAddWall, onAddOpening, onAddSun, onAddCamera, onSetActiveCamera, onSelectEntity }: V2ScenePanelProps) {
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
  const addProp = (propType: NonNullable<PropDocument['propType']>) => { onAddProp(propType); setAddOpen(false) }

  return (
    <aside className="v2-panel v2-scene-panel" aria-label="Scene">
      <div className="v2-panel-heading">
        <div><span className="v2-eyebrow">Workspace</span></div>
        <div className="v2-add-wrap">
          <button className="v2-add-button" onClick={() => setAddOpen((open) => !open)} type="button">+ Add</button>
          {addOpen ? <div className="v2-add-menu">
            <AddMenuItem kind="scene" label="Scene" onClick={() => { onAddScene(); setAddOpen(false) }} />
            <AddMenuItem kind="actor" label="Actor" onClick={addActor} />
            <AddMenuItem kind="camera" label="Camera" onClick={addCamera} />
            <span className="v2-add-menu-label">Props</span>
            {(['cube', 'sphere', 'cylinder', 'table', 'chair', 'bicycle', 'motorbike', 'car'] as const).map((kind) => <AddMenuItem key={kind} kind={kind} label={kind[0].toUpperCase() + kind.slice(1)} onClick={() => addProp(kind)} />)}
            <span className="v2-add-menu-label">Architecture</span>
            <AddMenuItem kind="wall" label="Wall" onClick={() => { onAddWall(); setAddOpen(false) }} />
            <AddMenuItem kind="door" label="Door" onClick={() => { onAddOpening('door'); setAddOpen(false) }} />
            <AddMenuItem kind="window" label="Window" onClick={() => { onAddOpening('window'); setAddOpen(false) }} />
            <span className="v2-add-menu-label">Lighting</span>
            <AddMenuItem kind="sun" label="Sun" onClick={() => { onAddSun(); setAddOpen(false) }} />
          </div> : null}
        </div>
      </div>
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
        <section className="v2-scene-section"><div className="v2-section-title"><span>Actors</span><span className="v2-count">{actors.length}</span></div>{actors.length === 0 ? <p>No actors in this Scene</p> : <div className="v2-entity-list">{actors.map((actor) => <button className={`v2-entity-row${selectedEntityId === actor.id ? ' is-selected' : ''}`} key={actor.id} onClick={() => onSelectEntity(actor.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: actor.appearance.primaryColor }} /><span>{actor.name}</span></button>)}</div>}</section>
        <section className="v2-scene-section"><div className="v2-section-title"><span>Props</span><span className="v2-count">{props.length}</span></div><div className="v2-entity-list">{props.map((entity) => <button className={`v2-entity-row${selectedEntityId === entity.id ? ' is-selected' : ''}`} key={entity.id} onClick={() => onSelectEntity(entity.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: entity.primaryColor }} /><span>{entity.name}</span><small>{entity.propType ?? entity.shape}</small></button>)}</div></section>
        <section className="v2-scene-section"><div className="v2-section-title"><span>Architecture</span><span className="v2-count">{walls.length + openings.length}</span></div><div className="v2-entity-list">{[...walls, ...openings].map((entity) => <button className={`v2-entity-row${selectedEntityId === entity.id ? ' is-selected' : ''}`} key={entity.id} onClick={() => onSelectEntity(entity.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: entity.primaryColor }} /><span>{entity.name}</span><small>{entity.type === 'Wall' ? 'Wall' : entity.openingType}</small></button>)}</div></section>
        <section className="v2-scene-section"><div className="v2-section-title"><span>Cameras</span><span className="v2-count">{cameras.length}</span></div>{cameras.length === 0 ? <p>No cameras in this Scene</p> : <div className="v2-entity-list">{cameras.map((camera) => <div className={`v2-camera-row${selectedEntityId === camera.id ? ' is-selected' : ''}`} key={camera.id}><button className="v2-camera-select" onClick={() => onSelectEntity(camera.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: camera.proxyColor }} /><span>{camera.name}</span></button><button className={`v2-camera-active${activeCameraId === camera.id ? ' is-active' : ''}`} onClick={() => onSetActiveCamera(camera.id)} type="button" title={activeCameraId === camera.id ? 'Active Camera' : 'Set Active Camera'}>{activeCameraId === camera.id ? 'A' : '·'}</button></div>)}</div>}</section>
        <section className="v2-scene-section"><div className="v2-section-title"><span>Lights</span><span className="v2-count">{lights.length}</span></div>{lights.length === 0 ? <p>No lights in this Scene</p> : <div className="v2-entity-list">{lights.map((sun) => <button className={`v2-entity-row${selectedEntityId === sun.id ? ' is-selected' : ''}`} key={sun.id} onClick={() => onSelectEntity(sun.id)} type="button"><span className="v2-entity-swatch" style={{ backgroundColor: sun.color }} /><span>{sun.name}</span><small>Sun</small></button>)}</div>}</section>
      </div>
    </aside>
  )
}

type MenuIconKind = 'scene' | 'actor' | 'camera' | 'cube' | 'sphere' | 'cylinder' | 'table' | 'chair' | 'bicycle' | 'motorbike' | 'car' | 'wall' | 'door' | 'window' | 'sun'

function AddMenuItem({ kind, label, onClick }: { kind: MenuIconKind; label: string; onClick: () => void }) {
  return <button onClick={onClick} type="button"><MenuIcon kind={kind} /><span>{label}</span></button>
}

function MenuIcon({ kind }: { kind: MenuIconKind }) {
  const paths: Record<MenuIconKind, string> = {
    scene: 'M3 4h18v16H3z M7 8h10 M7 12h10 M7 16h6',
    actor: 'M12 4a3 3 0 1 0 0 6a3 3 0 0 0 0-6 M6 20c.5-4 2.5-6 6-6s5.5 2 6 6',
    camera: 'M4 8h4l1.5-2h5L16 8h4v10H4z M12 10a3 3 0 1 0 0 6a3 3 0 0 0 0-6',
    cube: 'm12 3 8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9',
    sphere: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16',
    cylinder: 'M5 6c0-2 14-2 14 0v12c0 2-14 2-14 0z M5 6c0 2 14 2 14 0 M5 18c0 2 14 2 14 0',
    table: 'M4 7h16v3H4z M6 10v10 M18 10v10',
    chair: 'M6 5h12v3H9v5h9v3H6z M8 16v4 M16 16v4',
    bicycle: 'M5 17a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M19 17a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M5 14h5l3-5 3 5h3 M10 14l-2-5h3',
    motorbike: 'M4 16a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M20 16a3 3 0 1 0 0-6a3 3 0 0 0 0 6 M7 13h7l3-4h2 M10 13l2-4h3',
    car: 'M4 15l2-6h12l2 6v4H4z M6 9l2-3h8l2 3 M7 17a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3 M17 17a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0-3',
    wall: 'M4 4h16v16H4z M8 4v16 M16 4v16',
    door: 'M6 20V4h12v16 M9 12h1',
    window: 'M4 5h16v14H4z M12 5v14 M4 12h16',
    sun: 'M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M19 5l-1.5 1.5 M6.5 17.5 5 19',
  }
  return <svg className="v2-menu-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>
}
