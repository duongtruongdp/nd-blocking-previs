import { useEffect, useRef, useState } from 'react'
import type { ActorDocument, PropDocument } from '../core/sceneDocument'
import { StageEngine, type StageEngineDebugSnapshot, type StagePropDefinition, type StageTool, type StageTransform } from '../stage-engine'
import { ProceduralActorRuntime } from '../runtime/actor/proceduralActor'

type V2StageProps = {
  actors: readonly ActorDocument[]
  props: readonly PropDocument[]
  selectedEntityId: string | null
  tool: StageTool
  onSelectionChange: (entityId: string | null) => void
  onToolChange: (tool: StageTool) => void
  onTransformStart: (change: StageTransform) => void
  onTransformEnd: (change: StageTransform) => void
}

function syncActors(engine: StageEngine, actors: readonly ActorDocument[], runtimes: Map<string, ProceduralActorRuntime>): void {
  const actorIds = new Set(actors.map((actor) => actor.id))
  Array.from(runtimes.keys()).forEach((actorId) => {
    if (!actorIds.has(actorId)) {
      engine.removeEntity(actorId)
      runtimes.delete(actorId)
    }
  })
  actors.forEach((actor) => {
    let runtime = runtimes.get(actor.id)
    if (!runtime) {
      runtime = new ProceduralActorRuntime(actor)
      runtimes.set(actor.id, runtime)
      engine.addEntity({ id: actor.id, type: 'Actor', name: actor.name, root: runtime.root, setSelected: (selected) => runtime?.setSelected(selected), dispose: () => runtime?.dispose() })
    } else {
      runtime.applyDocument(actor)
    }
    engine.setEntityTransform(actor.id, { position: actor.position, rotation: actor.rotation })
  })
}

export function V2Stage({ actors, props, selectedEntityId, tool, onSelectionChange, onToolChange, onTransformStart, onTransformEnd }: V2StageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<StageEngine | null>(null)
  const actorRuntimesRef = useRef(new Map<string, ProceduralActorRuntime>())
  const initialStageRef = useRef({ actors, props, selectedEntityId, tool })
  const initialToolRef = useRef(tool)
  const callbacksRef = useRef({ onSelectionChange, onToolChange, onTransformStart, onTransformEnd })
  const [debug, setDebug] = useState<StageEngineDebugSnapshot | null>(null)
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).get('interactionDebug') === '1'
  const debugEnabledRef = useRef(debugEnabled)

  useEffect(() => {
    callbacksRef.current = { onSelectionChange, onToolChange, onTransformStart, onTransformEnd }
  }, [onSelectionChange, onToolChange, onTransformStart, onTransformEnd])

  useEffect(() => {
    if (!stageRef.current) return
    const actorRuntimes = actorRuntimesRef.current
    const engine = new StageEngine(stageRef.current, {
      onToolChanged: (nextTool) => callbacksRef.current.onToolChange(nextTool),
      onTransformStart: (change) => callbacksRef.current.onTransformStart(change),
      onTransformEnd: (change) => callbacksRef.current.onTransformEnd(change),
      onDebug: setDebug,
      debugEnabled: debugEnabledRef.current,
    })
    const removeSelectionListener = engine.onSelectionChanged((entityId) => callbacksRef.current.onSelectionChange(entityId))
    const initial = initialStageRef.current
    syncActors(engine, initial.actors, actorRuntimes)
    engine.setProps(initial.props as readonly StagePropDefinition[])
    engine.setTool(initialToolRef.current)
    engine.setSelected(initial.selectedEntityId)
    engineRef.current = engine
    return () => {
      removeSelectionListener()
      engineRef.current = null
      engine.dispose()
      actorRuntimes.clear()
    }
  }, [])

  useEffect(() => {
    engineRef.current?.setTool(tool)
  }, [tool])

  useEffect(() => {
    if (engineRef.current) syncActors(engineRef.current, actors, actorRuntimesRef.current)
  }, [actors])

  useEffect(() => {
    engineRef.current?.setProps(props as readonly StagePropDefinition[])
  }, [props])

  useEffect(() => {
    engineRef.current?.setSelected(selectedEntityId)
  }, [selectedEntityId])

  return (
    <section className="v2-stage-panel" aria-label="Stage">
      <div className="v2-stage-viewport" ref={stageRef}>
        <div className="v2-stage-header">
          <span className="v2-stage-pill">Blocking View</span>
          <span>Stage</span>
        </div>
        <div className="v2-stage-tools" aria-label="Transform tools">
          {(['select', 'move', 'rotate'] as const).map((item) => (
            <button className={tool === item ? 'is-active' : ''} key={item} onClick={() => onToolChange(item)} type="button">
              <span>{item === 'select' ? 'E' : item === 'move' ? 'Q' : 'R'}</span>{item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <div className="v2-stage-hint">E Select · Q Move · R Rotate · Left drag orbit · Right drag pan · Two-finger scroll pan · Pinch zoom</div>
        {debugEnabled && debug ? (
          <div className="v2-interaction-debug" aria-hidden="true">
            <strong>INTERACTION DEBUG</strong>
            <span>TOOL {debug.tool}</span>
            <span>POINTER MODE {debug.pointerMode}</span>
            <span>NDC {debug.ndc}</span>
            <span>RAY HITS {debug.rayHits}</span>
            <span>SELECTED ID {debug.selectedId}</span>
            {debug.axisDrag ? (
              <>
                <strong>AXIS DRAG {debug.axisDrag.handle.toUpperCase()}</strong>
                <span>SCREEN AXIS {debug.axisDrag.screenAxisX.toFixed(3)} / {debug.axisDrag.screenAxisY.toFixed(3)}</span>
                <span>POINTER Δ {debug.axisDrag.pointerDeltaX.toFixed(1)} / {debug.axisDrag.pointerDeltaY.toFixed(1)}</span>
                <span>PIXELS {debug.axisDrag.pixelsAlongAxis.toFixed(2)} · WORLD/PIXEL {debug.axisDrag.worldUnitsPerPixel.toFixed(5)}</span>
                <span>WORLD DISTANCE {debug.axisDrag.worldDistance.toFixed(4)}</span>
                <span>RESULT {debug.axisDrag.resultPosition.map((value) => value.toFixed(3)).join(' / ')}</span>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="v2-stage-footer">
          <span>Stage interaction foundation</span>
          <span>Meters</span>
        </div>
      </div>
    </section>
  )
}
