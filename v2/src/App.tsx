import { useCallback, useEffect, useRef, useState } from 'react'
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
import { editorShortcutForKey, timelinePlayPauseShortcut } from './core/editorShortcuts'
import type { StageTool, StageTransform } from './stage-engine'
import { evaluateTimeline } from './timeline/timelineEvaluator'
import { createPlaybackClock, playbackFrameAt, playbackReachedMarkOut, type PlaybackClock } from './timeline/playbackClock'
import { clampTimelineFrame, removeTimelineKeyframe, setTimelineMark, upsertTimelineKeyframe } from './timeline/timelineMath'
import { captureTimelineValue, commitTimelineTransform, type TimelineTransformCommit } from './timeline/transformOwnership'
import { V2ExportModal } from './components/V2ExportModal'
import { exportFilename } from './export/exportMath'
import { exportVideo, isExportCancelled } from './export/videoExporter'
import type { VideoExportProgress, VideoExportSettings, VideoExportStatus } from './export/exportTypes'
import { parseSceneFile, prepareSceneForSave, sceneFilename, serializeScene, SceneFileError } from './core/scenePersistence'
import { creativeSceneChanged, creativeSceneFingerprint } from './core/sceneDirty'

function createDefaultV2Scene(): SceneDocument {
  return { ...createEmptySceneDocument(), props: createDefaultProps() }
}

export function V2App() {
  const [view, setView] = useState<'blocking' | 'camera'>('blocking')
  const [sceneDocument, setSceneDocument] = useState(createDefaultV2Scene)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedFrameGuideId, setSelectedFrameGuideId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [sceneFileError, setSceneFileError] = useState<string | null>(null)
  const [transformTool, setTransformTool] = useState<StageTool>('select')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [transformingEntityId, setTransformingEntityId] = useState<string | null>(null)
  const [suspendedTimelineEntityIds, setSuspendedTimelineEntityIds] = useState<ReadonlySet<string>>(new Set())
  const [lastTransformDebug, setLastTransformDebug] = useState<V2TransformDebugState | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<VideoExportStatus>('idle')
  const [exportProgress, setExportProgress] = useState<VideoExportProgress | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSettings, setExportSettings] = useState<VideoExportSettings>(() => ({ cameraId: null, markIn: 0, markOut: 120, frameRate: { numerator: 24, denominator: 1 }, deliveryAspectRatio: '16:9', width: 1920, format: 'mp4' }))
  const sceneDocumentRef = useRef<SceneDocument>(sceneDocument)
  const savedSceneFingerprintRef = useRef(creativeSceneFingerprint(sceneDocument))
  const selectedEntityIdRef = useRef<string | null>(selectedEntityId)
  const clipboardRef = useRef<EditorClipboard | null>(null)
  const historyRef = useRef<EditorHistory>(new EditorHistory(100))
  const transformTransactionRef = useRef<{ before: SceneDocument; beforeSelection: string | null } | null>(null)
  const playbackRef = useRef<PlaybackClock | null>(null)
  const playbackFrameRequestRef = useRef<number | null>(null)
  const exportAbortRef = useRef<AbortController | null>(null)
  const togglePlaybackRef = useRef<() => void>(() => {})
  void webPlatformAdapter
  const evaluatedEntities = evaluateTimeline(sceneDocument, sceneDocument.timeline.currentFrame)
  const selectedActorBase = sceneDocument.actors.find((actor) => actor.id === selectedEntityId) ?? null
  const selectedPropBase = sceneDocument.props.find((prop) => prop.id === selectedEntityId) ?? null
  const selectedCameraBase = sceneDocument.cameras.find((camera) => camera.id === selectedEntityId) ?? null
  const selectedActor = selectedActorBase ? (suspendedTimelineEntityIds.has(selectedActorBase.id) ? selectedActorBase : { ...selectedActorBase, ...(evaluatedEntities[selectedActorBase.id] ?? {}) } as ActorDocument) : null
  const selectedProp = selectedPropBase ? (suspendedTimelineEntityIds.has(selectedPropBase.id) ? selectedPropBase : { ...selectedPropBase, ...(evaluatedEntities[selectedPropBase.id] ?? {}) }) : null
  const selectedCamera = selectedCameraBase ? (suspendedTimelineEntityIds.has(selectedCameraBase.id) ? selectedCameraBase : { ...selectedCameraBase, ...(evaluatedEntities[selectedCameraBase.id] ?? {}) } as CameraDocument) : null
  const timelineEntities = [
    ...sceneDocument.actors.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Actor' as const })),
    ...sceneDocument.props.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Prop' as const })),
    ...sceneDocument.cameras.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Camera' as const })),
  ]

  const formatTransform = (position: [number, number, number], rotation: [number, number, number]) => `P(${position.map((value) => value.toFixed(2)).join(',')}) R(${rotation.map((value) => value.toFixed(2)).join(',')})`

  useEffect(() => {
    sceneDocumentRef.current = sceneDocument
    selectedEntityIdRef.current = selectedEntityId
  }, [sceneDocument, selectedEntityId])

  const applyEditorSnapshot = (snapshot: EditorHistorySnapshot, suspendedIds: ReadonlySet<string> = new Set()) => {
    sceneDocumentRef.current = snapshot.document
    selectedEntityIdRef.current = snapshot.selectedEntityId
    setSceneDocument(snapshot.document)
    setSelectedEntityId(snapshot.selectedEntityId)
    setSuspendedTimelineEntityIds(suspendedIds)
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
    setIsDirty(creativeSceneChanged(before, after) || creativeSceneFingerprint(after) !== savedSceneFingerprintRef.current)
  }

  const resetForLoadedScene = (document: SceneDocument) => {
    playbackRef.current = null
    setIsPlaying(false)
    setSuspendedTimelineEntityIds(new Set())
    setTransformingEntityId(null)
    transformTransactionRef.current = null
    setSelectedFrameGuideId(null)
    setSceneFileError(null)
    historyRef.current = new EditorHistory(100)
    savedSceneFingerprintRef.current = creativeSceneFingerprint(document)
    applyEditorSnapshot({ document, selectedEntityId: null })
    setIsDirty(false)
  }

  const saveScene = () => {
    const savedAt = new Date().toISOString()
    const prepared = prepareSceneForSave(sceneDocumentRef.current, savedAt)
    try {
      const text = serializeScene(prepared, savedAt)
      const url = window.URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = sceneFilename(prepared.metadata.name)
      anchor.click()
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
      sceneDocumentRef.current = prepared
      savedSceneFingerprintRef.current = creativeSceneFingerprint(prepared)
      setSceneDocument(prepared)
      setSceneFileError(null)
      setIsDirty(false)
    } catch (error: unknown) {
      setSceneFileError(error instanceof SceneFileError ? error.message : 'This scene could not be saved.')
    }
  }

  const loadScene = (file: File) => {
    if (isDirty && !window.confirm('Discard unsaved scene changes and load this Scene?')) return
    void file.text().then((text) => {
      const loaded = parseSceneFile(text)
      resetForLoadedScene(loaded)
      setView('blocking')
    }).catch((error: unknown) => {
      setSceneFileError(error instanceof SceneFileError ? error.message : 'This scene file could not be opened.')
    })
  }

  const newScene = () => {
    if (isDirty && !window.confirm('Discard unsaved scene changes and start a New Scene?')) return
    resetForLoadedScene(createDefaultV2Scene())
    setView('blocking')
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
    setSelectedFrameGuideId(before.cameras.find((camera) => camera.id === cameraId)?.frameGuides[0]?.id ?? null)
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, activeCameraId: cameraId }
    recordAction('Set Active Camera', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const updateCamera = (cameraId: string, changes: Partial<CameraDocument>) => {
    const before = sceneDocumentRef.current
    const camera = before.cameras.find((item) => item.id === cameraId)
    if (!camera) return
    const tracks = before.timeline.tracks.filter((track) => track.entityId === cameraId)
    const shouldSuspend = (changes.position !== undefined && tracks.some((track) => track.property === 'position'))
      || (changes.rotation !== undefined && tracks.some((track) => track.property === 'rotation'))
      || (changes.focalLengthMm !== undefined && tracks.some((track) => track.property === 'focalLengthMm'))
    const evaluated = evaluateTimeline(before, before.timeline.currentFrame)[cameraId]
    const visibleCamera = shouldSuspend && evaluated ? { ...camera, ...evaluated, focalLengthMm: evaluated.focalLengthMm ?? camera.focalLengthMm } : camera
    const nextCamera = { ...visibleCamera, ...changes, ...((changes.cameraDefinitionId !== undefined || changes.captureModeId !== undefined) ? { cameraSnapshot: undefined } : {}) }
    const after = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      cameras: before.cameras.map((item) => item.id === cameraId ? nextCamera : item),
    }
    recordAction(`Update ${camera.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    const suspendedIds = new Set(suspendedTimelineEntityIds)
    if (shouldSuspend) suspendedIds.add(cameraId)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current }, suspendedIds)
  }

  const addKeyframe = (entityId: string, property: TimelineProperty) => {
    const before = sceneDocumentRef.current
    const actor = before.actors.find((item) => item.id === entityId)
    const prop = before.props.find((item) => item.id === entityId)
    const camera = before.cameras.find((item) => item.id === entityId)
    const entity = actor ?? prop ?? camera
    if (!entity) return
    const evaluated = evaluateTimeline(before, before.timeline.currentFrame)[entityId]
    const visibleEntity = suspendedTimelineEntityIds.has(entityId) || !evaluated ? entity : { ...entity, ...evaluated, ...(camera ? { focalLengthMm: evaluated.focalLengthMm ?? camera.focalLengthMm } : {}) }
    const value = captureTimelineValue(visibleEntity, property)
    if (value === undefined) return
    const entityType = camera ? 'Camera' : prop ? 'Prop' : 'Actor'
    const nextTimeline = upsertTimelineKeyframe(before.timeline, entityId, entityType, property, before.timeline.currentFrame, value)
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: nextTimeline }
    recordAction(`Add ${entity.name} ${property} keyframe`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    const suspendedIds = new Set(suspendedTimelineEntityIds)
    suspendedIds.delete(entityId)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current }, suspendedIds)
  }

  const handleSelectionChange = (entityId: string | null) => {
    selectedEntityIdRef.current = entityId
    setSelectedEntityId(entityId)
    const camera = entityId ? sceneDocumentRef.current.cameras.find((item) => item.id === entityId) : null
    setSelectedFrameGuideId(camera?.frameGuides[0]?.id ?? null)
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
    const prop = before.props.find((item) => item.id === change.entityId)
    const camera = before.cameras.find((item) => item.id === change.entityId)
    if (actor || prop || camera) {
      const result = commitTimelineTransform(before, change as TimelineTransformCommit)
      const after = { ...result.document, metadata: { ...result.document.metadata, updatedAt: new Date().toISOString() } }
      const finalEntity = [...after.actors, ...after.props, ...after.cameras].find((item) => item.id === change.entityId)
      const evaluatedAfter = evaluateTimeline(after, before.timeline.currentFrame)[change.entityId]
      setLastTransformDebug({ entityId: change.entityId, runtimeFinal: formatTransform(change.position, change.rotation), baseDocumentFinal: finalEntity ? formatTransform(finalEntity.position, finalEntity.rotation) : '—', timelineEvaluated: evaluatedAfter ? formatTransform(evaluatedAfter.position, evaluatedAfter.rotation) : '—', valueAppliedAfterTransform: result.suspendEvaluation ? 'BASE (TIMELINE SUSPENDED)' : result.changedKeyframe ? 'KEYFRAME' : 'BASE' })
      recordAction(`${result.changedKeyframe ? 'Update' : 'Move'} ${actor?.name ?? prop?.name ?? camera?.name ?? change.entityId}${result.changedKeyframe ? ' keyframe' : ''}`, before, transaction.beforeSelection, after, change.entityId)
      const suspendedIds = new Set(suspendedTimelineEntityIds)
      if (result.suspendEvaluation) suspendedIds.add(change.entityId)
      applyEditorSnapshot({ document: after, selectedEntityId: change.entityId }, suspendedIds)
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

  const togglePlayback = useCallback(() => {
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
  }, [isPlaying])
  useEffect(() => {
    togglePlaybackRef.current = togglePlayback
  }, [togglePlayback])

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

  const openExport = () => {
    const current = sceneDocumentRef.current
    const activeCamera = current.cameras.find((camera) => camera.id === current.activeCameraId) ?? null
    if (isPlaying) {
      playbackRef.current = null
      setIsPlaying(false)
    }
    setExportSettings({ cameraId: activeCamera?.id ?? null, markIn: current.timeline.markIn, markOut: current.timeline.markOut, frameRate: current.timeline.frameRate, deliveryAspectRatio: activeCamera?.deliveryAspectRatio ?? '16:9', width: 1920, format: 'mp4' })
    setExportProgress(null)
    setExportError(null)
    setExportStatus('idle')
    setExportOpen(true)
  }

  const cancelExport = () => {
    exportAbortRef.current?.abort()
  }

  const startExport = () => {
    if (exportAbortRef.current) return
    const snapshot = sceneDocumentRef.current
    const activeCamera = snapshot.cameras.find((camera) => camera.id === snapshot.activeCameraId) ?? null
    const settings: VideoExportSettings = {
      ...exportSettings,
      cameraId: activeCamera?.id ?? null,
      markIn: snapshot.timeline.markIn,
      markOut: snapshot.timeline.markOut,
      frameRate: snapshot.timeline.frameRate,
      deliveryAspectRatio: activeCamera && exportSettings.cameraId !== activeCamera.id ? activeCamera.deliveryAspectRatio : exportSettings.deliveryAspectRatio,
    }
    setExportSettings(settings)
    setExportError(null)
    setExportProgress(null)
    setExportStatus('preparing')
    if (isPlaying) {
      playbackRef.current = null
      setIsPlaying(false)
    }
    const controller = new AbortController()
    exportAbortRef.current = controller
    void exportVideo({ document: snapshot, settings, signal: controller.signal, onProgress: (progress) => { setExportStatus('exporting'); setExportProgress(progress) } }).then((blob) => {
      setExportStatus('finalizing')
      const camera = snapshot.cameras.find((item) => item.id === settings.cameraId)
      const url = URL.createObjectURL(blob)
      const anchor = window.document.createElement('a')
      anchor.href = url
      anchor.download = exportFilename(snapshot.metadata.name, camera?.name ?? 'Camera', settings.markIn, settings.markOut, settings.format)
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setExportStatus('completed')
    }).catch((error: unknown) => {
      if (isExportCancelled(error)) {
        setExportStatus('cancelled')
        setExportError('Export cancelled.')
      } else {
        setExportStatus('error')
        setExportError(error instanceof Error ? error.message : 'Video export failed. Try again.')
      }
    }).finally(() => {
      exportAbortRef.current = null
    })
  }

  useEffect(() => () => exportAbortRef.current?.abort(), [])

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
    setIsDirty(creativeSceneFingerprint(entry.before.document) !== savedSceneFingerprintRef.current)
    return true
  }

  const redo = (): boolean => {
    const entry = historyRef.current.redo()
    if (!entry) return false
    applyEditorSnapshot(entry.after)
    setIsDirty(creativeSceneFingerprint(entry.after.document) !== savedSceneFingerprintRef.current)
    return true
  }

  useEffect(() => {
    if (!isDirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const isTextEditing = Boolean(target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable))
      if (timelinePlayPauseShortcut(event.key, isTextEditing) && !event.repeat) {
        event.preventDefault()
        togglePlaybackRef.current()
        return
      }
      if (isTextEditing) return
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
      <V2TopBar sceneName={sceneDocument.metadata.name} isDirty={isDirty} fileError={sceneFileError} view={view} onViewChange={setView} onNewScene={newScene} onSaveScene={saveScene} onLoadScene={loadScene} onExport={openExport} exportDisabled={exportStatus === 'preparing' || exportStatus === 'exporting' || exportStatus === 'finalizing'} />
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
        selectedFrameGuideId={selectedFrameGuideId}
      />
      <V2DetailsPanel actor={selectedActor} prop={selectedProp} camera={selectedCamera} timeline={sceneDocument.timeline} onCameraChange={updateCamera} onSetActiveCamera={setActiveCamera} onAddKeyframe={addKeyframe} activeCameraId={sceneDocument.activeCameraId} selectedFrameGuideId={selectedFrameGuideId} onFrameGuideSelection={setSelectedFrameGuideId} />
      <V2Timeline timeline={sceneDocument.timeline} tracks={sceneDocument.timeline.tracks} entities={timelineEntities} selectedEntityId={selectedEntityId} isPlaying={isPlaying} onFrameChange={setCurrentFrame} onFrameRateChange={changeFrameRate} onTogglePlayback={togglePlayback} onStepFrame={stepFrame} onMarkIn={() => changeMark('in')} onMarkOut={() => changeMark('out')} onDeleteKeyframe={deleteKeyframe} onEntitySelect={handleSelectionChange} onScrubStart={() => setIsScrubbing(true)} onScrubEnd={() => setIsScrubbing(false)} />
      {exportStatus === 'preparing' || exportStatus === 'exporting' || exportStatus === 'finalizing' ? <div className="v2-export-lock" aria-hidden="true" /> : null}
      {exportOpen ? <V2ExportModal document={sceneDocument} settings={exportSettings} status={exportStatus} progress={exportProgress} error={exportError} onSettingsChange={setExportSettings} onExport={startExport} onCancel={cancelExport} onClose={() => setExportOpen(false)} /> : null}
    </main>
  )
}
