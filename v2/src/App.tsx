import { useEffect, useRef, useState } from 'react'
import { V2DetailsPanel } from './components/V2DetailsPanel'
import { V2ScenePanel } from './components/V2ScenePanel'
import { V2Stage, type V2TransformDebugState } from './components/V2Stage'
import { V2Timeline } from './components/V2Timeline'
import { V2TopBar } from './components/V2TopBar'
import { webPlatformAdapter } from './platform/platformAdapter'
import { createDefaultProps } from './scene/testEntities'
import { applySceneEntityTransform, createActorDocument, createCameraDocument, createEmptySceneDocument, type ActorDocument, type CameraDocument, type RationalFrameRate, type SceneDocument, type TimelineProperty } from './core/sceneDocument'
import { CAMERA_DATABASE } from './core/cameraDatabase'
import { defaultCameraPlacement } from './core/cameraPlacement'
import { cameraRotationLookingAt } from './runtime/cameraMath'
import { createEditorClipboard, pasteEditorClipboard, type EditorClipboard } from './core/editorClipboard'
import { EditorHistory, type EditorHistorySnapshot } from './core/editorHistory'
import { editorShortcutForKey } from './core/editorShortcuts'
import type { StageTool, StageTransform } from './stage-engine'
import { evaluateTimeline } from './timeline/timelineEvaluator'
import { createPlaybackClock, playbackFrameAt, playbackReachedMarkOut, type PlaybackClock } from './timeline/playbackClock'
import { clampTimelineFrame, removeTimelineKeyframe, setTimelineMark, trackHasKeyframe, upsertTimelineKeyframe } from './timeline/timelineMath'
import { commitTimelineTransform, type TimelineTransformCommit } from './timeline/transformOwnership'

export function V2App() {
  const [view, setView] = useState<'blocking' | 'camera'>('blocking')
  const [sceneDocument, setSceneDocument] = useState(() => ({ ...createEmptySceneDocument(), props: createDefaultProps() }))
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [transformTool, setTransformTool] = useState<StageTool>('select')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [transformingEntityId, setTransformingEntityId] = useState<string | null>(null)
  const [suspendedTimelineEntityIds, setSuspendedTimelineEntityIds] = useState<ReadonlySet<string>>(new Set())
  const [lastTransformDebug, setLastTransformDebug] = useState<V2TransformDebugState | null>(null)
  const sceneDocumentRef = useRef<SceneDocument>(sceneDocument)
  const selectedEntityIdRef = useRef<string | null>(selectedEntityId)
  const clipboardRef = useRef<EditorClipboard | null>(null)
  const historyRef = useRef<EditorHistory>(new EditorHistory(100))
  const transformTransactionRef = useRef<{ before: SceneDocument; beforeSelection: string | null } | null>(null)
  const playbackRef = useRef<PlaybackClock | null>(null)
  const playbackFrameRequestRef = useRef<number | null>(null)
  void webPlatformAdapter
  const evaluatedEntities = evaluateTimeline(sceneDocument, sceneDocument.timeline.currentFrame)
  const selectedActorBase = sceneDocument.actors.find((actor) => actor.id === selectedEntityId) ?? null
  const selectedProp = sceneDocument.props.find((prop) => prop.id === selectedEntityId) ?? null
  const selectedCameraBase = sceneDocument.cameras.find((camera) => camera.id === selectedEntityId) ?? null
  const selectedActor = selectedActorBase ? { ...selectedActorBase, ...(evaluatedEntities[selectedActorBase.id] ?? {}) } as ActorDocument : null
  const selectedCamera = selectedCameraBase ? { ...selectedCameraBase, ...(evaluatedEntities[selectedCameraBase.id] ?? {}) } as CameraDocument : null
  const entityNames = Object.fromEntries([...sceneDocument.actors, ...sceneDocument.cameras].map((entity) => [entity.id, entity.name]))

  const formatTransform = (position: [number, number, number], rotation: [number, number, number]) => `P(${position.map((value) => value.toFixed(2)).join(',')}) R(${rotation.map((value) => value.toFixed(2)).join(',')})`

  useEffect(() => {
    sceneDocumentRef.current = sceneDocument
    selectedEntityIdRef.current = selectedEntityId
  }, [sceneDocument, selectedEntityId])

  const applyEditorSnapshot = (snapshot: EditorHistorySnapshot) => {
    sceneDocumentRef.current = snapshot.document
    selectedEntityIdRef.current = snapshot.selectedEntityId
    setSceneDocument(snapshot.document)
    setSelectedEntityId(snapshot.selectedEntityId)
    setSuspendedTimelineEntityIds(new Set())
  }

  const setCurrentFrame = (frame: number) => {
    if (isPlaying) return
    const before = sceneDocumentRef.current
    const currentFrame = clampTimelineFrame(frame, before.timeline.startFrame, before.timeline.endFrame)
    if (currentFrame === before.timeline.currentFrame) return
    const after = { ...before, timeline: { ...before.timeline, currentFrame } }
    setSuspendedTimelineEntityIds(new Set())
    sceneDocumentRef.current = after
    setSceneDocument(after)
  }

  const recordAction = (label: string, before: SceneDocument, beforeSelection: string | null, after: SceneDocument, afterSelection: string | null) => {
    historyRef.current.record({
      label,
      before: { document: before, selectedEntityId: beforeSelection },
      after: { document: after, selectedEntityId: afterSelection },
    })
  }

  const addActor = () => {
    const before = sceneDocumentRef.current
    const nextIndex = Math.max(0, ...before.actors.map((actor) => Number(/actor-(\d+)/.exec(actor.id)?.[1] ?? 0))) + 1
    const actor = createActorDocument(
      `actor-${String(nextIndex).padStart(2, '0')}`,
      `Actor ${String(nextIndex).padStart(2, '0')}`,
      [nextIndex % 2 === 1 ? -1.25 : 1.25, 0, -1.6],
    )
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, actors: [...before.actors, actor] }
    recordAction(`Add ${actor.name}`, before, selectedEntityIdRef.current, after, actor.id)
    applyEditorSnapshot({ document: after, selectedEntityId: actor.id })
  }

  const addCamera = () => {
    const before = sceneDocumentRef.current
    const nextIndex = Math.max(0, ...before.cameras.map((camera) => Number(/camera-(\d+)/.exec(camera.id)?.[1] ?? 0))) + 1
    const definition = CAMERA_DATABASE[0]
    const captureMode = definition.captureModes[0]
    const placement = defaultCameraPlacement(nextIndex)
    const camera = createCameraDocument(
      `camera-${String(nextIndex).padStart(2, '0')}`,
      `Camera ${String(nextIndex).padStart(2, '0')}`,
      placement.position,
      cameraRotationLookingAt(placement.position, placement.target),
      definition.id,
      captureMode.id,
    )
    const after = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      cameras: [...before.cameras, camera],
      activeCameraId: before.activeCameraId ?? camera.id,
    }
    recordAction(`Add ${camera.name}`, before, selectedEntityIdRef.current, after, camera.id)
    applyEditorSnapshot({ document: after, selectedEntityId: camera.id })
  }

  const setActiveCamera = (cameraId: string) => {
    const before = sceneDocumentRef.current
    if (before.activeCameraId === cameraId) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, activeCameraId: cameraId }
    recordAction('Set Active Camera', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const updateCamera = (cameraId: string, changes: Partial<CameraDocument>) => {
    const before = sceneDocumentRef.current
    const camera = before.cameras.find((item) => item.id === cameraId)
    if (!camera) return
    let timeline = before.timeline
    const nextChanges = { ...changes }
    if (changes.position && trackHasKeyframe(before.timeline, cameraId, 'position', before.timeline.currentFrame)) {
      timeline = upsertTimelineKeyframe(timeline, cameraId, 'Camera', 'position', before.timeline.currentFrame, changes.position)
      delete nextChanges.position
    }
    if (changes.rotation && trackHasKeyframe(before.timeline, cameraId, 'rotation', before.timeline.currentFrame)) {
      timeline = upsertTimelineKeyframe(timeline, cameraId, 'Camera', 'rotation', before.timeline.currentFrame, changes.rotation)
      delete nextChanges.rotation
    }
    if (changes.focalLengthMm !== undefined && trackHasKeyframe(before.timeline, cameraId, 'focalLengthMm', before.timeline.currentFrame)) {
      timeline = upsertTimelineKeyframe(timeline, cameraId, 'Camera', 'focalLengthMm', before.timeline.currentFrame, changes.focalLengthMm)
      delete nextChanges.focalLengthMm
    }
    const after = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      cameras: before.cameras.map((item) => item.id === cameraId ? { ...item, ...nextChanges } : item),
      timeline,
    }
    recordAction(`Update ${camera.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const addKeyframe = (entityId: string, property: TimelineProperty) => {
    const before = sceneDocumentRef.current
    const evaluated = evaluateTimeline(before, before.timeline.currentFrame)[entityId]
    const actor = before.actors.find((item) => item.id === entityId)
    const camera = before.cameras.find((item) => item.id === entityId)
    const entity = actor ?? camera
    if (!entity || !evaluated) return
    const value = property === 'position' ? evaluated.position : property === 'heading' ? evaluated.rotation[1] : property === 'rotation' ? evaluated.rotation : evaluated.focalLengthMm
    if (value === undefined) return
    const nextTimeline = upsertTimelineKeyframe(before.timeline, entityId, camera ? 'Camera' : 'Actor', property, before.timeline.currentFrame, value)
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: nextTimeline }
    recordAction(`Add ${entity.name} ${property} keyframe`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const handleSelectionChange = (entityId: string | null) => {
    selectedEntityIdRef.current = entityId
    setSelectedEntityId(entityId)
  }

  const handleTransformStart = (_change: StageTransform) => {
    setTransformingEntityId(_change.entityId)
    transformTransactionRef.current = {
      before: sceneDocumentRef.current,
      beforeSelection: selectedEntityIdRef.current,
    }
  }

  const handleTransformEnd = (change: StageTransform) => {
    const transaction = transformTransactionRef.current
    transformTransactionRef.current = null
    setTransformingEntityId(null)
    if (!transaction) return
    const before = transaction.before
    const actor = before.actors.find((item) => item.id === change.entityId)
    const camera = before.cameras.find((item) => item.id === change.entityId)
    if (actor || camera) {
      const result = commitTimelineTransform(before, change as TimelineTransformCommit)
      const after = { ...result.document, metadata: { ...result.document.metadata, updatedAt: new Date().toISOString() } }
      const finalEntity = [...after.actors, ...after.cameras].find((item) => item.id === change.entityId)
      const evaluatedAfter = evaluateTimeline(after, before.timeline.currentFrame)[change.entityId]
      setLastTransformDebug({ entityId: change.entityId, runtimeFinal: formatTransform(change.position, change.rotation), baseDocumentFinal: finalEntity ? formatTransform(finalEntity.position, finalEntity.rotation) : '—', timelineEvaluated: evaluatedAfter ? formatTransform(evaluatedAfter.position, evaluatedAfter.rotation) : '—', valueAppliedAfterTransform: result.suspendEvaluation ? 'BASE (TIMELINE SUSPENDED)' : result.changedKeyframe ? 'KEYFRAME' : 'BASE' })
      recordAction(`${result.changedKeyframe ? 'Update' : 'Move'} ${actor?.name ?? camera?.name ?? change.entityId}${result.changedKeyframe ? ' keyframe' : ''}`, before, transaction.beforeSelection, after, change.entityId)
      applyEditorSnapshot({ document: after, selectedEntityId: change.entityId })
      if (result.suspendEvaluation) setSuspendedTimelineEntityIds(new Set([change.entityId]))
      return
    }
    const after = applySceneEntityTransform(sceneDocumentRef.current, change)
    const entity = [...after.actors, ...after.props, ...after.cameras].find((item) => item.id === change.entityId)
    const action = transformTool === 'rotate' ? 'Rotate' : 'Move'
    setLastTransformDebug({ entityId: change.entityId, runtimeFinal: formatTransform(change.position, change.rotation), baseDocumentFinal: formatTransform(after.props.find((item) => item.id === change.entityId)?.position ?? change.position, after.props.find((item) => item.id === change.entityId)?.rotation ?? change.rotation), timelineEvaluated: '—', valueAppliedAfterTransform: 'BASE' })
    recordAction(`${action} ${entity?.name ?? change.entityId}`, before, transaction.beforeSelection, after, change.entityId)
    applyEditorSnapshot({ document: after, selectedEntityId: change.entityId })
  }

  const changeFrameRate = (frameRate: RationalFrameRate) => {
    const before = sceneDocumentRef.current
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: { ...before.timeline, frameRate } }
    recordAction('Change Frame Rate', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const changeMark = (kind: 'in' | 'out') => {
    const before = sceneDocumentRef.current
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: setTimelineMark(before.timeline, kind, before.timeline.currentFrame) }
    recordAction(kind === 'in' ? 'Set Mark In' : 'Set Mark Out', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const deleteKeyframe = (trackId: string, keyframeId: string) => {
    const before = sceneDocumentRef.current
    const track = before.timeline.tracks.find((item) => item.id === trackId)
    if (!track?.keyframes.some((keyframe) => keyframe.id === keyframeId)) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: removeTimelineKeyframe(before.timeline, trackId, keyframeId) }
    recordAction('Delete Keyframe', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const stepFrame = (amount: number) => setCurrentFrame(sceneDocumentRef.current.timeline.currentFrame + amount)

  const togglePlayback = () => {
    if (isPlaying) {
      setIsPlaying(false)
      playbackRef.current = null
      return
    }
    const timeline = sceneDocumentRef.current.timeline
    const startFrame = timeline.currentFrame < timeline.markIn || timeline.currentFrame >= timeline.markOut ? timeline.markIn : timeline.currentFrame
    if (startFrame !== timeline.currentFrame) {
      const after = { ...sceneDocumentRef.current, timeline: { ...timeline, currentFrame: startFrame } }
      sceneDocumentRef.current = after
      setSceneDocument(after)
    }
    setSuspendedTimelineEntityIds(new Set())
    playbackRef.current = createPlaybackClock(startFrame, performance.now())
    setIsPlaying(true)
  }

  useEffect(() => {
    if (!isPlaying) {
      if (playbackFrameRequestRef.current !== null) window.cancelAnimationFrame(playbackFrameRequestRef.current)
      playbackFrameRequestRef.current = null
      return
    }
    const tick = (now: number) => {
      const clock = playbackRef.current
      if (!clock) return
      const timeline = sceneDocumentRef.current.timeline
      const frame = playbackFrameAt(clock, now, timeline.frameRate, timeline.markOut)
      if (frame !== timeline.currentFrame) {
        const after = { ...sceneDocumentRef.current, timeline: { ...timeline, currentFrame: frame } }
        sceneDocumentRef.current = after
        setSceneDocument(after)
      }
      if (playbackReachedMarkOut(clock, now, timeline.frameRate, timeline.markOut)) {
        playbackRef.current = null
        setIsPlaying(false)
        playbackFrameRequestRef.current = null
        return
      }
      playbackFrameRequestRef.current = window.requestAnimationFrame(tick)
    }
    playbackFrameRequestRef.current = window.requestAnimationFrame(tick)
    return () => { if (playbackFrameRequestRef.current !== null) window.cancelAnimationFrame(playbackFrameRequestRef.current) }
  }, [isPlaying])

  const copySelection = (): boolean => {
    const selected = [...sceneDocumentRef.current.actors, ...sceneDocumentRef.current.props].find((entity) => entity.id === selectedEntityIdRef.current)
    if (!selected) return false
    clipboardRef.current = createEditorClipboard(selected)
    return true
  }

  const pasteSelection = (): boolean => {
    const clipboard = clipboardRef.current
    if (!clipboard) return false
    const before = sceneDocumentRef.current
    const result = pasteEditorClipboard(before, clipboard)
    recordAction(`Paste ${result.entity.name}`, before, selectedEntityIdRef.current, result.document, result.entity.id)
    applyEditorSnapshot({ document: result.document, selectedEntityId: result.entity.id })
    return true
  }

  const undo = (): boolean => {
    const entry = historyRef.current.undo()
    if (!entry) return false
    applyEditorSnapshot(entry.before)
    return true
  }

  const redo = (): boolean => {
    const entry = historyRef.current.redo()
    if (!entry) return false
    applyEditorSnapshot(entry.after)
    return true
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target.isContentEditable)) return
      const shortcut = editorShortcutForKey(event)
      if (!shortcut) return
      const handled = shortcut === 'copy' ? copySelection() : shortcut === 'paste' ? pasteSelection() : shortcut === 'undo' ? undo() : redo()
      if (handled) event.preventDefault()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <main className="v2-app-shell">
      <V2TopBar view={view} onViewChange={setView} />
      <V2ScenePanel actors={sceneDocument.actors} props={sceneDocument.props} cameras={sceneDocument.cameras} activeCameraId={sceneDocument.activeCameraId} selectedEntityId={selectedEntityId} onAddActor={addActor} onAddCamera={addCamera} onSetActiveCamera={setActiveCamera} onSelectEntity={handleSelectionChange} />
      <V2Stage
        view={view}
        actors={sceneDocument.actors}
        props={sceneDocument.props}
        cameras={sceneDocument.cameras}
        activeCameraId={sceneDocument.activeCameraId}
        selectedEntityId={selectedEntityId}
        tool={transformTool}
        onSelectionChange={handleSelectionChange}
        onToolChange={setTransformTool}
        onTransformStart={handleTransformStart}
        onTransformEnd={handleTransformEnd}
        evaluatedEntities={evaluatedEntities}
        isPlaying={isPlaying}
        transformingEntityId={transformingEntityId}
        suspendedTimelineEntityIds={suspendedTimelineEntityIds}
        timeline={sceneDocument.timeline}
        isScrubbing={isScrubbing}
        lastTransformDebug={lastTransformDebug}
      />
      <V2DetailsPanel actor={selectedActor} prop={selectedProp} camera={selectedCamera} timeline={sceneDocument.timeline} onCameraChange={updateCamera} onSetActiveCamera={setActiveCamera} onAddKeyframe={addKeyframe} activeCameraId={sceneDocument.activeCameraId} />
      <V2Timeline timeline={sceneDocument.timeline} tracks={sceneDocument.timeline.tracks} entityNames={entityNames} selectedEntityId={selectedEntityId} isPlaying={isPlaying} onFrameChange={setCurrentFrame} onFrameRateChange={changeFrameRate} onTogglePlayback={togglePlayback} onStepFrame={stepFrame} onMarkIn={() => changeMark('in')} onMarkOut={() => changeMark('out')} onDeleteKeyframe={deleteKeyframe} onScrubStart={() => setIsScrubbing(true)} onScrubEnd={() => setIsScrubbing(false)} />
    </main>
  )
}
