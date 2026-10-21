import type { DragEvent } from 'react'
import type { ProjectSceneEntry } from '../core/projectDocument'
import { MASTER_SHOT_DRAG_TYPE } from '../core/masterSequence'
import type { ShotDocument } from '../core/shotDocument'
import { shotDurationFrames } from '../core/shotDocument'
import { frameToTimecode } from '../timeline/timelineMath'
import { resolveShotCamera } from '../core/shotCameraResolver'

type V2MasterShotBinProps = {
  shots: readonly ShotDocument[]
  scenes: readonly ProjectSceneEntry[]
  activeShotId: string | null
  onSelectShot: (shotId: string) => void
  onAddShot: (shotId: string) => void
}

export function V2MasterShotBin({ shots, scenes, activeShotId, onSelectShot, onAddShot }: V2MasterShotBinProps) {
  const beginDrag = (event: DragEvent<HTMLDivElement>, shotId: string) => {
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(MASTER_SHOT_DRAG_TYPE, shotId)
    event.dataTransfer.setData('text/plain', shotId)
  }
  return <aside className="v2-panel v2-master-shot-bin" aria-label="Master Shot Bin">
    <div className="v2-panel-heading"><div><span className="v2-eyebrow">Workspace</span><h2>Master</h2></div><span className="v2-count">{shots.length}</span></div>
    <div className="v2-master-bin-heading"><span>Shots</span><small>Drag into the timeline</small></div>
    {shots.length === 0 ? <p className="v2-master-bin-empty">Create Shots in Scene mode first.</p> : <div className="v2-master-bin-list">{shots.map((shot) => {
      const scene = scenes.find((entry) => entry.id === shot.sceneId)
      const camera = resolveShotCamera({ scenes }, shot).camera
      const selected = activeShotId === shot.id
      return <div className={`v2-master-bin-item${selected ? ' is-selected' : ''}`} key={shot.id} draggable onDragStart={(event) => beginDrag(event, shot.id)} onDoubleClick={() => onAddShot(shot.id)}>
        <button type="button" className="v2-master-bin-select" onClick={() => onSelectShot(shot.id)} title="Double-click to add to Master">
          <span className="v2-master-bin-thumb">{shot.thumbnail ? <img src={shot.thumbnail.dataUrl} alt="" /> : <span>SHOT</span>}</span>
          <span className="v2-master-bin-copy"><strong>{shot.name}</strong><small>{scene?.name ?? 'Missing Scene'} · {camera ? `${camera.name} · ${Math.round(camera.focalLengthMm)}mm` : 'Missing Camera'}</small><small>{frameToTimecode(shotDurationFrames(shot), scene?.scene.timeline.frameRate ?? { numerator: 24, denominator: 1 })}</small></span>
        </button>
        <button type="button" className="v2-master-bin-add" onClick={() => onAddShot(shot.id)} aria-label={`Add ${shot.name} to Master`}>+</button>
      </div>
    })}</div>}
    <p className="v2-master-bin-hint">Drag a Shot into the SHOTS track to place it in sequence order.</p>
  </aside>
}
