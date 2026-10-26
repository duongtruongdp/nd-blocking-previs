import { describe, expect, it } from 'vitest'
import { createProjectDocument } from '../core/projectDocument'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { parseProjectFile } from '../core/projectPersistence'
import { createLiveReviewSnapshot } from '../liveReview/projectSnapshot'
import { defaultLiveReviewState, isLiveReviewChatText, isLiveReviewCollaborativeTransform, isLiveReviewPlanningCommit, isLiveReviewPointer, isLiveReviewProject, isLiveReviewShotPatch, isLiveReviewState, isLiveReviewTimelineCommit, LIVE_REVIEW_MAX_MESSAGE_BYTES, liveReviewMessageVersion, normalizeLiveReviewDisplayName, parseLiveReviewMessage, serializeLiveReviewMessage } from '../liveReview/protocol'
import { acceptLiveReviewProject, addLiveReviewParticipant, appendLiveReviewChat, canAcceptLiveReviewEditorProject, connectedLiveReviewParticipants, createLiveReviewRoom, isLiveReviewRoomExpired, publicLiveReviewParticipants, rememberLiveReviewOperation, setLiveReviewState } from '../../live-server/sessionStore'
import { liveRelayConfig, originAllowed } from '../../live-server/config'
import { buildLiveReviewInviteUrl, OFFICIAL_PRODUCTION_RELAY, parseLiveReviewInviteSession, PUBLIC_LIVE_REVIEW_INVITE_BASE, resolveLiveReviewInviteBaseUrl, resolveLiveReviewRelayConfig } from '../liveReview/liveReviewConfig'
import { defaultLiveReviewFollowHost, mergeLiveProjectWorkspace, sharedProjectSnapshot, shouldApplyLivePresentation } from '../core/liveReviewWorkspace'

function project() {
  return createProjectDocument('project-live', 'Live Review', createEmptySceneDocument())
}

describe('Live Review foundation', () => {
  it('keeps Editor workspace state local while shared project content updates', () => {
    const current = project()
    const secondScene = createEmptySceneDocument()
    secondScene.metadata.id = 'scene-02'
    current.scenes.push({ id: 'scene-02', name: 'Scene 02', scene: secondScene })
    current.activeSceneId = 'scene-02'
    const incoming = { ...current, activeSceneId: 'scene-01', activeShotId: null }
    const merged = mergeLiveProjectWorkspace(incoming, { ...current, activeSceneId: 'scene-02' }, true)
    expect(merged.activeSceneId).toBe('scene-02')
    expect(merged.scenes.find((scene) => scene.id === 'scene-02')?.scene.timeline.currentFrame).toBe(0)
    expect(defaultLiveReviewFollowHost('viewer')).toBe(true)
    expect(defaultLiveReviewFollowHost('editor')).toBe(false)
    expect(shouldApplyLivePresentation('editor', false)).toBe(false)
    expect(shouldApplyLivePresentation('editor', true)).toBe(true)
  })

  it('keeps an editor snapshot from changing the host workspace', () => {
    const host = project()
    const editor = structuredClone(host)
    editor.activeSceneId = 'scene-editor'
    const editorScene = createEmptySceneDocument()
    editorScene.metadata.id = 'scene-editor'
    editor.scenes.push({ id: 'scene-editor', name: 'Editor Scene', scene: editorScene })
    editor.scenes[0].scene.timeline.currentFrame = 73
    const published = sharedProjectSnapshot(editor, host)
    expect(published.activeSceneId).toBe(host.activeSceneId)
    expect(published.activeShotId).toBe(host.activeShotId)
    expect(published.scenes[0].scene.timeline.currentFrame).toBe(host.scenes[0].scene.timeline.currentFrame)
  })

  it('creates a portable project snapshot using the existing project serializer', () => {
    const source = project()
    const snapshot = createLiveReviewSnapshot(source)
    expect(snapshot.bytes).toBeGreaterThan(0)
    expect(isLiveReviewProject(snapshot.project)).toBe(true)
    expect(parseProjectFile(JSON.stringify({ format: 'ndblock', version: 1, project: snapshot.project })).id).toBe(source.id)
  })

  it('builds a presentation state from the active scene and rejects malformed state', () => {
    const state = defaultLiveReviewState(project())
    expect(state.workspace).toBe('blocking')
    expect(state.activeSceneId).toBe('scene-01')
    expect(isLiveReviewState(state)).toBe(true)
    expect(isLiveReviewState({ ...state, shotListViewMode: 'board' })).toBe(true)
    expect(isLiveReviewState({ ...state, shotListViewMode: 'unknown' })).toBe(false)
    expect(isLiveReviewState({ ...state, sceneFrame: Number.NaN })).toBe(false)
  })

  it('round-trips protocol messages and rejects the wrong protocol version', () => {
    const message = { v: 2 as const, type: 'ping' as const, t: 42 }
    expect(parseLiveReviewMessage(serializeLiveReviewMessage(message))).toEqual(message)
    expect(parseLiveReviewMessage(JSON.stringify({ ...message, v: 1 }))).toBeNull()
    expect(liveReviewMessageVersion(JSON.stringify({ ...message, v: 1 }))).toBe(1)
    expect(liveReviewMessageVersion('{bad json')).toBeNull()
  })

  it('accepts monotonic Host project revisions and binds presentation state to them', () => {
    const room = createLiveReviewRoom(100)
    const source = project()
    expect(acceptLiveReviewProject(room, source, 1, 100)).toBe(true)
    expect(acceptLiveReviewProject(room, source, 1, 200)).toBe(false)
    expect(setLiveReviewState(room, { ...defaultLiveReviewState(source), projectRevision: 0 }, 300)).toBe(true)
    expect(room.state?.projectRevision).toBe(1)
    expect(room.expiresAt).toBeGreaterThan(300)
  })

  it('allows only an Editor with the current revision to publish a project edit', () => {
    expect(canAcceptLiveReviewEditorProject('editor', 4, 4, true)).toBe(true)
    expect(canAcceptLiveReviewEditorProject('viewer', 4, 4, true)).toBe(false)
    expect(canAcceptLiveReviewEditorProject('editor', 3, 4, true)).toBe(false)
    expect(canAcceptLiveReviewEditorProject('editor', 4, 4, false)).toBe(false)
  })

  it('expires a room from its TTL without depending on the browser session', () => {
    const room = createLiveReviewRoom(100)
    expect(isLiveReviewRoomExpired(room, room.expiresAt - 1)).toBe(false)
    expect(isLiveReviewRoomExpired(room, room.expiresAt)).toBe(true)
  })

  it('resolves development, official production, and explicit relay configurations safely', () => {
    expect(resolveLiveReviewRelayConfig({ mode: 'development' }).url).toBe('ws://localhost:8787/live')
    expect(resolveLiveReviewRelayConfig({ mode: 'production' })).toMatchObject({ url: OFFICIAL_PRODUCTION_RELAY, configured: false, error: null })
    expect(resolveLiveReviewRelayConfig({ mode: 'production', configuredUrl: 'ws://relay.example/live' }).url).toBeNull()
    expect(resolveLiveReviewRelayConfig({ mode: 'production', configuredUrl: 'wss://relay.example/live' }).url).toBe('wss://relay.example/live')
    expect(resolveLiveReviewRelayConfig({ mode: 'production', configuredUrl: 'wss://relay.example/not-live' }).error).toBe('Live Review server URL must use the /live path.')
    expect(resolveLiveReviewRelayConfig({ mode: 'development', configuredUrl: 'ws://localhost:8787/live' }).url).toBe('ws://localhost:8787/live')
    expect(resolveLiveReviewRelayConfig({ mode: 'production', configuredUrl: 'ws://localhost:8787/live' }).error).toBe('Production Live Review requires a wss:// relay.')
    expect(resolveLiveReviewRelayConfig({ mode: 'production', configuredUrl: 'not a url' }).error).toBe('Live Review server configuration is invalid.')
  })

  it('keeps browser origin policy explicit and leaves the protocol path configurable', () => {
    const config = liveRelayConfig({ NODE_ENV: 'production', LIVE_ALLOWED_ORIGINS: 'https://app.example.com' })
    expect(originAllowed('https://app.example.com', config)).toBe(true)
    expect(originAllowed('https://other.example.com', config)).toBe(false)
    expect(originAllowed(undefined, config)).toBe(true)
    expect(config.websocketPath).toBe('/live')
    expect(config.maxMessageBytes).toBe(16 * 1024 * 1024)
  })

  it('accepts the observed macOS Tauri origin only when explicitly allowlisted', () => {
    const config = liveRelayConfig({ NODE_ENV: 'production', LIVE_ALLOWED_ORIGINS: 'https://blocking.duongtruongdp.net,tauri://localhost' })
    expect(originAllowed('tauri://localhost', config)).toBe(true)
    expect(originAllowed('tauri://other-app', config)).toBe(false)
  })

  it('parses comma-separated production origins with optional whitespace', () => {
    const config = liveRelayConfig({ NODE_ENV: 'production', LIVE_ALLOWED_ORIGINS: 'https://blocking.duongtruongdp.net, tauri://localhost' })
    expect(config.allowedOrigins).toEqual(['https://blocking.duongtruongdp.net', 'tauri://localhost'])
    expect(originAllowed('https://blocking.duongtruongdp.net', config)).toBe(true)
    expect(originAllowed('tauri://localhost', config)).toBe(true)
    expect(originAllowed('tauri://other-app', config)).toBe(false)
    expect(originAllowed('https://other.example.com', config)).toBe(false)
  })

  it('accepts hosting-provided PORT and HOST while retaining local defaults', () => {
    expect(liveRelayConfig({}).port).toBe(8787)
    expect(liveRelayConfig({ PORT: '49152', HOST: '0.0.0.0' })).toMatchObject({ port: 49152, host: '0.0.0.0' })
    expect(liveRelayConfig({ PORT: 'not-a-port', HOST: '' })).toMatchObject({ port: 8787, host: '127.0.0.1' })
  })

  it('keeps relay selection independent from the shareable invite destination', () => {
    expect(resolveLiveReviewInviteBaseUrl({ mode: 'production' })).toBe(PUBLIC_LIVE_REVIEW_INVITE_BASE)
    expect(resolveLiveReviewInviteBaseUrl({ mode: 'development', pageOrigin: 'http://localhost:5174' })).toBe('http://localhost:5174/')
    expect(resolveLiveReviewInviteBaseUrl({ mode: 'development', configuredUrl: 'https://blocking.duongtruongdp.net' })).toBe(PUBLIC_LIVE_REVIEW_INVITE_BASE + '/')
    expect(resolveLiveReviewInviteBaseUrl({ mode: 'development', pageOrigin: 'tauri://localhost' })).toBe(PUBLIC_LIVE_REVIEW_INVITE_BASE)
    expect(resolveLiveReviewInviteBaseUrl({ mode: 'production', configuredUrl: 'http://localhost:5174' })).toBe(PUBLIC_LIVE_REVIEW_INVITE_BASE)
  })

  it('builds the canonical public invite without putting the Host token in the URL', () => {
    const invite = buildLiveReviewInviteUrl('session-123', PUBLIC_LIVE_REVIEW_INVITE_BASE)
    expect(invite).toBe('https://blocking.duongtruongdp.net/?live=session-123')
    expect(invite).not.toContain('token')
    expect(invite).not.toContain('secret')
    expect(parseLiveReviewInviteSession(invite)).toBe('session-123')
    expect(parseLiveReviewInviteSession('https://blocking.duongtruongdp.net/')).toBeNull()
  })

  it('preserves the 16 MiB wire-size guard', () => {
    expect(parseLiveReviewMessage(JSON.stringify({ v: 2, type: 'ping', t: 1 }), LIVE_REVIEW_MAX_MESSAGE_BYTES)).not.toBeNull()
    expect(parseLiveReviewMessage('x'.repeat(LIVE_REVIEW_MAX_MESSAGE_BYTES + 1), LIVE_REVIEW_MAX_MESSAGE_BYTES)).toBeNull()
  })

  it('validates session-only participant names, normalized pointers, and bounded chat text', () => {
    expect(normalizeLiveReviewDisplayName('  Director   Đông  ')).toBe('Director Đông')
    expect(normalizeLiveReviewDisplayName('')).toBe('Guest')
    expect(isLiveReviewPointer({ participantId: 'host', displayName: 'Host', x: .25, y: .5, surface: 'stage', visible: true, updatedAt: 1 })).toBe(true)
    expect(isLiveReviewPointer({ participantId: 'host', displayName: 'Host', x: 1.1, y: .5, surface: 'stage', visible: true, updatedAt: 1 })).toBe(false)
    expect(isLiveReviewChatText('  Can we move Camera 02 lower?  ')).toBe(true)
    expect(isLiveReviewChatText('   ')).toBe(false)
    expect(isLiveReviewChatText('x'.repeat(1001))).toBe(false)
  })

  it('validates scoped editor operations and deduplicates operation ids per ephemeral room', () => {
    const transform = { operationId: 'operation-1', leaseId: 'lease-1', sceneId: 'scene-01', targetType: 'Camera' as const, entityId: 'camera-01', mode: 'rotate' as const, position: [1, 2, 3] as [number, number, number], rotation: [0, 0.5, 0] as [number, number, number], baseProjectRevision: 4 }
    const patch = { operationId: 'operation-2', leaseId: 'lease-2', shotId: 'shot-01', field: 'notes' as const, value: 'Blocking note', baseProjectRevision: 4 }
    expect(isLiveReviewCollaborativeTransform(transform)).toBe(true)
    expect(isLiveReviewCollaborativeTransform({ ...transform, targetType: 'Wall' })).toBe(false)
    expect(isLiveReviewShotPatch(patch)).toBe(true)
    expect(isLiveReviewShotPatch({ ...patch, field: 'cameraId' })).toBe(false)
    const room = createLiveReviewRoom(100)
    expect(rememberLiveReviewOperation(room, transform.operationId, 100)).toBe(true)
    expect(rememberLiveReviewOperation(room, transform.operationId, 101)).toBe(false)
  })

  it('validates single-key timeline intents and rejects unsupported entity/property pairs', () => {
    const add = { operationId: 'timeline-add', leaseId: 'lease-1', sceneId: 'scene-01', entityType: 'Prop' as const, entityId: 'prop-01', property: 'scale' as const, operation: 'add' as const, frame: 24, baseProjectRevision: 4 }
    const move = { ...add, operationId: 'timeline-move', operation: 'move' as const, keyframeId: 'prop-01:scale:24', frame: undefined, targetFrame: 48 }
    expect(isLiveReviewTimelineCommit(add)).toBe(true)
    expect(isLiveReviewTimelineCommit(move)).toBe(true)
    expect(isLiveReviewTimelineCommit({ ...add, entityType: 'Camera', property: 'scale' })).toBe(false)
    expect(isLiveReviewTimelineCommit({ ...move, targetFrame: 48.5 })).toBe(false)
    expect(isLiveReviewTimelineCommit({ ...add, operation: 'delete', frame: undefined })).toBe(false)
  })

  it('validates typed collaborative Shot and Master planning intents', () => {
    expect(isLiveReviewPlanningCommit({ operation: 'shot_create', operationId: 'op', leaseId: 'lease', sceneId: 'scene-01', cameraId: 'camera-01', baseProjectRevision: 2 })).toBe(true)
    expect(isLiveReviewPlanningCommit({ operation: 'shot_update', operationId: 'op', leaseId: 'lease', shotId: 'shot-01', patch: { name: 'Wide', startFrame: 4 }, baseProjectRevision: 2 })).toBe(true)
    expect(isLiveReviewPlanningCommit({ operation: 'shot_update', operationId: 'op-camera', leaseId: 'lease', shotId: 'shot-01', patch: { cameraId: 'camera-02' }, baseProjectRevision: 2 })).toBe(true)
    expect(isLiveReviewPlanningCommit({ operation: 'shot_update', operationId: 'op', leaseId: 'lease', shotId: 'shot-01', patch: { thumbnail: 'raw-image' }, baseProjectRevision: 2 })).toBe(false)
    expect(isLiveReviewPlanningCommit({ operation: 'master_clip_update', operationId: 'op', leaseId: 'lease', clipId: 'clip-01', sourceStartFrame: 10, sourceEndFrame: 20, baseProjectRevision: 2 })).toBe(true)
    expect(isLiveReviewPlanningCommit({ operation: 'master_clip_update', operationId: 'op', leaseId: 'lease', clipId: 'clip-01', sourceStartFrame: 20, sourceEndFrame: 20, baseProjectRevision: 2 })).toBe(false)
  })

  it('keeps editor leases target-scoped and disposable with the session', () => {
    const room = createLiveReviewRoom(100)
    const lease = { targetKey: 'camera:camera-01', targetType: 'Camera' as const, targetId: 'camera-01', targetLabel: 'Camera 01', participantId: 'editor-1', displayName: 'Editor', leaseId: 'lease-1', expiresAt: 8_100 }
    room.leases.set(lease.targetKey, lease)
    expect(room.leases.get('camera:camera-01')?.participantId).toBe('editor-1')
    expect(room.leases.has('prop:prop-01')).toBe(false)
    room.leases.clear()
    expect(room.leases.size).toBe(0)
  })

  it('keeps participant presence and chat ephemeral and bounded in the room store', () => {
    const room = createLiveReviewRoom(100)
    addLiveReviewParticipant(room, { participantId: 'host-1', participantToken: 'token', displayName: 'Duong', role: 'host', status: 'connected', reconnectUntil: null })
    addLiveReviewParticipant(room, { participantId: 'viewer-1', participantToken: 'token-2', displayName: 'Director', role: 'viewer', status: 'connected', reconnectUntil: null })
    expect(connectedLiveReviewParticipants(room)).toHaveLength(2)
    expect(publicLiveReviewParticipants(room).map((participant) => participant.displayName)).toEqual(['Duong', 'Director'])
    for (let index = 0; index < 105; index += 1) appendLiveReviewChat(room, { messageId: String(index), participantId: 'viewer-1', displayName: 'Director', role: 'viewer', timestamp: index, text: String(index) })
    expect(room.chat).toHaveLength(100)
    room.pointer = { participantId: 'host-1', displayName: 'Duong', x: .4, y: .6, surface: 'stage', visible: true, updatedAt: 1 }
    room.participants.get('viewer-1')!.status = 'reconnecting'
    expect(connectedLiveReviewParticipants(room).map((participant) => participant.participantId)).toEqual(['host-1'])
  })
})
