import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { V2DetailsPanel } from './components/V2DetailsPanel'
import { V2ScenePanel } from './components/V2ScenePanel'
import { V2Stage, type V2TransformDebugState } from './components/V2Stage'
import { V2Timeline } from './components/V2Timeline'
import { V2TopBar } from './components/V2TopBar'
import { V2ProjectLibrary } from './components/V2ProjectLibrary'
import { closeDecisionForUnsavedChoice, platformAdapter, PlatformFileError, type DesktopDropEvent } from './platform/platformAdapter'
import { basename, createRecentProjectEntry, duplicateFilename, filenameWithoutExtension, firstSupportedProjectPath, isProjectFilePath, projectFilenameFromInput, recentProjectIdentity, recentProjectThumbnailKey, removeRecentProject, siblingPath, sortRecentProjects, updateRecentProjectPath, upsertRecentProject, type RecentProjectEntry } from './platform/projectLibrary'
import { createDefaultProps } from './scene/testEntities'
import { applySceneEntityTransform, createActorDocument, createCameraDocument, createEmptySceneDocument, createOpeningDocument, createPropDocument, createSunDocument, createWallDocument, type ActorDocument, type ActorVector3, type CameraDocument, type OpeningDocument, type PropDocument, type RationalFrameRate, type SceneDocument, type ScenicPropType, type SunDocument, type TimelineProperty, type WallDocument } from './core/sceneDocument'
import type { ProjectDocument, ProjectSceneEntry } from './core/projectDocument'
import { cloneSceneWithIdentity, createProjectDocument } from './core/projectDocument'
import { CAMERA_DATABASE } from './core/cameraDatabase'
import { defaultCameraPlacement } from './core/cameraPlacement'
import { cameraRotationLookingAt } from './runtime/cameraMath'
import { createEditorClipboard, pasteEditorClipboard, type EditorClipboard } from './core/editorClipboard'
import { EditorHistory, type EditorHistorySnapshot } from './core/editorHistory'
import { destructiveShortcutTarget, editorShortcutForKey } from './core/editorShortcuts'
import { clampTimelineHeight, TIMELINE_HEIGHT_DEFAULT, timelineHeightBounds } from './core/workspaceLayout'
import type { StageTool, StageTransform } from './stage-engine'
import { evaluateTimeline } from './timeline/timelineEvaluator'
import { createPlaybackClock, playbackFrameAt, playbackReachedMarkOut, type PlaybackClock } from './timeline/playbackClock'
import { clampTimelineFrame, moveTimelineKeyframe, removeTimelineKeyframe, setTimelineMark, upsertTimelineKeyframe } from './timeline/timelineMath'
import { captureTimelineValue, commitTimelineTransform, type TimelineTransformCommit } from './timeline/transformOwnership'
import { V2ExportModal } from './components/V2ExportModal'
import { exportFilename } from './export/exportMath'
import { isExportCancelled, userFacingExportError } from './export/exportErrors'
import type { VideoExportProgress, VideoExportSettings, VideoExportStatus } from './export/exportTypes'
import { parseSceneFile, prepareSceneForSave, sceneFilename, serializeScene, SceneFileError } from './core/scenePersistence'
import { parseProjectFile, prepareProjectForSave, projectFilename, ProjectFileError, serializeProject } from './core/projectPersistence'
import { creativeSceneChanged } from './core/sceneDirty'
import { creativeProjectFingerprint } from './core/projectDirty'
import * as THREE from 'three'
import { sunAnglesFromHelperPosition } from './runtime/sunMapping'
import type { WallDrawingState } from './architecture/wallDrawing'
import { WALL_SNAP_THRESHOLD, nearestWallForOpening, resolveOpeningAgainstWalls, wallFromEndpoints } from './architecture/wallMath'
import { cameraStillFilename, type StillCaptureOptions } from './runtime/stillCapture'
import { shortcutLabel, shortcutMatches, shortcutPreferencesWithDefaults, SHORTCUT_COMMANDS, type ShortcutBinding, type ShortcutCommandId } from './core/shortcutRegistry'
import { V2ShortcutSettings } from './components/V2ShortcutSettings'

function createDefaultV2Scene(id = 'scene-01', name = 'Scene 01', includeDefaultProps = true): SceneDocument {
  const scene = createEmptySceneDocument()
  return {
    ...scene,
    metadata: { ...scene.metadata, id, name },
    props: includeDefaultProps ? createDefaultProps() : [],
  }
}

function createDefaultV2Project(): ProjectDocument {
  return createProjectDocument('project-01', 'Untitled Project', createDefaultV2Scene())
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Thumbnail could not be read.'))
    reader.onerror = () => reject(reader.error ?? new Error('Thumbnail could not be read.'))
    reader.readAsDataURL(blob)
  })
}

async function refreshRecentProjectStatus(entries: readonly RecentProjectEntry[]): Promise<RecentProjectEntry[]> {
  const refreshed = await Promise.all(entries.map(async (entry) => {
    const exists = await platformAdapter.fileExists(entry.path)
    if (!exists) return { ...entry, missing: true }
    const stat = await platformAdapter.statFile(entry.path)
    return {
      ...entry,
      missing: false,
      modifiedSinceLastOpen: Boolean(entry.lastKnownModifiedAt && stat?.modifiedAt && entry.lastKnownModifiedAt !== stat.modifiedAt),
      lastKnownModifiedAt: stat?.modifiedAt ?? entry.lastKnownModifiedAt,
    }
  }))
  return sortRecentProjects(refreshed)
}

function nextSceneNumber(entries: readonly ProjectSceneEntry[]): number {
  return Math.max(0, ...entries.map((entry) => Number(/scene-(\d+)/i.exec(entry.id)?.[1] ?? 0))) + 1
}

function nextEntityIndex(scene: SceneDocument, prefix: string): number {
  const ids = [...scene.actors, ...scene.props, ...scene.walls, ...scene.openings, ...scene.cameras, ...scene.lights].map((entity) => entity.id)
  return Math.max(0, ...ids.map((id) => Number(new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(id)?.[1] ?? 0))) + 1
}

function V2EditorApp() {
  const [view, setView] = useState<'blocking' | 'camera'>('blocking')
  const [workspaceMode, setWorkspaceMode] = useState<'library' | 'editor'>(() => platformAdapter.kind === 'desktop' ? 'library' : 'editor')
  const [projectDocument, setProjectDocument] = useState(createDefaultV2Project)
  const activeSceneEntry = projectDocument.scenes.find((entry) => entry.id === projectDocument.activeSceneId) ?? projectDocument.scenes[0]
  const sceneDocument = activeSceneEntry.scene
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedFrameGuideId, setSelectedFrameGuideId] = useState<string | null>(null)
  const [selectedTimelineKeyframe, setSelectedTimelineKeyframe] = useState<{ trackId: string; keyframeId: string } | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  const [recentProjectThumbnails, setRecentProjectThumbnails] = useState<Record<string, string | null>>({})
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(platformAdapter.kind === 'desktop')
  const [recentProjectsError, setRecentProjectsError] = useState<string | null>(null)
  const [desktopDropState, setDesktopDropState] = useState<'idle' | 'valid' | 'invalid'>('idle')
  const [sceneFileError, setSceneFileError] = useState<string | null>(null)
  const [transformTool, setTransformTool] = useState<StageTool>('select')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [transformingEntityId, setTransformingEntityId] = useState<string | null>(null)
  const [suspendedTimelineEntityIds, setSuspendedTimelineEntityIds] = useState<ReadonlySet<string>>(new Set())
  const [lastTransformDebug, setLastTransformDebug] = useState<V2TransformDebugState | null>(null)
  const [wallDrawing, setWallDrawing] = useState(false)
  const [wallDrawState, setWallDrawState] = useState<WallDrawingState>({ active: false, start: null, end: null, length: 0 })
  const [snapPreviewWallId, setSnapPreviewWallId] = useState<string | null>(null)
  const [cameraPreview, setCameraPreview] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<VideoExportStatus>('idle')
  const [exportProgress, setExportProgress] = useState<VideoExportProgress | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSettings, setExportSettings] = useState<VideoExportSettings>(() => ({ cameraId: null, markIn: 0, markOut: 120, frameRate: { numerator: 24, denominator: 1 }, deliveryAspectRatio: '16:9', width: 1920, format: 'mp4' }))
  const [timelineHeight, setTimelineHeight] = useState(TIMELINE_HEIGHT_DEFAULT)
  const [isResizingTimeline, setIsResizingTimeline] = useState(false)
  const [shortcutBindings, setShortcutBindings] = useState(() => shortcutPreferencesWithDefaults())
  const [shortcutSettingsOpen, setShortcutSettingsOpen] = useState(false)
  const appShellRef = useRef<HTMLElement>(null)
  const projectDocumentRef = useRef<ProjectDocument>(projectDocument)
  const sceneDocumentRef = useRef<SceneDocument>(sceneDocument)
  const currentProjectPathRef = useRef<string | null>(null)
  const recentProjectsRef = useRef<RecentProjectEntry[]>([])
  const thumbnailCaptureRef = useRef<(() => Promise<Blob | null>) | null>(null)
  const isDirtyRef = useRef(isDirty)
  const workspaceModeRef = useRef(workspaceMode)
  const savedProjectFingerprintRef = useRef(creativeProjectFingerprint(projectDocument))
  const selectedEntityIdRef = useRef<string | null>(selectedEntityId)
  const selectedTimelineKeyframeRef = useRef<{ trackId: string; keyframeId: string } | null>(selectedTimelineKeyframe)
  const shortcutBindingsRef = useRef(shortcutBindings)
  const clipboardRef = useRef<EditorClipboard | null>(null)
  const historyRef = useRef<EditorHistory>(new EditorHistory(100))
  const transformTransactionRef = useRef<{ before: SceneDocument; beforeSelection: string | null } | null>(null)
  const playbackRef = useRef<PlaybackClock | null>(null)
  const playbackFrameRequestRef = useRef<number | null>(null)
  const exportAbortRef = useRef<AbortController | null>(null)
  const togglePlaybackRef = useRef<() => void>(() => {})
  const newProjectRef = useRef<() => void>(() => {})
  const loadProjectRef = useRef<() => void>(() => {})
  const saveProjectRef = useRef<() => void>(() => {})
  const saveProjectAsRef = useRef<() => void>(() => {})
  const isPlayingRef = useRef(isPlaying)
  const timelineResizeRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const evaluatedEntities = evaluateTimeline(sceneDocument, sceneDocument.timeline.currentFrame)
  const selectedActorBase = sceneDocument.actors.find((actor) => actor.id === selectedEntityId) ?? null
  const selectedPropBase = sceneDocument.props.find((prop) => prop.id === selectedEntityId) ?? null
  const selectedCameraBase = sceneDocument.cameras.find((camera) => camera.id === selectedEntityId) ?? null
  const selectedWallBase = sceneDocument.walls.find((wall) => wall.id === selectedEntityId) ?? null
  const selectedOpeningBase = sceneDocument.openings.find((opening) => opening.id === selectedEntityId) ?? null
  const selectedSunBase = sceneDocument.lights.find((sun) => sun.id === selectedEntityId) ?? null
  const selectedActor = selectedActorBase ? (suspendedTimelineEntityIds.has(selectedActorBase.id) ? selectedActorBase : { ...selectedActorBase, ...(evaluatedEntities[selectedActorBase.id] ?? {}) } as ActorDocument) : null
  const selectedProp = selectedPropBase ? (suspendedTimelineEntityIds.has(selectedPropBase.id) ? selectedPropBase : { ...selectedPropBase, ...(evaluatedEntities[selectedPropBase.id] ?? {}) }) : null
  const selectedCamera = selectedCameraBase ? (suspendedTimelineEntityIds.has(selectedCameraBase.id) ? selectedCameraBase : { ...selectedCameraBase, ...(evaluatedEntities[selectedCameraBase.id] ?? {}) } as CameraDocument) : null
  const selectedWall = selectedWallBase ? (suspendedTimelineEntityIds.has(selectedWallBase.id) ? selectedWallBase : { ...selectedWallBase, ...(evaluatedEntities[selectedWallBase.id] ?? {}) } as WallDocument) : null
  const selectedOpening = selectedOpeningBase ? (suspendedTimelineEntityIds.has(selectedOpeningBase.id) ? selectedOpeningBase : { ...selectedOpeningBase, ...(evaluatedEntities[selectedOpeningBase.id] ?? {}) } as OpeningDocument) : null
  const selectedSun = selectedSunBase ? (suspendedTimelineEntityIds.has(selectedSunBase.id) ? selectedSunBase : { ...selectedSunBase, ...(evaluatedEntities[selectedSunBase.id] ?? {}) } as SunDocument) : null
  const timelineEntities = [
    ...sceneDocument.actors.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Actor' as const })),
    ...sceneDocument.props.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Prop' as const })),
    ...sceneDocument.walls.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Wall' as const })),
    ...sceneDocument.openings.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Opening' as const })),
    ...sceneDocument.lights.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Sun' as const })),
    ...sceneDocument.cameras.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Camera' as const })),
  ]

  const formatTransform = (position: [number, number, number], rotation: [number, number, number]) => `P(${position.map((value) => value.toFixed(2)).join(',')}) R(${rotation.map((value) => value.toFixed(2)).join(',')})`

  useEffect(() => {
    projectDocumentRef.current = projectDocument
    sceneDocumentRef.current = sceneDocument
    selectedEntityIdRef.current = selectedEntityId
    selectedTimelineKeyframeRef.current = selectedTimelineKeyframe
    shortcutBindingsRef.current = shortcutBindings
    isDirtyRef.current = isDirty
    workspaceModeRef.current = workspaceMode
    recentProjectsRef.current = recentProjects
  }, [projectDocument, sceneDocument, selectedEntityId, selectedTimelineKeyframe, shortcutBindings, isDirty, workspaceMode, recentProjects])

  useEffect(() => {
    let active = true
    void platformAdapter.loadShortcutPreferences().then((preferences) => {
      if (active) setShortcutBindings(shortcutPreferencesWithDefaults(preferences))
    })
    return () => { active = false }
  }, [])

  const updateShortcut = (id: ShortcutCommandId, binding: ShortcutBinding) => {
    const next = { ...shortcutBindingsRef.current, [id]: binding }
    shortcutBindingsRef.current = next
    setShortcutBindings(next)
    const defaults = shortcutPreferencesWithDefaults()
    const preferences = Object.fromEntries(SHORTCUT_COMMANDS.filter((command) => shortcutLabel(next[command.id]) !== shortcutLabel(defaults[command.id])).map((command) => [command.id, next[command.id]]))
    void platformAdapter.saveShortcutPreferences(preferences)
  }

  const resetShortcuts = () => {
    const next = shortcutPreferencesWithDefaults()
    shortcutBindingsRef.current = next
    setShortcutBindings(next)
    void platformAdapter.saveShortcutPreferences({})
  }

  useEffect(() => {
    if (platformAdapter.kind !== 'desktop') return
    let active = true
    void platformAdapter.loadRecentProjects().then(async (entries) => {
      const refreshed = await refreshRecentProjectStatus(entries)
      if (!active) return
      recentProjectsRef.current = refreshed
      setRecentProjects(refreshed)
      setRecentProjectsError(null)
      const thumbnailEntries = await Promise.all(refreshed.map(async (entry) => [entry.thumbnailKey, await platformAdapter.loadProjectThumbnail(entry.thumbnailKey)] as const))
      if (!active) return
      setRecentProjectThumbnails(Object.fromEntries(thumbnailEntries))
      await platformAdapter.saveRecentProjects(refreshed)
    }).catch(() => {
      if (!active) return
      recentProjectsRef.current = []
      setRecentProjects([])
      setRecentProjectThumbnails({})
      setRecentProjectsError('Recent Projects could not be loaded.')
    }).finally(() => {
      if (active) setRecentProjectsLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const availableWorkspaceHeight = () => appShellRef.current?.getBoundingClientRect().height ?? window.innerHeight

  const setClampedTimelineHeight = (requestedHeight: number) => {
    setTimelineHeight(clampTimelineHeight(requestedHeight, availableWorkspaceHeight()))
  }

  const replaceProjectDocument = (next: ProjectDocument) => {
    projectDocumentRef.current = next
    setProjectDocument(next)
  }

  const updateActiveSceneDocument = (nextScene: SceneDocument, touchProject = true) => {
    const current = projectDocumentRef.current
    const nextProject: ProjectDocument = {
      ...current,
      updatedAt: touchProject ? new Date().toISOString() : current.updatedAt,
      scenes: current.scenes.map((entry) => entry.id === current.activeSceneId ? { ...entry, name: nextScene.metadata.name, scene: nextScene } : entry),
    }
    sceneDocumentRef.current = nextScene
    replaceProjectDocument(nextProject)
  }

  const startTimelineResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    timelineResizeRef.current = { startY: event.clientY, startHeight: timelineHeight }
    setIsResizingTimeline(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  useEffect(() => {
    if (!isResizingTimeline) return
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const resize = timelineResizeRef.current
      if (!resize) return
      setClampedTimelineHeight(resize.startHeight + resize.startY - event.clientY)
    }
    const finishTimelineResize = () => {
      timelineResizeRef.current = null
      setIsResizingTimeline(false)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', finishTimelineResize)
    window.addEventListener('pointercancel', finishTimelineResize)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishTimelineResize)
      window.removeEventListener('pointercancel', finishTimelineResize)
    }
  }, [isResizingTimeline])

  useEffect(() => {
    const handleViewportResize = () => {
      setTimelineHeight((currentHeight) => clampTimelineHeight(currentHeight, availableWorkspaceHeight()))
    }
    window.addEventListener('resize', handleViewportResize)
    return () => window.removeEventListener('resize', handleViewportResize)
  }, [])

  const applyEditorSnapshot = (snapshot: EditorHistorySnapshot, suspendedIds: ReadonlySet<string> = new Set()) => {
    sceneDocumentRef.current = snapshot.document
    selectedEntityIdRef.current = snapshot.selectedEntityId
    updateActiveSceneDocument(snapshot.document)
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
    updateActiveSceneDocument(after, false)
  }

  const recordAction = (label: string, before: SceneDocument, beforeSelection: string | null, after: SceneDocument, afterSelection: string | null) => {
    historyRef.current.record({
      label,
      before: { document: before, selectedEntityId: beforeSelection },
      after: { document: after, selectedEntityId: afterSelection },
    })
    if (creativeSceneChanged(before, after)) setIsDirty(true)
  }

  const resetEditorForProject = (project: ProjectDocument, clean = true, currentPath = currentProjectPathRef.current) => {
    playbackRef.current = null
    setIsPlaying(false)
    setSuspendedTimelineEntityIds(new Set())
    setTransformingEntityId(null)
    transformTransactionRef.current = null
    setSelectedFrameGuideId(null)
    setSelectedTimelineKeyframe(null)
    setSceneFileError(null)
    historyRef.current = new EditorHistory(100)
    const active = project.scenes.find((entry) => entry.id === project.activeSceneId) ?? project.scenes[0]
    sceneDocumentRef.current = active.scene
    currentProjectPathRef.current = currentPath
    replaceProjectDocument(project)
    setSelectedEntityId(null)
    setSuspendedTimelineEntityIds(new Set())
    if (clean) savedProjectFingerprintRef.current = creativeProjectFingerprint(project)
    setIsDirty(!clean)
  }

  const switchScene = (sceneId: string) => {
    const current = projectDocumentRef.current
    if (current.activeSceneId === sceneId) return
    const target = current.scenes.find((entry) => entry.id === sceneId)
    if (!target) return
    playbackRef.current = null
    setIsPlaying(false)
    setTransformingEntityId(null)
    transformTransactionRef.current = null
    historyRef.current = new EditorHistory(100)
    setSelectedEntityId(null)
    setSelectedFrameGuideId(null)
    setSelectedTimelineKeyframe(null)
    setSuspendedTimelineEntityIds(new Set())
    sceneDocumentRef.current = target.scene
    replaceProjectDocument({ ...current, activeSceneId: target.id })
  }

  const persistRecentProjects = async (entries: readonly RecentProjectEntry[]) => {
    const next = sortRecentProjects(entries)
    recentProjectsRef.current = next
    setRecentProjects(next)
    await platformAdapter.saveRecentProjects(next)
    void platformAdapter.cleanupProjectThumbnails(next.map((entry) => entry.thumbnailKey))
  }

  const recentEntryForProject = async (path: string, project: ProjectDocument, lastOpenedAt = new Date().toISOString()): Promise<RecentProjectEntry> => {
    const stat = await platformAdapter.statFile(path)
    const existing = recentProjectsRef.current.find((entry) => recentProjectIdentity(entry.path) === recentProjectIdentity(path))
    return createRecentProjectEntry({
      path,
      thumbnailKey: existing?.thumbnailKey ?? recentProjectThumbnailKey(path),
      displayName: project.name || filenameWithoutExtension(path),
      lastOpenedAt,
      lastKnownModifiedAt: stat?.modifiedAt ?? null,
      lastKnownSceneCount: project.scenes.length,
      missing: false,
      modifiedSinceLastOpen: false,
    })
  }

  const updateRecentForProject = async (path: string, project: ProjectDocument, lastOpenedAt = new Date().toISOString(), oldPath?: string) => {
    const prior = oldPath ? recentProjectsRef.current.find((candidate) => recentProjectIdentity(candidate.path) === recentProjectIdentity(oldPath)) : undefined
    const entry = await recentEntryForProject(path, project, lastOpenedAt)
    const preservedEntry = prior && recentProjectIdentity(prior.path) !== recentProjectIdentity(path) ? { ...entry, thumbnailKey: prior.thumbnailKey } : entry
    const next = oldPath ? updateRecentProjectPath(recentProjectsRef.current, oldPath, preservedEntry) : upsertRecentProject(recentProjectsRef.current, preservedEntry)
    await persistRecentProjects(next)
  }

  const captureProjectThumbnail = (path: string) => {
    if (platformAdapter.kind !== 'desktop' || !thumbnailCaptureRef.current) return
    const entry = recentProjectsRef.current.find((candidate) => recentProjectIdentity(candidate.path) === recentProjectIdentity(path))
    const key = entry?.thumbnailKey ?? recentProjectThumbnailKey(path)
    // Saving replaces the project document; wait one browser turn so Camera View
    // has received the same active-camera snapshot before rendering the still.
    window.setTimeout(() => {
      void thumbnailCaptureRef.current?.().then(async (blob) => {
        if (!blob) return
        await platformAdapter.saveProjectThumbnail(key, blob)
        const dataUrl = await blobToDataUrl(blob)
        setRecentProjectThumbnails((current) => ({ ...current, [key]: dataUrl }))
      }).catch(() => {})
    }, 0)
  }

  const saveProject = async (): Promise<boolean> => {
    const savedAt = new Date().toISOString()
    try {
      const prepared = prepareProjectForSave(projectDocumentRef.current, savedAt)
      const text = serializeProject(prepared, savedAt)
      const result = await platformAdapter.saveProjectFile(text, projectFilename(prepared.name), currentProjectPathRef.current)
      if (result.cancelled) return false
      currentProjectPathRef.current = result.path
      sceneDocumentRef.current = prepared.scenes.find((entry) => entry.id === prepared.activeSceneId)!.scene
      replaceProjectDocument(prepared)
      savedProjectFingerprintRef.current = creativeProjectFingerprint(prepared)
      setSceneFileError(null)
      setIsDirty(false)
      if (result.path) {
        await updateRecentForProject(result.path, prepared)
        captureProjectThumbnail(result.path)
      }
      return true
    } catch (error: unknown) {
      setSceneFileError(error instanceof ProjectFileError || error instanceof PlatformFileError ? error.message : 'This Project could not be saved.')
      return false
    }
  }

  const saveProjectAs = async (): Promise<boolean> => {
    const savedAt = new Date().toISOString()
    const previousPath = currentProjectPathRef.current
    try {
      const prepared = prepareProjectForSave(projectDocumentRef.current, savedAt)
      const result = await platformAdapter.saveProjectFileAs(serializeProject(prepared, savedAt), projectFilename(prepared.name))
      if (result.cancelled) return false
      currentProjectPathRef.current = result.path
      sceneDocumentRef.current = prepared.scenes.find((entry) => entry.id === prepared.activeSceneId)!.scene
      replaceProjectDocument(prepared)
      savedProjectFingerprintRef.current = creativeProjectFingerprint(prepared)
      setSceneFileError(null)
      setIsDirty(false)
      if (result.path) {
        await updateRecentForProject(result.path, prepared, savedAt, previousPath ?? undefined)
        captureProjectThumbnail(result.path)
      }
      return true
    } catch (error: unknown) {
      setSceneFileError(error instanceof ProjectFileError || error instanceof PlatformFileError ? error.message : 'This Project could not be saved.')
      return false
    }
  }

  const exportScene = async (sceneId = projectDocumentRef.current.activeSceneId) => {
    const savedAt = new Date().toISOString()
    const sceneEntry = projectDocumentRef.current.scenes.find((entry) => entry.id === sceneId)
    if (!sceneEntry) return
    const scene = prepareSceneForSave(sceneEntry.scene, savedAt)
    try {
      const result = await platformAdapter.saveSceneFile(serializeScene(scene, savedAt), sceneFilename(scene.metadata.name))
      if (result.cancelled) return
      setSceneFileError(null)
    } catch (error: unknown) {
      setSceneFileError(error instanceof SceneFileError || error instanceof PlatformFileError ? error.message : 'This Scene could not be exported.')
    }
  }

  const enterLoadedProject = async (file: { path: string | null; text: string }) => {
    const loaded = parseProjectFile(file.text)
    resetEditorForProject(loaded, true, file.path)
    setView('blocking')
    setWorkspaceMode('editor')
    if (file.path) await updateRecentForProject(file.path, loaded)
  }

  const confirmProjectSwitch = async (): Promise<boolean> => {
    if (!isDirtyRef.current) return true
    if (platformAdapter.promptUnsavedClose) {
      const choice = await platformAdapter.promptUnsavedClose()
      const decision = closeDecisionForUnsavedChoice(choice, choice !== 'save' || await saveProject())
      if (choice === 'discard' && decision === 'close') setIsDirty(false)
      return decision === 'close'
    }
    return window.confirm('Discard unsaved Project changes and load this Project?')
  }

  const openProjectFile = async (file: { path: string | null; text: string } | null) => {
    if (!file || !await confirmProjectSwitch()) return
    await enterLoadedProject(file)
  }

  const openDesktopProjectPath = async (path: string) => {
    if (!isProjectFilePath(path)) return
    try {
      await openProjectFile(await platformAdapter.openProjectFileAt(path))
      setRecentProjectsError(null)
      setSceneFileError(null)
    } catch (error: unknown) {
      const message = error instanceof ProjectFileError || error instanceof PlatformFileError ? error.message : 'This Project file could not be opened.'
      if (workspaceModeRef.current === 'library') setRecentProjectsError(message)
      else setSceneFileError(message)
    }
  }

  const loadProject = async () => {
    try {
      await openProjectFile(await platformAdapter.openProjectFile())
    } catch (error: unknown) {
      setSceneFileError(error instanceof ProjectFileError || error instanceof PlatformFileError ? error.message : 'This Project file could not be opened.')
    }
  }

  const newProject = () => {
    if (isDirty && !window.confirm('Discard unsaved Project changes and start a New Project?')) return
    resetEditorForProject(createDefaultV2Project(), true, null)
    setView('blocking')
    setWorkspaceMode('editor')
  }

  useEffect(() => {
    newProjectRef.current = newProject
    loadProjectRef.current = loadProject
    saveProjectRef.current = () => { void saveProject() }
    saveProjectAsRef.current = () => { void saveProjectAs() }
  }, [newProject, loadProject])

  useEffect(() => {
    if (platformAdapter.kind !== 'desktop') return
    let active = true
    const handleDrop = (event: DesktopDropEvent) => {
      if (event.type === 'leave') {
        setDesktopDropState('idle')
        return
      }
      if (event.type === 'enter' || event.type === 'drop') {
        const supported = firstSupportedProjectPath(event.paths)
        setDesktopDropState(supported ? 'valid' : event.type === 'enter' ? 'invalid' : 'idle')
        if (event.type === 'drop') {
          setDesktopDropState('idle')
          if (supported) void openDesktopProjectPath(supported)
        }
      }
    }
    let unlistenOpen: (() => void) | null = null
    let unlistenDrop: (() => void) | null = null
    void Promise.all([platformAdapter.subscribeProjectOpen(openDesktopProjectPath), platformAdapter.subscribeProjectDrop(handleDrop)]).then(async ([removeOpen, removeDrop]) => {
      if (!active) {
        removeOpen()
        removeDrop()
        return
      }
      unlistenOpen = removeOpen
      unlistenDrop = removeDrop
      const startupPath = await platformAdapter.initialProjectPath()
      if (startupPath) await openDesktopProjectPath(startupPath)
    }).catch(() => {})
    return () => {
      active = false
      unlistenOpen?.()
      unlistenDrop?.()
    }
  }, [])

  const openRecentProject = async (entry: RecentProjectEntry) => {
    try {
      if (!await platformAdapter.fileExists(entry.path)) {
        await persistRecentProjects(recentProjectsRef.current.map((candidate) => candidate.id === entry.id ? { ...candidate, missing: true } : candidate))
        return
      }
      const file = await platformAdapter.openProjectFileAt(entry.path)
      await openProjectFile(file)
    } catch (error: unknown) {
      setRecentProjectsError(error instanceof ProjectFileError || error instanceof PlatformFileError ? error.message : 'This Project file could not be opened.')
    }
  }

  const locateRecentProject = async (entry: RecentProjectEntry) => {
    try {
      const file = await platformAdapter.locateProjectFile()
      if (!file) return
      const loaded = parseProjectFile(file.text)
      resetEditorForProject(loaded, true, file.path)
      setView('blocking')
      setWorkspaceMode('editor')
      if (file.path) await updateRecentForProject(file.path, loaded, new Date().toISOString(), entry.path)
    } catch (error: unknown) {
      setRecentProjectsError(error instanceof ProjectFileError || error instanceof PlatformFileError ? error.message : 'This Project file could not be opened.')
    }
  }

  const removeRecent = async (entry: RecentProjectEntry) => {
    await persistRecentProjects(removeRecentProject(recentProjectsRef.current, entry.path))
    await platformAdapter.deleteProjectThumbnail(entry.thumbnailKey)
    setRecentProjectThumbnails((current) => {
      const next = { ...current }
      delete next[entry.thumbnailKey]
      return next
    })
  }

  const revealRecentFile = async (entry: RecentProjectEntry) => {
    try {
      if (!await platformAdapter.fileExists(entry.path)) {
        await persistRecentProjects(recentProjectsRef.current.map((candidate) => candidate.id === entry.id ? { ...candidate, missing: true } : candidate))
        setRecentProjectsError('This Project file is no longer available.')
        return
      }
      await platformAdapter.revealProjectFile(entry.path)
      setRecentProjectsError(null)
    } catch (error: unknown) {
      setRecentProjectsError(error instanceof PlatformFileError ? error.message : 'The Project could not be revealed in Finder or Explorer.')
    }
  }

  const renameRecentFile = async (entry: RecentProjectEntry) => {
    const requested = window.prompt('Rename File', basename(entry.path))
    if (requested === null) return
    const filename = projectFilenameFromInput(requested)
    if (!filename) {
      setRecentProjectsError('Choose a valid Project filename.')
      return
    }
    const nextPath = siblingPath(entry.path, filename)
    if (recentProjectIdentity(nextPath) === recentProjectIdentity(entry.path)) return
    try {
      if (await platformAdapter.fileExists(nextPath)) {
        setRecentProjectsError('A Project file with that name already exists.')
        return
      }
      await platformAdapter.renameProjectFile(entry.path, nextPath)
      const nextEntry = { ...entry, id: recentProjectIdentity(nextPath), path: nextPath, missing: false, modifiedSinceLastOpen: false }
      await persistRecentProjects(updateRecentProjectPath(recentProjectsRef.current, entry.path, nextEntry))
      setRecentProjectsError(null)
    } catch (error: unknown) {
      setRecentProjectsError(error instanceof PlatformFileError ? error.message : 'This Project file could not be renamed.')
    }
  }

  const duplicateRecentFile = async (entry: RecentProjectEntry) => {
    try {
      let copyIndex = 1
      let nextPath = siblingPath(entry.path, duplicateFilename(entry.path, copyIndex))
      while (await platformAdapter.fileExists(nextPath)) {
        copyIndex += 1
        nextPath = siblingPath(entry.path, duplicateFilename(entry.path, copyIndex))
      }
      await platformAdapter.copyProjectFile(entry.path, nextPath)
      const nextThumbnailKey = recentProjectThumbnailKey(nextPath)
      await platformAdapter.copyProjectThumbnail(entry.thumbnailKey, nextThumbnailKey)
      const stat = await platformAdapter.statFile(nextPath)
      const nextEntry = createRecentProjectEntry({ ...entry, id: undefined, path: nextPath, thumbnailKey: nextThumbnailKey, lastOpenedAt: new Date().toISOString(), lastKnownModifiedAt: stat?.modifiedAt ?? entry.lastKnownModifiedAt, missing: false, modifiedSinceLastOpen: false })
      await persistRecentProjects(upsertRecentProject(recentProjectsRef.current, nextEntry))
      const thumbnail = await platformAdapter.loadProjectThumbnail(nextThumbnailKey)
      if (thumbnail) setRecentProjectThumbnails((current) => ({ ...current, [nextThumbnailKey]: thumbnail }))
      setRecentProjectsError(null)
    } catch (error: unknown) {
      setRecentProjectsError(error instanceof PlatformFileError ? error.message : 'This Project file could not be duplicated.')
    }
  }

  const deleteRecentFile = async (entry: RecentProjectEntry) => {
    const confirmed = window.confirm(`Delete “${entry.displayName}”?\n\nThis will permanently delete the .ndblock file from disk.`)
    if (!confirmed) return
    try {
      await platformAdapter.deleteProjectFile(entry.path)
      await persistRecentProjects(removeRecentProject(recentProjectsRef.current, entry.path))
      await platformAdapter.deleteProjectThumbnail(entry.thumbnailKey)
      setRecentProjectThumbnails((current) => {
        const next = { ...current }
        delete next[entry.thumbnailKey]
        return next
      })
      setRecentProjectsError(null)
    } catch (error: unknown) {
      setRecentProjectsError(error instanceof PlatformFileError ? error.message : 'This Project file could not be deleted.')
    }
  }

  const returnToLibrary = async () => {
    if (isDirtyRef.current) {
      const choice = platformAdapter.promptUnsavedClose ? await platformAdapter.promptUnsavedClose() : 'cancel'
      const decision = closeDecisionForUnsavedChoice(choice, choice !== 'save' || await saveProject())
      if (decision === 'cancel') return
      if (choice === 'discard') setIsDirty(false)
    }
    setWorkspaceMode('library')
    setView('blocking')
    const refreshed = await refreshRecentProjectStatus(recentProjectsRef.current)
    await persistRecentProjects(refreshed)
  }

  const renameProject = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === projectDocumentRef.current.name) return
    replaceProjectDocument({ ...projectDocumentRef.current, name: trimmed, updatedAt: new Date().toISOString() })
    setIsDirty(true)
  }

  const addScene = () => {
    const current = projectDocumentRef.current
    const number = nextSceneNumber(current.scenes)
    const id = `scene-${String(number).padStart(2, '0')}`
    const name = `Scene ${String(number).padStart(2, '0')}`
    const scene = createDefaultV2Scene(id, name, false)
    resetEditorForProject({ ...current, scenes: [...current.scenes, { id, name, scene }], activeSceneId: id, updatedAt: new Date().toISOString() }, false)
    setView('blocking')
  }

  const renameScene = (sceneId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = projectDocumentRef.current
    const entry = current.scenes.find((item) => item.id === sceneId)
    if (!entry || entry.name === trimmed) return
    const scene = { ...entry.scene, metadata: { ...entry.scene.metadata, name: trimmed, updatedAt: new Date().toISOString() } }
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), scenes: current.scenes.map((item) => item.id === sceneId ? { ...item, name: trimmed, scene } : item) })
    if (current.activeSceneId === sceneId) sceneDocumentRef.current = scene
    setIsDirty(true)
  }

  const duplicateScene = (sceneId: string) => {
    const current = projectDocumentRef.current
    const original = current.scenes.find((entry) => entry.id === sceneId)
    if (!original) return
    const number = nextSceneNumber(current.scenes)
    const id = `scene-${String(number).padStart(2, '0')}`
    const name = `${original.name} Copy`
    const scene = cloneSceneWithIdentity(original.scene, id, name, `copy-${String(number).padStart(2, '0')}`)
    resetEditorForProject({ ...current, updatedAt: new Date().toISOString(), scenes: [...current.scenes, { id, name, scene }], activeSceneId: id }, false)
  }

  const deleteScene = (sceneId: string) => {
    const current = projectDocumentRef.current
    if (current.scenes.length <= 1) return
    const index = current.scenes.findIndex((entry) => entry.id === sceneId)
    if (index < 0 || !window.confirm(`Delete ${current.scenes[index].name}?`)) return
    const scenes = current.scenes.filter((entry) => entry.id !== sceneId)
    const activeSceneId = current.activeSceneId === sceneId ? scenes[Math.min(index, scenes.length - 1)].id : current.activeSceneId
    const next = { ...current, updatedAt: new Date().toISOString(), scenes, activeSceneId }
    if (activeSceneId !== current.activeSceneId) resetEditorForProject(next, false)
    else {
      replaceProjectDocument(next)
      setIsDirty(true)
    }
  }

  const importScene = async () => {
    try {
      const file = await platformAdapter.openSceneFile()
      if (!file) return
      const loaded = parseSceneFile(file.text)
      const current = projectDocumentRef.current
      const number = nextSceneNumber(current.scenes)
      const id = current.scenes.some((entry) => entry.id === loaded.metadata.id) ? `scene-${String(number).padStart(2, '0')}` : loaded.metadata.id
      const name = current.scenes.some((entry) => entry.name === loaded.metadata.name) ? `${loaded.metadata.name} Copy` : loaded.metadata.name
      const scene = { ...loaded, metadata: { ...loaded.metadata, id, name } }
      resetEditorForProject({ ...current, updatedAt: new Date().toISOString(), scenes: [...current.scenes, { id, name, scene }], activeSceneId: id }, false)
    } catch (error: unknown) {
      setSceneFileError(error instanceof SceneFileError || error instanceof PlatformFileError ? error.message : 'This Scene file could not be imported.')
    }
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

  const addProp = (propType: ScenicPropType) => {
    const before = sceneDocumentRef.current
    const index = nextEntityIndex(before, 'prop')
    const labels: Record<ScenicPropType, string> = { cube: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', table: 'Table', chair: 'Chair', window: 'Window', door: 'Door', bicycle: 'Bicycle', motorbike: 'Motorbike', car: 'Car' }
    const colors: Record<ScenicPropType, string> = { cube: '#9b91df', sphere: '#86b7c8', cylinder: '#d5a47f', table: '#9a7658', chair: '#7d8fa5', window: '#7ba2b4', door: '#806a55', bicycle: '#8f9e6d', motorbike: '#a86d61', car: '#71839a' }
    const groundHeight = propType === 'sphere' ? 0.9 : propType === 'cube' || propType === 'cylinder' ? 1 : 0
    const prop = createPropDocument(`prop-${String(index).padStart(2, '0')}`, `${labels[propType]} ${String(index).padStart(2, '0')}`, propType, [((index - 1) % 3 - 1) * 2.2, groundHeight, 0.5], colors[propType])
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, props: [...before.props, prop] }
    recordAction(`Add ${prop.name}`, before, selectedEntityIdRef.current, after, prop.id)
    applyEditorSnapshot({ document: after, selectedEntityId: prop.id })
  }

  const addWall = () => {
    setWallDrawing(true)
    setWallDrawState({ active: true, start: null, end: null, length: 0 })
  }

  const commitWallSegment = (start: ActorVector3, end: ActorVector3) => {
    const geometry = wallFromEndpoints(start, end)
    if (geometry.length < 0.05) return
    const before = sceneDocumentRef.current
    const index = nextEntityIndex(before, 'wall')
    const wall = createWallDocument(`wall-${String(index).padStart(2, '0')}`, `Wall ${String(index).padStart(2, '0')}`, geometry.center)
    const placedWall: WallDocument = { ...wall, length: geometry.length, height: geometry.height, thickness: geometry.thickness, rotation: [0, geometry.heading, 0] }
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, walls: [...before.walls, placedWall] }
    recordAction(`Add ${placedWall.name}`, before, selectedEntityIdRef.current, after, placedWall.id)
    applyEditorSnapshot({ document: after, selectedEntityId: placedWall.id })
  }

  const exitWallDrawing = () => {
    setWallDrawing(false)
    setWallDrawState({ active: false, start: null, end: null, length: 0 })
    setSnapPreviewWallId(null)
  }

  const handleViewChange = (nextView: 'blocking' | 'camera') => {
    setView(nextView)
    if (nextView !== 'blocking' && wallDrawing) exitWallDrawing()
  }

  const saveGeneratedFile = async (blob: Blob, fileName: string, extension: string): Promise<boolean> => {
    if (platformAdapter.kind === 'desktop') {
      const path = await platformAdapter.chooseExportLocation(fileName, extension)
      if (!path) return false
      await platformAdapter.writeExportFile(path, new Uint8Array(await blob.arrayBuffer()))
      return true
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  }

  const handleCaptureFrameReady = async (blob: Blob, _options: StillCaptureOptions) => {
    const current = sceneDocumentRef.current
    const camera = current.cameras.find((item) => item.id === current.activeCameraId)
    if (!camera) return
    try {
      await saveGeneratedFile(blob, cameraStillFilename(projectDocumentRef.current.name, current.metadata.name, camera.name, current.timeline.currentFrame), 'png')
    } catch (error: unknown) {
      setSceneFileError(error instanceof PlatformFileError ? error.message : 'The still image could not be saved.')
    }
  }

  const addOpening = (openingType: 'door' | 'window') => {
    const before = sceneDocumentRef.current
    const index = nextEntityIndex(before, openingType)
    const name = `${openingType === 'door' ? 'Door' : 'Window'} ${String(index).padStart(2, '0')}`
    const opening = createOpeningDocument(`${openingType}-${String(index).padStart(2, '0')}`, name, openingType, [openingType === 'door' ? -1 : 1, openingType === 'door' ? 0 : 1.1, -2.86])
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, openings: [...before.openings, opening] }
    recordAction(`Add ${opening.name}`, before, selectedEntityIdRef.current, after, opening.id)
    applyEditorSnapshot({ document: after, selectedEntityId: opening.id })
  }

  const addSun = () => {
    const before = sceneDocumentRef.current
    const index = nextEntityIndex(before, 'sun')
    const sun = createSunDocument(`sun-${String(index).padStart(2, '0')}`, `Sun ${String(index).padStart(2, '0')}`)
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, lights: [...before.lights, sun] }
    recordAction(`Add ${sun.name}`, before, selectedEntityIdRef.current, after, sun.id)
    applyEditorSnapshot({ document: after, selectedEntityId: sun.id })
  }

  const updateWall = (wallId: string, changes: Partial<WallDocument>) => {
    const before = sceneDocumentRef.current
    const wall = before.walls.find((item) => item.id === wallId)
    if (!wall) return
    const nextWalls = before.walls.map((item) => item.id === wallId ? { ...item, ...changes } : item)
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, walls: nextWalls, openings: before.openings.map((opening) => resolveOpeningAgainstWalls(opening, nextWalls)) }
    recordAction(`Update ${wall.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const updateActor = (actorId: string, changes: Partial<ActorDocument>) => {
    const before = sceneDocumentRef.current
    const actor = before.actors.find((item) => item.id === actorId)
    if (!actor) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, actors: before.actors.map((item) => item.id === actorId ? { ...item, ...changes, appearance: changes.appearance ? { ...item.appearance, ...changes.appearance } : item.appearance } : item) }
    recordAction(`Update ${actor.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const updateProp = (propId: string, changes: Partial<PropDocument>) => {
    const before = sceneDocumentRef.current
    const prop = before.props.find((item) => item.id === propId)
    if (!prop) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, props: before.props.map((item) => item.id === propId ? { ...item, ...changes } : item) }
    recordAction(`Update ${prop.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const updateOpening = (openingId: string, changes: Partial<OpeningDocument>) => {
    const before = sceneDocumentRef.current
    const opening = before.openings.find((item) => item.id === openingId)
    if (!opening) return
    const nextOpenings = before.openings.map((item) => item.id === openingId ? { ...item, ...changes } : item)
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, openings: nextOpenings.map((item) => resolveOpeningAgainstWalls(item, before.walls)) }
    recordAction(`Update ${opening.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const updateSun = (sunId: string, changes: Partial<SunDocument>) => {
    const before = sceneDocumentRef.current
    const sun = before.lights.find((item) => item.id === sunId)
    if (!sun) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, lights: before.lights.map((item) => item.id === sunId ? { ...item, ...changes } : item) }
    recordAction(`Update ${sun.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const duplicateEntity = (entityId: string): boolean => {
    const before = sceneDocumentRef.current
    const source = [...before.actors, ...before.props, ...before.walls, ...before.openings, ...before.cameras, ...before.lights].find((entity) => entity.id === entityId)
    if (!source) return false
    const sourceType = 'cameraDefinitionId' in source ? 'Camera' : 'type' in source ? source.type : 'Actor'
    const prefix = sourceType === 'Prop' ? 'prop' : sourceType === 'Wall' ? 'wall' : sourceType === 'Opening' ? ('openingType' in source ? source.openingType : 'door') : sourceType === 'Camera' ? 'camera' : sourceType === 'Sun' ? 'sun' : 'actor'
    const index = nextEntityIndex(before, prefix)
    const id = `${prefix}-${String(index).padStart(2, '0')}`
    const copy = JSON.parse(JSON.stringify(source)) as typeof source
    copy.id = id
    copy.name = `${source.name} Copy`
    if ('position' in copy) copy.position = [copy.position[0] + 0.6, copy.position[1], copy.position[2] + 0.6]
    const tracks = before.timeline.tracks.filter((track) => track.entityId === entityId).map((track) => ({ ...track, id: `${id}:${track.property}`, entityId: id, keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, id: `${id}:${track.property}:${keyframe.frame}` })) }))
    const next = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      actors: sourceType === 'Actor' ? [...before.actors, copy as ActorDocument] : before.actors,
      props: sourceType === 'Prop' ? [...before.props, copy as PropDocument] : before.props,
      walls: sourceType === 'Wall' ? [...before.walls, copy as WallDocument] : before.walls,
      openings: sourceType === 'Opening' ? [...before.openings, copy as OpeningDocument] : before.openings,
      cameras: sourceType === 'Camera' ? [...before.cameras, copy as CameraDocument] : before.cameras,
      lights: sourceType === 'Sun' ? [...before.lights, copy as SunDocument] : before.lights,
      timeline: { ...before.timeline, tracks: [...before.timeline.tracks, ...tracks] },
    }
    recordAction(`Duplicate ${source.name}`, before, selectedEntityIdRef.current, next, id)
    applyEditorSnapshot({ document: next, selectedEntityId: id })
    return true
  }

  const deleteEntity = (entityId: string) => {
    const before = sceneDocumentRef.current
    const source = [...before.actors, ...before.props, ...before.walls, ...before.openings, ...before.cameras, ...before.lights].find((entity) => entity.id === entityId)
    if (!source || !window.confirm(`Delete ${source.name}?`)) return
    const nextCameras = before.cameras.filter((item) => item.id !== entityId)
    const next = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      actors: before.actors.filter((item) => item.id !== entityId),
      props: before.props.filter((item) => item.id !== entityId),
      walls: before.walls.filter((item) => item.id !== entityId),
      openings: before.openings.filter((item) => item.id !== entityId).map((item) => item.wallId === entityId ? { ...item, wallId: null, offsetAlongWallMeters: undefined } : item),
      cameras: nextCameras,
      activeCameraId: before.activeCameraId === entityId ? (nextCameras[0]?.id ?? null) : before.activeCameraId,
      lights: before.lights.filter((item) => item.id !== entityId),
      timeline: { ...before.timeline, tracks: before.timeline.tracks.filter((track) => track.entityId !== entityId) },
    }
    recordAction(`Delete ${source.name}`, before, selectedEntityIdRef.current, next, null)
    applyEditorSnapshot({ document: next, selectedEntityId: null })
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
    const wall = before.walls.find((item) => item.id === entityId)
    const opening = before.openings.find((item) => item.id === entityId)
    const sun = before.lights.find((item) => item.id === entityId)
    const camera = before.cameras.find((item) => item.id === entityId)
    const entity = actor ?? prop ?? wall ?? opening ?? sun ?? camera
    if (!entity) return
    const evaluated = evaluateTimeline(before, before.timeline.currentFrame)[entityId]
    const visibleEntity = suspendedTimelineEntityIds.has(entityId) || !evaluated ? entity : { ...entity, ...evaluated, ...(camera ? { focalLengthMm: evaluated.focalLengthMm ?? camera.focalLengthMm } : {}) }
    const value = captureTimelineValue(visibleEntity, property)
    if (value === undefined) return
    const entityType = camera ? 'Camera' : sun ? 'Sun' : opening ? 'Opening' : wall ? 'Wall' : prop ? 'Prop' : 'Actor'
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
    setSnapPreviewWallId(null)
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
    setSnapPreviewWallId(null)
    if (!transaction) return
    const before = transaction.before
    const actor = before.actors.find((item) => item.id === change.entityId)
    const prop = before.props.find((item) => item.id === change.entityId)
    const wall = before.walls.find((item) => item.id === change.entityId)
    const opening = before.openings.find((item) => item.id === change.entityId)
    const camera = before.cameras.find((item) => item.id === change.entityId)
    const sun = before.lights.find((item) => item.id === change.entityId)
    if (sun) {
      const angles = sunAnglesFromHelperPosition(new THREE.Vector3(...change.position))
      const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, lights: before.lights.map((item) => item.id === sun.id ? { ...item, ...angles } : item) }
      setLastTransformDebug({ entityId: change.entityId, runtimeFinal: formatTransform(change.position, change.rotation), baseDocumentFinal: `Direction ${angles.azimuth.toFixed(1)}° / Height ${angles.elevation.toFixed(1)}°`, timelineEvaluated: '—', valueAppliedAfterTransform: 'SUN DIRECTION / HEIGHT' })
      recordAction(`Move ${sun.name}`, before, transaction.beforeSelection, after, change.entityId)
      const suspendedIds = new Set(suspendedTimelineEntityIds)
      if (before.timeline.tracks.some((track) => track.entityId === sun.id && (track.property === 'azimuth' || track.property === 'elevation'))) suspendedIds.add(sun.id)
      applyEditorSnapshot({ document: after, selectedEntityId: change.entityId }, suspendedIds)
      return
    }
    if (actor || prop || wall || opening || camera) {
      const snap = opening ? nearestWallForOpening(change.position, before.walls, WALL_SNAP_THRESHOLD, opening.width) : null
      const effectiveChange: StageTransform = opening && snap
        ? { ...change, position: resolveOpeningAgainstWalls({ ...opening, position: change.position, rotation: change.rotation, wallId: snap.wallId, offsetAlongWallMeters: snap.offset }, before.walls).position, rotation: resolveOpeningAgainstWalls({ ...opening, position: change.position, rotation: change.rotation, wallId: snap.wallId, offsetAlongWallMeters: snap.offset }, before.walls).rotation }
        : change
      const result = commitTimelineTransform(before, effectiveChange as TimelineTransformCommit)
      let after = { ...result.document, metadata: { ...result.document.metadata, updatedAt: new Date().toISOString() } }
      if (opening) {
        const attachedOpening = snap
          ? resolveOpeningAgainstWalls({ ...(after.openings.find((item) => item.id === opening.id) ?? opening), wallId: snap.wallId, offsetAlongWallMeters: snap.offset, position: effectiveChange.position, rotation: effectiveChange.rotation }, after.walls)
          : { ...(after.openings.find((item) => item.id === opening.id) ?? opening), wallId: null, offsetAlongWallMeters: undefined, position: effectiveChange.position, rotation: effectiveChange.rotation }
        after = { ...after, openings: after.openings.map((item) => item.id === opening.id ? attachedOpening : item) }
      } else if (wall) {
        after = { ...after, openings: after.openings.map((item) => resolveOpeningAgainstWalls(item, after.walls)) }
      }
      const finalEntity = [...after.actors, ...after.props, ...after.walls, ...after.openings, ...after.cameras].find((item) => item.id === change.entityId)
      const evaluatedAfter = evaluateTimeline(after, before.timeline.currentFrame)[change.entityId]
      setLastTransformDebug({ entityId: change.entityId, runtimeFinal: formatTransform(effectiveChange.position, effectiveChange.rotation), baseDocumentFinal: finalEntity ? formatTransform(finalEntity.position, finalEntity.rotation) : '—', timelineEvaluated: evaluatedAfter ? formatTransform(evaluatedAfter.position, evaluatedAfter.rotation) : '—', valueAppliedAfterTransform: result.suspendEvaluation ? 'BASE (TIMELINE SUSPENDED)' : result.changedKeyframe ? 'KEYFRAME' : 'BASE' })
      recordAction(`${result.changedKeyframe ? 'Update' : 'Move'} ${actor?.name ?? prop?.name ?? wall?.name ?? opening?.name ?? camera?.name ?? change.entityId}${result.changedKeyframe ? ' keyframe' : ''}`, before, transaction.beforeSelection, after, change.entityId)
      const suspendedIds = new Set(suspendedTimelineEntityIds)
      if (result.suspendEvaluation) suspendedIds.add(change.entityId)
      applyEditorSnapshot({ document: after, selectedEntityId: change.entityId }, suspendedIds)
      return
    }
    const after = applySceneEntityTransform(sceneDocumentRef.current, change)
    const entity = [...after.actors, ...after.props, ...after.walls, ...after.openings, ...after.cameras].find((item) => item.id === change.entityId)
    const action = transformTool === 'rotate' ? 'Rotate' : transformTool === 'scale' ? 'Scale' : 'Move'
    setLastTransformDebug({ entityId: change.entityId, runtimeFinal: formatTransform(change.position, change.rotation), baseDocumentFinal: formatTransform(after.props.find((item) => item.id === change.entityId)?.position ?? change.position, after.props.find((item) => item.id === change.entityId)?.rotation ?? change.rotation), timelineEvaluated: '—', valueAppliedAfterTransform: 'BASE' })
    recordAction(`${action} ${entity?.name ?? change.entityId}`, before, transaction.beforeSelection, after, change.entityId)
    applyEditorSnapshot({ document: after, selectedEntityId: change.entityId })
  }

  const handleTransformPreview = (change: StageTransform) => {
    const opening = sceneDocumentRef.current.openings.find((item) => item.id === change.entityId)
    if (!opening) {
      setSnapPreviewWallId(null)
      return
    }
    setSnapPreviewWallId(nearestWallForOpening(change.position, sceneDocumentRef.current.walls, WALL_SNAP_THRESHOLD, opening.width)?.wallId ?? null)
  }

  const handleWallDrawState = (state: WallDrawingState) => setWallDrawState(state)

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
    setSelectedTimelineKeyframe(null)
  }

  const moveKeyframe = (trackId: string, keyframeId: string, frame: number) => {
    const before = sceneDocumentRef.current
    const track = before.timeline.tracks.find((item) => item.id === trackId)
    const source = track?.keyframes.find((keyframe) => keyframe.id === keyframeId)
    if (!source || source.frame === frame) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: moveTimelineKeyframe(before.timeline, trackId, keyframeId, frame) }
    recordAction('Move Keyframe', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
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
      updateActiveSceneDocument(after, false)
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
        updateActiveSceneDocument(after, false)
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
    void import('./export/videoExporter').then(({ exportVideo }) => exportVideo({ document: snapshot, settings, signal: controller.signal, onProgress: (progress) => { setExportStatus('exporting'); setExportProgress(progress) } })).then(async (blob) => {
      setExportStatus('finalizing')
      const camera = snapshot.cameras.find((item) => item.id === settings.cameraId)
      const written = await saveGeneratedFile(blob, exportFilename(snapshot.metadata.name, camera?.name ?? 'Camera', settings.markIn, settings.markOut, settings.format), settings.format)
      if (!written) {
        setExportStatus('cancelled')
        setExportError(null)
        return
      }
      setExportStatus('completed')
    }).catch((error: unknown) => {
      if (isExportCancelled(error)) {
        setExportStatus('cancelled')
        setExportError('Export cancelled.')
      } else {
        setExportStatus('error')
        setExportError(userFacingExportError(error))
      }
    }).finally(() => {
      exportAbortRef.current = null
    })
  }

  useEffect(() => () => exportAbortRef.current?.abort(), [])

  const copySelection = (): boolean => {
    const selected = [...sceneDocumentRef.current.actors, ...sceneDocumentRef.current.props, ...sceneDocumentRef.current.openings].find((entity) => entity.id === selectedEntityIdRef.current)
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
    setIsDirty(creativeProjectFingerprint(projectDocumentRef.current) !== savedProjectFingerprintRef.current)
    return true
  }

  const redo = (): boolean => {
    const entry = historyRef.current.redo()
    if (!entry) return false
    applyEditorSnapshot(entry.after)
    setIsDirty(creativeProjectFingerprint(projectDocumentRef.current) !== savedProjectFingerprintRef.current)
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
    if (!platformAdapter.registerCloseGuard) return
    let active = true
    let cleanup: (() => void) | null = null
    void platformAdapter.registerCloseGuard(async () => {
      if (!isDirtyRef.current) return 'close'
      const choice = platformAdapter.promptUnsavedClose ? await platformAdapter.promptUnsavedClose() : 'cancel'
      return closeDecisionForUnsavedChoice(choice, choice !== 'save' || await saveProject())
    }).then((unlisten) => {
      if (active) cleanup = unlisten
      else unlisten()
    }).catch((error: unknown) => {
      setSceneFileError(error instanceof PlatformFileError ? error.message : 'The Project close guard could not be installed.')
    })
    return () => {
      active = false
      cleanup?.()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      const isTextEditing = Boolean(target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable))
      const bindings = shortcutBindingsRef.current
      if (!isTextEditing && shortcutMatches(event, bindings.open)) {
        event.preventDefault()
        loadProjectRef.current()
        return
      }
      if (!isTextEditing && shortcutMatches(event, bindings.newProject)) {
        event.preventDefault()
        newProjectRef.current()
        return
      }
      if (!isTextEditing && shortcutMatches(event, bindings.save) && workspaceModeRef.current === 'editor') {
        event.preventDefault()
        saveProjectRef.current()
        return
      }
      if (!isTextEditing && shortcutMatches(event, bindings.saveAs) && workspaceModeRef.current === 'editor') {
        event.preventDefault()
        saveProjectAsRef.current()
        return
      }
      if (!isTextEditing && shortcutMatches(event, bindings.playPause) && !event.repeat) {
        event.preventDefault()
        togglePlaybackRef.current()
        return
      }
      const markShortcut = !isTextEditing && shortcutMatches(event, bindings.markIn) ? 'in' : !isTextEditing && shortcutMatches(event, bindings.markOut) ? 'out' : null
      if (markShortcut && !event.repeat && !isPlayingRef.current) {
        event.preventDefault()
        changeMark(markShortcut)
        return
      }
      if (isTextEditing) return
      const shortcut = editorShortcutForKey(event)
      if (shortcut) {
        const handled = shortcut === 'copy' ? copySelection() : shortcut === 'paste' ? pasteSelection() : shortcut === 'undo' ? undo() : shortcut === 'redo' ? redo() : duplicateEntity(selectedEntityIdRef.current ?? '')
        if (handled) event.preventDefault()
        return
      }
      const destructiveTarget = destructiveShortcutTarget(event.key, isTextEditing, selectedTimelineKeyframeRef.current !== null, selectedEntityIdRef.current !== null)
      if (destructiveTarget === 'keyframe') {
        const timelineKeyframe = selectedTimelineKeyframeRef.current
        if (timelineKeyframe) {
          deleteKeyframe(timelineKeyframe.trackId, timelineKeyframe.keyframeId)
          event.preventDefault()
          return
        }
      }
      if (destructiveTarget === 'entity') {
        const selected = selectedEntityIdRef.current
        if (selected === null) return
        deleteEntity(selected as string)
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (workspaceMode === 'library') {
    return <><V2ProjectLibrary entries={recentProjects} thumbnails={recentProjectThumbnails} loading={recentProjectsLoading} error={recentProjectsError} dropState={desktopDropState} revealLabel={platformAdapter.revealProjectLabel} onNewProject={newProject} onOpenProject={loadProject} onOpenRecent={openRecentProject} onLocate={locateRecentProject} onReveal={revealRecentFile} onRemove={removeRecent} onRename={renameRecentFile} onDuplicate={duplicateRecentFile} onDelete={deleteRecentFile} onOpenSettings={() => setShortcutSettingsOpen(true)} />{shortcutSettingsOpen ? <V2ShortcutSettings bindings={shortcutBindings} onChange={updateShortcut} onReset={resetShortcuts} onClose={() => setShortcutSettingsOpen(false)} /> : null}</>
  }

  const timelineBounds = timelineHeightBounds(typeof window === 'undefined' ? 900 : window.innerHeight)
  const appShellStyle = { '--v2-timeline-height': `${timelineHeight}px` } as CSSProperties

  return (
    <main ref={appShellRef} className={`v2-app-shell${isResizingTimeline ? ' is-resizing-timeline' : ''}`} style={appShellStyle}>
      {desktopDropState === 'valid' ? <div className="v2-desktop-drop-feedback" role="status">Drop .ndblock to open this Project</div> : null}
      <V2TopBar projectName={projectDocument.name} sceneName={sceneDocument.metadata.name} isDirty={isDirty} fileError={sceneFileError} view={view} onViewChange={handleViewChange} onNewProject={newProject} onBackToLibrary={platformAdapter.kind === 'desktop' ? returnToLibrary : undefined} onSaveProject={saveProject} onSaveProjectAs={saveProjectAs} onLoadProject={loadProject} onProjectNameChange={renameProject} onExport={openExport} exportDisabled={exportStatus === 'preparing' || exportStatus === 'exporting' || exportStatus === 'finalizing'} />
      <V2ScenePanel scenes={projectDocument.scenes} activeSceneId={projectDocument.activeSceneId} actors={sceneDocument.actors} props={sceneDocument.props} walls={sceneDocument.walls} openings={sceneDocument.openings} lights={sceneDocument.lights} cameras={sceneDocument.cameras} activeCameraId={sceneDocument.activeCameraId} selectedEntityId={selectedEntityId} onSelectScene={switchScene} onAddScene={addScene} onRenameScene={renameScene} onDuplicateScene={duplicateScene} onDeleteScene={deleteScene} onImportScene={importScene} onExportScene={exportScene} onAddActor={addActor} onAddProp={addProp} onAddWall={addWall} onAddOpening={addOpening} onAddSun={addSun} onAddCamera={addCamera} onSetActiveCamera={setActiveCamera} onSelectEntity={handleSelectionChange} />
      <V2Stage
        view={view}
        actors={sceneDocument.actors}
        props={sceneDocument.props}
        walls={sceneDocument.walls}
        openings={sceneDocument.openings}
        lights={sceneDocument.lights}
        cameras={sceneDocument.cameras}
        activeCameraId={sceneDocument.activeCameraId}
        selectedEntityId={selectedEntityId}
        tool={transformTool}
        onSelectionChange={handleSelectionChange}
        onToolChange={setTransformTool}
        onTransformStart={handleTransformStart}
        onTransformEnd={handleTransformEnd}
        onTransformPreview={handleTransformPreview}
        onCaptureFrameReady={handleCaptureFrameReady}
        cameraPreview={cameraPreview}
        onCameraPreviewChange={setCameraPreview}
        onOpenCameraView={() => setView('camera')}
        wallDrawing={wallDrawing}
        wallDrawState={wallDrawState}
        onWallDrawCommit={commitWallSegment}
        onWallDrawState={handleWallDrawState}
        onWallDrawExit={exitWallDrawing}
        snapPreviewWallId={snapPreviewWallId}
        evaluatedEntities={evaluatedEntities}
        isPlaying={isPlaying}
        transformingEntityId={transformingEntityId}
        suspendedTimelineEntityIds={suspendedTimelineEntityIds}
        timeline={sceneDocument.timeline}
        isScrubbing={isScrubbing}
        lastTransformDebug={lastTransformDebug}
        selectedFrameGuideId={selectedFrameGuideId}
        thumbnailCaptureRef={thumbnailCaptureRef}
        shortcutBindings={shortcutBindings}
      />
      <V2DetailsPanel actor={selectedActor} prop={selectedProp} wall={selectedWall} opening={selectedOpening} sun={selectedSun} camera={selectedCamera} timeline={sceneDocument.timeline} onActorChange={updateActor} onPropChange={updateProp} onCameraChange={updateCamera} onWallChange={updateWall} onOpeningChange={updateOpening} onSunChange={updateSun} onDuplicateEntity={duplicateEntity} onDeleteEntity={deleteEntity} onSetActiveCamera={setActiveCamera} onAddKeyframe={addKeyframe} activeCameraId={sceneDocument.activeCameraId} selectedFrameGuideId={selectedFrameGuideId} onFrameGuideSelection={setSelectedFrameGuideId} />
      <div
        className="v2-timeline-resize-handle"
        role="separator"
        aria-label="Resize Timeline"
        aria-orientation="horizontal"
        aria-valuemin={timelineBounds.min}
        aria-valuemax={timelineBounds.max}
        aria-valuenow={timelineHeight}
        tabIndex={0}
        onPointerDown={startTimelineResize}
        onDoubleClick={() => setClampedTimelineHeight(TIMELINE_HEIGHT_DEFAULT)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setClampedTimelineHeight(timelineHeight + 16)
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setClampedTimelineHeight(timelineHeight - 16)
          } else if (event.key === 'Home') {
            event.preventDefault()
            setClampedTimelineHeight(TIMELINE_HEIGHT_DEFAULT)
          }
        }}
      ><span aria-hidden="true" /></div>
      <V2Timeline timeline={sceneDocument.timeline} tracks={sceneDocument.timeline.tracks} entities={timelineEntities} selectedEntityId={selectedEntityId} isPlaying={isPlaying} onFrameChange={setCurrentFrame} onFrameRateChange={changeFrameRate} onTogglePlayback={togglePlayback} onStepFrame={stepFrame} onMarkIn={() => changeMark('in')} onMarkOut={() => changeMark('out')} onMoveKeyframe={moveKeyframe} selectedKeyframe={selectedTimelineKeyframe} onKeyframeSelect={setSelectedTimelineKeyframe} onEntitySelect={handleSelectionChange} onScrubStart={() => setIsScrubbing(true)} onScrubEnd={() => setIsScrubbing(false)} />
      {exportStatus === 'preparing' || exportStatus === 'exporting' || exportStatus === 'finalizing' ? <div className="v2-export-lock" aria-hidden="true" /> : null}
      {exportOpen ? <V2ExportModal document={sceneDocument} projectName={projectDocument.name} sceneName={sceneDocument.metadata.name} settings={exportSettings} status={exportStatus} progress={exportProgress} error={exportError} onSettingsChange={setExportSettings} onExport={startExport} onCancel={cancelExport} onClose={() => setExportOpen(false)} /> : null}
      {shortcutSettingsOpen ? <V2ShortcutSettings bindings={shortcutBindings} onChange={updateShortcut} onReset={resetShortcuts} onClose={() => setShortcutSettingsOpen(false)} /> : null}
    </main>
  )
}

function V2DesktopViewportNotice() {
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 900 || window.innerHeight < 620)

  useEffect(() => {
    const update = () => setIsCompact(window.innerWidth < 900 || window.innerHeight < 620)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return isCompact ? <div className="v2-viewport-notice" role="status">ND Blocking &amp; Previs is designed for desktop-sized screens.</div> : null
}

export function V2App() {
  return <><V2DesktopViewportNotice /><V2EditorApp /></>
}
