export const LIVE_REVIEW_PROTOCOL_VERSION = 2
export const LIVE_REVIEW_MAX_MESSAGE_BYTES = 16 * 1024 * 1024
export const LIVE_REVIEW_SESSION_TTL_MS = 60 * 60 * 1000
export const LIVE_REVIEW_MAX_DISPLAY_NAME_LENGTH = 48
export const LIVE_REVIEW_MAX_CHAT_LENGTH = 1000
export const LIVE_REVIEW_CHAT_HISTORY_LIMIT = 100

export type LiveReviewWorkspace = 'blocking' | 'camera' | 'shot-list'
export type LiveReviewTimelineMode = 'scene' | 'master'
export type LiveReviewShotListView = 'grid' | 'list'
export type LiveReviewStageView = 'blocking' | 'camera'
export type LiveReviewRole = 'host' | 'editor' | 'viewer'
export type LiveReviewParticipantStatus = 'connected' | 'reconnecting'

export type LiveReviewParticipant = {
  participantId: string
  displayName: string
  role: LiveReviewRole
  status: LiveReviewParticipantStatus
}

export type LiveReviewCollaborativeEntityType = 'Actor' | 'Prop' | 'Camera'
export type LiveReviewTransformMode = 'move' | 'rotate' | 'scale'
export type LiveReviewLeaseTargetType = LiveReviewCollaborativeEntityType | 'Shot' | 'ShotOrder' | 'MasterClip' | 'MasterOrder' | 'Timeline'
export type LiveReviewTimelineEntityType = LiveReviewCollaborativeEntityType
export type LiveReviewTimelineProperty = 'position' | 'rotation' | 'scale'
export type LiveReviewTimelineOperation = 'add' | 'move' | 'delete' | 'update'
export type LiveReviewLease = {
  targetKey: string
  targetType: LiveReviewLeaseTargetType
  targetId: string
  targetLabel: string
  participantId: string
  displayName: string
  leaseId: string
  expiresAt: number
}

export type LiveReviewTransformPreview = {
  leaseId: string
  sceneId: string
  targetType: LiveReviewCollaborativeEntityType
  entityId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: [number, number, number]
  participantId: string
  displayName: string
}

export type LiveReviewTransformCommit = {
  operationId: string
  leaseId: string
  sceneId: string
  targetType: LiveReviewCollaborativeEntityType
  entityId: string
  mode: LiveReviewTransformMode
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: [number, number, number]
  baseProjectRevision: number
}

export type LiveReviewShotField = 'name' | 'notes' | 'shotSize' | 'angle' | 'movement' | 'equipment'
export type LiveReviewShotPatch = {
  operationId: string
  leaseId: string
  shotId: string
  field: LiveReviewShotField
  value: string | null
  baseProjectRevision: number
}

export type LiveReviewShotUpdateField = LiveReviewShotField | 'startFrame' | 'endFrame' | 'cameraId'
export type LiveReviewShotUpdatePatch = Partial<Record<LiveReviewShotUpdateField, string | number | null>>
export type LiveReviewPlanningCommit =
  | { operation: 'shot_create'; operationId: string; leaseId: string; sceneId: string; cameraId: string; baseProjectRevision: number }
  | { operation: 'shot_update'; operationId: string; leaseId: string; shotId: string; patch: LiveReviewShotUpdatePatch; baseProjectRevision: number }
  | { operation: 'shot_reorder'; operationId: string; leaseId: string; shotId: string; targetIndex: number; baseProjectRevision: number }
  | { operation: 'master_clip_add'; operationId: string; leaseId: string; shotId: string; targetIndex: number; baseProjectRevision: number }
  | { operation: 'master_clip_update'; operationId: string; leaseId: string; clipId: string; sourceStartFrame: number; sourceEndFrame: number; baseProjectRevision: number }
  | { operation: 'master_clip_duplicate'; operationId: string; leaseId: string; clipId: string; baseProjectRevision: number }
  | { operation: 'master_clip_remove'; operationId: string; leaseId: string; clipId: string; baseProjectRevision: number }
  | { operation: 'master_reorder'; operationId: string; leaseId: string; clipId: string; targetIndex: number; baseProjectRevision: number }
export type LiveReviewPlanningDraft =
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'shot_create' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'shot_update' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'shot_reorder' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'master_clip_add' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'master_clip_update' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'master_clip_duplicate' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'master_clip_remove' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>
  | Omit<Extract<LiveReviewPlanningCommit, { operation: 'master_reorder' }>, 'operationId' | 'leaseId' | 'baseProjectRevision'>

export type LiveReviewTimelineCommit = {
  operationId: string
  leaseId: string
  sceneId: string
  entityType: LiveReviewTimelineEntityType
  entityId: string
  property: LiveReviewTimelineProperty
  operation: LiveReviewTimelineOperation
  keyframeId?: string
  frame?: number
  targetFrame?: number
  value?: [number, number, number]
  baseProjectRevision: number
}

export type LiveReviewEditRejection = 'target_busy' | 'permission_denied' | 'stale_revision' | 'host_unavailable' | 'target_missing' | 'invalid_payload' | 'duplicate_operation' | 'lease_expired'
export type LiveReviewEditResult = {
  operationId: string
  accepted: boolean
  reason?: LiveReviewEditRejection
  projectRevision: number
}

export type LiveReviewPointer = {
  participantId: string
  displayName: string
  x: number
  y: number
  surface: 'stage'
  visible: boolean
  updatedAt: number
}

export type LiveReviewChatMessage = {
  messageId: string
  participantId: string
  displayName: string
  role: LiveReviewRole
  timestamp: number
  text: string
}

/** Structural wire shape keeps the relay independent from the editor's module graph. */
export type LiveReviewProject = {
  id: string
  name: string
  activeSceneId: string
  activeShotId: string | null
  scenes: Array<{ id: string; name: string; scene: { activeCameraId?: string | null; timeline?: { currentFrame?: number }; [key: string]: unknown } }>
  shots: unknown[]
  masterSequence?: unknown
}

export type LiveReviewState = {
  workspace: LiveReviewWorkspace
  activeSceneId: string | null
  activeShotId: string | null
  activeCameraId: string | null
  timelineMode: LiveReviewTimelineMode
  sceneFrame: number
  masterFrame: number
  scenePlaying: boolean
  masterPlaying: boolean
  stageViewMode: LiveReviewStageView
  cameraPreviewVisible: boolean
  shotListViewMode: LiveReviewShotListView
  shotListSceneFilter: string | null
  presentMode: boolean
  projectRevision: number
}

export type LiveReviewProjectSnapshot = {
  project: LiveReviewProject
  bytes: number
}

export type LiveReviewTransform = {
  sceneId: string
  entityId: string
  position: [number, number, number]
  rotation: [number, number, number]
  scale?: [number, number, number]
}

export type LiveReviewClientMessage =
  | { v: 2; type: 'create_session'; participantId?: string; displayName?: string }
  | { v: 2; type: 'join_session'; session: string; token?: string; participantId?: string; participantToken?: string; displayName?: string }
  | { v: 2; type: 'participant_profile'; displayName: string }
  | { v: 2; type: 'host_project_snapshot'; revision: number; project: LiveReviewProject }
  | { v: 2; type: 'host_present_state'; state: LiveReviewState }
  | { v: 2; type: 'host_transform'; transform: LiveReviewTransform }
  | { v: 2; type: 'host_pointer'; pointer: LiveReviewPointer }
  | { v: 2; type: 'chat_send'; text: string }
  | { v: 2; type: 'participant_role_update'; participantId: string; role: 'editor' | 'viewer' }
  | { v: 2; type: 'lease_request'; requestId: string; targetType: LiveReviewLeaseTargetType; targetId: string; targetLabel: string }
  | { v: 2; type: 'lease_renew'; leaseId: string }
  | { v: 2; type: 'lease_release'; leaseId: string }
  | { v: 2; type: 'lease_take_control'; requestId: string; targetType: LiveReviewLeaseTargetType; targetId: string; targetLabel: string }
  | { v: 2; type: 'editor_transform_preview'; preview: Omit<LiveReviewTransformPreview, 'participantId' | 'displayName'> }
  | { v: 2; type: 'editor_transform_commit'; commit: LiveReviewTransformCommit }
  | { v: 2; type: 'editor_shot_patch'; patch: LiveReviewShotPatch }
  | { v: 2; type: 'editor_planning_commit'; commit: LiveReviewPlanningCommit }
  | { v: 2; type: 'editor_timeline_commit'; commit: LiveReviewTimelineCommit }
  | { v: 2; type: 'host_edit_result'; result: LiveReviewEditResult }
  | { v: 2; type: 'request_snapshot' }
  | { v: 2; type: 'end_session' }
  | { v: 2; type: 'leave_session' }
  | { v: 2; type: 'ping'; t: number }

export type LiveReviewServerMessage =
  | { v: 2; type: 'session_created'; session: string; token: string; expiresAt: number; participantId: string; participantToken: string; participants: LiveReviewParticipant[]; chatHistory: LiveReviewChatMessage[]; pointer: LiveReviewPointer | null; leases: LiveReviewLease[]; hostConnected: boolean }
  | { v: 2; type: 'session_snapshot'; project: LiveReviewProject; state: LiveReviewState; revision: number; projectRevision: number; hostConnected: boolean; participantId: string; participantToken: string; participants: LiveReviewParticipant[]; chatHistory: LiveReviewChatMessage[]; pointer: LiveReviewPointer | null; leases: LiveReviewLease[] }
  | { v: 2; type: 'project_update'; project: LiveReviewProject; revision: number }
  | { v: 2; type: 'present_state'; state: LiveReviewState }
  | { v: 2; type: 'transform_update'; transform: LiveReviewTransform }
  | { v: 2; type: 'transform_preview'; preview: LiveReviewTransformPreview }
  | { v: 2; type: 'edit_transform_request'; commit: LiveReviewTransformCommit; participantId: string; displayName: string }
  | { v: 2; type: 'edit_shot_request'; patch: LiveReviewShotPatch; participantId: string; displayName: string }
  | { v: 2; type: 'edit_planning_request'; commit: LiveReviewPlanningCommit; participantId: string; displayName: string }
  | { v: 2; type: 'edit_timeline_request'; commit: LiveReviewTimelineCommit; participantId: string; displayName: string }
  | { v: 2; type: 'edit_result'; result: LiveReviewEditResult }
  | { v: 2; type: 'presence_snapshot'; participants: LiveReviewParticipant[]; hostConnected: boolean }
  | { v: 2; type: 'presence_update'; action: 'joined' | 'left' | 'updated'; participant: LiveReviewParticipant }
  | { v: 2; type: 'role_updated'; participant: LiveReviewParticipant }
  | { v: 2; type: 'lease_granted'; requestId: string; lease: LiveReviewLease }
  | { v: 2; type: 'lease_denied'; requestId: string; reason: LiveReviewEditRejection }
  | { v: 2; type: 'lease_update'; lease: LiveReviewLease | null; targetKey?: string }
  | { v: 2; type: 'lease_snapshot'; leases: LiveReviewLease[] }
  | { v: 2; type: 'host_editing_paused'; paused: boolean }
  | { v: 2; type: 'host_pointer'; pointer: LiveReviewPointer | null }
  | { v: 2; type: 'chat_message'; message: LiveReviewChatMessage }
  | { v: 2; type: 'chat_history'; messages: LiveReviewChatMessage[] }
  | { v: 2; type: 'presence'; viewers: number; hostConnected: boolean }
  | { v: 2; type: 'host_disconnected'; graceUntil: number }
  | { v: 2; type: 'session_ended'; reason: string }
  | { v: 2; type: 'pong'; t: number }
  | { v: 2; type: 'error'; code: string; message: string }

export type LiveReviewMessage = LiveReviewClientMessage | LiveReviewServerMessage

export function defaultLiveReviewState(project: LiveReviewProject): LiveReviewState {
  const scene = project.scenes.find((entry) => entry.id === project.activeSceneId) ?? project.scenes[0]
  return {
    workspace: 'blocking',
    activeSceneId: scene?.id ?? null,
    activeShotId: project.activeShotId,
    activeCameraId: scene?.scene.activeCameraId ?? null,
    timelineMode: 'scene',
    sceneFrame: scene?.scene.timeline?.currentFrame ?? 0,
    masterFrame: 0,
    scenePlaying: false,
    masterPlaying: false,
    stageViewMode: 'blocking',
    cameraPreviewVisible: false,
    shotListViewMode: 'grid',
    shotListSceneFilter: null,
    presentMode: false,
    projectRevision: 0,
  }
}

export function serializeLiveReviewMessage(message: LiveReviewMessage): string {
  return JSON.stringify(message)
}

export function parseLiveReviewMessage(raw: unknown, maxBytes = LIVE_REVIEW_MAX_MESSAGE_BYTES): LiveReviewMessage | null {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > maxBytes) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (!isRecord(value) || value.v !== LIVE_REVIEW_PROTOCOL_VERSION || typeof value.type !== 'string') return null
    return value as LiveReviewMessage
  } catch {
    return null
  }
}

/** Reads only the wire version so the relay can explain a client mismatch. */
export function liveReviewMessageVersion(raw: unknown, maxBytes = LIVE_REVIEW_MAX_MESSAGE_BYTES): number | null {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > maxBytes) return null
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    return isRecord(value) && typeof value.v === 'number' && Number.isInteger(value.v) ? value.v : null
  } catch {
    return null
  }
}

export function isLiveReviewState(value: unknown): value is LiveReviewState {
  if (!isRecord(value)) return false
  return isOneOf(value.workspace, ['blocking', 'camera', 'shot-list']) &&
    (value.activeSceneId === null || typeof value.activeSceneId === 'string') &&
    (value.activeShotId === null || typeof value.activeShotId === 'string') &&
    (value.activeCameraId === null || typeof value.activeCameraId === 'string') &&
    isOneOf(value.timelineMode, ['scene', 'master']) &&
    finiteNumber(value.sceneFrame) && finiteNumber(value.masterFrame) &&
    typeof value.scenePlaying === 'boolean' && typeof value.masterPlaying === 'boolean' &&
    isOneOf(value.stageViewMode, ['blocking', 'camera']) &&
    typeof value.cameraPreviewVisible === 'boolean' &&
    isOneOf(value.shotListViewMode, ['grid', 'list']) &&
    (value.shotListSceneFilter === null || typeof value.shotListSceneFilter === 'string') &&
    typeof value.presentMode === 'boolean' && finiteNumber(value.projectRevision)
}

export function isLiveReviewTransform(value: unknown): value is LiveReviewTransform {
  if (!isRecord(value) || typeof value.sceneId !== 'string' || typeof value.entityId !== 'string') return false
  return vector3(value.position) && vector3(value.rotation) && (value.scale === undefined || vector3(value.scale))
}

export function isLiveReviewCollaborativeTransform(value: unknown): value is LiveReviewTransformCommit {
  if (!isRecord(value) || typeof value.operationId !== 'string' || typeof value.leaseId !== 'string' || typeof value.sceneId !== 'string' || typeof value.entityId !== 'string' || typeof value.baseProjectRevision !== 'number') return false
  if (!isOneOf(value.targetType, ['Actor', 'Prop', 'Camera']) || !isOneOf(value.mode, ['move', 'rotate', 'scale'])) return false
  return vector3(value.position) && vector3(value.rotation) && (value.scale === undefined || vector3(value.scale)) && Number.isFinite(value.baseProjectRevision)
}

export function isLiveReviewTransformPreview(value: unknown): value is Omit<LiveReviewTransformPreview, 'participantId' | 'displayName'> {
  if (!isRecord(value) || typeof value.leaseId !== 'string' || typeof value.sceneId !== 'string' || typeof value.entityId !== 'string') return false
  return isOneOf(value.targetType, ['Actor', 'Prop', 'Camera']) && vector3(value.position) && vector3(value.rotation) && (value.scale === undefined || vector3(value.scale))
}

export function isLiveReviewShotPatch(value: unknown): value is LiveReviewShotPatch {
  if (!isRecord(value) || typeof value.operationId !== 'string' || typeof value.leaseId !== 'string' || typeof value.shotId !== 'string' || typeof value.baseProjectRevision !== 'number' || !Number.isFinite(value.baseProjectRevision)) return false
  return isOneOf(value.field, ['name', 'notes', 'shotSize', 'angle', 'movement', 'equipment']) && (value.value === null || typeof value.value === 'string')
}

export function isLiveReviewPlanningCommit(value: unknown): value is LiveReviewPlanningCommit {
  if (!isRecord(value) || !boundedId(value.operationId) || !boundedId(value.leaseId) || !integerAtLeastZero(value.baseProjectRevision) || typeof value.operation !== 'string') return false
  if (value.operation === 'shot_create') return boundedId(value.sceneId) && boundedId(value.cameraId)
  if (value.operation === 'shot_update') {
    if (!boundedId(value.shotId) || !isRecord(value.patch) || Object.keys(value.patch).length === 0) return false
    const fields = ['name', 'notes', 'shotSize', 'angle', 'movement', 'equipment', 'startFrame', 'endFrame', 'cameraId']
    return Object.keys(value.patch).every((field) => fields.includes(field)) && Object.values(value.patch).every((entry) => entry === null || typeof entry === 'string' || (typeof entry === 'number' && Number.isFinite(entry)))
  }
  if (value.operation === 'shot_reorder') return boundedId(value.shotId) && integerAtLeastZero(value.targetIndex)
  if (value.operation === 'master_clip_add') return boundedId(value.shotId) && integerAtLeastZero(value.targetIndex)
  if (value.operation === 'master_clip_update') return boundedId(value.clipId) && integerAtLeastZero(value.sourceStartFrame) && integerAtLeastZero(value.sourceEndFrame) && value.sourceEndFrame > value.sourceStartFrame
  if (value.operation === 'master_clip_duplicate' || value.operation === 'master_clip_remove') return boundedId(value.clipId)
  if (value.operation === 'master_reorder') return boundedId(value.clipId) && integerAtLeastZero(value.targetIndex)
  return false
}

export function isLiveReviewTimelineCommit(value: unknown): value is LiveReviewTimelineCommit {
  if (!isRecord(value) || !boundedId(value.operationId) || !boundedId(value.leaseId) || !boundedId(value.sceneId) || !boundedId(value.entityId) || !integerAtLeastZero(value.baseProjectRevision)) return false
  if (!isOneOf(value.entityType, ['Actor', 'Prop', 'Camera']) || !isOneOf(value.property, ['position', 'rotation', 'scale']) || !isOneOf(value.operation, ['add', 'move', 'delete', 'update'])) return false
  if (value.property === 'scale' && value.entityType !== 'Prop') return false
  if (value.keyframeId !== undefined && !boundedId(value.keyframeId)) return false
  if (!optionalIntegerAtLeastZero(value.frame) || !optionalIntegerAtLeastZero(value.targetFrame)) return false
  if (value.value !== undefined && !vector3(value.value)) return false
  if (value.operation === 'add') return value.keyframeId === undefined && value.targetFrame === undefined && value.value === undefined
  if (value.operation === 'move') return value.keyframeId !== undefined && value.targetFrame !== undefined && value.frame === undefined && value.value === undefined
  if (value.operation === 'delete') return value.keyframeId !== undefined && value.frame === undefined && value.targetFrame === undefined && value.value === undefined
  return value.keyframeId !== undefined && value.frame === undefined && value.targetFrame === undefined && value.value !== undefined
}

export function isLiveReviewLeaseTarget(value: unknown): value is { targetType: LiveReviewLeaseTargetType; targetId: string; targetLabel: string } {
  return isRecord(value) && isOneOf(value.targetType, ['Actor', 'Prop', 'Camera', 'Shot', 'ShotOrder', 'MasterClip', 'MasterOrder', 'Timeline']) && typeof value.targetId === 'string' && typeof value.targetLabel === 'string' && value.targetId.length > 0 && value.targetId.length <= 256 && value.targetLabel.length <= 128
}

export function isLiveReviewProject(value: unknown): value is LiveReviewProject {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || !Array.isArray(value.scenes) || !Array.isArray(value.shots)) return false
  return value.scenes.length > 0 && value.scenes.every((scene) => isRecord(scene) && typeof scene.id === 'string' && isRecord(scene.scene))
}

export function randomLiveReviewId(bytes = 18): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = new Uint8Array(bytes)
    crypto.getRandomValues(values)
    return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export function normalizeLiveReviewDisplayName(value: unknown, fallback = 'Guest'): string {
  const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, LIVE_REVIEW_MAX_DISPLAY_NAME_LENGTH) : ''
  return normalized || fallback
}

export function isLiveReviewPointer(value: unknown): value is LiveReviewPointer {
  if (!isRecord(value) || typeof value.participantId !== 'string' || typeof value.displayName !== 'string' || value.surface !== 'stage' || typeof value.visible !== 'boolean' || !finiteNumber(value.x) || !finiteNumber(value.y) || !finiteNumber(value.updatedAt)) return false
  return value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1
}

export function isLiveReviewChatText(value: unknown): value is string {
  return typeof value === 'string' && value.replace(/\s+/g, ' ').trim().length > 0 && value.replace(/\s+/g, ' ').trim().length <= LIVE_REVIEW_MAX_CHAT_LENGTH
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function vector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(finiteNumber)
}

function boundedId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
}

function integerAtLeastZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function optionalIntegerAtLeastZero(value: unknown): value is number | undefined {
  return value === undefined || integerAtLeastZero(value)
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
