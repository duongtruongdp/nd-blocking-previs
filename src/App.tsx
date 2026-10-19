import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { V2DetailsPanel } from './components/V2DetailsPanel'
import { V2ScenePanel } from './components/V2ScenePanel'
import { V2Stage, type V2TransformDebugState } from './components/V2Stage'
import { V2Timeline } from './components/V2Timeline'
import { V2MasterTimeline } from './components/V2MasterTimeline'
import { V2MasterShotBin } from './components/V2MasterShotBin'
import { V2MasterInspector, type MasterInspectorSelection } from './components/V2MasterInspector'
import { V2TopBar } from './components/V2TopBar'
import { V2ProjectLibrary } from './components/V2ProjectLibrary'
import { closeDecisionForUnsavedChoice, platformAdapter, PlatformFileError, type DesktopDropEvent } from './platform/platformAdapter'
import { basename, createRecentProjectEntry, duplicateFilename, filenameWithoutExtension, firstSupportedProjectPath, isProjectFilePath, projectFilenameFromInput, recentProjectIdentity, recentProjectThumbnailKey, removeRecentProject, siblingPath, sortRecentProjects, updateRecentProjectPath, upsertRecentProject, type RecentProjectEntry } from './platform/projectLibrary'
import { createDefaultProps } from './scene/testEntities'
import { resolveFrameGuideSelection } from './core/frameGuideSelection'
import { applySceneEntityTransform, createActorDocument, createCameraDocument, createEmptySceneDocument, createOpeningDocument, createPropDocument, createSunDocument, createWallDocument, type ActorDocument, type ActorVector3, type CameraDocument, type OpeningDocument, type PropDocument, type RationalFrameRate, type SceneDocument, type ScenicPropType, type SunDocument, type TimelineEasingMode, type TimelineProperty, type WallDocument } from './core/sceneDocument'
import type { ProjectDocument, ProjectSceneEntry } from './core/projectDocument'
import { cloneSceneWithIdentity, createProjectDocument } from './core/projectDocument'
import { createShotDocument, createShotId, duplicateShotName, nextShotName, resolveShotThumbnailFrame, SHOT_THUMBNAIL_JPEG_QUALITY, SHOT_THUMBNAIL_TARGET_WIDTH, type ShotDocument } from './core/shotDocument'
import { normalizeShotListSettings, type ShotListSettings } from './core/shotListSettings'
import { reorderShotDocuments } from './core/shotListModel'
import { createMusicClip, duplicateMasterClip, effectiveMasterRenderRange, insertMasterClipAt, masterSequenceDurationFrames, masterSequenceFrameRate, removeMasterClip, reorderMasterClip, resolveMasterFrame, resolveMasterMusicTime, sameFrameRate, setMasterSequenceMark, updateMasterClipRange } from './core/masterSequence'
import { resolveMasterPreviewContext } from './core/masterPreview'
import { decodeMusicFile } from './core/musicWaveform'
import { deleteMusicAsset, loadMusicAsset, saveMusicAsset } from './core/musicAssetStore'
import { CAMERA_DATABASE } from './core/cameraDatabase'
import { defaultCameraPlacement } from './core/cameraPlacement'
import { cameraRotationLookingAt } from './runtime/cameraMath'
import { cameraAimRotation, cameraPositionAfterMove, cameraSubjectDistance, currentEditableCameraPose, type CameraBlockingMove } from './runtime/cameraBlocking'
import { cameraPositionForActorFraming, type FramingPreset, type TargetAimPoint } from './runtime/compositionMath'
import { createEditorClipboard, pasteEditorClipboard, type EditorClipboard } from './core/editorClipboard'
import { EditorHistory, type EditorHistorySnapshot } from './core/editorHistory'
import { destructiveShortcutTarget, editorShortcutForKey } from './core/editorShortcuts'
import { clampTimelineHeight, TIMELINE_HEIGHT_DEFAULT, timelineHeightBounds } from './core/workspaceLayout'
import type { StageSelection, StageTool, StageTransform, StageTransformBatch } from './stage-engine'
import { evaluateTimeline } from './timeline/timelineEvaluator'
import { createPlaybackClock, playbackFrameAt, playbackFrameAtLoop, playbackLoopCycle, playbackReachedMarkOut, playbackStartFrame, type PlaybackClock } from './timeline/playbackClock'
import { clampTimelineFrame, moveTimelineKeyframe, moveTimelineKeyframes, removeTimelineKeyframe, removeTimelineKeyframes, retimeCameraPathSegment, setTimelineKeyframesEasing, setTimelineMark, timelineEasingForMode, timelineEasingMode, timelineDurationFrames, timelinePlaybackRange, upsertTimelineKeyframe, type CameraRetimeMode, type TimelineKeyframeSelection, type TimelinePlaybackRange } from './timeline/timelineMath'
import { createTimelineKeyframeClipboardGroup, pasteTimelineKeyframes, type TimelineKeyframeClipboard } from './timeline/timelineClipboard'
import { captureTimelineValue, commitTimelineTransform, type SuspendedTimelineProperties, type TimelineTransformCommit } from './timeline/transformOwnership'
import { V2ExportModal } from './components/V2ExportModal'
import { V2ShotListWorkspace } from './components/V2ShotListWorkspace'
import { buildShotListCsv, shotListExportFilename, type ShotListExportScope } from './core/shotListExport'
import { exportFilename } from './export/exportMath'
import { buildMasterRenderPlan } from './export/masterRenderPlan'
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
import { cameraPathSegmentForKeyframe, cameraPathSegmentForSelection, type CameraPathKeyframe, type CameraPathSegmentSelection } from './timeline/cameraPath'
import { cameraMoveReviewRange, type CameraMoveReviewMode } from './timeline/cameraReview'
import { shortcutLabel, shortcutMatches, shortcutPreferencesWithDefaults, SHORTCUT_COMMANDS, type ShortcutBinding, type ShortcutCommandId } from './core/shortcutRegistry'
import { V2ShortcutSettings, type AboutUpdateState } from './components/V2ShortcutSettings'
import { captureAndStoreProjectThumbnail } from './platform/projectThumbnail'
import { createUnsavedRecoveryId, recoveryIdForProjectPath, RecoveryManager, type RecoveryInspection } from './platform/recovery'
import { V2RecoveryCenter } from './components/V2RecoveryCenter'
import { APP_CONTACT_EMAIL, APP_VERSION, APP_WEBSITE_URL } from './core/appMetadata'
import { checkLatestRelease, openUpdateDownload, platformForUserAgent, releaseHasAsset, type UpdateCheckResult } from './platform/updateChecker'
import type { UpdatePreferences } from './platform/platformAdapter'
import { PhoneCameraController, type PhoneCameraControllerState } from './phoneCamera/phoneCameraController'
import { ROTATE_PHONE_CAMERA_CHANNELS } from './phoneCamera/protocol'
import type { PhoneCameraLiveLayer } from './phoneCamera/cameraPoseComposition'
import { cameraDocumentForRecording } from './phoneCamera/recordingScope'
import { LiveReviewPanel } from './components/LiveReviewPanel'
import { LiveReviewTransport, type LiveReviewTransportStatus } from './liveReview/liveReviewTransport'
import { buildLiveReviewInviteUrl, liveReviewRelayConfig } from './liveReview/liveReviewConfig'
import { createLiveReviewSnapshot } from './liveReview/projectSnapshot'
import { defaultLiveReviewState, randomLiveReviewId, type LiveReviewChatMessage, type LiveReviewCollaborativeEntityType, type LiveReviewEditResult, type LiveReviewLease, type LiveReviewParticipant, type LiveReviewPointer, type LiveReviewRole, type LiveReviewServerMessage, type LiveReviewShotField, type LiveReviewState, type LiveReviewTimelineCommit, type LiveReviewTimelineProperty, type LiveReviewTransform, type LiveReviewTransformCommit } from './liveReview/protocol'

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

async function compactShotThumbnail(blob: Blob, targetWidth = SHOT_THUMBNAIL_TARGET_WIDTH): Promise<{ dataUrl: string; width: number; height: number }> {
  const source = await blobToDataUrl(blob)
  if (typeof document === 'undefined' || typeof Image === 'undefined') return { dataUrl: source, width: targetWidth, height: Math.round(targetWidth * 9 / 16) }
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, targetWidth / Math.max(1, image.naturalWidth))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
      canvas.toBlob((compressed) => {
        if (!compressed) { resolve({ dataUrl: source, width, height }); return }
        void blobToDataUrl(compressed).then((dataUrl) => resolve({ dataUrl, width, height })).catch(() => resolve({ dataUrl: source, width, height }))
      }, 'image/jpeg', SHOT_THUMBNAIL_JPEG_QUALITY)
    }
    image.onerror = () => resolve({ dataUrl: source, width: targetWidth, height: Math.round(targetWidth * 9 / 16) })
    image.src = source
  })
}

function nextSceneNumber(entries: readonly ProjectSceneEntry[]): number {
  return Math.max(0, ...entries.map((entry) => Number(/scene-(\d+)/i.exec(entry.id)?.[1] ?? 0))) + 1
}

function nextEntityIndex(scene: SceneDocument, prefix: string): number {
  const ids = [...scene.actors, ...scene.props, ...scene.walls, ...scene.openings, ...scene.cameras, ...scene.lights].map((entity) => entity.id)
  return Math.max(0, ...ids.map((id) => Number(new RegExp(`^${prefix}-(\\d+)$`, 'i').exec(id)?.[1] ?? 0))) + 1
}

function shotCreationRange(timeline: SceneDocument['timeline']): TimelinePlaybackRange {
  const fullRange = { startFrame: timeline.startFrame, endFrame: timeline.endFrame }
  const markIn = Math.round(timeline.markIn)
  const markOut = Math.round(timeline.markOut)
  if (!Number.isFinite(markIn) || !Number.isFinite(markOut) || markIn < timeline.startFrame || markOut <= markIn || markOut > timeline.endFrame) return fullRange
  return { startFrame: markIn, endFrame: markOut }
}

function isMacOSDesktop(): boolean {
  return platformAdapter.kind === 'desktop' && typeof navigator !== 'undefined' && /Macintosh|Mac OS X/i.test(navigator.userAgent)
}

type CameraMoveReviewState = {
  mode: CameraMoveReviewMode
  sceneId: string
  cameraId: string
  segment: CameraPathSegmentSelection
}

type ShotReviewState = {
  shotId: string
  sceneId: string
  range: TimelinePlaybackRange
}

function V2EditorApp() {
  const [view, setView] = useState<'blocking' | 'camera' | 'shot-list'>('blocking')
  const [shotListSelectedId, setShotListSelectedId] = useState<string | null>(null)
  const [shotListPresentation, setShotListPresentation] = useState(false)
  const [shotListViewMode, setShotListViewMode] = useState<'grid' | 'list'>('grid')
  const [shotListSceneFilter, setShotListSceneFilter] = useState<string | null>(null)
  const [workspaceMode, setWorkspaceMode] = useState<'library' | 'editor'>(() => platformAdapter.kind === 'desktop' ? 'library' : 'editor')
  const [projectDocument, setProjectDocument] = useState(createDefaultV2Project)
  const activeSceneEntry = projectDocument.scenes.find((entry) => entry.id === projectDocument.activeSceneId) ?? projectDocument.scenes[0]
  const sceneDocument = activeSceneEntry.scene
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
  const [renameRequest, setRenameRequest] = useState<{ entityId: string; token: number } | null>(null)
  const [selectedFrameGuideId, setSelectedFrameGuideId] = useState<string | null>(null)
  const [selectedTimelineKeyframes, setSelectedTimelineKeyframes] = useState<TimelineKeyframeSelection[]>([])
  const [cameraPathVisible, setCameraPathVisible] = useState(false)
  const [selectedCameraPathSegment, setSelectedCameraPathSegment] = useState<CameraPathSegmentSelection | null>(null)
  const [cameraMoveReview, setCameraMoveReview] = useState<CameraMoveReviewState | null>(null)
  const [, setShotReview] = useState<ShotReviewState | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  const [recentProjectThumbnails, setRecentProjectThumbnails] = useState<Record<string, string | null>>({})
  const [recentProjectsLoading, setRecentProjectsLoading] = useState(platformAdapter.kind === 'desktop')
  const [recentProjectsError, setRecentProjectsError] = useState<string | null>(null)
  const [desktopDropState, setDesktopDropState] = useState<'idle' | 'valid' | 'invalid'>('idle')
  const [sceneFileError, setSceneFileError] = useState<string | null>(null)
  const [transformTool, setTransformTool] = useState<StageTool>('select')
  const [isPlaying, setIsPlaying] = useState(false)
  const [timelineMode, setTimelineMode] = useState<'scene' | 'master'>('scene')
  const [masterSelection, setMasterSelection] = useState<MasterInspectorSelection>(null)
  const activeMasterClipId = masterSelection?.kind === 'clip' ? masterSelection.id : null
  const [masterFrame, setMasterFrame] = useState(0)
  const [isMasterPlaying, setIsMasterPlaying] = useState(false)
  const [isMasterLooping, setIsMasterLooping] = useState(false)
  const [masterMusicPeaks, setMasterMusicPeaks] = useState<number[] | null>(null)
  const [isLooping, setIsLooping] = useState(false)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [transformingEntityId, setTransformingEntityId] = useState<string | null>(null)
  const [suspendedTimelineEntityIds, setSuspendedTimelineEntityIds] = useState<ReadonlySet<string>>(new Set())
  const [suspendedTimelineProperties, setSuspendedTimelineProperties] = useState<SuspendedTimelineProperties>({})
  const [lastTransformDebug, setLastTransformDebug] = useState<V2TransformDebugState | null>(null)
  const [wallDrawing, setWallDrawing] = useState(false)
  const [wallDrawState, setWallDrawState] = useState<WallDrawingState>({ active: false, start: null, end: null, length: 0 })
  const [snapPreviewWallId, setSnapPreviewWallId] = useState<string | null>(null)
  const [cameraPreview, setCameraPreview] = useState(false)
  const [phoneCameraState, setPhoneCameraState] = useState<PhoneCameraControllerState>({ status: 'idle', pairingUrl: null, isRecording: false, activeCameraId: null, orientation: 'unknown', controlMode: 'rotation', controlPreset: 'rotate', controlChannels: { ...ROTATE_PHONE_CAMERA_CHANNELS }, requiresRecenter: false, sourceMode: 'rotation-only', movementScale: 1, rotationSensitivity: 1, message: null })
  const [livePanelOpen, setLivePanelOpen] = useState(false)
  const [liveStatus, setLiveStatus] = useState<LiveReviewTransportStatus>('idle')
  const [liveRole, setLiveRole] = useState<LiveReviewRole | null>(null)
  const [liveSession, setLiveSession] = useState<string | null>(null)
  const [liveInviteUrl, setLiveInviteUrl] = useState<string | null>(null)
  const [liveViewerCount, setLiveViewerCount] = useState(0)
  const [liveParticipants, setLiveParticipants] = useState<LiveReviewParticipant[]>([])
  const [liveFollowHost, setLiveFollowHost] = useState(true)
  const [livePointerActive, setLivePointerActive] = useState(false)
  const [livePointer, setLivePointer] = useState<LiveReviewPointer | null>(null)
  const [liveChatMessages, setLiveChatMessages] = useState<LiveReviewChatMessage[]>([])
  const [liveLeases, setLiveLeases] = useState<LiveReviewLease[]>([])
  const [liveHostConnected, setLiveHostConnected] = useState(true)
  const [liveError, setLiveError] = useState<string | null>(null)
  const liveRelayConfig = liveReviewRelayConfig()
  const [exportOpen, setExportOpen] = useState(false)
  const [exportStatus, setExportStatus] = useState<VideoExportStatus>('idle')
  const [exportProgress, setExportProgress] = useState<VideoExportProgress | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSettings, setExportSettings] = useState<VideoExportSettings>(() => ({ source: 'scene', cameraId: null, markIn: 0, markOut: 120, frameRate: { numerator: 24, denominator: 1 }, deliveryAspectRatio: '16:9', width: 1920, format: 'mp4', quality: 'standard', includeMusic: false }))
  const [timelineHeight, setTimelineHeight] = useState(TIMELINE_HEIGHT_DEFAULT)
  const [isResizingTimeline, setIsResizingTimeline] = useState(false)
  const [shortcutBindings, setShortcutBindings] = useState(() => shortcutPreferencesWithDefaults())
  const [shortcutSettingsOpen, setShortcutSettingsOpen] = useState(false)
  const [updatePreferences, setUpdatePreferences] = useState<UpdatePreferences>({ autoCheck: true })
  const [updateState, setUpdateState] = useState<AboutUpdateState>({ status: 'idle', currentVersion: APP_VERSION })
  const [updateNotice, setUpdateNotice] = useState<UpdateCheckResult | null>(null)
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'opening' | 'error'>('idle')
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [recoveryEnabled, setRecoveryEnabled] = useState(true)
  const [recoveryReady, setRecoveryReady] = useState(platformAdapter.kind !== 'desktop')
  const [recoveryLoading, setRecoveryLoading] = useState(platformAdapter.kind === 'desktop')
  const [recoveryEntries, setRecoveryEntries] = useState<RecoveryInspection[]>([])
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false)
  const [recoveryRequestedPath, setRecoveryRequestedPath] = useState<string | null>(null)
  const appShellRef = useRef<HTMLElement>(null)
  const projectDocumentRef = useRef<ProjectDocument>(projectDocument)
  const sceneDocumentRef = useRef<SceneDocument>(sceneDocument)
  const currentProjectPathRef = useRef<string | null>(null)
  const recentProjectsRef = useRef<RecentProjectEntry[]>([])
  const thumbnailCaptureRef = useRef<(() => Promise<Blob | null>) | null>(null)
  const phoneCameraLiveApplyRef = useRef<((layer: PhoneCameraLiveLayer | null) => void) | null>(null)
  const phoneCameraControllerRef = useRef<PhoneCameraController | null>(null)
  const phoneRecordingBeforeRef = useRef<SceneDocument | null>(null)
  const phoneRecordingCameraIdRef = useRef<string | null>(null)
  const phoneProjectIdentityRef = useRef<string | null>(null)
  const liveTransportRef = useRef<LiveReviewTransport | null>(null)
  const liveRoleRef = useRef<LiveReviewRole | null>(null)
  const liveProjectRevisionRef = useRef(0)
  const liveProjectFingerprintRef = useRef<string | null>(null)
  const liveLastStateSentAtRef = useRef(0)
  const liveBeforeProjectRef = useRef<ProjectDocument | null>(null)
  const liveBeforeDirtyRef = useRef(false)
  const publishLiveProjectRef = useRef<(project: ProjectDocument) => void>(() => {})
  const sendLiveStateRef = useRef<(force?: boolean) => void>(() => {})
  const liveTransformThrottleRef = useRef(new Map<string, { latest: LiveReviewTransform; timer: number | null }>())
  const liveFollowHostRef = useRef(true)
  const liveLatestProjectRef = useRef<ProjectDocument | null>(null)
  const liveLatestStateRef = useRef<LiveReviewState | null>(null)
  const livePendingTransformsRef = useRef(new Map<string, LiveReviewTransform>())
  const liveLeaseRequestsRef = useRef(new Map<string, { resolve: (lease: LiveReviewLease | null) => void; timer: number } >())
  const liveActiveLeaseRef = useRef<LiveReviewLease | null>(null)
  const liveTimelineLeaseRequestsRef = useRef(new Map<string, Promise<LiveReviewLease | null>>())
  const liveCanceledTimelineLeaseTargetsRef = useRef(new Set<string>())
  const liveTimelineEditTargetRef = useRef<string | null>(null)
  const liveTimelineEditActiveRef = useRef(false)
  const liveLeaseRenewedAtRef = useRef(0)
  const livePointerSentAtRef = useRef(0)
  const liveInviteSession = useState<string | null>(() => typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('live'))[0]
  const isDirtyRef = useRef(isDirty)
  const workspaceModeRef = useRef(workspaceMode)
  const savedProjectFingerprintRef = useRef(creativeProjectFingerprint(projectDocument))
  const selectedEntityIdRef = useRef<string | null>(selectedEntityId)
  const selectedEntityIdsRef = useRef<string[]>(selectedEntityIds)
  const renameRequestTokenRef = useRef(0)
  const selectedTimelineKeyframesRef = useRef<TimelineKeyframeSelection[]>(selectedTimelineKeyframes)
  const shortcutBindingsRef = useRef(shortcutBindings)
  const clipboardRef = useRef<EditorClipboard | null>(null)
  const keyframeClipboardRef = useRef<TimelineKeyframeClipboard | null>(null)
  const historyRef = useRef<EditorHistory>(new EditorHistory(100))
  const transformTransactionRef = useRef<{ before: SceneDocument; beforeSelection: string | null; beforeSelectionIds: string[] } | null>(null)
  const cameraPathTransactionRef = useRef<{ before: SceneDocument; cameraId: string; keyframe: CameraPathKeyframe } | null>(null)
  const playbackRef = useRef<PlaybackClock | null>(null)
  const playbackRangeRef = useRef<TimelinePlaybackRange | null>(null)
  const playbackFrameRequestRef = useRef<number | null>(null)
  const masterPlaybackRequestRef = useRef<number | null>(null)
  const masterPlaybackStartRef = useRef<number | null>(null)
  const masterMusicFileRef = useRef<Blob | null>(null)
  const masterAudioRef = useRef<HTMLAudioElement | null>(null)
  const masterAudioUrlRef = useRef<string | null>(null)
  const cameraMoveReviewRef = useRef<CameraMoveReviewState | null>(null)
  const shotReviewRef = useRef<ShotReviewState | null>(null)
  const isLoopingRef = useRef(isLooping)
  const isMasterLoopingRef = useRef(isMasterLooping)
  const exportAbortRef = useRef<AbortController | null>(null)
  const recoveryManagerRef = useRef<RecoveryManager>(new RecoveryManager({
    loadEntries: () => platformAdapter.loadRecoveryEntries(),
    saveEntries: (entries) => platformAdapter.saveRecoveryEntries(entries),
    readSnapshot: (recoveryId) => platformAdapter.readRecoverySnapshot(recoveryId),
    writeSnapshot: (recoveryId, text) => platformAdapter.writeRecoverySnapshot(recoveryId, text),
    deleteSnapshot: (recoveryId) => platformAdapter.deleteRecoverySnapshot(recoveryId),
    statProject: (path) => platformAdapter.statRecoveryProject(path),
  }, import.meta.env.DEV ? (message, details) => console.info(`[recovery] ${message}`, details ?? '') : undefined))
  const recoveryEntriesRef = useRef<RecoveryInspection[]>([])
  const recoveryRequestedPathRef = useRef<string | null>(null)
  const unsavedRecoveryIdRef = useRef(createUnsavedRecoveryId())
  const currentRecoveryIdRef = useRef<string | null>(null)
  const dirtySinceRef = useRef<string | null>(null)
  const recoveryFingerprintRef = useRef(creativeProjectFingerprint(projectDocument))
  const togglePlaybackRef = useRef<() => void>(() => {})
  const newProjectRef = useRef<() => void>(() => {})
  const loadProjectRef = useRef<() => void>(() => {})
  const saveProjectRef = useRef<() => void>(() => {})
  const saveProjectAsRef = useRef<() => void>(() => {})
  const isPlayingRef = useRef(isPlaying)
  const timelineModeRef = useRef(timelineMode)
  const timelineResizeRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const evaluatedEntities = evaluateTimeline(sceneDocument, sceneDocument.timeline.currentFrame)
  const masterPreview = useMemo(() => timelineMode === 'master' ? resolveMasterPreviewContext(projectDocument, masterFrame) : null, [projectDocument, masterFrame, timelineMode])
  const cameraViewSceneRevision = `${projectDocument.id}:${projectDocument.activeSceneId}:${sceneDocument.metadata.id}:${sceneDocument.metadata.updatedAt}:${sceneDocument.timeline.currentFrame}`
  const selectedActorBase = sceneDocument.actors.find((actor) => actor.id === selectedEntityId) ?? null
  const selectedPropBase = sceneDocument.props.find((prop) => prop.id === selectedEntityId) ?? null
  const selectedCameraBase = sceneDocument.cameras.find((camera) => camera.id === selectedEntityId) ?? null
  const selectedCameraTarget = selectedCameraBase?.targetEntityId ? [...sceneDocument.actors, ...sceneDocument.props, ...sceneDocument.walls, ...sceneDocument.openings, ...sceneDocument.cameras].find((entity) => entity.id === selectedCameraBase.targetEntityId && entity.id !== selectedCameraBase.id) ?? null : null
  const selectedCameraEditablePose = selectedCameraBase ? currentEditableCameraPose(sceneDocument, selectedCameraBase.id) : null
  const selectedCameraSubjectDistance = selectedCameraEditablePose && selectedCameraTarget ? cameraSubjectDistance(selectedCameraEditablePose, selectedCameraTarget, selectedCameraBase?.targetAimPoint as TargetAimPoint | undefined) : null
  const selectedWallBase = sceneDocument.walls.find((wall) => wall.id === selectedEntityId) ?? null
  const selectedOpeningBase = sceneDocument.openings.find((opening) => opening.id === selectedEntityId) ?? null
  const selectedSunBase = sceneDocument.lights.find((sun) => sun.id === selectedEntityId) ?? null
  const selectedActor = selectedActorBase ? (suspendedTimelineEntityIds.has(selectedActorBase.id) ? selectedActorBase : { ...selectedActorBase, ...(evaluatedEntities[selectedActorBase.id] ?? {}) } as ActorDocument) : null
  const selectedProp = selectedPropBase ? (suspendedTimelineEntityIds.has(selectedPropBase.id) ? selectedPropBase : { ...selectedPropBase, ...(evaluatedEntities[selectedPropBase.id] ?? {}) }) : null
  const selectedCamera = selectedCameraBase ? (suspendedTimelineEntityIds.has(selectedCameraBase.id) ? selectedCameraBase : { ...selectedCameraBase, ...(evaluatedEntities[selectedCameraBase.id] ?? {}) } as CameraDocument) : null
  const selectedWall = selectedWallBase ? (suspendedTimelineEntityIds.has(selectedWallBase.id) ? selectedWallBase : { ...selectedWallBase, ...(evaluatedEntities[selectedWallBase.id] ?? {}) } as WallDocument) : null
  const selectedOpening = selectedOpeningBase ? (suspendedTimelineEntityIds.has(selectedOpeningBase.id) ? selectedOpeningBase : { ...selectedOpeningBase, ...(evaluatedEntities[selectedOpeningBase.id] ?? {}) } as OpeningDocument) : null
  const selectedSun = selectedSunBase ? (suspendedTimelineEntityIds.has(selectedSunBase.id) ? selectedSunBase : { ...selectedSunBase, ...(evaluatedEntities[selectedSunBase.id] ?? {}) } as SunDocument) : null
  const selectedTypeCounts = {
    Actor: sceneDocument.actors.filter((entity) => selectedEntityIds.includes(entity.id)).length,
    Prop: sceneDocument.props.filter((entity) => selectedEntityIds.includes(entity.id)).length,
    Wall: sceneDocument.walls.filter((entity) => selectedEntityIds.includes(entity.id)).length,
    Opening: sceneDocument.openings.filter((entity) => selectedEntityIds.includes(entity.id)).length,
    Camera: sceneDocument.cameras.filter((entity) => selectedEntityIds.includes(entity.id)).length,
    Sun: sceneDocument.lights.filter((entity) => selectedEntityIds.includes(entity.id)).length,
  }
  const timelineEntities = [
    ...sceneDocument.actors.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Actor' as const })),
    ...sceneDocument.props.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Prop' as const })),
    ...sceneDocument.walls.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Wall' as const })),
    ...sceneDocument.openings.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Opening' as const })),
    ...sceneDocument.lights.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Sun' as const })),
    ...sceneDocument.cameras.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Camera' as const })),
  ]
  const cameraTargetEntities = [
    ...sceneDocument.actors.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Actor' as const })),
    ...sceneDocument.props.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Prop' as const })),
    ...sceneDocument.walls.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Wall' as const })),
    ...sceneDocument.openings.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Opening' as const })),
    ...sceneDocument.cameras.map((entity) => ({ id: entity.id, name: entity.name, entityType: 'Camera' as const })),
  ]

  const formatTransform = (position: [number, number, number], rotation: [number, number, number]) => `P(${position.map((value) => value.toFixed(2)).join(',')}) R(${rotation.map((value) => value.toFixed(2)).join(',')})`

  useEffect(() => {
    projectDocumentRef.current = projectDocument
    sceneDocumentRef.current = sceneDocument
    selectedEntityIdRef.current = selectedEntityId
    selectedEntityIdsRef.current = selectedEntityIds
    selectedTimelineKeyframesRef.current = selectedTimelineKeyframes
    shortcutBindingsRef.current = shortcutBindings
    isDirtyRef.current = isDirty
    workspaceModeRef.current = workspaceMode
    timelineModeRef.current = timelineMode
    recentProjectsRef.current = recentProjects
  }, [projectDocument, sceneDocument, selectedEntityId, selectedEntityIds, selectedTimelineKeyframes, shortcutBindings, isDirty, workspaceMode, timelineMode, recentProjects])

  useEffect(() => {
    let active = true
    void platformAdapter.loadShortcutPreferences().then((preferences) => {
      if (active) setShortcutBindings(shortcutPreferencesWithDefaults(preferences))
    })
    return () => { active = false }
  }, [])

  const checkForUpdates = useCallback(async (showError = true): Promise<UpdateCheckResult | null> => {
    setUpdateState({ status: 'checking', currentVersion: APP_VERSION })
    try {
      const result = await checkLatestRelease(APP_VERSION)
      const detectedPlatform = typeof navigator !== 'undefined' ? platformForUserAgent(navigator.userAgent) : null
      const downloadPlatform = detectedPlatform && releaseHasAsset(result.release, detectedPlatform) ? detectedPlatform : null
      setUpdateState({ status: result.updateAvailable ? 'available' : 'up-to-date', currentVersion: result.currentVersion, latestVersion: result.latestVersion, notes: result.release.notes, downloadPlatform })
      return result
    } catch {
      if (showError) setUpdateState({ status: 'error', currentVersion: APP_VERSION })
      else setUpdateState({ status: 'idle', currentVersion: APP_VERSION })
      return null
    }
  }, [])

  useEffect(() => {
    if (platformAdapter.kind !== 'desktop') return
    let active = true
    void platformAdapter.loadUpdatePreferences().then((preferences) => {
      if (!active) return
      setUpdatePreferences(preferences)
      if (!preferences.autoCheck) return
      void checkForUpdates(false).then((result) => {
        if (active && result?.updateAvailable) setUpdateNotice(result)
      })
    })
    return () => { active = false }
  }, [checkForUpdates])

  const saveUpdatePreference = (autoCheck: boolean) => {
    const next = { autoCheck }
    setUpdatePreferences(next)
    void platformAdapter.saveUpdatePreferences(next)
  }

  const downloadUpdate = (result: UpdateCheckResult | null = null) => {
    const platform = updateState.downloadPlatform ?? (typeof navigator !== 'undefined' ? platformForUserAgent(navigator.userAgent) : null)
    if (!platform || !(result?.updateAvailable ?? updateState.status === 'available') || downloadStatus === 'opening') return
    setDownloadStatus('opening')
    setDownloadError(null)
    void openUpdateDownload(platformAdapter.openExternalUrl, platform).then(() => {
      setDownloadStatus('idle')
    }).catch((error: unknown) => {
      setDownloadStatus('error')
      setDownloadError('Couldn’t open the download in your browser.')
      if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Update download could not be opened', error)
    })
  }

  const dismissUpdate = () => {
    setUpdateNotice(null)
    setDownloadStatus('idle')
    setDownloadError(null)
    setUpdateState((current) => ({ ...current, status: 'idle', latestVersion: undefined, notes: undefined }))
  }

  useEffect(() => {
    if (platformAdapter.kind !== 'desktop') return
    let active = true
    void Promise.all([
      platformAdapter.loadRecoverySettings(),
      recoveryManagerRef.current.inspect(),
      platformAdapter.initialProjectPath(),
    ]).then(([settings, entries, startupPath]) => {
      if (!active) return
      recoveryManagerRef.current.setEnabled(settings.enabled)
      recoveryEntriesRef.current = entries
      setRecoveryEnabled(settings.enabled)
      setRecoveryEntries(entries)
      if (startupPath && entries.some((entry) => entry.projectPath && recoveryIdForProjectPath(entry.projectPath) === recoveryIdForProjectPath(startupPath))) {
        recoveryRequestedPathRef.current = startupPath
        setRecoveryRequestedPath(startupPath)
        setRecoveryModalOpen(true)
      } else if (!startupPath && entries.length > 0) {
        setRecoveryModalOpen(true)
      }
      setRecoveryReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      if (import.meta.env.DEV) console.error('[recovery] startup scan failed', error)
      setRecoveryReady(true)
    }).finally(() => {
      if (active) setRecoveryLoading(false)
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

  const setRecoveryPreference = (enabled: boolean) => {
    if (platformAdapter.kind !== 'desktop') return
    recoveryManagerRef.current.setEnabled(enabled)
    if (enabled && isDirtyRef.current) recoveryFingerprintRef.current = ''
    setRecoveryEnabled(enabled)
    void platformAdapter.saveRecoverySettings({ enabled })
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

  useEffect(() => {
    isLoopingRef.current = isLooping
  }, [isLooping])

  useEffect(() => {
    isMasterLoopingRef.current = isMasterLooping
  }, [isMasterLooping])

  const availableWorkspaceHeight = () => appShellRef.current?.getBoundingClientRect().height ?? window.innerHeight

  const setClampedTimelineHeight = (requestedHeight: number) => {
    setTimelineHeight(clampTimelineHeight(requestedHeight, availableWorkspaceHeight()))
  }

  const replaceProjectDocument = (next: ProjectDocument, options: { allowViewer?: boolean } = {}) => {
    if ((liveRoleRef.current === 'viewer' || liveRoleRef.current === 'editor') && !options.allowViewer) return
    projectDocumentRef.current = next
    setProjectDocument(next)
  }

  const liveStateSnapshot = (): LiveReviewState => ({
    ...defaultLiveReviewState(projectDocumentRef.current),
    workspace: view,
    activeSceneId: projectDocumentRef.current.activeSceneId,
    activeShotId: projectDocumentRef.current.activeShotId,
    activeCameraId: sceneDocumentRef.current.activeCameraId,
    timelineMode,
    sceneFrame: sceneDocumentRef.current.timeline.currentFrame,
    masterFrame,
    scenePlaying: isPlaying,
    masterPlaying: isMasterPlaying,
    stageViewMode: view === 'camera' ? 'camera' : 'blocking',
    cameraPreviewVisible: cameraPreview,
    shotListViewMode,
    shotListSceneFilter,
    presentMode: shotListPresentation,
    projectRevision: liveProjectRevisionRef.current,
  })

  const sendLiveState = (force = false) => {
    if (liveRoleRef.current !== 'host' || !liveTransportRef.current?.connected) return
    const now = Date.now()
    if (!force && now - liveLastStateSentAtRef.current < 150) return
    liveLastStateSentAtRef.current = now
    liveTransportRef.current?.send({ type: 'host_present_state', state: liveStateSnapshot() })
  }

  const publishLiveProject = (project: ProjectDocument) => {
    if (liveRoleRef.current !== 'host' || !liveTransportRef.current?.connected) return
    const snapshot = createLiveReviewSnapshot(project)
    if (snapshot.bytes > 16 * 1024 * 1024) {
      setLiveError('This project is too large for the Live Review relay limit.')
      return
    }
    liveProjectRevisionRef.current += 1
    liveProjectFingerprintRef.current = creativeProjectFingerprint(project)
    liveTransportRef.current?.send({ type: 'host_project_snapshot', revision: liveProjectRevisionRef.current, project: snapshot.project })
    sendLiveState(true)
  }

  const applyLiveProject = (project: ProjectDocument) => {
    if (liveTimelineEditActiveRef.current) {
      liveTimelineEditActiveRef.current = false
      liveTimelineEditTargetRef.current = null
      if (liveActiveLeaseRef.current?.targetType === 'Timeline') releaseLiveLease(liveActiveLeaseRef.current)
    }
    const scene = project.scenes.find((entry) => entry.id === project.activeSceneId) ?? project.scenes[0]
    if (!scene) return
    projectDocumentRef.current = project
    sceneDocumentRef.current = scene.scene
    setProjectDocument(project)
    setSelectedEntityId(null)
    setSelectedEntityIds([])
    setSelectedFrameGuideId(null)
    setSelectedTimelineKeyframes([])
    setSelectedCameraPathSegment(null)
    setShotListSelectedId(project.activeShotId)
    setIsDirty(false)
  }

  const applyLiveState = (state: LiveReviewState) => {
    const current = projectDocumentRef.current
    const sceneEntry = state.activeSceneId ? current.scenes.find((entry) => entry.id === state.activeSceneId) : current.scenes[0]
    if (!sceneEntry) return
    const preserveLocalTimelineFrame = liveRoleRef.current === 'editor' && liveTimelineEditActiveRef.current
    const nextScene = sceneEntry.scene === sceneDocumentRef.current && (preserveLocalTimelineFrame || sceneEntry.scene.timeline.currentFrame === state.sceneFrame) && sceneEntry.scene.activeCameraId === state.activeCameraId
      ? sceneEntry.scene
      : { ...sceneEntry.scene, activeCameraId: state.activeCameraId && sceneEntry.scene.cameras.some((camera) => camera.id === state.activeCameraId) ? state.activeCameraId : sceneEntry.scene.activeCameraId, timeline: { ...sceneEntry.scene.timeline, currentFrame: preserveLocalTimelineFrame ? sceneDocumentRef.current.timeline.currentFrame : Math.max(sceneEntry.scene.timeline.startFrame, Math.round(state.sceneFrame)) } }
    const nextProject = { ...current, activeSceneId: sceneEntry.id, activeShotId: state.activeShotId, scenes: current.scenes.map((entry) => entry.id === sceneEntry.id ? { ...entry, scene: nextScene } : entry) }
    projectDocumentRef.current = nextProject
    sceneDocumentRef.current = nextScene
    replaceProjectDocument(nextProject, { allowViewer: true })
    setView(state.workspace)
    setTimelineMode(state.timelineMode)
    setMasterFrame(Math.max(0, Math.round(state.masterFrame)))
    setIsPlaying(state.scenePlaying)
    setIsMasterPlaying(state.masterPlaying)
    setCameraPreview(state.cameraPreviewVisible)
    setShotListSelectedId(state.activeShotId)
    setShotListPresentation(state.presentMode)
    setShotListViewMode(state.shotListViewMode)
    setShotListSceneFilter(state.shotListSceneFilter)
  }

  const applyLiveTransform = (transform: LiveReviewTransform) => {
    if (transform.sceneId !== projectDocumentRef.current.activeSceneId) return
    const scene = sceneDocumentRef.current
    const nextScene = applySceneEntityTransform(scene, { entityId: transform.entityId, position: transform.position, rotation: transform.rotation, ...(transform.scale ? { scale: transform.scale } : {}) })
    if (nextScene === scene) return
    sceneDocumentRef.current = nextScene
    const nextProject = { ...projectDocumentRef.current, scenes: projectDocumentRef.current.scenes.map((entry) => entry.id === scene.metadata.id ? { ...entry, scene: nextScene } : entry) }
    replaceProjectDocument(nextProject, { allowViewer: true })
  }

  const applyLatestLiveHostState = () => {
    const project = liveLatestProjectRef.current
    const state = liveLatestStateRef.current
    if (project) applyLiveProject(project)
    if (state) applyLiveState(state)
    livePendingTransformsRef.current.forEach((transform) => applyLiveTransform(transform))
    livePendingTransformsRef.current.clear()
  }

  const publishLiveTransform = (transform: LiveReviewTransform) => {
    if (liveRoleRef.current !== 'host' || !liveTransportRef.current?.connected) return
    const existing = liveTransformThrottleRef.current.get(transform.entityId)
    if (existing) {
      existing.latest = transform
      return
    }
    const entry = { latest: transform, timer: null as number | null }
    liveTransformThrottleRef.current.set(transform.entityId, entry)
    liveTransportRef.current.send({ type: 'host_transform', transform })
    entry.timer = window.setTimeout(() => {
      const current = liveTransformThrottleRef.current.get(transform.entityId)
      if (!current) return
      if (current.latest !== transform) liveTransportRef.current?.send({ type: 'host_transform', transform: current.latest })
      liveTransformThrottleRef.current.delete(transform.entityId)
    }, 33)
  }

  const clearLiveTransformThrottle = () => {
    liveTransformThrottleRef.current.forEach((entry) => { if (entry.timer !== null) window.clearTimeout(entry.timer) })
    liveTransformThrottleRef.current.clear()
  }

  const liveEntityTypeForId = (entityId: string, scene = sceneDocumentRef.current): LiveReviewCollaborativeEntityType | null => {
    if (scene.actors.some((entity) => entity.id === entityId)) return 'Actor'
    if (scene.props.some((entity) => entity.id === entityId)) return 'Prop'
    if (scene.cameras.some((entity) => entity.id === entityId)) return 'Camera'
    return null
  }

  const liveEntityLabelForId = (entityId: string, scene = sceneDocumentRef.current): string => {
    return [...scene.actors, ...scene.props, ...scene.cameras].find((entity) => entity.id === entityId)?.name ?? entityId
  }

  const requestLiveLease = (targetType: LiveReviewCollaborativeEntityType | 'Shot' | 'Timeline', targetId: string, targetLabel: string, takeControl = false): Promise<LiveReviewLease | null> => {
    const role = liveRoleRef.current
    if ((role !== 'host' && role !== 'editor') || !liveTransportRef.current?.connected || (role === 'editor' && !liveHostConnected)) return Promise.resolve(null)
    const requestId = randomLiveReviewId(12)
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        liveLeaseRequestsRef.current.delete(requestId)
        setLiveError('The edit lease request timed out.')
        resolve(null)
      }, 2500)
      liveLeaseRequestsRef.current.set(requestId, { resolve, timer })
      liveTransportRef.current?.send(takeControl
        ? { type: 'lease_take_control', requestId, targetType, targetId, targetLabel }
        : { type: 'lease_request', requestId, targetType, targetId, targetLabel })
    })
  }

  const releaseLiveLease = (lease: LiveReviewLease | null = liveActiveLeaseRef.current) => {
    if (!lease) return
    if (liveRoleRef.current === 'host' || liveRoleRef.current === 'editor') liveTransportRef.current?.send({ type: 'lease_release', leaseId: lease.leaseId })
    if (liveActiveLeaseRef.current?.leaseId === lease.leaseId) liveActiveLeaseRef.current = null
  }

  const renewActiveLiveLease = () => {
    const lease = liveActiveLeaseRef.current
    const now = Date.now()
    if (!lease || !liveTransportRef.current?.connected || (liveRoleRef.current !== 'host' && liveRoleRef.current !== 'editor') || now - liveLeaseRenewedAtRef.current < 2000) return
    liveLeaseRenewedAtRef.current = now
    liveTransportRef.current.send({ type: 'lease_renew', leaseId: lease.leaseId })
  }

  const sendEditorTransformCommit = (change: StageTransform, lease: LiveReviewLease | null = liveActiveLeaseRef.current) => {
    const targetType = liveEntityTypeForId(change.entityId)
    if (!lease || !targetType || !liveTransportRef.current?.connected || liveRoleRef.current !== 'editor') return
    const commit: LiveReviewTransformCommit = {
      operationId: randomLiveReviewId(16),
      leaseId: lease.leaseId,
      sceneId: projectDocumentRef.current.activeSceneId,
      targetType,
      entityId: change.entityId,
      mode: transformTool === 'rotate' ? 'rotate' : transformTool === 'scale' ? 'scale' : 'move',
      position: change.position,
      rotation: change.rotation,
      scale: change.scale,
      baseProjectRevision: liveProjectRevisionRef.current,
    }
    liveTransportRef.current.send({ type: 'editor_transform_commit', commit })
  }

  const applyHostCollaborativeTransform = (commit: LiveReviewTransformCommit): LiveReviewEditResult => {
    if (commit.sceneId !== projectDocumentRef.current.activeSceneId) return { operationId: commit.operationId, accepted: false, reason: 'target_missing', projectRevision: liveProjectRevisionRef.current }
    const before = sceneDocumentRef.current
    const exists = commit.targetType === 'Actor' ? before.actors.some((entity) => entity.id === commit.entityId) : commit.targetType === 'Prop' ? before.props.some((entity) => entity.id === commit.entityId) : before.cameras.some((entity) => entity.id === commit.entityId)
    if (!exists) return { operationId: commit.operationId, accepted: false, reason: 'target_missing', projectRevision: liveProjectRevisionRef.current }
    const editedProperty: TimelineTransformCommit['editedProperty'] = commit.mode === 'move' ? 'position' : commit.mode === 'rotate' ? (commit.targetType === 'Actor' ? 'heading' : 'rotation') : commit.mode === 'scale' && commit.targetType === 'Prop' ? 'scale' : undefined
    const result = commitTimelineTransform(before, { entityId: commit.entityId, position: commit.position, rotation: commit.rotation, scale: commit.scale ?? [1, 1, 1], editedProperty })
    let after = { ...result.document, metadata: { ...result.document.metadata, updatedAt: new Date().toISOString() } }
    if (commit.targetType === 'Camera' && commit.mode === 'rotate') {
      const camera = before.cameras.find((entity) => entity.id === commit.entityId)
      if (camera?.lockTarget) after = { ...after, cameras: after.cameras.map((entity) => entity.id === commit.entityId ? { ...entity, lockTarget: false } : entity) }
    }
    recordAction(`Collaborative ${commit.mode} ${liveEntityLabelForId(commit.entityId, before)}`, before, selectedEntityIdRef.current, after, commit.entityId)
    const suspendedIds = new Set(suspendedTimelineEntityIds)
    if (result.suspendEvaluation) suspendedIds.add(commit.entityId)
    else suspendedIds.delete(commit.entityId)
    applyEditorSnapshot({ document: after, selectedEntityId: commit.entityId }, suspendedIds)
    publishLiveProject(projectDocumentRef.current)
    return { operationId: commit.operationId, accepted: true, projectRevision: liveProjectRevisionRef.current }
  }

  const canonicalTimelineProperty = (entityType: LiveReviewCollaborativeEntityType, property: LiveReviewTimelineProperty): TimelineProperty => entityType === 'Actor' && property === 'rotation' ? 'heading' : property

  const timelineLeaseTargetId = (sceneId: string, entityType: LiveReviewCollaborativeEntityType, entityId: string, property: LiveReviewTimelineProperty) => `${sceneId}:${entityType.toLowerCase()}:${entityId}:${property}`

  const requestTimelineLease = (sceneId: string, entityType: LiveReviewCollaborativeEntityType, entityId: string, property: LiveReviewTimelineProperty): Promise<LiveReviewLease | null> => {
    const targetId = timelineLeaseTargetId(sceneId, entityType, entityId, property)
    const active = liveActiveLeaseRef.current
    if (active?.targetType === 'Timeline' && active.targetId === targetId) return Promise.resolve(active)
    const pending = liveTimelineLeaseRequestsRef.current.get(targetId)
    if (pending) return pending
    const request = requestLiveLease('Timeline', targetId, `${entityType} ${liveEntityLabelForId(entityId)} · ${property}`).then((lease) => {
      if (lease && liveCanceledTimelineLeaseTargetsRef.current.delete(targetId)) {
        releaseLiveLease(lease)
        return null
      }
      return lease
    }).finally(() => {
      liveTimelineLeaseRequestsRef.current.delete(targetId)
    })
    liveTimelineLeaseRequestsRef.current.set(targetId, request)
    return request
  }

  const timelineEntityForCommit = (scene: SceneDocument, commit: LiveReviewTimelineCommit) => commit.entityType === 'Actor'
    ? scene.actors.find((entity) => entity.id === commit.entityId)
    : commit.entityType === 'Prop'
      ? scene.props.find((entity) => entity.id === commit.entityId)
      : scene.cameras.find((entity) => entity.id === commit.entityId)

  const timelineValueForCommit = (commit: LiveReviewTimelineCommit): ActorVector3 | undefined => commit.value ? [...commit.value] as ActorVector3 : undefined

  const applyHostCollaborativeTimeline = (commit: LiveReviewTimelineCommit): LiveReviewEditResult => {
    if (commit.sceneId !== projectDocumentRef.current.activeSceneId) return { operationId: commit.operationId, accepted: false, reason: 'target_missing', projectRevision: liveProjectRevisionRef.current }
    const before = sceneDocumentRef.current
    const entity = timelineEntityForCommit(before, commit)
    if (!entity) return { operationId: commit.operationId, accepted: false, reason: 'target_missing', projectRevision: liveProjectRevisionRef.current }
    const property = canonicalTimelineProperty(commit.entityType, commit.property)
    const track = before.timeline.tracks.find((candidate) => candidate.entityId === commit.entityId && candidate.property === property)
    let timeline = before.timeline
    if (commit.operation === 'add') {
      const frame = Math.max(before.timeline.startFrame, Math.round(commit.frame ?? before.timeline.currentFrame))
      const evaluated = evaluateTimeline(before, frame)[commit.entityId]
      const visibleEntity = evaluated ? { ...entity, ...evaluated } : entity
      const value = captureTimelineValue(visibleEntity, property)
      if (value === undefined) return { operationId: commit.operationId, accepted: false, reason: 'invalid_payload', projectRevision: liveProjectRevisionRef.current }
      timeline = upsertTimelineKeyframe(before.timeline, commit.entityId, commit.entityType, property, frame, value)
    } else if (!track || !commit.keyframeId || !track.keyframes.some((keyframe) => keyframe.id === commit.keyframeId)) {
      return { operationId: commit.operationId, accepted: false, reason: 'target_missing', projectRevision: liveProjectRevisionRef.current }
    } else if (commit.operation === 'move') {
      timeline = moveTimelineKeyframe(before.timeline, track.id, commit.keyframeId, commit.targetFrame ?? before.timeline.currentFrame)
    } else if (commit.operation === 'delete') {
      timeline = removeTimelineKeyframe(before.timeline, track.id, commit.keyframeId)
    } else {
      const source = track.keyframes.find((keyframe) => keyframe.id === commit.keyframeId)
      const vector = timelineValueForCommit(commit)
      const value = commit.entityType === 'Actor' && commit.property === 'rotation' ? vector?.[1] : vector
      if (!source || value === undefined) return { operationId: commit.operationId, accepted: false, reason: 'invalid_payload', projectRevision: liveProjectRevisionRef.current }
      timeline = upsertTimelineKeyframe(before.timeline, commit.entityId, commit.entityType, property, source.frame, value)
    }
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline }
    recordAction(`${commit.operation === 'add' ? 'Add' : commit.operation === 'move' ? 'Move' : commit.operation === 'delete' ? 'Delete' : 'Update'} ${commit.entityType} ${commit.property} keyframe`, before, selectedEntityIdRef.current, after, commit.entityId)
    applyEditorSnapshot({ document: after, selectedEntityId: commit.entityId })
    publishLiveProject(projectDocumentRef.current)
    return { operationId: commit.operationId, accepted: true, projectRevision: liveProjectRevisionRef.current }
  }

  const applyHostCollaborativeShotPatch = (patch: { operationId: string; shotId: string; field: LiveReviewShotField; value: string | null }): LiveReviewEditResult => {
    const current = projectDocumentRef.current
    const shot = current.shots.find((candidate) => candidate.id === patch.shotId)
    if (!shot) return { operationId: patch.operationId, accepted: false, reason: 'target_missing', projectRevision: liveProjectRevisionRef.current }
    if (patch.field === 'name' && !patch.value?.trim()) return { operationId: patch.operationId, accepted: false, reason: 'invalid_payload', projectRevision: liveProjectRevisionRef.current }
    const value = patch.field === 'name' ? patch.value?.trim() ?? '' : patch.value ?? ''
    if (patch.field === 'name') renameShot(patch.shotId, value)
    else if (patch.field === 'notes') updateShotNotes(patch.shotId, value)
    else updateShotMetadata(patch.shotId, { [patch.field]: value } as Partial<Pick<ShotDocument, 'shotSize' | 'angle' | 'movement' | 'equipment'>>)
    publishLiveProject(projectDocumentRef.current)
    return { operationId: patch.operationId, accepted: true, projectRevision: liveProjectRevisionRef.current }
  }

  const sendEditorShotPatch = async (shotId: string, field: LiveReviewShotField, value: string | null) => {
    const lease = await requestLiveLease('Shot', shotId, projectDocumentRef.current.shots.find((shot) => shot.id === shotId)?.name ?? shotId)
    if (!lease || !liveTransportRef.current?.connected) return
    liveTransportRef.current.send({ type: 'editor_shot_patch', patch: { operationId: randomLiveReviewId(16), leaseId: lease.leaseId, shotId, field, value, baseProjectRevision: liveProjectRevisionRef.current } })
  }

  const handleLiveMessage = (message: LiveReviewServerMessage) => {
    if (message.type === 'error') {
      setLiveError(message.message)
      return
    }
    if (message.type === 'presence') {
      setLiveViewerCount(message.viewers)
      setLiveHostConnected(message.hostConnected)
      return
    }
    if (message.type === 'presence_snapshot') {
      setLiveParticipants(message.participants)
      setLiveViewerCount(message.participants.filter((participant) => participant.role === 'viewer' && participant.status === 'connected').length)
      setLiveHostConnected(message.hostConnected)
      const own = message.participants.find((participant) => participant.participantId === liveTransportRef.current?.participantId)
      if (own && own.role !== liveRoleRef.current) { liveRoleRef.current = own.role; setLiveRole(own.role); if (own.role !== 'editor') { liveTimelineEditActiveRef.current = false; liveTimelineEditTargetRef.current = null } }
      return
    }
    if (message.type === 'presence_update') {
      setLiveParticipants((current) => {
        const without = current.filter((participant) => participant.participantId !== message.participant.participantId)
        return message.action === 'left' ? without : [...without, message.participant]
      })
      if (message.participant.participantId === liveTransportRef.current?.participantId) { liveRoleRef.current = message.participant.role; setLiveRole(message.participant.role); if (message.participant.role !== 'editor') { liveTimelineEditActiveRef.current = false; liveTimelineEditTargetRef.current = null } }
      return
    }
    if (message.type === 'role_updated') {
      setLiveParticipants((current) => current.map((participant) => participant.participantId === message.participant.participantId ? message.participant : participant))
      if (message.participant.participantId === liveTransportRef.current?.participantId) { liveRoleRef.current = message.participant.role; setLiveRole(message.participant.role); if (message.participant.role !== 'editor') { liveTimelineEditActiveRef.current = false; liveTimelineEditTargetRef.current = null } }
      return
    }
    if (message.type === 'session_snapshot') {
      const assignedRole = message.participants.find((participant) => participant.participantId === message.participantId)?.role ?? liveRoleRef.current
      if (assignedRole === 'viewer' && !liveBeforeProjectRef.current) liveBeforeProjectRef.current = projectDocumentRef.current
      liveRoleRef.current = assignedRole
      setLiveRole(assignedRole)
      liveProjectRevisionRef.current = message.projectRevision
      liveLatestProjectRef.current = message.project as ProjectDocument
      liveLatestStateRef.current = message.state
      setLiveParticipants(message.participants)
      setLiveViewerCount(message.participants.filter((participant) => participant.role === 'viewer' && participant.status === 'connected').length)
      setLiveChatMessages(message.chatHistory)
      setLivePointer(message.pointer)
      setLiveLeases(message.leases)
      setLiveHostConnected(message.hostConnected)
      if (assignedRole !== 'viewer' || liveFollowHostRef.current) {
        applyLiveProject(message.project as ProjectDocument)
        applyLiveState(message.state)
      }
      return
    }
    if (message.type === 'project_update') {
      liveProjectRevisionRef.current = message.revision
      liveLatestProjectRef.current = message.project as ProjectDocument
      if (liveRoleRef.current !== 'viewer' || liveFollowHostRef.current) applyLiveProject(message.project as ProjectDocument)
      return
    }
    if (message.type === 'present_state') {
      liveLatestStateRef.current = message.state
      if (liveRoleRef.current !== 'viewer' || liveFollowHostRef.current) applyLiveState(message.state)
      return
    }
    if (message.type === 'transform_update') {
      if (liveRoleRef.current === 'viewer' && !liveFollowHostRef.current) livePendingTransformsRef.current.set(message.transform.entityId, message.transform)
      else applyLiveTransform(message.transform)
      return
    }
    if (message.type === 'transform_preview') {
      if (message.preview.participantId !== liveTransportRef.current?.participantId) applyLiveTransform(message.preview)
      return
    }
    if (message.type === 'lease_granted') {
      const pending = liveLeaseRequestsRef.current.get(message.requestId)
      if (pending) {
        window.clearTimeout(pending.timer)
        liveLeaseRequestsRef.current.delete(message.requestId)
        pending.resolve(message.lease)
      }
      liveActiveLeaseRef.current = message.lease.participantId === liveTransportRef.current?.participantId ? message.lease : liveActiveLeaseRef.current
      setLiveLeases((current) => [...current.filter((lease) => lease.targetKey !== message.lease.targetKey), message.lease])
      return
    }
    if (message.type === 'lease_denied') {
      const pending = liveLeaseRequestsRef.current.get(message.requestId)
      if (pending) {
        window.clearTimeout(pending.timer)
        liveLeaseRequestsRef.current.delete(message.requestId)
        pending.resolve(null)
      }
      setLiveError(`Edit lease unavailable: ${message.reason.replaceAll('_', ' ')}.`)
      return
    }
    if (message.type === 'lease_update') {
      if (message.lease) setLiveLeases((current) => [...current.filter((lease) => lease.targetKey !== message.lease?.targetKey), message.lease!])
      else if (message.targetKey) setLiveLeases((current) => current.filter((lease) => lease.targetKey !== message.targetKey))
      else setLiveLeases([])
      if (!message.lease && message.targetKey && liveActiveLeaseRef.current?.targetKey === message.targetKey) liveActiveLeaseRef.current = null
      return
    }
    if (message.type === 'lease_snapshot') {
      setLiveLeases(message.leases)
      return
    }
    if (message.type === 'host_editing_paused') {
      setLiveHostConnected(!message.paused)
      if (message.paused) setLiveError('Host disconnected. Collaborative editing is paused until the Host reconnects.')
      return
    }
    if (message.type === 'edit_transform_request') {
      if (liveRoleRef.current === 'host') {
        const result = applyHostCollaborativeTransform(message.commit)
        liveTransportRef.current?.send({ type: 'host_edit_result', result })
      }
      return
    }
    if (message.type === 'edit_shot_request') {
      if (liveRoleRef.current === 'host') {
        const result = applyHostCollaborativeShotPatch(message.patch)
        liveTransportRef.current?.send({ type: 'host_edit_result', result })
      }
      return
    }
    if (message.type === 'edit_timeline_request') {
      if (liveRoleRef.current === 'host') {
        const result = applyHostCollaborativeTimeline(message.commit)
        liveTransportRef.current?.send({ type: 'host_edit_result', result })
      }
      return
    }
    if (message.type === 'edit_result') {
      if (!message.result.accepted) {
        setLiveError(`Edit rejected: ${(message.result.reason ?? 'unknown error').replaceAll('_', ' ')}.`)
        liveTransportRef.current?.send({ type: 'request_snapshot' })
      }
      if (liveActiveLeaseRef.current) releaseLiveLease(liveActiveLeaseRef.current)
      return
    }
    if (message.type === 'host_pointer') {
      setLivePointer(message.pointer)
      return
    }
    if (message.type === 'chat_history') {
      setLiveChatMessages(message.messages)
      return
    }
    if (message.type === 'chat_message') {
      setLiveChatMessages((current) => [...current.filter((entry) => entry.messageId !== message.message.messageId), message.message].slice(-100))
      return
    }
    if (message.type === 'session_ended') {
      setLiveError(message.reason)
      liveTransportRef.current?.close()
      if (liveRoleRef.current === 'viewer' && liveBeforeProjectRef.current) {
        applyLiveProject(liveBeforeProjectRef.current)
        setIsDirty(liveBeforeDirtyRef.current)
      }
      liveBeforeProjectRef.current = null
      liveRoleRef.current = null
      setLiveRole(null)
      setLiveSession(null)
      setLiveParticipants([])
      setLiveLeases([])
      setLiveHostConnected(false)
      setLiveChatMessages([])
      setLivePointer(null)
      liveLatestProjectRef.current = null
      liveLatestStateRef.current = null
      livePendingTransformsRef.current.clear()
      liveActiveLeaseRef.current = null
      liveTimelineLeaseRequestsRef.current.clear()
      liveCanceledTimelineLeaseTargetsRef.current.clear()
      liveTimelineEditActiveRef.current = false
      liveTimelineEditTargetRef.current = null
      return
    }
    if (message.type === 'host_disconnected') { liveTimelineEditActiveRef.current = false; liveTimelineEditTargetRef.current = null; liveActiveLeaseRef.current = null; setLiveHostConnected(false); setLiveError('The Host disconnected. The review will reconnect if the Host returns.') }
  }

  useEffect(() => {
    const transport = new LiveReviewTransport(undefined, { onStatus: (status, message) => { setLiveStatus(status); if (message) setLiveError(message) }, onMessage: handleLiveMessage })
    liveTransportRef.current = transport
    return () => { clearLiveTransformThrottle(); transport.close(); liveTransportRef.current = null }
  }, [])

  const startLiveReview = async (displayName = 'Host') => {
    setLiveError(null)
    setLivePanelOpen(true)
    try {
      const response = await liveTransportRef.current?.createSession(displayName)
      if (!response) throw new Error('The Live Review transport is unavailable.')
      liveRoleRef.current = 'host'
      setLiveRole('host')
      liveFollowHostRef.current = true
      setLiveFollowHost(true)
      setLiveSession(response.session)
      setLiveParticipants(response.participants)
      setLiveViewerCount(response.participants.filter((participant) => participant.role === 'viewer' && participant.status === 'connected').length)
      setLiveChatMessages(response.chatHistory)
      setLivePointer(response.pointer)
      const invite = typeof window === 'undefined' ? response.session : buildLiveReviewInviteUrl(window.location.href, response.session)
      setLiveInviteUrl(invite)
      liveProjectRevisionRef.current = 0
      liveProjectFingerprintRef.current = null
      publishLiveProject(projectDocumentRef.current)
      sendLiveState(true)
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : 'The Live Review session could not be started.')
    }
  }

  const joinLiveReview = async (displayName = 'Guest') => {
    if (!liveInviteSession) return
    setLiveError(null)
    setLivePanelOpen(true)
    liveBeforeProjectRef.current = projectDocumentRef.current
    liveBeforeDirtyRef.current = isDirtyRef.current
    liveRoleRef.current = 'viewer'
    setLiveRole('viewer')
    try {
      await liveTransportRef.current?.joinSession(liveInviteSession, displayName)
      setLiveSession(liveInviteSession)
      liveFollowHostRef.current = true
      setLiveFollowHost(true)
    } catch (error) {
      liveRoleRef.current = null
      setLiveRole(null)
      setLiveError(error instanceof Error ? error.message : 'The Live Review session could not be joined.')
    }
  }

  const leaveLiveReview = () => {
    if (liveRoleRef.current === 'host') clearLivePointer()
    liveTransportRef.current?.send({ type: 'leave_session' })
    liveTransportRef.current?.close()
    clearLiveTransformThrottle()
    if (liveRoleRef.current === 'viewer' && liveBeforeProjectRef.current) {
      applyLiveProject(liveBeforeProjectRef.current)
      setIsDirty(liveBeforeDirtyRef.current)
    }
    liveBeforeProjectRef.current = null
    liveRoleRef.current = null
    setLiveRole(null)
    setLiveSession(null)
    setLiveInviteUrl(null)
    setLiveViewerCount(0)
    setLiveParticipants([])
      setLiveLeases([])
      setLiveHostConnected(false)
    setLiveChatMessages([])
    setLivePointer(null)
    setLivePointerActive(false)
    liveFollowHostRef.current = true
    setLiveFollowHost(true)
    liveLatestProjectRef.current = null
    liveLatestStateRef.current = null
    livePendingTransformsRef.current.clear()
    liveActiveLeaseRef.current = null
    liveTimelineLeaseRequestsRef.current.clear()
    liveCanceledTimelineLeaseTargetsRef.current.clear()
    liveTimelineEditActiveRef.current = false
    liveTimelineEditTargetRef.current = null
    setLiveError(null)
  }

  const endLiveReview = () => {
    liveTransportRef.current?.send({ type: 'end_session' })
    leaveLiveReview()
  }

  const changeLiveFollowHost = (follow: boolean) => {
    liveFollowHostRef.current = follow
    setLiveFollowHost(follow)
    if (follow) applyLatestLiveHostState()
  }

  const publishLivePointer = (pointer: LiveReviewPointer) => {
    if (liveRoleRef.current !== 'host' || !liveTransportRef.current?.connected) return
    const now = Date.now()
    if (pointer.visible && now - livePointerSentAtRef.current < 33) return
    livePointerSentAtRef.current = now
    const participantId = liveTransportRef.current.participantId
    const next = { ...pointer, participantId, displayName: liveTransportRef.current.participantDisplayName, updatedAt: now }
    liveTransportRef.current.send({ type: 'host_pointer', pointer: next })
  }

  const clearLivePointer = () => {
    publishLivePointer({ participantId: '', displayName: '', x: 0, y: 0, surface: 'stage', visible: false, updatedAt: Date.now() })
    setLivePointer(null)
  }

  const sendLiveChat = (text: string) => {
    if (liveRoleRef.current && liveTransportRef.current?.connected) liveTransportRef.current.send({ type: 'chat_send', text })
  }

  const changeLiveParticipantRole = (participantId: string, role: 'editor' | 'viewer') => {
    if (liveRoleRef.current === 'host') liveTransportRef.current?.send({ type: 'participant_role_update', participantId, role })
  }

  const takeLiveLeaseControl = (lease: LiveReviewLease) => {
    if (liveRoleRef.current !== 'host') return
    liveTransportRef.current?.send({ type: 'lease_take_control', requestId: randomLiveReviewId(12), targetType: lease.targetType, targetId: lease.targetId, targetLabel: lease.targetLabel })
  }

  useEffect(() => {
    publishLiveProjectRef.current = publishLiveProject
    sendLiveStateRef.current = sendLiveState
  })

  useEffect(() => {
    if (liveRole !== 'host' || liveStatus !== 'live') return
    const fingerprint = creativeProjectFingerprint(projectDocument)
    if (fingerprint !== liveProjectFingerprintRef.current) publishLiveProjectRef.current(projectDocument)
  }, [projectDocument, liveRole, liveStatus])

  useEffect(() => {
    if (liveRole !== 'host' || liveStatus !== 'live') return
    sendLiveStateRef.current()
  }, [view, projectDocument.activeSceneId, projectDocument.activeShotId, sceneDocument.activeCameraId, sceneDocument.timeline.currentFrame, timelineMode, masterFrame, isPlaying, isMasterPlaying, cameraPreview, shotListViewMode, shotListSceneFilter, shotListPresentation, liveRole, liveStatus])

  useEffect(() => {
    if (liveInviteSession && !liveRole) {
      setWorkspaceMode('editor')
      if (!livePanelOpen) setLivePanelOpen(true)
    }
  }, [liveInviteSession, liveRole, livePanelOpen])

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

  const stopPlaybackSession = useCallback((clearReview = true) => {
    if (playbackFrameRequestRef.current !== null) window.cancelAnimationFrame(playbackFrameRequestRef.current)
    playbackFrameRequestRef.current = null
    playbackRef.current = null
    playbackRangeRef.current = null
    setIsPlaying(false)
    if (clearReview) {
      cameraMoveReviewRef.current = null
      setCameraMoveReview(null)
      shotReviewRef.current = null
      setShotReview(null)
    }
  }, [setCameraMoveReview, setIsPlaying, setShotReview])

  const syncMasterAudio = useCallback((frame: number, shouldPlay: boolean) => {
    const sequence = projectDocumentRef.current.masterSequence
    const music = sequence.musicClip
    const file = masterMusicFileRef.current
    if (!music || !file || typeof Audio === 'undefined') {
      masterAudioRef.current?.pause()
      return
    }
    if (!masterAudioRef.current) {
      masterAudioUrlRef.current = URL.createObjectURL(file)
      masterAudioRef.current = new Audio(masterAudioUrlRef.current)
      masterAudioRef.current.preload = 'auto'
    }
    const rate = masterSequenceFrameRate(sequence, projectDocumentRef.current.shots, projectDocumentRef.current.scenes, sceneDocumentRef.current.timeline.frameRate).rate
    const resolved = resolveMasterMusicTime(sequence, frame, rate)
    const audio = masterAudioRef.current
    if (!resolved) {
      audio.pause()
      return
    }
    if (Math.abs(audio.currentTime - resolved.sourceSeconds) > .12) audio.currentTime = resolved.sourceSeconds
    if (shouldPlay) void audio.play().catch(() => {})
    else audio.pause()
  }, [])

  const restoreMasterMusicAsset = async (project: ProjectDocument) => {
    const music = project.masterSequence.musicClip
    if (!music) return
    try {
      const file = await loadMusicAsset(project.id, music.asset.id)
      if (!file) {
        if (projectDocumentRef.current.id !== project.id) return
        setSceneFileError('Music metadata loaded, but its stored audio asset is unavailable. Re-import Music to restore waveform and audition.')
        return
      }
      const decoded = await decodeMusicFile(file)
      const current = projectDocumentRef.current
      if (current.id !== project.id || current.masterSequence.musicClip?.id !== music.id) return
      masterMusicFileRef.current = file
      setMasterMusicPeaks(decoded.peaks)
    } catch {
      if (projectDocumentRef.current.id !== project.id) return
      setSceneFileError('Music metadata loaded, but its stored audio asset could not be restored. Re-import Music to restore waveform and audition.')
    }
  }

  const stopMasterPlayback = (reset = false) => {
    if (masterPlaybackRequestRef.current !== null) window.cancelAnimationFrame(masterPlaybackRequestRef.current)
    masterPlaybackRequestRef.current = null
    masterPlaybackStartRef.current = null
    setIsMasterPlaying(false)
    syncMasterAudio(reset ? 0 : masterFrame, false)
    if (reset) setMasterFrame(0)
  }

  const playMasterPlayback = () => {
    const current = projectDocumentRef.current
    const range = effectiveMasterRenderRange(current.masterSequence)
    if (range.endFrame <= range.startFrame) return
    const rate = masterSequenceFrameRate(current.masterSequence, current.shots, current.scenes, sceneDocumentRef.current.timeline.frameRate).rate
    const currentFrame = playbackStartFrame(masterFrame, range.startFrame, range.endFrame)
    masterPlaybackStartRef.current = performance.now() - currentFrame * rate.denominator / rate.numerator * 1000
    setMasterFrame(currentFrame)
    syncMasterAudio(currentFrame, true)
    setIsMasterPlaying(true)
  }

  const pauseMasterPlayback = () => {
    setIsMasterPlaying(false)
    if (masterPlaybackRequestRef.current !== null) window.cancelAnimationFrame(masterPlaybackRequestRef.current)
    masterPlaybackRequestRef.current = null
    syncMasterAudio(masterFrame, false)
  }

  const toggleMasterPlayback = () => {
    if (isMasterPlaying) pauseMasterPlayback()
    else playMasterPlayback()
  }

  useEffect(() => {
    if (!isMasterPlaying || timelineMode !== 'master') {
      if (masterPlaybackRequestRef.current !== null) window.cancelAnimationFrame(masterPlaybackRequestRef.current)
      masterPlaybackRequestRef.current = null
      return
    }
    const tick = (now: number) => {
      const current = projectDocumentRef.current
      const range = effectiveMasterRenderRange(current.masterSequence)
      const rate = masterSequenceFrameRate(current.masterSequence, current.shots, current.scenes, sceneDocumentRef.current.timeline.frameRate).rate
      const start = masterPlaybackStartRef.current ?? now
      const rawFrame = Math.floor((now - start) / 1000 * rate.numerator / rate.denominator)
      if (range.endFrame <= range.startFrame) {
        masterPlaybackRequestRef.current = null
        masterPlaybackStartRef.current = null
        setIsMasterPlaying(false)
        syncMasterAudio(0, false)
        return
      }
      if (isMasterLoopingRef.current) {
        const span = range.endFrame - range.startFrame
        const frame = range.startFrame + ((rawFrame - range.startFrame) % span + span) % span
        const resolved = resolveMasterFrame(current.masterSequence, current.shots, frame)
        void resolved
        setMasterFrame(frame)
        syncMasterAudio(frame, true)
        masterPlaybackRequestRef.current = window.requestAnimationFrame(tick)
        return
      }
      if (rawFrame >= range.endFrame) {
        const lastFrame = range.endFrame - 1
        setMasterFrame(lastFrame)
        masterPlaybackRequestRef.current = null
        masterPlaybackStartRef.current = null
        setIsMasterPlaying(false)
        syncMasterAudio(lastFrame, false)
        return
      }
      const frame = rawFrame
      const resolved = resolveMasterFrame(current.masterSequence, current.shots, frame)
      void resolved
      setMasterFrame(frame)
      syncMasterAudio(frame, true)
      masterPlaybackRequestRef.current = window.requestAnimationFrame(tick)
    }
    masterPlaybackRequestRef.current = window.requestAnimationFrame(tick)
    return () => { if (masterPlaybackRequestRef.current !== null) window.cancelAnimationFrame(masterPlaybackRequestRef.current) }
  }, [isMasterPlaying, syncMasterAudio, timelineMode])

  const switchTimelineMode = (mode: 'scene' | 'master') => {
    if (mode === timelineMode) return
    stopPlaybackSession()
    stopMasterPlayback()
    if (mode === 'master') {
      setSelectedEntityId(null)
      setSelectedEntityIds([])
      setSelectedFrameGuideId(null)
      setSelectedCameraPathSegment(null)
      setSuspendedTimelineEntityIds(new Set())
      setSuspendedTimelineProperties({})
    }
    setTimelineMode(mode)
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
    selectedEntityIdsRef.current = snapshot.selectedEntityId ? [snapshot.selectedEntityId] : []
    updateActiveSceneDocument(snapshot.document)
    setSelectedEntityId(snapshot.selectedEntityId)
    setSelectedEntityIds(snapshot.selectedEntityId ? [snapshot.selectedEntityId] : [])
    setSuspendedTimelineEntityIds(suspendedIds)
  }

  const setCurrentFrame = (frame: number) => {
    if (isPlayingRef.current) return
    setFrameWithoutPlayback(frame)
  }

  const setFrameWithoutPlayback = (frame: number) => {
    const before = sceneDocumentRef.current
    // The Timeline canvas may be scrubbed into the visible workspace after the
    // shot boundary. Playback remains bounded by Mark Out; manual inspection
    // can remain beyond the current duration so a key can extend the shot.
    const currentFrame = Math.max(before.timeline.startFrame, Math.round(frame))
    if (currentFrame === before.timeline.currentFrame) return
    const after = { ...before, timeline: { ...before.timeline, currentFrame } }
    setSuspendedTimelineEntityIds(new Set())
    sceneDocumentRef.current = after
    updateActiveSceneDocument(after, false)
  }

  const handleCameraPathKeyframeSelect = (keyframe: CameraPathKeyframe) => {
    handleSelectionChange(keyframe.cameraId)
    selectTimelineKeyframe({ trackId: keyframe.trackId, keyframeId: keyframe.keyframeId }, false)
    setCurrentFrame(keyframe.frame)
  }

  const handleCameraPathSegmentSelect = (segment: CameraPathSegmentSelection) => {
    if (cameraMoveReviewRef.current || shotReviewRef.current) stopPlaybackSession()
    handleSelectionChange(segment.cameraId)
    setSelectedCameraPathSegment(segment)
    selectTimelineKeyframe({ trackId: segment.trackId, keyframeId: segment.fromKeyframeId }, false)
  }

  const handleCameraPathRetime = (selection: CameraPathSegmentSelection, durationSeconds: number, mode: CameraRetimeMode): string | null => {
    const before = sceneDocumentRef.current
    const segment = cameraPathSegmentForSelection(before.timeline, selection)
    if (!segment || !Number.isFinite(durationSeconds)) return 'The selected Camera move segment is no longer available.'
    const fps = before.timeline.frameRate.numerator / before.timeline.frameRate.denominator
    const durationFrames = Math.max(1, Math.round(durationSeconds * fps))
    const result = retimeCameraPathSegment(before.timeline, selection, durationFrames, mode)
    if (!result.changed) return result.reason ?? 'The Camera move could not be retimed.'
    const currentFrame = before.timeline.currentFrame === segment.to.frame ? result.targetFrame : before.timeline.currentFrame
    const timeline = { ...result.timeline, currentFrame }
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline }
    recordAction(`Retime Camera Move · ${mode === 'moveEnd' ? 'Move End' : 'Ripple Following'}`, before, selectedEntityIdRef.current, after, selection.cameraId)
    applyEditorSnapshot({ document: after, selectedEntityId: selection.cameraId })
    return result.reason
  }

  const handleCameraPathPointMoveStart = (keyframe: CameraPathKeyframe) => {
    cameraPathTransactionRef.current = { before: sceneDocumentRef.current, cameraId: keyframe.cameraId, keyframe }
  }

  const handleCameraPathPointMoveEnd = (keyframe: CameraPathKeyframe, position: [number, number, number]) => {
    const transaction = cameraPathTransactionRef.current
    cameraPathTransactionRef.current = null
    if (!transaction) return
    const before = transaction.before
    const track = before.timeline.tracks.find((candidate) => candidate.id === keyframe.trackId)
    const source = track?.keyframes.find((candidate) => candidate.id === keyframe.keyframeId)
    if (!track || !source) return
    const previous = Array.isArray(source.value) ? source.value : null
    if (previous && previous.every((value, index) => Math.abs(Number(value) - position[index]) < 1e-8)) return
    const timeline = upsertTimelineKeyframe(before.timeline, keyframe.cameraId, 'Camera', 'position', source.frame, position)
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline }
    recordAction(`Move Camera path point · frame ${source.frame}`, before, selectedEntityIdRef.current, after, keyframe.cameraId)
    applyEditorSnapshot({ document: after, selectedEntityId: keyframe.cameraId })
  }

  const changeTimelineDuration = (durationFrames: number) => {
    const before = sceneDocumentRef.current
    const furthestKey = before.timeline.tracks.reduce((furthest, track) => Math.max(furthest, ...track.keyframes.map((keyframe) => keyframe.frame)), before.timeline.startFrame)
    const minimum = Math.max(1, before.timeline.markOut - before.timeline.startFrame, furthestKey - before.timeline.startFrame)
    const duration = Math.max(minimum, Math.round(durationFrames))
    if (duration === timelineDurationFrames(before.timeline)) return
    const previousDurationEnd = before.timeline.startFrame + timelineDurationFrames(before.timeline)
    const marksFollowDuration = before.timeline.markIn === before.timeline.startFrame && before.timeline.markOut === previousDurationEnd
    const nextEndFrame = before.timeline.startFrame + duration
    const after = { ...before, timeline: { ...before.timeline, durationFrames: duration, endFrame: nextEndFrame, markOut: marksFollowDuration ? nextEndFrame : Math.min(before.timeline.markOut, nextEndFrame) } }
    recordAction('Change Timeline Duration', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const recordAction = (label: string, before: SceneDocument, beforeSelection: string | null, after: SceneDocument, afterSelection: string | null) => {
    historyRef.current.record({
      label,
      before: { document: before, selectedEntityId: beforeSelection },
      after: { document: after, selectedEntityId: afterSelection },
    })
    if (creativeSceneChanged(before, after)) setIsDirty(true)
  }

  const refreshRecoveryEntries = async () => {
    if (platformAdapter.kind !== 'desktop') return
    try {
      const entries = await recoveryManagerRef.current.inspect()
      recoveryEntriesRef.current = entries
      setRecoveryEntries(entries)
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error('[recovery] refresh failed', error)
    }
  }

  const currentRecoveryId = () => currentRecoveryIdRef.current ?? (currentProjectPathRef.current ? recoveryIdForProjectPath(currentProjectPathRef.current) : unsavedRecoveryIdRef.current)

  const discardCurrentRecovery = async () => {
    if (platformAdapter.kind !== 'desktop') return
    await recoveryManagerRef.current.cleanup(currentRecoveryId())
    currentRecoveryIdRef.current = null
    dirtySinceRef.current = null
    unsavedRecoveryIdRef.current = createUnsavedRecoveryId()
    await refreshRecoveryEntries()
  }

  const resetEditorForProject = (project: ProjectDocument, clean = true, currentPath = currentProjectPathRef.current) => {
    stopPlaybackSession()
    stopMasterPlayback()
    setSuspendedTimelineEntityIds(new Set())
    setSuspendedTimelineProperties({})
    setTransformingEntityId(null)
    transformTransactionRef.current = null
    cameraPathTransactionRef.current = null
    setSelectedFrameGuideId(null)
    selectedTimelineKeyframesRef.current = []
    setSelectedTimelineKeyframes([])
    setSelectedCameraPathSegment(null)
    setCameraMoveReview(null)
    setShotReview(null)
    setTimelineMode('scene')
    setMasterSelection(null)
    setMasterFrame(0)
    setIsMasterLooping(false)
    setMasterMusicPeaks(null)
    masterMusicFileRef.current = null
    masterAudioRef.current?.pause()
    if (masterAudioUrlRef.current) URL.revokeObjectURL(masterAudioUrlRef.current)
    masterAudioRef.current = null
    masterAudioUrlRef.current = null
    setSceneFileError(null)
    historyRef.current = new EditorHistory(100)
    const active = project.scenes.find((entry) => entry.id === project.activeSceneId) ?? project.scenes[0]
    const normalizedProject = { ...project, activeShotId: project.shots.find((shot) => shot.id === project.activeShotId && shot.sceneId === active.id)?.id ?? null }
    sceneDocumentRef.current = active.scene
    currentProjectPathRef.current = currentPath
    currentRecoveryIdRef.current = currentPath ? recoveryIdForProjectPath(currentPath) : unsavedRecoveryIdRef.current
    replaceProjectDocument(normalizedProject)
    void restoreMasterMusicAsset(normalizedProject)
    setSelectedEntityId(null)
    setSelectedEntityIds([])
    setSuspendedTimelineEntityIds(new Set())
    setSuspendedTimelineProperties({})
    if (clean) savedProjectFingerprintRef.current = creativeProjectFingerprint(normalizedProject)
    recoveryFingerprintRef.current = creativeProjectFingerprint(normalizedProject)
    dirtySinceRef.current = clean ? null : new Date().toISOString()
    setIsDirty(!clean)
  }

  const switchScene = (sceneId: string, activatingShotId: string | null = null) => {
    const current = projectDocumentRef.current
    if (current.activeSceneId === sceneId) return
    const target = current.scenes.find((entry) => entry.id === sceneId)
    if (!target) return
    stopPlaybackSession()
    setTransformingEntityId(null)
    transformTransactionRef.current = null
    cameraPathTransactionRef.current = null
    historyRef.current = new EditorHistory(100)
    setSelectedEntityId(null)
    setSelectedEntityIds([])
    setSelectedFrameGuideId(null)
    selectedTimelineKeyframesRef.current = []
    setSelectedTimelineKeyframes([])
    setSelectedCameraPathSegment(null)
    setCameraMoveReview(null)
    setSuspendedTimelineEntityIds(new Set())
    setSuspendedTimelineProperties({})
    sceneDocumentRef.current = target.scene
    replaceProjectDocument({ ...current, activeSceneId: target.id, activeShotId: activatingShotId })
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

  const captureProjectThumbnail = (path: string, project: ProjectDocument) => {
    if (platformAdapter.kind !== 'desktop' || !thumbnailCaptureRef.current) return
    const entry = recentProjectsRef.current.find((candidate) => recentProjectIdentity(candidate.path) === recentProjectIdentity(path))
    const key = entry?.thumbnailKey ?? recentProjectThumbnailKey(path)
    void captureAndStoreProjectThumbnail({
      path,
      key,
      project,
      capture: async () => thumbnailCaptureRef.current?.() ?? null,
      save: platformAdapter.saveProjectThumbnail,
      onReady: async (thumbnailKey, blob) => {
        const dataUrl = await blobToDataUrl(blob)
        setRecentProjectThumbnails((current) => ({ ...current, [thumbnailKey]: dataUrl }))
        await platformAdapter.saveRecentProjects(recentProjectsRef.current)
      },
      log: import.meta.env.DEV ? (message, details) => console.info(`[thumbnail] ${message}`, details ?? '') : undefined,
    }).then((result) => {
      if (import.meta.env.DEV && result.status === 'skipped') console.info('[thumbnail]', result.reason, { projectPath: path, key })
    })
  }

  const saveProject = async (): Promise<boolean> => {
    const savedAt = new Date().toISOString()
    const previousRecoveryId = currentRecoveryId()
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
      dirtySinceRef.current = null
      recoveryFingerprintRef.current = creativeProjectFingerprint(prepared)
      if (result.path) {
        currentRecoveryIdRef.current = recoveryIdForProjectPath(result.path)
        await recoveryManagerRef.current.cleanup(previousRecoveryId)
        await updateRecentForProject(result.path, prepared)
        captureProjectThumbnail(result.path, prepared)
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
    const previousRecoveryId = currentRecoveryId()
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
      dirtySinceRef.current = null
      recoveryFingerprintRef.current = creativeProjectFingerprint(prepared)
      if (result.path) {
        currentRecoveryIdRef.current = recoveryIdForProjectPath(result.path)
        await recoveryManagerRef.current.cleanup(previousRecoveryId)
        await updateRecentForProject(result.path, prepared, savedAt, previousPath ?? undefined)
        captureProjectThumbnail(result.path, prepared)
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
      if (choice === 'discard' && decision === 'close') {
        await discardCurrentRecovery()
        setIsDirty(false)
      }
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

  const recoverProject = async (entry: RecoveryInspection) => {
    try {
      const recovered = await recoveryManagerRef.current.recover(entry.recoveryId)
      if (!recovered) throw new Error('Recovery snapshot is no longer available.')
      currentRecoveryIdRef.current = entry.recoveryId
      if (!entry.projectPath) unsavedRecoveryIdRef.current = entry.recoveryId
      resetEditorForProject(recovered.project, false, entry.projectPath)
      recoveryRequestedPathRef.current = null
      setRecoveryRequestedPath(null)
      setRecoveryModalOpen(false)
      setView('blocking')
      setWorkspaceMode('editor')
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error('[recovery] recover failed', error)
      setRecentProjectsError('This recovery snapshot could not be opened.')
      await refreshRecoveryEntries()
    }
  }

  const discardRecoveryEntry = async (entry: RecoveryInspection) => {
    const wasRequested = Boolean(recoveryRequestedPathRef.current && entry.projectPath && recoveryIdForProjectPath(entry.projectPath) === recoveryIdForProjectPath(recoveryRequestedPathRef.current))
    await recoveryManagerRef.current.cleanup(entry.recoveryId)
    await refreshRecoveryEntries()
    if (wasRequested && entry.projectPath) {
      recoveryRequestedPathRef.current = null
      setRecoveryRequestedPath(null)
      setRecoveryModalOpen(false)
      await openDesktopProjectPath(entry.projectPath)
    } else if (recoveryEntriesRef.current.length === 0) {
      setRecoveryModalOpen(false)
    }
  }

  const openSavedVersion = async (entry: RecoveryInspection) => {
    if (!entry.projectPath || !window.confirm('Open the saved Project and discard this recovery copy?')) return
    await discardRecoveryEntry(entry)
  }

  const loadProject = async () => {
    try {
      await openProjectFile(await platformAdapter.openProjectFile())
    } catch (error: unknown) {
      setSceneFileError(error instanceof ProjectFileError || error instanceof PlatformFileError ? error.message : 'This Project file could not be opened.')
    }
  }

  const newProject = async () => {
    if (isDirty) {
      if (platformAdapter.promptUnsavedClose) {
        const choice = await platformAdapter.promptUnsavedClose()
        if (choice === 'cancel') return
        if (choice === 'save' && !await saveProject()) return
        if (choice === 'discard') await discardCurrentRecovery()
      } else if (!window.confirm('Discard unsaved Project changes and start a New Project?')) return
    }
    unsavedRecoveryIdRef.current = createUnsavedRecoveryId()
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
    if (platformAdapter.kind !== 'desktop' || !recoveryReady) return
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
      if (startupPath && recoveryRequestedPathRef.current !== startupPath) await openDesktopProjectPath(startupPath)
    }).catch(() => {})
    return () => {
      active = false
      unlistenOpen?.()
      unlistenDrop?.()
    }
  }, [recoveryReady])

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
      try {
        await recoveryManagerRef.current.reassociate(recoveryIdForProjectPath(entry.path), recoveryIdForProjectPath(nextPath), nextPath)
      } catch (error: unknown) {
        if (import.meta.env.DEV) console.warn('[recovery] rename reassociation failed', error)
      }
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
      await recoveryManagerRef.current.cleanup(recoveryIdForProjectPath(entry.path))
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
    if (exportAbortRef.current) {
      setExportError('Cancel the video export before returning to Projects.')
      return
    }
    if (isDirtyRef.current) {
      const choice = platformAdapter.promptUnsavedClose ? await platformAdapter.promptUnsavedClose() : 'cancel'
      const decision = closeDecisionForUnsavedChoice(choice, choice !== 'save' || await saveProject())
      if (decision === 'cancel') return
      if (choice === 'discard') {
        await discardCurrentRecovery()
        setIsDirty(false)
      }
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
    const dependentShots = current.shots.filter((shot) => shot.sceneId === sceneId)
    if (dependentShots.length > 0 && !window.confirm(`This Scene is referenced by ${dependentShots.length} Shot${dependentShots.length === 1 ? '' : 's'}. Delete those Shots with the Scene?`)) return
    const scenes = current.scenes.filter((entry) => entry.id !== sceneId)
    const activeSceneId = current.activeSceneId === sceneId ? scenes[Math.min(index, scenes.length - 1)].id : current.activeSceneId
    const shots = current.shots.filter((shot) => shot.sceneId !== sceneId).map((shot, shotIndex) => ({ ...shot, order: shotIndex }))
    const removedShotIds = new Set(dependentShots.map((shot) => shot.id))
    const masterSequence = { ...current.masterSequence, clips: current.masterSequence.clips.filter((clip) => !removedShotIds.has(clip.shotId)).map((clip, clipIndex) => ({ ...clip, order: clipIndex })) }
    const activeShotId = current.activeShotId && shots.some((shot) => shot.id === current.activeShotId) ? current.activeShotId : null
    const next = { ...current, updatedAt: new Date().toISOString(), scenes, activeSceneId, shots, masterSequence, activeShotId }
    if (masterSelection?.kind === 'clip' && !masterSequence.clips.some((clip) => clip.id === masterSelection.id)) setMasterSelection(null)
    if (activeSceneId !== current.activeSceneId) resetEditorForProject(next, false)
    else {
      replaceProjectDocument(next)
      setIsDirty(true)
    }
  }

  const activateShot = (shotId: string) => {
    const current = projectDocumentRef.current
    const shot = current.shots.find((item) => item.id === shotId)
    if (!shot) return
    const target = current.scenes.find((entry) => entry.id === shot.sceneId)
    if (!target) {
      replaceProjectDocument({ ...current, activeShotId: shot.id })
      setSceneFileError(`Shot “${shot.name}” references a missing Scene.`)
      return
    }
    stopPlaybackSession()
    setSelectedEntityId(null)
    setSelectedEntityIds([])
    setSelectedFrameGuideId(null)
    selectedTimelineKeyframesRef.current = []
    setSelectedTimelineKeyframes([])
    setSelectedCameraPathSegment(null)
    setCameraMoveReview(null)
    setSuspendedTimelineEntityIds(new Set())
    setSuspendedTimelineProperties({})
    if (current.activeSceneId !== shot.sceneId) switchScene(shot.sceneId, shot.id)
    const project = projectDocumentRef.current
    const scene = sceneDocumentRef.current
    const camera = shot.cameraId ? scene.cameras.find((item) => item.id === shot.cameraId) ?? null : null
    const nextScene = camera
      ? { ...scene, activeCameraId: camera.id, timeline: { ...scene.timeline, currentFrame: Math.max(scene.timeline.startFrame, Math.min(scene.timeline.endFrame, shot.startFrame)) } }
      : { ...scene, timeline: { ...scene.timeline, currentFrame: Math.max(scene.timeline.startFrame, Math.min(scene.timeline.endFrame, shot.startFrame)) } }
    sceneDocumentRef.current = nextScene
    replaceProjectDocument({ ...project, activeShotId: shot.id, scenes: project.scenes.map((entry) => entry.id === project.activeSceneId ? { ...entry, scene: nextScene } : entry) })
    if (camera) {
      setSelectedEntityId(camera.id)
      setSelectedEntityIds([camera.id])
      setSelectedFrameGuideId(resolveFrameGuideSelection(camera.frameGuides, null))
      setSceneFileError(null)
    } else {
      setSceneFileError(`Shot “${shot.name}” has a missing Camera reference.`)
    }
    setView('blocking')
  }

  const createShotFromCurrentSetup = () => {
    const current = sceneDocumentRef.current
    const selectedCamera = selectedEntityIdRef.current ? current.cameras.find((camera) => camera.id === selectedEntityIdRef.current) : null
    const camera = selectedCamera ?? current.cameras.find((item) => item.id === current.activeCameraId) ?? null
    if (!camera) {
      setSceneFileError('Create Shot requires an active or selected Camera.')
      return
    }
    const range = shotCreationRange(current.timeline)
    const id = createShotId(new Set(projectDocumentRef.current.shots.map((shot) => shot.id)))
    const shot = createShotDocument({ id, name: nextShotName(projectDocumentRef.current.shots), sceneId: projectDocumentRef.current.activeSceneId, cameraId: camera.id, startFrame: range.startFrame, endFrame: range.endFrame, order: projectDocumentRef.current.shots.length, notes: '', thumbnail: null })
    const nextScene = current.activeCameraId === camera.id ? current : { ...current, activeCameraId: camera.id }
    sceneDocumentRef.current = nextScene
    const next = { ...projectDocumentRef.current, updatedAt: new Date().toISOString(), scenes: projectDocumentRef.current.scenes.map((entry) => entry.id === projectDocumentRef.current.activeSceneId ? { ...entry, scene: nextScene } : entry), shots: [...projectDocumentRef.current.shots, shot], activeShotId: shot.id }
    replaceProjectDocument(next)
    setSelectedEntityId(camera.id)
    setSelectedEntityIds([camera.id])
    setIsDirty(true)
    setSceneFileError(null)
    setView('blocking')
    void captureShotThumbnail(id)
  }

  function renameShot(shotId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = projectDocumentRef.current
    if (!current.shots.some((shot) => shot.id === shotId)) return
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots: current.shots.map((shot) => shot.id === shotId ? { ...shot, name: trimmed } : shot) })
    setIsDirty(true)
  }

  const duplicateShot = (shotId: string) => {
    const current = projectDocumentRef.current
    const index = current.shots.findIndex((shot) => shot.id === shotId)
    if (index < 0) return
    const source = current.shots[index]
    const copy = { ...source, id: createShotId(new Set(current.shots.map((shot) => shot.id))), name: duplicateShotName(source.name), thumbnail: source.thumbnail ? { ...source.thumbnail } : null }
    const shots = [...current.shots.slice(0, index + 1), copy, ...current.shots.slice(index + 1)].map((shot, order) => ({ ...shot, order }))
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots, activeShotId: copy.id })
    setIsDirty(true)
    activateShot(copy.id)
    setIsDirty(true)
  }

  const deleteShot = (shotId: string) => {
    const current = projectDocumentRef.current
    const shot = current.shots.find((item) => item.id === shotId)
    if (!shot || !window.confirm(`Delete ${shot.name}?`)) return
    const dependentClips = current.masterSequence.clips.filter((clip) => clip.shotId === shotId)
    if (dependentClips.length > 0 && !window.confirm(`This Shot is used by ${dependentClips.length} Master clip${dependentClips.length === 1 ? '' : 's'}. Delete the Shot and remove those Master clips?`)) return
    const shots = current.shots.filter((item) => item.id !== shotId).map((item, order) => ({ ...item, order }))
    const nextMasterSequence = dependentClips.reduce((sequence, clip) => removeMasterClip(sequence, clip.id), current.masterSequence)
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots, masterSequence: nextMasterSequence, activeShotId: current.activeShotId === shotId ? null : current.activeShotId })
    if (masterSelection?.kind === 'clip' && dependentClips.some((clip) => clip.id === masterSelection.id)) setMasterSelection(null)
    setIsDirty(true)
  }

  const addShotToMaster = (shotId: string, index?: number) => {
    if (isMasterPlaying) stopMasterPlayback(false)
    const current = projectDocumentRef.current
    const shot = current.shots.find((item) => item.id === shotId)
    const scene = shot ? current.scenes.find((entry) => entry.id === shot.sceneId) : null
    if (!shot || !scene) {
      setSceneFileError('This Shot cannot be added because its Scene is missing.')
      return
    }
    const fallbackRate = sceneDocumentRef.current.timeline.frameRate
    const currentRate = masterSequenceFrameRate(current.masterSequence, current.shots, current.scenes, fallbackRate).rate
    if (current.masterSequence.clips.length > 0 && !sameFrameRate(currentRate, scene.scene.timeline.frameRate)) {
      setSceneFileError('Master Sequence requires all Shots to use the same FPS.')
      return
    }
    const nextSequence = insertMasterClipAt(current.masterSequence, shot, index ?? current.masterSequence.clips.length)
    const newClip = nextSequence.clips.find((clip) => !current.masterSequence.clips.some((existing) => existing.id === clip.id))
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence: nextSequence })
    if (newClip) setMasterSelection({ kind: 'clip', id: newClip.id })
    switchTimelineMode('master')
    setSceneFileError(null)
    setIsDirty(true)
  }

  const selectMasterClip = (clipId: string, frame: number) => {
    setMasterSelection({ kind: 'clip', id: clipId })
    setMasterFrame(frame)
  }

  const selectMasterMusic = () => {
    const musicClip = projectDocumentRef.current.masterSequence.musicClip
    if (musicClip) setMasterSelection({ kind: 'music', id: musicClip.id })
  }

  const setMasterPlayhead = (frame: number) => {
    const current = projectDocumentRef.current
    const total = masterSequenceDurationFrames(current.masterSequence)
    const clamped = total > 0 ? Math.max(0, Math.min(total - 1, Math.round(frame))) : 0
    setMasterFrame(clamped)
    syncMasterAudio(clamped, isMasterPlaying)
  }

  const clampMasterFrame = (sequence: typeof projectDocument.masterSequence, frame: number) => {
    const total = masterSequenceDurationFrames(sequence)
    return total > 0 ? Math.max(0, Math.min(total - 1, Math.round(frame))) : 0
  }

  const returnMasterToStart = () => {
    stopMasterPlayback(false)
    setMasterFrame(0)
    syncMasterAudio(0, false)
  }

  const changeMasterMark = (kind: 'in' | 'out') => {
    const current = projectDocumentRef.current
    const masterSequence = setMasterSequenceMark(current.masterSequence, kind, masterFrame)
    if (masterSequence.markInFrame === current.masterSequence.markInFrame && masterSequence.markOutFrame === current.masterSequence.markOutFrame) return
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence })
    setIsDirty(true)
  }

  const duplicateMasterClipAction = (clipId: string) => {
    if (isMasterPlaying) stopMasterPlayback(false)
    const current = projectDocumentRef.current
    const sequence = duplicateMasterClip(current.masterSequence, clipId)
    if (!sequence) return
    const newClip = sequence.clips.find((clip) => !current.masterSequence.clips.some((existing) => existing.id === clip.id))
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence: sequence })
    if (newClip) setMasterSelection({ kind: 'clip', id: newClip.id })
    setIsDirty(true)
  }

  const removeMasterClipAction = (clipId: string) => {
    if (isMasterPlaying) stopMasterPlayback(false)
    const current = projectDocumentRef.current
    if (!current.masterSequence.clips.some((clip) => clip.id === clipId)) return
    const masterSequence = removeMasterClip(current.masterSequence, clipId)
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence })
    const clampedFrame = clampMasterFrame(masterSequence, masterFrame)
    setMasterFrame(clampedFrame)
    syncMasterAudio(clampedFrame, false)
    if (masterSelection?.kind === 'clip' && masterSelection.id === clipId) setMasterSelection(null)
    setIsDirty(true)
  }

  const reorderMasterClipAction = (clipId: string, index: number) => {
    if (isMasterPlaying) stopMasterPlayback(false)
    const current = projectDocumentRef.current
    const next = reorderMasterClip(current.masterSequence, clipId, index)
    if (!next) return
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence: next })
    setIsDirty(true)
  }

  const trimMasterClip = (clipId: string, sourceStartFrame: number, sourceEndFrame: number) => {
    if (isMasterPlaying) stopMasterPlayback(false)
    const current = projectDocumentRef.current
    const clip = current.masterSequence.clips.find((item) => item.id === clipId)
    const shot = clip ? current.shots.find((item) => item.id === clip.shotId) : null
    if (!clip || !shot) return
    const sequence = updateMasterClipRange(current.masterSequence, clipId, shot, sourceStartFrame, sourceEndFrame)
    if (!sequence) {
      setSceneFileError('Master Clip trim must remain inside the source Shot range.')
      return
    }
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence: sequence })
    const clampedFrame = clampMasterFrame(sequence, masterFrame)
    setMasterFrame(clampedFrame)
    syncMasterAudio(clampedFrame, false)
    setSceneFileError(null)
    setIsDirty(true)
  }

  const openMasterClip = (clipId: string) => {
    const current = projectDocumentRef.current
    const clip = current.masterSequence.clips.find((item) => item.id === clipId)
    if (!clip || !current.shots.some((shot) => shot.id === clip.shotId)) return
    setMasterSelection({ kind: 'clip', id: clipId })
    activateShot(clip.shotId)
    setFrameWithoutPlayback(clip.sourceStartFrame)
    setTimelineMode('scene')
  }

  const importMasterMusic = async (file: File) => {
    if (projectDocumentRef.current.masterSequence.musicClip && !window.confirm('Replace the current music bed?')) return
    try {
      if (isMasterPlaying) stopMasterPlayback(false)
      const decoded = await decodeMusicFile(file)
      if (!Number.isFinite(decoded.durationSeconds) || decoded.durationSeconds <= 0) throw new Error('Music duration is invalid.')
      masterAudioRef.current?.pause()
      if (masterAudioUrlRef.current) URL.revokeObjectURL(masterAudioUrlRef.current)
      masterAudioRef.current = null
      masterAudioUrlRef.current = null
      masterMusicFileRef.current = file
      setMasterMusicPeaks(decoded.peaks)
      const current = projectDocumentRef.current
      const musicClip = createMusicClip(file, decoded.durationSeconds)
      let sidecarStored = false
      try {
        sidecarStored = await saveMusicAsset(current.id, musicClip.asset.id, file)
      } catch {
        // The current browser session remains usable even when IndexedDB is unavailable.
      }
      replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence: { ...current.masterSequence, musicClip } })
      setMasterSelection({ kind: 'music', id: musicClip.id })
      switchTimelineMode('master')
      setSceneFileError(sidecarStored ? null : 'Music imported for this session, but browser storage is unavailable. Re-import it after reopening this project to restore waveform and audition.')
      setIsDirty(true)
    } catch {
      setSceneFileError('This music file could not be decoded for waveform generation.')
    }
  }

  const updateMasterMusic = (patch: { startMasterFrame?: number; sourceStartSeconds?: number; sourceEndSeconds?: number }) => {
    if (isMasterPlaying) stopMasterPlayback(false)
    const current = projectDocumentRef.current
    const clip = current.masterSequence.musicClip
    if (!clip) return
    const startMasterFrame = patch.startMasterFrame === undefined ? clip.startMasterFrame : Math.max(0, Math.round(patch.startMasterFrame))
    const sourceStartSeconds = patch.sourceStartSeconds === undefined ? clip.sourceStartSeconds : Math.max(0, patch.sourceStartSeconds)
    const sourceEndSeconds = patch.sourceEndSeconds === undefined ? clip.sourceEndSeconds : Math.min(clip.durationSeconds, patch.sourceEndSeconds)
    if (sourceEndSeconds <= sourceStartSeconds) return
    const musicClip = { ...clip, startMasterFrame, sourceStartSeconds, sourceEndSeconds }
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence: { ...current.masterSequence, musicClip } })
    setIsDirty(true)
  }

  const removeMasterMusic = () => {
    if (isMasterPlaying) stopMasterPlayback(false)
    const current = projectDocumentRef.current
    const music = current.masterSequence.musicClip
    if (!music) return
    void deleteMusicAsset(current.id, music.asset.id).catch(() => undefined)
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), masterSequence: { ...current.masterSequence, musicClip: null } })
    if (masterSelection?.kind === 'music') setMasterSelection(null)
    setMasterMusicPeaks(null)
    masterMusicFileRef.current = null
    masterAudioRef.current?.pause()
    if (masterAudioUrlRef.current) URL.revokeObjectURL(masterAudioUrlRef.current)
    masterAudioRef.current = null
    masterAudioUrlRef.current = null
    setIsDirty(true)
  }

  const moveShot = (shotId: string, direction: -1 | 1) => {
    const current = projectDocumentRef.current
    const index = current.shots.findIndex((shot) => shot.id === shotId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= current.shots.length) return
    const shots = [...current.shots]
    const [moved] = shots.splice(index, 1)
    shots.splice(targetIndex, 0, moved)
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots: shots.map((shot, order) => ({ ...shot, order })) })
    setIsDirty(true)
  }

  const reorderShot = (shotId: string, targetIndex: number) => {
    const current = projectDocumentRef.current
    const shots = reorderShotDocuments(current.shots, shotId, targetIndex)
    if (shots.every((shot, index) => shot.id === current.shots[index]?.id)) return
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots })
    setShotListSelectedId(shotId)
    setIsDirty(true)
  }

  function updateShotNotes(shotId: string, notes: string) {
    const current = projectDocumentRef.current
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots: current.shots.map((shot) => shot.id === shotId ? { ...shot, notes } : shot) })
    setIsDirty(true)
  }

  function updateShotMetadata(shotId: string, patch: Partial<Pick<ShotDocument, 'shotSize' | 'angle' | 'movement' | 'equipment'>>) {
    const current = projectDocumentRef.current
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots: current.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot) })
    setIsDirty(true)
  }

  const updateShotListSettings = (nextSettings: ShotListSettings) => {
    const current = projectDocumentRef.current
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), settings: { ...current.settings, shotList: normalizeShotListSettings(nextSettings) } })
    setIsDirty(true)
  }

  const updateShotRange = (shotId: string, requestedStart: number, requestedEnd: number) => {
    if (!Number.isFinite(requestedStart) || !Number.isFinite(requestedEnd)) return
    const current = projectDocumentRef.current
    const shot = current.shots.find((item) => item.id === shotId)
    const scene = shot ? current.scenes.find((entry) => entry.id === shot.sceneId)?.scene : null
    if (!shot || !scene) return
    const start = Math.max(scene.timeline.startFrame, Math.min(scene.timeline.endFrame - 1, Math.round(requestedStart)))
    const end = Math.max(start + 1, Math.min(scene.timeline.endFrame, Math.round(requestedEnd)))
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots: current.shots.map((item) => item.id === shotId ? { ...item, startFrame: start, endFrame: end } : item) })
    setIsDirty(true)
  }

  const captureShotThumbnail = async (shotId: string) => {
    const project = projectDocumentRef.current
    const shot = project.shots.find((item) => item.id === shotId)
    if (!shot) return
    const scene = sceneDocumentRef.current
    if (!project.scenes.some((entry) => entry.id === shot.sceneId)) {
      setSceneFileError(`Shot “${shot.name}” references a missing Scene.`)
      return
    }
    const frame = resolveShotThumbnailFrame(shot, { activeSceneId: project.activeSceneId, activeCameraId: scene.activeCameraId, currentFrame: scene.timeline.currentFrame })
    if (frame === null) {
      const sameProductionContext = project.activeSceneId === shot.sceneId && scene.activeCameraId === shot.cameraId
      setSceneFileError(sameProductionContext ? 'Move the playhead inside this Shot range to capture a thumbnail.' : 'Select this Shot and make its production Camera active before capturing a thumbnail.')
      return
    }
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    const blob = await thumbnailCaptureRef.current?.()
    if (!blob) { setSceneFileError('Shot thumbnail capture is unavailable for this Camera.'); return }
    const compact = await compactShotThumbnail(blob)
    const current = projectDocumentRef.current
    replaceProjectDocument({ ...current, updatedAt: new Date().toISOString(), shots: current.shots.map((item) => item.id === shotId ? { ...item, thumbnail: { ...compact, frame }, thumbnailFrame: frame } : item) })
    setIsDirty(true)
    setSceneFileError(null)
  }

  const previewShot = (shotId: string) => {
    activateShot(shotId)
    const shot = projectDocumentRef.current.shots.find((item) => item.id === shotId)
    if (!shot) return
    const range = { startFrame: shot.startFrame, endFrame: shot.endFrame }
    const review: ShotReviewState = { shotId, sceneId: shot.sceneId, range }
    shotReviewRef.current = review
    setShotReview(review)
    setFrameWithoutPlayback(range.startFrame)
    playbackRangeRef.current = range
    playbackRef.current = createPlaybackClock(range.startFrame, performance.now())
    setIsPlaying(true)
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

  const handleViewChange = (nextView: 'blocking' | 'camera' | 'shot-list') => {
    setView(nextView)
    if (nextView !== 'blocking' && wallDrawing) exitWallDrawing()
    if (nextView === 'shot-list') {
      stopPlaybackSession()
      stopMasterPlayback()
      setShotListPresentation(false)
      if (!shotListSelectedId) setShotListSelectedId(projectDocumentRef.current.shots[0]?.id ?? null)
    }
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

  const exportShotList = async (format: 'csv' | 'xlsx', scope: ShotListExportScope) => {
    const project = projectDocumentRef.current
    const settings = normalizeShotListSettings(project.settings.shotList)
    try {
      if (format === 'csv') {
        await saveGeneratedFile(new Blob([buildShotListCsv(project, settings, scope)], { type: 'text/csv;charset=utf-8' }), shotListExportFilename(project.name, 'csv'), 'csv')
      } else {
        const { buildShotListXlsx } = await import('./export/shotListXlsx')
        await saveGeneratedFile(await buildShotListXlsx(project, settings, scope), shotListExportFilename(project.name, 'xlsx'), 'xlsx')
      }
      setSceneFileError(null)
    } catch (error: unknown) {
      setSceneFileError(error instanceof Error ? `Shot List export failed: ${error.message}` : 'Shot List export failed.')
    }
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
    const nextCameras = before.cameras.filter((item) => item.id !== entityId).map((item) => item.targetEntityId === entityId ? { ...item, targetEntityId: null, targetAimPoint: 'center' as const, lockTarget: false } : item)
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
    if (before.cameras.some((camera) => camera.id === entityId)) {
      const affected = projectDocumentRef.current.shots.filter((shot) => shot.cameraId === entityId).length
      if (affected > 0) {
        replaceProjectDocument({ ...projectDocumentRef.current, updatedAt: new Date().toISOString(), shots: projectDocumentRef.current.shots.map((shot) => shot.cameraId === entityId ? { ...shot, cameraId: null } : shot) })
        setSceneFileError(`${affected} Shot${affected === 1 ? '' : 's'} now show Missing Camera.`)
        setIsDirty(true)
      }
    }
  }

  const deleteSelectedEntities = () => {
    const ids = [...selectedEntityIdsRef.current]
    if (ids.length < 2) {
      if (ids[0]) deleteEntity(ids[0])
      return
    }
    const before = sceneDocumentRef.current
    const selected = [...before.actors, ...before.props, ...before.walls, ...before.openings, ...before.cameras, ...before.lights].filter((entity) => ids.includes(entity.id))
    if (selected.length === 0 || !window.confirm(`Delete ${selected.length} selected items?`)) return
    const idSet = new Set(selected.map((entity) => entity.id))
    const nextCameras = before.cameras.filter((item) => !idSet.has(item.id)).map((item) => item.targetEntityId && idSet.has(item.targetEntityId) ? { ...item, targetEntityId: null, targetAimPoint: 'center' as const, lockTarget: false } : item)
    const next = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      actors: before.actors.filter((item) => !idSet.has(item.id)),
      props: before.props.filter((item) => !idSet.has(item.id)),
      walls: before.walls.filter((item) => !idSet.has(item.id)),
      // Remove wall-attached openings with a deleted wall as one atomic action;
      // this avoids leaving a structurally invalid opening or silently detaching it.
      openings: before.openings.filter((item) => !idSet.has(item.id) && !idSet.has(item.wallId ?? '')),
      cameras: nextCameras,
      activeCameraId: before.activeCameraId && idSet.has(before.activeCameraId) ? (nextCameras[0]?.id ?? null) : before.activeCameraId,
      lights: before.lights.filter((item) => !idSet.has(item.id)),
      timeline: { ...before.timeline, tracks: before.timeline.tracks.filter((track) => !idSet.has(track.entityId) && !(track.entityType === 'Opening' && before.openings.some((opening) => opening.id === track.entityId && idSet.has(opening.wallId ?? '')))) },
    }
    recordAction(`Delete ${selected.length} items`, before, selectedEntityIdRef.current, next, null)
    applyEditorSnapshot({ document: next, selectedEntityId: null })
    const deletedCameraIds = new Set(selected.filter((entity) => before.cameras.some((camera) => camera.id === entity.id)).map((entity) => entity.id))
    if (deletedCameraIds.size > 0) {
      const affected = projectDocumentRef.current.shots.filter((shot) => shot.cameraId && deletedCameraIds.has(shot.cameraId)).length
      if (affected > 0) {
        replaceProjectDocument({ ...projectDocumentRef.current, updatedAt: new Date().toISOString(), shots: projectDocumentRef.current.shots.map((shot) => shot.cameraId && deletedCameraIds.has(shot.cameraId) ? { ...shot, cameraId: null } : shot) })
        setSceneFileError(`${affected} Shot${affected === 1 ? '' : 's'} now show Missing Camera.`)
        setIsDirty(true)
      }
    }
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
    if (before.activeCameraId === cameraId || !before.cameras.some((camera) => camera.id === cameraId)) return
    setSelectedFrameGuideId((current) => resolveFrameGuideSelection(before.cameras.find((camera) => camera.id === cameraId)?.frameGuides ?? [], current))
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, activeCameraId: cameraId }
    recordAction('Set Active Camera', before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const updateCamera = (cameraId: string, changes: Partial<CameraDocument>, options: { disableLockOnRotation?: boolean } = {}) => {
    const before = sceneDocumentRef.current
    const camera = before.cameras.find((item) => item.id === cameraId)
    if (!camera) return
    let effectiveChanges: Partial<CameraDocument> = changes.rotation !== undefined && camera.lockTarget && options.disableLockOnRotation !== false ? { ...changes, lockTarget: false } : changes
    if (changes.targetAimPoint !== undefined && camera.lockTarget) {
      const target = cameraBlockingTarget(before, camera)
      const editable = currentEditableCameraPose(before, cameraId)
      if (target && editable) effectiveChanges = { ...effectiveChanges, rotation: cameraAimRotation(editable, target, changes.targetAimPoint as TargetAimPoint) }
    }
    const tracks = before.timeline.tracks.filter((track) => track.entityId === cameraId)
    const positionAnimated = effectiveChanges.position !== undefined && tracks.some((track) => track.property === 'position' && track.keyframes.length > 0)
    const rotationAnimated = effectiveChanges.rotation !== undefined && tracks.some((track) => track.property === 'rotation' && track.keyframes.length > 0)
    const shouldSuspendForFocal = effectiveChanges.focalLengthMm !== undefined && tracks.some((track) => track.property === 'focalLengthMm' && track.keyframes.length > 0)
    const shouldUseEvaluated = positionAnimated || rotationAnimated || shouldSuspendForFocal
    const editableCamera = currentEditableCameraPose(before, cameraId)
    const visibleCamera = editableCamera && shouldUseEvaluated ? {
      ...camera,
      ...(positionAnimated ? { position: editableCamera.position } : {}),
      ...(rotationAnimated ? { rotation: editableCamera.rotation } : {}),
      ...(shouldSuspendForFocal ? { focalLengthMm: editableCamera.focalLengthMm } : {}),
    } : camera
    const nextCamera = { ...visibleCamera, ...effectiveChanges, ...((effectiveChanges.cameraDefinitionId !== undefined || effectiveChanges.captureModeId !== undefined) ? { cameraSnapshot: undefined } : {}) }
    let nextTimeline = before.timeline
    if (positionAnimated && effectiveChanges.position) nextTimeline = upsertTimelineKeyframe(nextTimeline, cameraId, 'Camera', 'position', before.timeline.currentFrame, effectiveChanges.position)
    if (rotationAnimated && effectiveChanges.rotation) nextTimeline = upsertTimelineKeyframe(nextTimeline, cameraId, 'Camera', 'rotation', before.timeline.currentFrame, effectiveChanges.rotation)
    const after = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      cameras: before.cameras.map((item) => item.id === cameraId ? nextCamera : item),
      timeline: nextTimeline,
    }
    recordAction(`Update ${camera.name}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    const suspendedIds = new Set(suspendedTimelineEntityIds)
    if (shouldSuspendForFocal) suspendedIds.add(cameraId)
    else suspendedIds.delete(cameraId)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current }, suspendedIds)
  }

  const sendEditorEntityChange = async (entityId: string, changes: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: [number, number, number] }) => {
    if (liveRoleRef.current !== 'editor') return
    const scene = sceneDocumentRef.current
    const targetType = liveEntityTypeForId(entityId, scene)
    if (!targetType) return
    const entity = targetType === 'Actor' ? scene.actors.find((candidate) => candidate.id === entityId) : targetType === 'Prop' ? scene.props.find((candidate) => candidate.id === entityId) : scene.cameras.find((candidate) => candidate.id === entityId)
    if (!entity) return
    const lease = await requestLiveLease(targetType, entityId, entity.name)
    if (!lease || !liveTransportRef.current?.connected) return
    const position = changes.position ?? entity.position
    const rotation = changes.rotation ?? entity.rotation
    const scale = 'scale' in entity ? (changes.scale ?? entity.scale) : undefined
    const mode = changes.scale !== undefined ? 'scale' : changes.rotation !== undefined ? 'rotate' : 'move'
    liveTransportRef.current.send({ type: 'editor_transform_commit', commit: { operationId: randomLiveReviewId(16), leaseId: lease.leaseId, sceneId: projectDocumentRef.current.activeSceneId, targetType, entityId, mode, position, rotation, ...(scale ? { scale } : {}), baseProjectRevision: liveProjectRevisionRef.current } })
  }

  const updateActorForRole = (actorId: string, changes: Partial<ActorDocument>) => {
    if (liveRoleRef.current === 'editor') {
      void sendEditorEntityChange(actorId, { position: changes.position, rotation: changes.rotation })
      return
    }
    if (!canEditLiveTarget('Actor', actorId)) return
    updateActor(actorId, changes)
  }

  const updatePropForRole = (propId: string, changes: Partial<PropDocument>) => {
    if (liveRoleRef.current === 'editor') {
      void sendEditorEntityChange(propId, { position: changes.position, rotation: changes.rotation, scale: changes.scale })
      return
    }
    if (!canEditLiveTarget('Prop', propId)) return
    updateProp(propId, changes)
  }

  const updateCameraForRole = (cameraId: string, changes: Partial<CameraDocument>) => {
    if (liveRoleRef.current === 'editor') {
      void sendEditorEntityChange(cameraId, { position: changes.position, rotation: changes.rotation })
      return
    }
    if (!canEditLiveTarget('Camera', cameraId)) return
    updateCamera(cameraId, changes)
  }

  const renameShotForRole = (shotId: string, name: string) => liveRoleRef.current === 'editor' ? void sendEditorShotPatch(shotId, 'name', name) : canEditLiveTarget('Shot', shotId) ? renameShot(shotId, name) : undefined
  const updateShotNotesForRole = (shotId: string, notes: string) => liveRoleRef.current === 'editor' ? void sendEditorShotPatch(shotId, 'notes', notes) : canEditLiveTarget('Shot', shotId) ? updateShotNotes(shotId, notes) : undefined
  const updateShotMetadataForRole = (shotId: string, patch: Partial<Pick<ShotDocument, 'shotSize' | 'angle' | 'movement' | 'equipment'>>) => {
    if (liveRoleRef.current !== 'editor') {
      if (canEditLiveTarget('Shot', shotId)) updateShotMetadata(shotId, patch)
      return
    }
    Object.entries(patch).forEach(([field, value]) => { void sendEditorShotPatch(shotId, field as LiveReviewShotField, value ?? null) })
  }

  const cameraBlockingTarget = (scene: SceneDocument, camera: CameraDocument) => {
    const targetId = camera.targetEntityId
    if (!targetId || targetId === camera.id) return null
    return [...scene.actors, ...scene.props, ...scene.walls, ...scene.openings, ...scene.cameras].find((entity) => entity.id === targetId) ?? null
  }

  const aimCameraAtTarget = (cameraId: string) => {
    const scene = sceneDocumentRef.current
    const baseCamera = scene.cameras.find((item) => item.id === cameraId)
    const camera = currentEditableCameraPose(scene, cameraId)
    const target = baseCamera ? cameraBlockingTarget(scene, baseCamera) : null
    if (!camera || !baseCamera || !target) {
      if (baseCamera?.targetEntityId || baseCamera?.lockTarget) updateCamera(cameraId, { targetEntityId: null, lockTarget: false })
      return
    }
    updateCamera(cameraId, { rotation: cameraAimRotation(camera, target, camera.targetAimPoint as TargetAimPoint | undefined) }, { disableLockOnRotation: false })
  }

  const moveCameraBlocking = (cameraId: string, move: CameraBlockingMove, delta: number) => {
    const scene = sceneDocumentRef.current
    const baseCamera = scene.cameras.find((item) => item.id === cameraId)
    const camera = currentEditableCameraPose(scene, cameraId)
    if (!camera || !baseCamera) return
    const position = cameraPositionAfterMove(camera, move, delta)
    const target = camera.lockTarget ? cameraBlockingTarget(scene, baseCamera) : null
    const changes: Partial<CameraDocument> = { position }
    if (camera.lockTarget) {
      if (target) changes.rotation = cameraAimRotation({ ...camera, position }, target, camera.targetAimPoint as TargetAimPoint | undefined)
      else { changes.targetEntityId = null; changes.lockTarget = false }
    }
    updateCamera(cameraId, changes, { disableLockOnRotation: false })
  }

  const frameCameraOnActor = (cameraId: string, preset: FramingPreset) => {
    const scene = sceneDocumentRef.current
    const baseCamera = scene.cameras.find((item) => item.id === cameraId)
    const actor = baseCamera?.targetEntityId ? scene.actors.find((item) => item.id === baseCamera.targetEntityId) : null
    const camera = currentEditableCameraPose(scene, cameraId)
    if (!baseCamera || !actor || !camera) return
    const position = cameraPositionForActorFraming(camera, actor, preset, baseCamera.targetAimPoint as TargetAimPoint | undefined)
    const rotation = cameraAimRotation({ ...camera, position }, actor, baseCamera.targetAimPoint as TargetAimPoint | undefined)
    updateCamera(cameraId, { position, rotation }, { disableLockOnRotation: false })
  }

  const recordPhoneCameraSample = (frame: number, rotation: [number, number, number]) => {
    const before = sceneDocumentRef.current
    const cameraId = phoneRecordingCameraIdRef.current
    if (!cameraId) return
    const camera = before.cameras.find((item) => item.id === cameraId)
    if (!camera) return
    if (frame > before.timeline.markOut) {
      phoneCameraControllerRef.current?.stopRecording()
      return
    }
    const safeFrame = clampTimelineFrame(frame, before.timeline.startFrame, before.timeline.endFrame)
    const timeline = upsertTimelineKeyframe(before.timeline, cameraId, 'Camera', 'rotation', safeFrame, rotation, 'linear')
    const after: SceneDocument = {
      ...before,
      timeline: { ...timeline, currentFrame: safeFrame },
    }
    sceneDocumentRef.current = after
    updateActiveSceneDocument(after, false)
  }

  const finishPhoneCameraRecording = () => {
    const before = phoneRecordingBeforeRef.current
    const after = sceneDocumentRef.current
    const cameraId = phoneRecordingCameraIdRef.current
    phoneRecordingBeforeRef.current = null
    phoneRecordingCameraIdRef.current = null
    setSuspendedTimelineEntityIds(new Set())
    setSuspendedTimelineProperties({})
    if (before && after && creativeSceneChanged(before, after)) {
      const camera = after.cameras.find((item) => item.id === cameraId)
      recordAction(`Record ${camera?.name ?? 'Camera'} Move`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    }
  }

  const startPhoneCameraRecording = () => {
    const activeCamera = sceneDocumentRef.current.cameras.find((camera) => camera.id === sceneDocumentRef.current.activeCameraId) ?? null
    if (!activeCamera || phoneCameraState.status !== 'connected') return
    phoneRecordingBeforeRef.current = sceneDocumentRef.current
    phoneRecordingCameraIdRef.current = activeCamera.id
    // Record Move owns Rotation only. Position remains Timeline-owned and
    // must continue evaluating while the phone supplies the live rotation.
    setSuspendedTimelineEntityIds(new Set())
    setSuspendedTimelineProperties({ [activeCamera.id]: new Set(['rotation']) })
    if (!phoneCameraControllerRef.current?.startRecording()) {
      phoneRecordingBeforeRef.current = null
      phoneRecordingCameraIdRef.current = null
      setSuspendedTimelineEntityIds(new Set())
      setSuspendedTimelineProperties({})
    }
  }

  const stopPhoneCameraRecording = () => phoneCameraControllerRef.current?.stopRecording()

  const setPhoneCameraKey = (): boolean => {
    const before = sceneDocumentRef.current
    const camera = before.cameras.find((item) => item.id === before.activeCameraId)
    const rotation = phoneCameraControllerRef.current?.getCurrentRotation()
    const phoneState = phoneCameraControllerRef.current?.currentState
    if (!camera || phoneState?.status !== 'connected' || phoneState.activeCameraId !== camera.id || !rotation) return false
    const frame = before.timeline.currentFrame
    const timeline = upsertTimelineKeyframe(before.timeline, camera.id, 'Camera', 'rotation', frame, rotation, 'linear')
    const after: SceneDocument = {
      ...before,
      metadata: { ...before.metadata, updatedAt: new Date().toISOString() },
      cameras: before.cameras.map((item) => item.id === camera.id ? { ...item, rotation: [...rotation] } : item),
      timeline,
    }
    recordAction(`Set ${camera.name} Camera Key`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
    return true
  }

  useEffect(() => {
    const controller = new PhoneCameraController({
      getActiveCamera: () => {
        const current = sceneDocumentRef.current
        const recordingBase = phoneRecordingBeforeRef.current
        const camera = current.cameras.find((item) => item.id === current.activeCameraId) ?? null
        if (!camera) return null
        const currentEvaluated = evaluateTimeline(current, current.timeline.currentFrame)[camera.id]
        const baselineCamera = recordingBase && phoneRecordingCameraIdRef.current === current.activeCameraId
          ? recordingBase.cameras.find((item) => item.id === camera.id) ?? null
          : null
        const baselineEvaluated = baselineCamera && recordingBase
          ? evaluateTimeline(recordingBase, current.timeline.currentFrame)[camera.id]
          : undefined
        return cameraDocumentForRecording(camera, currentEvaluated, baselineCamera, baselineEvaluated, { position: false, rotation: true })
      },
      getCurrentFrame: () => sceneDocumentRef.current.timeline.currentFrame,
      getFrameRate: () => sceneDocumentRef.current.timeline.frameRate,
      onLiveLayer: (layer) => phoneCameraLiveApplyRef.current?.(layer),
      onState: (state) => setPhoneCameraState(state),
      onRecordSample: recordPhoneCameraSample,
      onRecordingFinished: finishPhoneCameraRecording,
      onSetCameraKey: setPhoneCameraKey,
    })
    phoneCameraControllerRef.current = controller
    const current = sceneDocumentRef.current
    controller.setActiveCamera(current.cameras.find((camera) => camera.id === current.activeCameraId) ?? null)
    return () => {
      controller.dispose()
      phoneCameraControllerRef.current = null
      phoneRecordingBeforeRef.current = null
      phoneRecordingCameraIdRef.current = null
    }
  }, [])

  useEffect(() => {
    const current = sceneDocumentRef.current
    phoneCameraControllerRef.current?.setActiveCamera(current.cameras.find((camera) => camera.id === current.activeCameraId) ?? null)
  }, [sceneDocument.activeCameraId])

  useEffect(() => {
    const identity = `${projectDocument.id}:${projectDocument.activeSceneId}`
    if (phoneProjectIdentityRef.current === null) {
      phoneProjectIdentityRef.current = identity
      return
    }
    if (phoneProjectIdentityRef.current !== identity) {
      phoneProjectIdentityRef.current = identity
      const controller = phoneCameraControllerRef.current
      controller?.disconnect()
      const current = sceneDocumentRef.current
      controller?.setActiveCamera(current.cameras.find((camera) => camera.id === current.activeCameraId) ?? null)
    }
  }, [projectDocument.id, projectDocument.activeSceneId])

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

  const collaborativeTimelineProperty = (entityType: LiveReviewCollaborativeEntityType, property: TimelineProperty): LiveReviewTimelineProperty | null => {
    if (property === 'position' || property === 'rotation') return property
    if (property === 'heading' && entityType === 'Actor') return 'rotation'
    if (property === 'scale' && entityType === 'Prop') return 'scale'
    return null
  }

  const sendEditorTimelineCommit = async (partial: Omit<LiveReviewTimelineCommit, 'operationId' | 'leaseId' | 'baseProjectRevision'>) => {
    if (liveRoleRef.current !== 'editor') return
    const lease = await requestTimelineLease(partial.sceneId, partial.entityType, partial.entityId, partial.property)
    if (!lease || !liveTransportRef.current?.connected) return
    liveTransportRef.current.send({ type: 'editor_timeline_commit', commit: { ...partial, operationId: randomLiveReviewId(16), leaseId: lease.leaseId, baseProjectRevision: liveProjectRevisionRef.current } })
  }

  const addKeyframeForRole = (entityId: string, property: TimelineProperty) => {
    if (liveRoleRef.current !== 'editor') {
      if (liveRoleRef.current !== 'viewer') addKeyframe(entityId, property)
      return
    }
    const scene = sceneDocumentRef.current
    const entityType = liveEntityTypeForId(entityId, scene)
    const collaborativeProperty = entityType ? collaborativeTimelineProperty(entityType, property) : null
    if (!entityType || !collaborativeProperty || !liveHostConnected) return
    void sendEditorTimelineCommit({ operation: 'add', sceneId: projectDocumentRef.current.activeSceneId, entityType, entityId, property: collaborativeProperty, frame: scene.timeline.currentFrame })
  }

  const timelineSelectionForCollaboration = (selection: TimelineKeyframeSelection, scene = sceneDocumentRef.current) => {
    const track = scene.timeline.tracks.find((candidate) => candidate.id === selection.trackId)
    if (!track || (track.entityType !== 'Actor' && track.entityType !== 'Prop' && track.entityType !== 'Camera')) return null
    const property = collaborativeTimelineProperty(track.entityType, track.property)
    if (!property) return null
    const keyframe = track.keyframes.find((candidate) => candidate.id === selection.keyframeId)
    return keyframe ? { track, keyframe, entityType: track.entityType, property } : null
  }

  const canEditTimelineSelection = (selection: TimelineKeyframeSelection): boolean => {
    if (liveRoleRef.current === null || liveRoleRef.current === 'host') return true
    return liveRoleRef.current === 'editor' && timelineSelectionForCollaboration(selection) !== null && liveHostConnected
  }

  const beginTimelineKeyframeLease = (selection: TimelineKeyframeSelection) => {
    if (liveRoleRef.current !== 'editor') return
    const selected = timelineSelectionForCollaboration(selection)
    if (!selected || !liveHostConnected) return
    liveTimelineEditActiveRef.current = true
    liveTimelineEditTargetRef.current = timelineLeaseTargetId(projectDocumentRef.current.activeSceneId, selected.entityType, selected.track.entityId, selected.property)
    void requestTimelineLease(projectDocumentRef.current.activeSceneId, selected.entityType, selected.track.entityId, selected.property)
  }

  const endTimelineKeyframeLease = (committed: boolean) => {
    const targetId = liveTimelineEditTargetRef.current
    liveTimelineEditActiveRef.current = false
    liveTimelineEditTargetRef.current = null
    if (committed || liveRoleRef.current !== 'editor') return
    if (targetId) liveCanceledTimelineLeaseTargetsRef.current.add(targetId)
    const lease = liveActiveLeaseRef.current
    if (lease?.targetType === 'Timeline' && (!targetId || lease.targetId === targetId)) releaseLiveLease(lease)
  }

  const moveKeyframesForRole = (selections: readonly TimelineKeyframeSelection[], deltaFrames: number) => {
    if (liveRoleRef.current !== 'editor') {
      if (liveRoleRef.current !== 'viewer') moveKeyframes(selections, deltaFrames)
      return
    }
    if (selections.length !== 1 || deltaFrames === 0 || !liveHostConnected) return
    const selected = timelineSelectionForCollaboration(selections[0])
    if (!selected) return
    void sendEditorTimelineCommit({ operation: 'move', sceneId: projectDocumentRef.current.activeSceneId, entityType: selected.entityType, entityId: selected.track.entityId, property: selected.property, keyframeId: selected.keyframe.id, targetFrame: selected.keyframe.frame + Math.round(deltaFrames) })
  }

  const deleteKeyframesForRole = (selections: readonly TimelineKeyframeSelection[]) => {
    if (liveRoleRef.current !== 'editor') {
      if (liveRoleRef.current !== 'viewer') deleteKeyframes(selections)
      return
    }
    if (selections.length !== 1 || !liveHostConnected) return
    const selected = timelineSelectionForCollaboration(selections[0])
    if (!selected) return
    void sendEditorTimelineCommit({ operation: 'delete', sceneId: projectDocumentRef.current.activeSceneId, entityType: selected.entityType, entityId: selected.track.entityId, property: selected.property, keyframeId: selected.keyframe.id })
  }

  const changeKeyframeEasingForRole = (selections: readonly TimelineKeyframeSelection[], mode: TimelineEasingMode) => {
    if (liveRoleRef.current === null || liveRoleRef.current === 'host') changeKeyframeEasing(selections, mode)
  }

  const handleSelectionChange = (selection: StageSelection | string | null, additive = false) => {
    const currentIds = selectedEntityIdsRef.current
    const ids = selection !== null && typeof selection === 'object' ? selection.ids : additive && typeof selection === 'string'
      ? currentIds.includes(selection) ? currentIds.filter((id) => id !== selection) : [...currentIds, selection]
      : selection ? [selection] : []
    const requestedPrimary = selection !== null && typeof selection === 'object' ? selection.primaryId : selection
    const validIds = new Set([...sceneDocumentRef.current.actors, ...sceneDocumentRef.current.props, ...sceneDocumentRef.current.walls, ...sceneDocumentRef.current.openings, ...sceneDocumentRef.current.cameras, ...sceneDocumentRef.current.lights].map((entity) => entity.id))
    const normalizedIds = ids.filter((id, index) => validIds.has(id) && ids.indexOf(id) === index)
    const primaryId = requestedPrimary && normalizedIds.includes(requestedPrimary) ? requestedPrimary : normalizedIds[normalizedIds.length - 1] ?? null
    selectedEntityIdRef.current = primaryId
    selectedEntityIdsRef.current = normalizedIds
    setSelectedEntityId(primaryId)
    setSelectedEntityIds(normalizedIds)
    const camera = primaryId ? sceneDocumentRef.current.cameras.find((item) => item.id === primaryId) : null
    const review = cameraMoveReviewRef.current
    if (review && (!camera || camera.id !== review.cameraId)) stopPlaybackSession()
    setSelectedFrameGuideId((current) => resolveFrameGuideSelection(camera?.frameGuides ?? [], current))
    if (!camera) setSelectedCameraPathSegment(null)
  }

  const beginEntityRename = (entityId: string) => {
    handleSelectionChange(entityId)
    renameRequestTokenRef.current += 1
    setRenameRequest({ entityId, token: renameRequestTokenRef.current })
  }

  const canTransformEntity = (entityId: string): boolean => {
    const role = liveRoleRef.current
    if (role === 'viewer') return false
    if (!role) return true
    const targetType = liveEntityTypeForId(entityId)
    if (!targetType) return false
    const targetKey = `${targetType.toLowerCase()}:${entityId}`
    const lease = liveLeases.find((candidate) => candidate.targetKey === targetKey)
    return !lease || lease.participantId === liveTransportRef.current?.participantId
  }

  const canEditLiveTarget = (targetType: LiveReviewCollaborativeEntityType | 'Shot', targetId: string): boolean => {
    if (liveRoleRef.current === 'viewer') return false
    if (!liveRoleRef.current) return true
    const lease = liveLeases.find((candidate) => candidate.targetKey === `${targetType.toLowerCase()}:${targetId}`)
    return !lease || lease.participantId === liveTransportRef.current?.participantId
  }

  const canTransformGroup = (entityIds: readonly string[]): boolean => {
    const role = liveRoleRef.current
    if (role === 'viewer') return false
    if (role === 'host' || !role) return true
    return entityIds.length === 1 && canTransformEntity(entityIds[0] ?? '')
  }

  const requestTransformPermission = async (entityId: string): Promise<boolean> => {
    if (liveRoleRef.current === 'host') {
      if (!canTransformEntity(entityId)) return false
      const targetType = liveEntityTypeForId(entityId)
      if (!targetType || !liveTransportRef.current?.connected) return true
      if (liveActiveLeaseRef.current?.targetId === entityId) return true
      const lease = await requestLiveLease(targetType, entityId, liveEntityLabelForId(entityId))
      if (!lease) return false
      liveActiveLeaseRef.current = lease
      return true
    }
    if (liveRoleRef.current !== 'editor') return liveRoleRef.current !== 'viewer'
    const targetType = liveEntityTypeForId(entityId)
    if (!targetType || !liveHostConnected) return false
    if (liveActiveLeaseRef.current?.targetId === entityId) return true
    const lease = await requestLiveLease(targetType, entityId, liveEntityLabelForId(entityId))
    if (!lease) return false
    liveActiveLeaseRef.current = lease
    return true
  }

  const releaseHostTransformLease = () => {
    if (liveRoleRef.current === 'host') releaseLiveLease(liveActiveLeaseRef.current)
  }

  const handleTransformStart = (_change: StageTransform) => {
    setSnapPreviewWallId(null)
    setTransformingEntityId(_change.entityId)
    transformTransactionRef.current = {
      before: sceneDocumentRef.current,
      beforeSelection: selectedEntityIdRef.current,
      beforeSelectionIds: [...selectedEntityIdsRef.current],
    }
  }

  const handleTransformBatchStart = (batch: StageTransformBatch) => {
    setSnapPreviewWallId(null)
    setTransformingEntityId(batch.primaryEntityId)
    transformTransactionRef.current = {
      before: sceneDocumentRef.current,
      beforeSelection: selectedEntityIdRef.current,
      beforeSelectionIds: [...selectedEntityIdsRef.current],
    }
  }

  const handleTransformBatchEnd = (batch: StageTransformBatch) => {
    if (liveRoleRef.current === 'editor') {
      const primary = batch.changes.find((change) => change.entityId === batch.primaryEntityId) ?? batch.changes[0]
      if (primary) sendEditorTransformCommit(primary)
      return
    }
    const transaction = transformTransactionRef.current
    transformTransactionRef.current = null
    setTransformingEntityId(null)
    setSnapPreviewWallId(null)
    if (!transaction || batch.changes.length === 0) {
      releaseHostTransformLease()
      return
    }
    const before = transaction.before
    let after = before
    const suspendedIds = new Set(suspendedTimelineEntityIds)
    batch.changes.forEach((change) => {
      const actor = after.actors.find((item) => item.id === change.entityId)
      const prop = after.props.find((item) => item.id === change.entityId)
      const wall = after.walls.find((item) => item.id === change.entityId)
      const opening = after.openings.find((item) => item.id === change.entityId)
      const camera = after.cameras.find((item) => item.id === change.entityId)
      const sun = after.lights.find((item) => item.id === change.entityId)
      if (sun) {
        const angles = sunAnglesFromHelperPosition(new THREE.Vector3(...change.position))
        after = { ...after, lights: after.lights.map((item) => item.id === sun.id ? { ...item, ...angles } : item) }
        if (after.timeline.tracks.some((track) => track.entityId === sun.id && (track.property === 'azimuth' || track.property === 'elevation'))) suspendedIds.add(sun.id)
        return
      }
      if (!(actor || prop || wall || opening || camera)) {
        after = applySceneEntityTransform(after, change)
        return
      }
      const snap = opening ? nearestWallForOpening(change.position, after.walls, WALL_SNAP_THRESHOLD, opening.width) : null
      const resolved = opening && snap ? resolveOpeningAgainstWalls({ ...opening, position: change.position, rotation: change.rotation, wallId: snap.wallId, offsetAlongWallMeters: snap.offset }, after.walls) : null
      const effectiveChange: StageTransform = resolved ? { ...change, position: resolved.position, rotation: resolved.rotation } : change
      const editedProperty: TimelineTransformCommit['editedProperty'] = transformTool === 'move' ? 'position' : transformTool === 'rotate' ? actor ? 'heading' : 'rotation' : transformTool === 'scale' && prop ? 'scale' : undefined
      const result = commitTimelineTransform(after, { ...effectiveChange, editedProperty } as TimelineTransformCommit)
      after = result.document
      if (camera && transformTool === 'rotate' && camera.lockTarget) after = { ...after, cameras: after.cameras.map((item) => item.id === camera.id ? { ...item, lockTarget: false } : item) }
      if (result.suspendEvaluation) suspendedIds.add(change.entityId)
      else suspendedIds.delete(change.entityId)
      if (opening) {
        const nextOpening = snap
          ? resolveOpeningAgainstWalls({ ...(after.openings.find((item) => item.id === opening.id) ?? opening), wallId: snap.wallId, offsetAlongWallMeters: snap.offset, position: effectiveChange.position, rotation: effectiveChange.rotation }, after.walls)
          : { ...(after.openings.find((item) => item.id === opening.id) ?? opening), wallId: null, offsetAlongWallMeters: undefined, position: effectiveChange.position, rotation: effectiveChange.rotation }
        after = { ...after, openings: after.openings.map((item) => item.id === opening.id ? nextOpening : item) }
      } else if (wall) {
        after = { ...after, openings: after.openings.map((item) => resolveOpeningAgainstWalls(item, after.walls)) }
      }
    })
    after = { ...after, metadata: { ...after.metadata, updatedAt: new Date().toISOString() } }
    recordAction(`Transform ${batch.changes.length} objects`, before, transaction.beforeSelection, after, batch.primaryEntityId)
    applyEditorSnapshot({ document: after, selectedEntityId: batch.primaryEntityId }, suspendedIds)
    releaseHostTransformLease()
  }

  const handleTransformBatchPreview = (batch: StageTransformBatch) => {
    renewActiveLiveLease()
    if (liveRoleRef.current === 'editor') {
      const primary = batch.changes.find((change) => change.entityId === batch.primaryEntityId) ?? batch.changes[0]
      if (primary && liveActiveLeaseRef.current && liveTransportRef.current?.connected) liveTransportRef.current.send({ type: 'editor_transform_preview', preview: { leaseId: liveActiveLeaseRef.current.leaseId, sceneId: projectDocumentRef.current.activeSceneId, targetType: liveEntityTypeForId(primary.entityId) ?? 'Prop', entityId: primary.entityId, position: primary.position, rotation: primary.rotation, scale: primary.scale } })
      return
    }
    const opening = sceneDocumentRef.current.openings.find((item) => item.id === batch.primaryEntityId)
    const change = batch.changes.find((item) => item.entityId === batch.primaryEntityId)
    setSnapPreviewWallId(opening && change ? nearestWallForOpening(change.position, sceneDocumentRef.current.walls, WALL_SNAP_THRESHOLD, opening.width)?.wallId ?? null : null)
    batch.changes.forEach((change) => publishLiveTransform({ sceneId: projectDocumentRef.current.activeSceneId, entityId: change.entityId, position: change.position, rotation: change.rotation, scale: change.scale }))
  }

  const handleTransformEnd = (change: StageTransform) => {
    if (liveRoleRef.current === 'editor') {
      sendEditorTransformCommit(change)
      transformTransactionRef.current = null
      setTransformingEntityId(null)
      setSnapPreviewWallId(null)
      return
    }
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
      releaseHostTransformLease()
      return
    }
    if (actor || prop || wall || opening || camera) {
      const snap = opening ? nearestWallForOpening(change.position, before.walls, WALL_SNAP_THRESHOLD, opening.width) : null
      const effectiveChange: StageTransform = opening && snap
        ? { ...change, position: resolveOpeningAgainstWalls({ ...opening, position: change.position, rotation: change.rotation, wallId: snap.wallId, offsetAlongWallMeters: snap.offset }, before.walls).position, rotation: resolveOpeningAgainstWalls({ ...opening, position: change.position, rotation: change.rotation, wallId: snap.wallId, offsetAlongWallMeters: snap.offset }, before.walls).rotation }
        : change
      const editedProperty: TimelineTransformCommit['editedProperty'] = transformTool === 'move'
        ? 'position'
        : transformTool === 'rotate'
          ? actor ? 'heading' : 'rotation'
          : transformTool === 'scale' && prop ? 'scale'
          : undefined
      const result = commitTimelineTransform(before, { ...effectiveChange, editedProperty } as TimelineTransformCommit)
      let after = { ...result.document, metadata: { ...result.document.metadata, updatedAt: new Date().toISOString() } }
      if (camera && transformTool === 'rotate' && camera.lockTarget) after = { ...after, cameras: after.cameras.map((item) => item.id === camera.id ? { ...item, lockTarget: false } : item) }
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
      else suspendedIds.delete(change.entityId)
      applyEditorSnapshot({ document: after, selectedEntityId: change.entityId }, suspendedIds)
      releaseHostTransformLease()
      return
    }
    const after = applySceneEntityTransform(sceneDocumentRef.current, change)
    const entity = [...after.actors, ...after.props, ...after.walls, ...after.openings, ...after.cameras].find((item) => item.id === change.entityId)
    const action = transformTool === 'rotate' ? 'Rotate' : transformTool === 'scale' ? 'Scale' : 'Move'
    setLastTransformDebug({ entityId: change.entityId, runtimeFinal: formatTransform(change.position, change.rotation), baseDocumentFinal: formatTransform(after.props.find((item) => item.id === change.entityId)?.position ?? change.position, after.props.find((item) => item.id === change.entityId)?.rotation ?? change.rotation), timelineEvaluated: '—', valueAppliedAfterTransform: 'BASE' })
    recordAction(`${action} ${entity?.name ?? change.entityId}`, before, transaction.beforeSelection, after, change.entityId)
    applyEditorSnapshot({ document: after, selectedEntityId: change.entityId })
    releaseHostTransformLease()
  }

  const handleTransformPreview = (change: StageTransform) => {
    renewActiveLiveLease()
    if (liveRoleRef.current === 'editor') {
      const lease = liveActiveLeaseRef.current
      const targetType = liveEntityTypeForId(change.entityId)
      if (lease && targetType && liveTransportRef.current?.connected) liveTransportRef.current.send({ type: 'editor_transform_preview', preview: { leaseId: lease.leaseId, sceneId: projectDocumentRef.current.activeSceneId, targetType, entityId: change.entityId, position: change.position, rotation: change.rotation, scale: change.scale } })
      return
    }
    publishLiveTransform({ sceneId: projectDocumentRef.current.activeSceneId, entityId: change.entityId, position: change.position, rotation: change.rotation, scale: change.scale })
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

  const selectTimelineKeyframe = (selection: TimelineKeyframeSelection | null, additive = false) => {
    if (cameraMoveReviewRef.current) stopPlaybackSession()
    const current = selectedTimelineKeyframesRef.current
    let next: TimelineKeyframeSelection[]
    if (!selection) {
      next = additive ? current : []
    } else if (!additive) {
      next = [selection]
    } else {
      const identity = `${selection.trackId}:${selection.keyframeId}`
      next = current.some((item) => `${item.trackId}:${item.keyframeId}` === identity)
        ? current.filter((item) => `${item.trackId}:${item.keyframeId}` !== identity)
        : [...current, selection]
    }
    selectedTimelineKeyframesRef.current = next
    setSelectedTimelineKeyframes(next)
    const selected = next.length === 1 ? next[0] : null
    const selectedTrack = selected ? sceneDocumentRef.current.timeline.tracks.find((track) => track.id === selected.trackId) : null
    if (selected && selectedTrack?.entityType === 'Camera' && selectedTrack.property === 'position') {
      setSelectedCameraPathSegment(cameraPathSegmentForKeyframe(sceneDocumentRef.current.timeline, selectedTrack.entityId, selected.keyframeId))
    } else if (!selected) {
      setSelectedCameraPathSegment(null)
    }
  }

  const deleteKeyframes = (selections: readonly TimelineKeyframeSelection[]) => {
    const before = sceneDocumentRef.current
    const valid = selections.filter((selection) => before.timeline.tracks.some((track) => track.id === selection.trackId && track.keyframes.some((keyframe) => keyframe.id === selection.keyframeId)))
    if (valid.length === 0) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: removeTimelineKeyframes(before.timeline, valid) }
    recordAction(valid.length === 1 ? 'Delete Keyframe' : `Delete ${valid.length} Keyframes`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
    selectTimelineKeyframe(null)
  }

  const changeKeyframeEasing = (selections: readonly TimelineKeyframeSelection[], mode: TimelineEasingMode) => {
    const before = sceneDocumentRef.current
    const valid = selections.filter((selection) => before.timeline.tracks.some((track) => track.id === selection.trackId && track.keyframes.some((keyframe) => keyframe.id === selection.keyframeId)))
    if (valid.length === 0) return
    const easing = timelineEasingForMode(mode)
    const unchanged = valid.every((selection) => {
      const keyframe = before.timeline.tracks.find((track) => track.id === selection.trackId)?.keyframes.find((item) => item.id === selection.keyframeId)
      return keyframe && keyframe.interpolation === 'linear' && timelineEasingMode(keyframe) === mode && Boolean(keyframe.easeIn) === Boolean(easing.easeIn) && Boolean(keyframe.easeOut) === Boolean(easing.easeOut)
    })
    if (unchanged) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: setTimelineKeyframesEasing(before.timeline, valid, mode) }
    recordAction(`Set ${mode === 'linear' ? 'Linear' : mode === 'easeIn' ? 'Ease In' : mode === 'easeOut' ? 'Ease Out' : 'Ease In & Out'} interpolation${valid.length > 1 ? ` (${valid.length} keys)` : ''}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
    selectTimelineKeyframe(valid[valid.length - 1])
  }

  const moveKeyframes = (selections: readonly TimelineKeyframeSelection[], deltaFrames: number) => {
    const before = sceneDocumentRef.current
    const valid = selections.filter((selection) => before.timeline.tracks.some((track) => track.id === selection.trackId && track.keyframes.some((keyframe) => keyframe.id === selection.keyframeId)))
    if (valid.length === 0 || deltaFrames === 0) return
    const after = { ...before, metadata: { ...before.metadata, updatedAt: new Date().toISOString() }, timeline: moveTimelineKeyframes(before.timeline, valid, deltaFrames) }
    recordAction(valid.length === 1 ? 'Move Keyframe' : `Move ${valid.length} Keyframes`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
  }

  const startCameraMoveReview = (mode: CameraMoveReviewMode) => {
    const selection = selectedCameraPathSegment
    const timeline = sceneDocumentRef.current.timeline
    const range = cameraMoveReviewRange(timeline, selection)
    const camera = selection ? sceneDocumentRef.current.cameras.find((item) => item.id === selection.cameraId) : null
    if (!selection || !range || !camera) return
    stopPlaybackSession()
    const review: CameraMoveReviewState = { mode, sceneId: projectDocumentRef.current.activeSceneId, cameraId: camera.id, segment: selection }
    cameraMoveReviewRef.current = review
    setCameraMoveReview(review)
    setFrameWithoutPlayback(range.startFrame)
    setSuspendedTimelineEntityIds(new Set())
    playbackRangeRef.current = range
    playbackRef.current = createPlaybackClock(range.startFrame, performance.now())
    setIsPlaying(true)
  }

  const goToCameraMovePose = (edge: 'start' | 'end') => {
    const range = cameraMoveReviewRange(sceneDocumentRef.current.timeline, selectedCameraPathSegment)
    if (!range) return
    stopPlaybackSession()
    setFrameWithoutPlayback(edge === 'start' ? range.startFrame : range.endFrame)
  }

  const togglePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      if (cameraMoveReviewRef.current || shotReviewRef.current) {
        if (playbackFrameRequestRef.current !== null) window.cancelAnimationFrame(playbackFrameRequestRef.current)
        playbackFrameRequestRef.current = null
        playbackRef.current = null
        setIsPlaying(false)
      } else {
        stopPlaybackSession()
      }
      return
    }
    const review = cameraMoveReviewRef.current
    if (review) {
      const range = cameraMoveReviewRange(sceneDocumentRef.current.timeline, review.segment)
      if (!range || review.sceneId !== projectDocumentRef.current.activeSceneId) {
        stopPlaybackSession()
        return
      }
      const currentFrame = Math.max(range.startFrame, Math.min(range.endFrame, sceneDocumentRef.current.timeline.currentFrame))
      if (currentFrame !== sceneDocumentRef.current.timeline.currentFrame) setFrameWithoutPlayback(currentFrame)
      setSuspendedTimelineEntityIds(new Set())
      playbackRangeRef.current = range
      playbackRef.current = createPlaybackClock(currentFrame, performance.now())
      setIsPlaying(true)
      return
    }
    const shotReview = shotReviewRef.current
    if (shotReview) {
      if (shotReview.sceneId !== projectDocumentRef.current.activeSceneId) {
        stopPlaybackSession()
        return
      }
      const timeline = sceneDocumentRef.current.timeline
      const range = { startFrame: Math.max(timeline.startFrame, Math.min(timeline.endFrame - 1, shotReview.range.startFrame)), endFrame: Math.max(1, Math.min(timeline.endFrame, shotReview.range.endFrame)) }
      const currentFrame = Math.max(range.startFrame, Math.min(range.endFrame, timeline.currentFrame))
      if (currentFrame !== timeline.currentFrame) setFrameWithoutPlayback(currentFrame)
      setSuspendedTimelineEntityIds(new Set())
      playbackRangeRef.current = range
      playbackRef.current = createPlaybackClock(currentFrame, performance.now())
      setIsPlaying(true)
      return
    }
    const timeline = sceneDocumentRef.current.timeline
    const range = timelinePlaybackRange(timeline)
    const startFrame = playbackStartFrame(timeline.currentFrame, range.startFrame, range.endFrame)
    if (startFrame !== timeline.currentFrame) setFrameWithoutPlayback(startFrame)
    setSuspendedTimelineEntityIds(new Set())
    playbackRangeRef.current = range
    playbackRef.current = createPlaybackClock(startFrame, performance.now())
    setIsPlaying(true)
  }, [stopPlaybackSession])
  useEffect(() => {
    togglePlaybackRef.current = timelineMode === 'master' ? toggleMasterPlayback : togglePlayback
  }, [isMasterPlaying, timelineMode, toggleMasterPlayback, togglePlayback])

  useEffect(() => {
    if (!isPlaying) {
      if (playbackFrameRequestRef.current !== null) window.cancelAnimationFrame(playbackFrameRequestRef.current)
      playbackFrameRequestRef.current = null
      return
    }
    const tick = (now: number) => {
      let clock = playbackRef.current
      if (!clock) return
      const scene = sceneDocumentRef.current
      const timeline = scene.timeline
      const review = cameraMoveReviewRef.current
      const shotReview = shotReviewRef.current
      const range = review
        ? cameraMoveReviewRange(timeline, review.segment)
        : shotReview
          ? { startFrame: Math.max(timeline.startFrame, Math.min(timeline.endFrame - 1, shotReview.range.startFrame)), endFrame: Math.max(1, Math.min(timeline.endFrame, shotReview.range.endFrame)) }
        : timelinePlaybackRange(timeline)
      if (!range || (review && review.sceneId !== projectDocumentRef.current.activeSceneId) || (shotReview && shotReview.sceneId !== projectDocumentRef.current.activeSceneId)) {
        if (review) setSelectedCameraPathSegment(null)
        stopPlaybackSession()
        return
      }
      const loop = review ? review.mode === 'loop' : shotReview ? false : isLoopingRef.current
      const previousRange = playbackRangeRef.current
      const rangeChanged = !previousRange || previousRange.startFrame !== range.startFrame || previousRange.endFrame !== range.endFrame
      if (rangeChanged) {
        playbackRangeRef.current = range
        const currentFrame = timeline.currentFrame
        const resetFrame = Math.max(range.startFrame, Math.min(range.endFrame, currentFrame))
        clock = createPlaybackClock(resetFrame, now)
        playbackRef.current = clock
        if (resetFrame !== currentFrame) setFrameWithoutPlayback(resetFrame)
        if (!loop && currentFrame > range.endFrame) {
          stopPlaybackSession()
          return
        }
      }
      if (!clock) return
      if (loop) {
        const frame = playbackFrameAtLoop(clock, now, timeline.frameRate, range.startFrame, range.endFrame)
        if (frame !== timeline.currentFrame) setFrameWithoutPlayback(frame)
        if (frame === range.startFrame && playbackLoopCycle(clock, now, timeline.frameRate, range.startFrame, range.endFrame) > 0) playbackRef.current = createPlaybackClock(range.startFrame, now)
        playbackFrameRequestRef.current = window.requestAnimationFrame(tick)
        return
      }
      const frame = playbackFrameAt(clock, now, timeline.frameRate, range.endFrame)
      if (frame !== timeline.currentFrame) setFrameWithoutPlayback(frame)
      if (playbackReachedMarkOut(clock, now, timeline.frameRate, range.endFrame)) {
        stopPlaybackSession()
        return
      }
      playbackFrameRequestRef.current = window.requestAnimationFrame(tick)
    }
    playbackFrameRequestRef.current = window.requestAnimationFrame(tick)
    return () => { if (playbackFrameRequestRef.current !== null) window.cancelAnimationFrame(playbackFrameRequestRef.current) }
  }, [isPlaying, stopPlaybackSession])

  const openExport = () => {
    const current = sceneDocumentRef.current
    const activeCamera = current.cameras.find((camera) => camera.id === current.activeCameraId) ?? null
    const source = timelineMode === 'master' ? 'master' as const : 'scene' as const
    const masterRange = effectiveMasterRenderRange(projectDocumentRef.current.masterSequence)
    const masterRate = masterSequenceFrameRate(projectDocumentRef.current.masterSequence, projectDocumentRef.current.shots, projectDocumentRef.current.scenes, current.timeline.frameRate).rate
    if (isPlaying) {
      playbackRef.current = null
      setIsPlaying(false)
    }
    setExportSettings({ source, cameraId: source === 'scene' ? activeCamera?.id ?? null : null, markIn: source === 'scene' ? current.timeline.markIn : masterRange.startFrame, markOut: source === 'scene' ? current.timeline.markOut : masterRange.endFrame, frameRate: source === 'scene' ? current.timeline.frameRate : masterRate, deliveryAspectRatio: source === 'scene' ? activeCamera?.deliveryAspectRatio ?? '16:9' : '16:9', width: 1920, format: 'mp4', quality: 'standard', includeMusic: source === 'master' && Boolean(projectDocumentRef.current.masterSequence.musicClip) })
    setExportProgress(null)
    setExportError(null)
    setExportStatus('idle')
    setExportOpen(true)
  }

  const cancelExport = () => {
    exportAbortRef.current?.abort()
  }

  const startExport = async () => {
    if (exportAbortRef.current) return
    const snapshot = sceneDocumentRef.current
    const activeCamera = snapshot.cameras.find((camera) => camera.id === snapshot.activeCameraId) ?? null
    const source = exportSettings.source ?? 'scene'
    let settings: VideoExportSettings = { ...exportSettings, source, cameraId: source === 'scene' ? activeCamera?.id ?? null : null, markIn: snapshot.timeline.markIn, markOut: snapshot.timeline.markOut, frameRate: snapshot.timeline.frameRate, deliveryAspectRatio: activeCamera && exportSettings.cameraId !== activeCamera.id && source === 'scene' ? activeCamera.deliveryAspectRatio : exportSettings.deliveryAspectRatio }
    let masterPlan: ReturnType<typeof buildMasterRenderPlan> | undefined
    let musicBlob: Blob | null = null
    try {
      if (source === 'master') {
        masterPlan = buildMasterRenderPlan(projectDocumentRef.current, { width: settings.width, deliveryAspectRatio: settings.deliveryAspectRatio, includeMusic: settings.includeMusic === true })
        settings = { ...settings, cameraId: null, frameRate: masterPlan.frameRate, markIn: masterPlan.startFrame, markOut: masterPlan.endFrameExclusive }
        const music = projectDocumentRef.current.masterSequence.musicClip
        if (settings.includeMusic === true && music) {
          musicBlob = await loadMusicAsset(projectDocumentRef.current.id, music.asset.id)
          if (!musicBlob) throw new Error('Master Music is missing. Re-import the Music asset or export without Music.')
        }
      }
    } catch (error: unknown) {
      setExportStatus('error')
      setExportError(userFacingExportError(error))
      return
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
    const camera = snapshot.cameras.find((item) => item.id === settings.cameraId)
    const fileName = source === 'master' ? exportFilename(projectDocumentRef.current.name, 'Master', settings.markIn, settings.markOut, settings.format) : exportFilename(snapshot.metadata.name, camera?.name ?? 'Camera', settings.markIn, settings.markOut, settings.format)
    const exportPromise = platformAdapter.kind === 'desktop'
      ? (source === 'master' ? import('./export/nativeMasterVideoExporter').then(async ({ exportNativeMasterVideo }) => {
        const path = await platformAdapter.chooseExportLocation(fileName, settings.format)
        if (!path) return false
        await exportNativeMasterVideo({ document: snapshot, project: projectDocumentRef.current, masterPlan, musicBlob, settings, signal: controller.signal, onProgress: (progress) => { setExportStatus(progress.phase === 'encoding' ? 'encoding' : 'exporting'); setExportProgress(progress) } }, path)
        return true
      }) : import('./export/nativeVideoExporter').then(async ({ exportNativeVideo }) => {
        const path = await platformAdapter.chooseExportLocation(fileName, 'mp4')
        if (!path) return false
        await exportNativeVideo({ document: snapshot, settings, signal: controller.signal, onProgress: (progress) => { setExportStatus(progress.phase === 'encoding' ? 'encoding' : 'exporting'); setExportProgress(progress) } }, path)
        return true
      }))
      : (source === 'master' ? import('./export/masterVideoExporter').then(({ exportMasterVideo }) => exportMasterVideo({ document: snapshot, project: projectDocumentRef.current, masterPlan, musicBlob, settings, signal: controller.signal, onProgress: (progress) => { setExportStatus('exporting'); setExportProgress(progress) } })).then(async (blob) => saveGeneratedFile(blob, fileName, settings.format)) : import('./export/videoExporter').then(({ exportVideo }) => exportVideo({ document: snapshot, settings, signal: controller.signal, onProgress: (progress) => { setExportStatus('exporting'); setExportProgress(progress) } })).then(async (blob) => saveGeneratedFile(blob, fileName, settings.format)))
    void exportPromise.then((written) => {
      setExportStatus('finalizing')
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

  useEffect(() => () => recoveryManagerRef.current.dispose(), [])

  const copyKeyframeSelection = (): boolean => {
    const clipboard = createTimelineKeyframeClipboardGroup(projectDocumentRef.current.id, sceneDocumentRef.current.metadata.id, sceneDocumentRef.current.timeline.tracks, selectedTimelineKeyframesRef.current)
    if (!clipboard) return false
    keyframeClipboardRef.current = clipboard
    return true
  }

  const copySelection = (): boolean => {
    if (selectedTimelineKeyframesRef.current.length > 0 && copyKeyframeSelection()) return true
    const selected = [...sceneDocumentRef.current.actors, ...sceneDocumentRef.current.props, ...sceneDocumentRef.current.openings].find((entity) => entity.id === selectedEntityIdRef.current)
    if (!selected) return false
    clipboardRef.current = createEditorClipboard(selected)
    return true
  }

  const pasteKeyframeSelection = (): boolean => {
    const clipboard = keyframeClipboardRef.current
    if (!clipboard) return false
    const before = sceneDocumentRef.current
    const frame = clampTimelineFrame(before.timeline.currentFrame, before.timeline.startFrame, before.timeline.endFrame)
    const result = pasteTimelineKeyframes(before, clipboard, frame, projectDocumentRef.current.id)
    if (!result) return false
    const after = { ...result.document, metadata: { ...result.document.metadata, updatedAt: new Date().toISOString() } }
    recordAction(`Paste ${result.selections.length} Keyframe${result.selections.length === 1 ? '' : 's'}`, before, selectedEntityIdRef.current, after, selectedEntityIdRef.current)
    applyEditorSnapshot({ document: after, selectedEntityId: selectedEntityIdRef.current })
    selectedTimelineKeyframesRef.current = result.selections
    setSelectedTimelineKeyframes(result.selections)
    return true
  }

  const pasteSelection = (): boolean => {
    if (keyframeClipboardRef.current) return pasteKeyframeSelection()
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
    if (platformAdapter.kind !== 'desktop' || !recoveryReady || !recoveryEnabled) return
    const fingerprint = creativeProjectFingerprint(projectDocument)
    if (!isDirty) {
      recoveryFingerprintRef.current = fingerprint
      dirtySinceRef.current = null
      return
    }
    if (fingerprint === recoveryFingerprintRef.current && dirtySinceRef.current) return
    const dirtySince = dirtySinceRef.current ?? new Date().toISOString()
    dirtySinceRef.current = dirtySince
    const projectPath = currentProjectPathRef.current
    const recoveryId = projectPath ? recoveryIdForProjectPath(projectPath) : unsavedRecoveryIdRef.current
    currentRecoveryIdRef.current = recoveryId
    recoveryManagerRef.current.schedule({ recoveryId, projectPath, project: projectDocument, dirtySince })
    recoveryFingerprintRef.current = fingerprint
  }, [projectDocument, isDirty, recoveryEnabled, recoveryReady])

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
      if (exportAbortRef.current) {
        setExportError('Cancel the video export before quitting the desktop app.')
        return 'cancel'
      }
      if (!isDirtyRef.current) return 'close'
      const choice = platformAdapter.promptUnsavedClose ? await platformAdapter.promptUnsavedClose() : 'cancel'
      const decision = closeDecisionForUnsavedChoice(choice, choice !== 'save' || await saveProject())
      if (choice === 'discard' && decision === 'close') await discardCurrentRecovery()
      return decision
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
      if (markShortcut && !event.repeat) {
        event.preventDefault()
        if (timelineModeRef.current === 'scene') changeMark(markShortcut)
        return
      }
      if (isTextEditing) return
      const shortcut = editorShortcutForKey(event)
      if (shortcut) {
        const handled = shortcut === 'copy' ? copySelection() : shortcut === 'paste' ? pasteSelection() : shortcut === 'undo' ? undo() : shortcut === 'redo' ? redo() : duplicateEntity(selectedEntityIdRef.current ?? '')
        if (handled) event.preventDefault()
        return
      }
      const destructiveTarget = destructiveShortcutTarget(event.key, isTextEditing, selectedTimelineKeyframesRef.current.length > 0, selectedEntityIdsRef.current.length > 0)
      if (destructiveTarget === 'keyframe') {
        if (selectedTimelineKeyframesRef.current.length > 0) {
          deleteKeyframesForRole(selectedTimelineKeyframesRef.current)
          event.preventDefault()
          return
        }
      }
      if (destructiveTarget === 'entity') {
        if (selectedEntityIdsRef.current.length === 0) return
        deleteSelectedEntities()
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (workspaceMode === 'library') {
    return <><V2ProjectLibrary entries={recentProjects} thumbnails={recentProjectThumbnails} loading={recentProjectsLoading} error={recentProjectsError} dropState={desktopDropState} revealLabel={platformAdapter.revealProjectLabel} onNewProject={newProject} onOpenProject={loadProject} onOpenRecent={openRecentProject} onLocate={locateRecentProject} onReveal={revealRecentFile} onRemove={removeRecent} onRename={renameRecentFile} onDuplicate={duplicateRecentFile} onDelete={deleteRecentFile} onOpenSettings={() => setShortcutSettingsOpen(true)} recoveryCount={recoveryLoading ? 0 : recoveryEntries.length} onOpenRecoveries={() => setRecoveryModalOpen(true)} />{updateNotice ? <V2UpdateNotice release={updateNotice} downloadStatus={downloadStatus} downloadError={downloadError} onDownload={() => downloadUpdate(updateNotice)} onLater={dismissUpdate} /> : null}{shortcutSettingsOpen ? <V2ShortcutSettings bindings={shortcutBindings} onChange={updateShortcut} onReset={resetShortcuts} onClose={() => setShortcutSettingsOpen(false)} recoveryEnabled={recoveryEnabled} onRecoveryEnabledChange={platformAdapter.kind === 'desktop' ? setRecoveryPreference : undefined} showMacosBetaHelp={isMacOSDesktop()} appVersion={APP_VERSION} websiteUrl={APP_WEBSITE_URL} contactEmail={APP_CONTACT_EMAIL} onOpenExternalUrl={(url) => { void platformAdapter.openExternalUrl(url) }} updateState={updateState} onCheckForUpdates={() => { void checkForUpdates() }} onDownloadUpdate={() => downloadUpdate()} onLaterUpdate={dismissUpdate} downloadStatus={downloadStatus} downloadError={downloadError} autoUpdateChecks={updatePreferences.autoCheck} onAutoUpdateChecksChange={platformAdapter.kind === 'desktop' ? saveUpdatePreference : undefined} /> : null}{recoveryModalOpen && recoveryEntries.length > 0 ? <V2RecoveryCenter entries={recoveryEntries} requestedPath={recoveryRequestedPath} onRecover={(entry) => { void recoverProject(entry) }} onDiscard={(entry) => { void discardRecoveryEntry(entry) }} onOpenSaved={(entry) => { void openSavedVersion(entry) }} onClose={() => setRecoveryModalOpen(false)} /> : null}</>
  }

  const timelineBounds = timelineHeightBounds(typeof window === 'undefined' ? 900 : window.innerHeight)
  const appShellStyle = { '--v2-timeline-height': `${timelineHeight}px` } as CSSProperties

  return (
    <main ref={appShellRef} className={`v2-app-shell${isResizingTimeline ? ' is-resizing-timeline' : ''}${shotListPresentation ? ' is-shot-presentation' : ''}`} style={appShellStyle}>
      {desktopDropState === 'valid' ? <div className="v2-desktop-drop-feedback" role="status">Drop .ndblock to open this Project</div> : null}
      {updateNotice ? <V2UpdateNotice release={updateNotice} downloadStatus={downloadStatus} downloadError={downloadError} onDownload={() => downloadUpdate(updateNotice)} onLater={dismissUpdate} /> : null}
      <V2TopBar projectName={projectDocument.name} sceneName={view === 'shot-list' ? 'Shot List' : sceneDocument.metadata.name} isDirty={isDirty} fileError={sceneFileError} view={view} onViewChange={handleViewChange} onNewProject={newProject} onBackToLibrary={platformAdapter.kind === 'desktop' ? returnToLibrary : undefined} onSaveProject={saveProject} onSaveProjectAs={saveProjectAs} onLoadProject={loadProject} onProjectNameChange={renameProject} onExport={openExport} onOpenAbout={() => setShortcutSettingsOpen(true)} exportDisabled={exportStatus === 'preparing' || exportStatus === 'exporting' || exportStatus === 'encoding' || exportStatus === 'finalizing'} readOnly={liveRole !== null && liveRole !== 'host'} liveStatus={liveStatus} liveRole={liveRole} liveViewerCount={liveViewerCount} onOpenLive={() => setLivePanelOpen(true)} />
      {view === 'shot-list' ? <V2ShotListWorkspace project={projectDocument} selectedShotId={shotListSelectedId} presentation={shotListPresentation} controlledView={shotListViewMode} controlledSceneFilter={shotListSceneFilter} onViewChange={setShotListViewMode} onSceneFilterChange={setShotListSceneFilter} onSelectShot={setShotListSelectedId} onPresentationChange={setShotListPresentation} onOpenShot={activateShot} onPreviewShot={previewShot} onCaptureThumbnail={(shotId) => { void captureShotThumbnail(shotId) }} onRenameShot={liveRole === 'viewer' ? () => {} : renameShotForRole} onNotesChange={liveRole === 'viewer' ? () => {} : updateShotNotesForRole} onShotMetadataChange={liveRole === 'viewer' ? () => {} : updateShotMetadataForRole} onDuplicateShot={liveRole === null || liveRole === 'host' ? duplicateShot : () => {}} onDeleteShot={liveRole === null || liveRole === 'host' ? deleteShot : () => {}} onReorderShot={liveRole === null || liveRole === 'host' ? reorderShot : () => {}} onShotListSettingsChange={liveRole === null || liveRole === 'host' ? updateShotListSettings : () => {}} onExportShotList={(format, scope) => { void exportShotList(format, scope) }} onOpenBlocking={() => setView('blocking')} /> : <>
      {timelineMode === 'master' ? <V2MasterShotBin shots={projectDocument.shots} scenes={projectDocument.scenes} activeShotId={activeMasterClipId ? projectDocument.masterSequence.clips.find((clip) => clip.id === activeMasterClipId)?.shotId ?? null : null} onSelectShot={(shotId) => { const clip = projectDocument.masterSequence.clips.find((candidate) => candidate.shotId === shotId); if (clip) selectMasterClip(clip.id, 0) }} onAddShot={liveRole === null || liveRole === 'host' ? addShotToMaster : () => {}} /> : <V2ScenePanel scenes={projectDocument.scenes} activeSceneId={projectDocument.activeSceneId} actors={sceneDocument.actors} props={sceneDocument.props} walls={sceneDocument.walls} openings={sceneDocument.openings} lights={sceneDocument.lights} cameras={sceneDocument.cameras} activeCameraId={sceneDocument.activeCameraId} selectedEntityIds={selectedEntityIds} onSelectScene={switchScene} onAddScene={liveRole === null || liveRole === 'host' ? addScene : () => {}} onRenameScene={liveRole === null || liveRole === 'host' ? renameScene : () => {}} onDuplicateScene={liveRole === null || liveRole === 'host' ? duplicateScene : () => {}} onDeleteScene={liveRole === null || liveRole === 'host' ? deleteScene : () => {}} onImportScene={liveRole === null || liveRole === 'host' ? importScene : () => {}} onExportScene={exportScene} onAddActor={liveRole === null || liveRole === 'host' ? addActor : () => {}} onAddProp={liveRole === null || liveRole === 'host' ? addProp : () => {}} onAddWall={liveRole === null || liveRole === 'host' ? addWall : () => {}} onAddOpening={liveRole === null || liveRole === 'host' ? addOpening : () => {}} onAddSun={liveRole === null || liveRole === 'host' ? addSun : () => {}} onAddCamera={liveRole === null || liveRole === 'host' ? addCamera : () => {}} onSetActiveCamera={liveRole === null || liveRole === 'host' ? setActiveCamera : () => {}} onSelectEntity={handleSelectionChange} onBeginEntityRename={liveRole === null || liveRole === 'host' ? beginEntityRename : () => {}} shots={projectDocument.shots} activeShotId={projectDocument.activeShotId} onCreateShot={liveRole === null || liveRole === 'host' ? createShotFromCurrentSetup : () => {}} onSelectShot={activateShot} onRenameShot={liveRole === 'viewer' ? () => {} : renameShotForRole} onDuplicateShot={liveRole === null || liveRole === 'host' ? duplicateShot : () => {}} onDeleteShot={liveRole === null || liveRole === 'host' ? deleteShot : () => {}} onMoveShot={liveRole === null || liveRole === 'host' ? moveShot : () => {}} onCaptureShotThumbnail={(shotId) => { void captureShotThumbnail(shotId) }} onShotNotesChange={liveRole === 'viewer' ? () => {} : updateShotNotesForRole} onShotRangeChange={liveRole === null || liveRole === 'host' ? updateShotRange : () => {}} onPreviewShot={previewShot} onAddShotToMaster={liveRole === null || liveRole === 'host' ? addShotToMaster : () => {}} />}
      <V2Stage
        view={view}
        activeSceneId={projectDocument.activeSceneId}
        sceneScopeId={`${projectDocument.id}:${projectDocument.activeSceneId}`}
        actors={sceneDocument.actors}
        props={sceneDocument.props}
        walls={sceneDocument.walls}
        openings={sceneDocument.openings}
        lights={sceneDocument.lights}
        cameras={sceneDocument.cameras}
        activeCameraId={sceneDocument.activeCameraId}
        selectedEntityId={selectedEntityId}
        selectedEntityIds={selectedEntityIds}
        tool={liveRole === 'viewer' ? 'select' : transformTool}
        onSelectionChange={handleSelectionChange}
        onBeginEntityRename={beginEntityRename}
        onToolChange={liveRole === 'viewer' ? () => {} : setTransformTool}
        onTransformStart={liveRole === 'viewer' ? () => {} : handleTransformStart}
        onTransformEnd={liveRole === 'viewer' ? () => {} : handleTransformEnd}
        onTransformPreview={liveRole === 'viewer' ? () => {} : handleTransformPreview}
        onTransformBatchStart={liveRole === 'viewer' ? () => {} : handleTransformBatchStart}
        onTransformBatchEnd={liveRole === 'viewer' ? () => {} : handleTransformBatchEnd}
        onTransformBatchPreview={liveRole === 'viewer' ? () => {} : handleTransformBatchPreview}
        canTransformEntity={canTransformEntity}
        canTransformGroup={canTransformGroup}
        onTransformPermissionRequest={requestTransformPermission}
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
        sceneRevision={cameraViewSceneRevision}
        isPlaying={isPlaying}
        transformingEntityId={transformingEntityId}
        suspendedTimelineEntityIds={suspendedTimelineEntityIds}
        suspendedTimelineProperties={suspendedTimelineProperties}
        runtimeSceneRef={sceneDocumentRef}
        masterPreview={masterPreview}
        timeline={sceneDocument.timeline}
        isScrubbing={isScrubbing}
        lastTransformDebug={lastTransformDebug}
        selectedFrameGuideId={selectedFrameGuideId}
        selectedTimelineKeyframes={selectedTimelineKeyframes}
        cameraPathVisible={cameraPathVisible}
        selectedCameraPathSegment={selectedCameraPathSegment}
        onCameraPathSegmentSelect={handleCameraPathSegmentSelect}
        onCameraPathKeyframeSelect={handleCameraPathKeyframeSelect}
        onCameraPathPointMoveStart={handleCameraPathPointMoveStart}
        onCameraPathPointMovePreview={() => {}}
        onCameraPathPointMoveEnd={handleCameraPathPointMoveEnd}
        thumbnailCaptureRef={thumbnailCaptureRef}
        phoneCameraLiveApplyRef={phoneCameraLiveApplyRef}
        phoneCameraLive={phoneCameraState.status === 'connected'}
        shortcutBindings={shortcutBindings}
        readOnly={liveRole === 'viewer'}
        livePointer={livePointer}
        livePointerActive={liveRole === 'host' && livePointerActive}
        onLivePointerMove={(point) => publishLivePointer({ ...point, participantId: '', displayName: '', surface: 'stage', updatedAt: Date.now() })}
      />
      {timelineMode === 'master' ? <V2MasterInspector sequence={projectDocument.masterSequence} shots={projectDocument.shots} scenes={projectDocument.scenes} selection={masterSelection} rate={masterSequenceFrameRate(projectDocument.masterSequence, projectDocument.shots, projectDocument.scenes, sceneDocument.timeline.frameRate).rate} onOpenShot={openMasterClip} onDuplicateClip={liveRole === null || liveRole === 'host' ? duplicateMasterClipAction : () => {}} onRemoveClip={liveRole === null || liveRole === 'host' ? removeMasterClipAction : () => {}} onTrimClip={liveRole === null || liveRole === 'host' ? trimMasterClip : () => {}} onMusicChange={liveRole === null || liveRole === 'host' ? updateMasterMusic : () => {}} onRemoveMusic={liveRole === null || liveRole === 'host' ? removeMasterMusic : () => {}} /> : <V2DetailsPanel actor={selectedActor} prop={selectedProp} wall={selectedWall} opening={selectedOpening} sun={selectedSun} camera={selectedCamera} selectedEntityIds={selectedEntityIds} selectedTypeCounts={selectedTypeCounts} timeline={sceneDocument.timeline} selectedTimelineKeyframes={selectedTimelineKeyframes} selectedCameraPathSegment={selectedCameraPathSegment} cameraPathVisible={cameraPathVisible} onCameraPathVisibleChange={setCameraPathVisible} onCameraPathSegmentSelect={handleCameraPathSegmentSelect} onCameraPathRetime={liveRole === null || liveRole === 'host' ? handleCameraPathRetime : () => null} cameraMoveReview={cameraMoveReview} onCameraMoveReview={startCameraMoveReview} onCameraMoveReviewStop={() => stopPlaybackSession()} onCameraMoveReviewPose={goToCameraMovePose} onActorChange={liveRole === 'viewer' ? () => {} : updateActorForRole} onPropChange={liveRole === 'viewer' ? () => {} : updatePropForRole} onCameraChange={liveRole === 'viewer' ? () => {} : updateCameraForRole} onAimAtTarget={liveRole === null || liveRole === 'host' ? aimCameraAtTarget : () => {}} onMoveCameraBlocking={liveRole === null || liveRole === 'host' ? moveCameraBlocking : () => {}} onFrameCamera={liveRole === null || liveRole === 'host' ? frameCameraOnActor : () => {}} cameraTargets={cameraTargetEntities} cameraSubjectDistance={selectedCameraSubjectDistance} onWallChange={liveRole === null || liveRole === 'host' ? updateWall : () => {}} onOpeningChange={liveRole === null || liveRole === 'host' ? updateOpening : () => {}} onSunChange={liveRole === null || liveRole === 'host' ? updateSun : () => {}} onDuplicateEntity={liveRole === null || liveRole === 'host' ? duplicateEntity : () => {}} onDeleteEntity={liveRole === null || liveRole === 'host' ? deleteEntity : () => {}} onDeleteSelected={liveRole === null || liveRole === 'host' ? deleteSelectedEntities : () => {}} onSetActiveCamera={liveRole === null || liveRole === 'host' ? setActiveCamera : () => {}} onAddKeyframe={addKeyframeForRole} activeCameraId={sceneDocument.activeCameraId} selectedFrameGuideId={selectedFrameGuideId} onFrameGuideSelection={setSelectedFrameGuideId} renameRequest={renameRequest} phoneCamera={{ enabled: platformAdapter.kind === 'desktop' && liveRole !== 'viewer' && liveRole !== 'editor', state: phoneCameraState, onPair: () => { try { phoneCameraControllerRef.current?.beginPairing() } catch (error) { if (import.meta.env.DEV) console.error('[phone-camera] pairing failed', error) } }, onDisconnect: () => phoneCameraControllerRef.current?.disconnect(), onRecenter: () => phoneCameraControllerRef.current?.recenter(), onControlChannels: (channels) => phoneCameraControllerRef.current?.setControlChannels(channels), onMovementScale: (value) => phoneCameraControllerRef.current?.setMovementScale(value), onRotationSensitivity: (value) => phoneCameraControllerRef.current?.setRotationSensitivity(value), onSetCameraKey: setPhoneCameraKey, onStartRecording: startPhoneCameraRecording, onStopRecording: stopPhoneCameraRecording }} />}
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
      <div className="v2-timeline-shell">
        {timelineMode === 'scene' ? <V2Timeline key={`${projectDocument.id}:${projectDocument.createdAt}:${sceneDocument.metadata.id}`} timeline={sceneDocument.timeline} tracks={sceneDocument.timeline.tracks} entities={timelineEntities} selectedEntityId={selectedEntityId} isPlaying={isPlaying} isLooping={isLooping} onFrameChange={liveRole === 'viewer' && liveFollowHost ? () => {} : setCurrentFrame} onDurationChange={liveRole === null || liveRole === 'host' ? changeTimelineDuration : () => {}} onFrameRateChange={liveRole === null || liveRole === 'host' ? changeFrameRate : () => {}} onTogglePlayback={liveRole === null || liveRole === 'host' ? togglePlayback : () => {}} onStopPlayback={liveRole === null || liveRole === 'host' ? () => stopPlaybackSession() : () => {}} onMarkIn={liveRole === null || liveRole === 'host' ? () => changeMark('in') : () => {}} onMarkOut={liveRole === null || liveRole === 'host' ? () => changeMark('out') : () => {}} onToggleLoop={liveRole === null || liveRole === 'host' ? () => setIsLooping((current) => !current) : () => {}} onMoveKeyframes={moveKeyframesForRole} onKeyframeInterpolationChange={changeKeyframeEasingForRole} canEditKeyframe={liveRole === 'editor' ? canEditTimelineSelection : undefined} canEditTimelineStructure={liveRole === null || liveRole === 'host'} canEditTimelineInterpolation={liveRole === null || liveRole === 'host'} onKeyframeEditStart={beginTimelineKeyframeLease} onKeyframeEditActivity={renewActiveLiveLease} onKeyframeEditEnd={endTimelineKeyframeLease} selectedKeyframes={selectedTimelineKeyframes} onKeyframeSelect={selectTimelineKeyframe} onEntitySelect={handleSelectionChange} onScrubStart={() => setIsScrubbing(true)} onScrubEnd={() => setIsScrubbing(false)} onSwitchToScene={() => switchTimelineMode('scene')} onSwitchToMaster={() => switchTimelineMode('master')} /> : <V2MasterTimeline sequence={projectDocument.masterSequence} shots={projectDocument.shots} scenes={projectDocument.scenes} activeClipId={activeMasterClipId} masterFrame={masterFrame} fallbackRate={sceneDocument.timeline.frameRate} isPlaying={isMasterPlaying} isLooping={isMasterLooping} musicPeaks={masterMusicPeaks} onSelectClip={selectMasterClip} onSelectMusic={selectMasterMusic} onSetMasterFrame={liveRole === null || liveRole === 'host' ? setMasterPlayhead : () => {}} onReturnToStart={liveRole === null || liveRole === 'host' ? returnMasterToStart : () => {}} onAddShot={liveRole === null || liveRole === 'host' ? addShotToMaster : () => {}} onReorderClip={liveRole === null || liveRole === 'host' ? reorderMasterClipAction : () => {}} onImportMusic={liveRole === null || liveRole === 'host' ? (file) => { void importMasterMusic(file) } : () => {}} onPlay={liveRole === null || liveRole === 'host' ? playMasterPlayback : () => {}} onPause={liveRole === null || liveRole === 'host' ? pauseMasterPlayback : () => {}} onStop={liveRole === null || liveRole === 'host' ? () => stopMasterPlayback(false) : () => {}} onToggleLoop={liveRole === null || liveRole === 'host' ? () => setIsMasterLooping((current) => !current) : () => {}} onMarkIn={liveRole === null || liveRole === 'host' ? () => changeMasterMark('in') : () => {}} onMarkOut={liveRole === null || liveRole === 'host' ? () => changeMasterMark('out') : () => {}} onSwitchToScene={() => switchTimelineMode('scene')} onSwitchToMaster={() => switchTimelineMode('master')} />}
      </div>
      {exportStatus === 'preparing' || exportStatus === 'exporting' || exportStatus === 'encoding' || exportStatus === 'finalizing' ? <div className="v2-export-lock" aria-hidden="true" /> : null}
      </>}
      {exportOpen ? <V2ExportModal document={sceneDocument} project={projectDocument} projectName={projectDocument.name} sceneName={sceneDocument.metadata.name} settings={exportSettings} status={exportStatus} progress={exportProgress} error={exportError} onSettingsChange={setExportSettings} onExport={startExport} onCancel={cancelExport} onClose={() => setExportOpen(false)} desktop={platformAdapter.kind === 'desktop'} /> : null}
      <LiveReviewPanel open={livePanelOpen} role={liveRole} status={liveStatus} session={liveSession} inviteUrl={liveInviteUrl} viewerCount={liveViewerCount} participants={liveParticipants} leases={liveLeases} hostConnected={liveHostConnected} chatMessages={liveChatMessages} followHost={liveFollowHost} pointerActive={livePointerActive} inviteSession={liveInviteSession} error={liveError} canStart={liveRelayConfig.url !== null} configurationError={liveRelayConfig.error} onStart={(name) => { void startLiveReview(name) }} onJoin={(name) => { void joinLiveReview(name) }} onFollowHost={changeLiveFollowHost} onTogglePointer={() => { setLivePointerActive((active) => { if (active) clearLivePointer(); return !active }) }} onSendChat={sendLiveChat} onEnd={endLiveReview} onLeave={leaveLiveReview} onClose={() => setLivePanelOpen(false)} onRoleChange={changeLiveParticipantRole} onTakeControl={takeLiveLeaseControl} />
      {shortcutSettingsOpen ? <V2ShortcutSettings bindings={shortcutBindings} onChange={updateShortcut} onReset={resetShortcuts} onClose={() => setShortcutSettingsOpen(false)} recoveryEnabled={recoveryEnabled} onRecoveryEnabledChange={platformAdapter.kind === 'desktop' ? setRecoveryPreference : undefined} showMacosBetaHelp={isMacOSDesktop()} appVersion={APP_VERSION} websiteUrl={APP_WEBSITE_URL} contactEmail={APP_CONTACT_EMAIL} onOpenExternalUrl={(url) => { void platformAdapter.openExternalUrl(url) }} updateState={updateState} onCheckForUpdates={() => { void checkForUpdates() }} onDownloadUpdate={() => downloadUpdate()} onLaterUpdate={dismissUpdate} downloadStatus={downloadStatus} downloadError={downloadError} autoUpdateChecks={updatePreferences.autoCheck} onAutoUpdateChecksChange={platformAdapter.kind === 'desktop' ? saveUpdatePreference : undefined} /> : null}
      {recoveryModalOpen && recoveryEntries.length > 0 ? <V2RecoveryCenter entries={recoveryEntries} requestedPath={recoveryRequestedPath} onRecover={(entry) => { void recoverProject(entry) }} onDiscard={(entry) => { void discardRecoveryEntry(entry) }} onOpenSaved={(entry) => { void openSavedVersion(entry) }} onClose={() => setRecoveryModalOpen(false)} /> : null}
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

function V2UpdateNotice({ release, downloadStatus, downloadError, onDownload, onLater }: { release: UpdateCheckResult; downloadStatus: 'idle' | 'opening' | 'error'; downloadError: string | null; onDownload: () => void; onLater: () => void }) {
  return <aside className="v2-update-notice" role="status"><div><strong>A new version of ND Blocking &amp; Previs is available.</strong><small>Version {release.latestVersion} is ready to download.</small>{downloadError ? <small className="v2-update-notice-error" role="alert">{downloadError}</small> : null}</div><div className="v2-update-notice-actions"><button className="v2-small-action" onClick={onDownload} disabled={downloadStatus === 'opening'} type="button">{downloadStatus === 'opening' ? 'Opening…' : 'Download Update'}</button><button className="v2-small-action is-muted" onClick={onLater} type="button">Later</button></div></aside>
}

export function V2App() {
  return <><V2DesktopViewportNotice /><V2EditorApp /></>
}
