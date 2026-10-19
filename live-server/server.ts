import { createServer, type IncomingMessage } from 'node:http'
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { acceptLiveReviewProject, addLiveReviewParticipant, appendLiveReviewChat, clearLiveReviewEphemeralState, connectedLiveReviewParticipants, createLiveReviewRoom, isLiveReviewRoomExpired, publicLiveReviewLeases, publicLiveReviewParticipants, rememberLiveReviewOperation, setLiveReviewState, type LiveReviewRoom, type LiveReviewRoomParticipant } from './sessionStore.js'
import { clientIp, liveRelayConfig, originAllowed } from './config.js'
import { isLiveReviewChatText, isLiveReviewCollaborativeTransform, isLiveReviewLeaseTarget, isLiveReviewPointer, isLiveReviewProject, isLiveReviewShotPatch, isLiveReviewState, isLiveReviewTimelineCommit, isLiveReviewTransform, isLiveReviewTransformPreview, LIVE_REVIEW_PROTOCOL_VERSION, liveReviewMessageVersion, normalizeLiveReviewDisplayName, parseLiveReviewMessage, randomLiveReviewId, serializeLiveReviewMessage, type LiveReviewClientMessage, type LiveReviewEditRejection, type LiveReviewEditResult, type LiveReviewLease, type LiveReviewLeaseTargetType, type LiveReviewParticipant, type LiveReviewServerMessage } from '../src/liveReview/protocol.js'

type Peer = { socket: WebSocket; room: LiveReviewRoom; role: 'host' | 'viewer'; ip: string; participantId: string }
type SocketMeta = { ip: string; messageTimes: number[]; transformTimes: number[]; pointerTimes: number[]; chatTimes: number[]; invalidTimes: number[]; alive: boolean; closed: boolean }

export const config = liveRelayConfig()
const rooms = new Map<string, LiveReviewRoom>()
const peers = new Map<WebSocket, Peer>()
const socketMeta = new Map<WebSocket, SocketMeta>()
const activeConnectionsByIp = new Map<string, number>()
const sessionCreatesByIp = new Map<string, number[]>()
let shuttingDown = false

const httpServer = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://relay.local').pathname
  if (request.method === 'GET' && (pathname === '/health' || pathname === '/ready')) {
    const ready = !shuttingDown
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ ok: ready, ready, service: 'nd-blocking-live-review-relay', protocol: LIVE_REVIEW_PROTOCOL_VERSION, websocketPath: config.websocketPath, rooms: rooms.size }))
    return
  }
  response.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  response.end(JSON.stringify({ error: 'not_found' }))
})

const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxMessageBytes, perMessageDeflate: false })

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://relay.local').pathname
  if (shuttingDown || pathname !== config.websocketPath) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }
  if (!originAllowed(request.headers.origin, config)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    socket.destroy()
    console.warn(`[live-review] rejected browser origin ${request.headers.origin ? 'provided' : 'missing'}`)
    return
  }
  const ip = clientIp(request)
  if ((activeConnectionsByIp.get(ip) ?? 0) >= config.maxConnectionsPerIp) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n')
    socket.destroy()
    console.warn('[live-review] rejected connection rate limit')
    return
  }
  wss.handleUpgrade(request, socket, head, (webSocket) => wss.emit('connection', webSocket, request))
})

wss.on('connection', (socket, request: IncomingMessage) => {
  const ip = clientIp(request)
  socketMeta.set(socket, { ip, messageTimes: [], transformTimes: [], pointerTimes: [], chatTimes: [], invalidTimes: [], alive: true, closed: false })
  activeConnectionsByIp.set(ip, (activeConnectionsByIp.get(ip) ?? 0) + 1)
  socket.on('pong', () => { const meta = socketMeta.get(socket); if (meta) meta.alive = true })
  socket.on('message', (raw) => handleMessage(socket, raw))
  socket.on('close', () => handleClose(socket))
  socket.on('error', () => handleClose(socket))
})

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const room of [...rooms.values()]) {
    pruneParticipants(room, now)
    pruneLeases(room, now)
    if (room.pointer && now - room.pointer.updatedAt > 1200) {
      room.pointer = null
      broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'host_pointer', pointer: null })
    }
    if (isLiveReviewRoomExpired(room, now) || (!room.hostConnected && room.hostGraceUntil !== null && now >= room.hostGraceUntil)) endRoom(room, isLiveReviewRoomExpired(room, now) ? 'Live Review expired.' : 'The Host reconnect window expired.')
  }
  for (const [ip, timestamps] of sessionCreatesByIp) {
    const recent = timestamps.filter((timestamp) => timestamp > now - 60_000)
    if (recent.length === 0) sessionCreatesByIp.delete(ip)
    else sessionCreatesByIp.set(ip, recent)
  }
}, 1000)
cleanupTimer.unref()

const heartbeatTimer = setInterval(() => {
  for (const socket of peers.keys()) {
    const meta = socketMeta.get(socket)
    if (!meta) continue
    if (!meta.alive) { socket.terminate(); continue }
    meta.alive = false
    socket.ping()
  }
}, config.heartbeatIntervalMs)
heartbeatTimer.unref()

httpServer.listen(config.port, config.host, () => console.info(`[live-review] relay listening on ${config.host}:${config.port}${config.websocketPath}`))

function handleMessage(socket: WebSocket, raw: RawData): void {
  const meta = socketMeta.get(socket)
  if (!meta || !allowMessage(meta)) return reject(socket, 'rate_limited', 'Live Review message rate limit exceeded.')
  const rawText = raw.toString()
  const version = liveReviewMessageVersion(rawText, config.maxMessageBytes)
  if (version !== null && version !== LIVE_REVIEW_PROTOCOL_VERSION) return reject(socket, 'protocol_incompatible', `Live Review protocol version ${version} is incompatible with relay version ${LIVE_REVIEW_PROTOCOL_VERSION}.`)
  const message = parseLiveReviewMessage(rawText, config.maxMessageBytes)
  if (!message || !isKnownClientMessage(message)) {
    if (!allowInvalidMessage(meta)) return reject(socket, 'invalid_message', 'Too many invalid Live Review messages.')
    return reject(socket, 'invalid_message', 'The Live Review message is invalid.')
  }
  if ((message.type === 'host_transform' || message.type === 'editor_transform_preview' || message.type === 'editor_transform_commit' || message.type === 'editor_timeline_commit') && !allowTransform(meta)) return reject(socket, 'rate_limited', 'Live Review transform rate limit exceeded.')
  const peer = peers.get(socket)
  if (!peer) {
    if (message.type === 'create_session') createSession(socket, meta.ip, message.displayName, message.participantId)
    else if (message.type === 'join_session') joinSession(socket, message.session, message.token, message.participantId, message.participantToken, message.displayName)
    else reject(socket, 'not_authenticated', 'Join a Live Review session first.')
    return
  }
  if (message.type === 'host_project_snapshot') {
    if (peer.role !== 'host' || !isLiveReviewProject(message.project) || !acceptLiveReviewProject(peer.room, message.project, message.revision, Date.now(), config.sessionTtlMs)) return reject(socket, 'host_only_or_stale', 'Only the Host can publish a newer project snapshot.')
    if (peer.room.project) broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'project_update', project: peer.room.project, revision: peer.room.revision }, socket)
    broadcastPresence(peer.room)
    return
  }
  if (message.type === 'host_present_state') {
    if (peer.role !== 'host' || !isLiveReviewState(message.state) || !setLiveReviewState(peer.room, message.state, Date.now(), config.sessionTtlMs)) return reject(socket, 'host_only_or_invalid_state', 'Only the Host can publish presentation state.')
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'present_state', state: peer.room.state! }, socket)
    return
  }
  if (message.type === 'host_transform') {
    if (peer.role !== 'host' || !isLiveReviewTransform(message.transform)) return reject(socket, 'host_only_or_invalid_transform', 'Only the Host can publish transforms.')
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'transform_update', transform: message.transform }, socket)
    return
  }
  if (message.type === 'participant_role_update') {
    if (peer.role !== 'host') return reject(socket, 'permission_denied', 'Only the Host can change participant roles.')
    updateParticipantRole(peer.room, message.participantId, message.role)
    return
  }
  if (message.type === 'lease_request' || message.type === 'lease_take_control') {
    const target = { targetType: message.targetType, targetId: message.targetId, targetLabel: message.targetLabel }
    if (!isLiveReviewLeaseTarget(target)) return sendLeaseDenied(socket, 'requestId' in message ? message.requestId : '', 'invalid_payload')
    const participant = peer.room.participants.get(peer.participantId)
    const hostTakeControl = message.type === 'lease_take_control'
    if (!participant || (!hostTakeControl && participant.role !== 'editor' && participant.role !== 'host') || (hostTakeControl && peer.role !== 'host') || !peer.room.hostConnected) return sendLeaseDenied(socket, 'requestId' in message ? message.requestId : '', peer.room.hostConnected ? 'permission_denied' : 'host_unavailable')
    const requestId = message.requestId
    const existing = peer.room.leases.get(targetKey(target.targetType, target.targetId))
    if (existing && existing.participantId !== peer.participantId && !hostTakeControl) return sendLeaseDenied(socket, requestId, 'target_busy')
    if (existing && existing.participantId !== peer.participantId && hostTakeControl) {
      peer.room.leases.delete(existing.targetKey)
      broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease: null, targetKey: existing.targetKey })
      broadcastAuthoritativeState(peer.room)
    }
    const lease = createLease(peer.room, peer.participantId, target.targetType, target.targetId, target.targetLabel, existing?.participantId === peer.participantId ? existing.leaseId : undefined)
    peer.room.leases.set(lease.targetKey, lease)
    send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_granted', requestId, lease })
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease })
    return
  }
  if (message.type === 'lease_renew') {
    const lease = peer.room.leases.get(leaseTargetFromId(peer.room, message.leaseId))
    if (!lease || lease.participantId !== peer.participantId) return reject(socket, 'permission_denied', 'This edit lease is no longer active.')
    lease.expiresAt = Date.now() + config.editLeaseMs
    send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_granted', requestId: '', lease })
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease })
    return
  }
  if (message.type === 'lease_release') {
    const key = leaseTargetFromId(peer.room, message.leaseId)
    const lease = peer.room.leases.get(key)
    if (lease && (lease.participantId === peer.participantId || peer.role === 'host')) {
      peer.room.leases.delete(key)
      broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease: null, targetKey: lease.targetKey })
    }
    return
  }
  if (message.type === 'editor_transform_preview') {
    const participant = peer.room.participants.get(peer.participantId)
    if (!participant || (participant.role !== 'editor' && participant.role !== 'host') || !peer.room.hostConnected || !isLiveReviewTransformPreview(message.preview)) return reject(socket, 'permission_denied', 'Collaborative editing is unavailable.')
    const lease = leaseForParticipant(peer.room, message.preview.leaseId, peer.participantId)
    if (!lease) return reject(socket, 'lease_expired', 'The edit lease expired.')
    const preview = { ...message.preview, participantId: peer.participantId, displayName: participant.displayName }
    lease.expiresAt = Date.now() + config.editLeaseMs
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'transform_preview', preview })
    return
  }
  if (message.type === 'editor_transform_commit') {
    const participant = peer.room.participants.get(peer.participantId)
    if (!participant || (participant.role !== 'editor' && participant.role !== 'host') || !peer.room.hostConnected || !isLiveReviewCollaborativeTransform(message.commit)) return sendEditResult(socket, { operationId: message.commit.operationId, accepted: false, reason: peer.room.hostConnected ? 'invalid_payload' : 'host_unavailable', projectRevision: peer.room.revision })
    if (!rememberLiveReviewOperation(peer.room, message.commit.operationId)) return sendEditResult(socket, { operationId: message.commit.operationId, accepted: false, reason: 'duplicate_operation', projectRevision: peer.room.revision })
    const lease = leaseForParticipant(peer.room, message.commit.leaseId, peer.participantId)
    if (!lease) return sendEditResult(socket, { operationId: message.commit.operationId, accepted: false, reason: 'lease_expired', projectRevision: peer.room.revision })
    if (message.commit.baseProjectRevision !== peer.room.revision) return finishLeaseWithResult(peer.room, lease, socket, { operationId: message.commit.operationId, accepted: false, reason: 'stale_revision', projectRevision: peer.room.revision })
    lease.expiresAt = Date.now() + config.editLeaseMs
    const host = [...peers.values()].find((candidate) => candidate.room === peer.room && candidate.role === 'host')
    if (!host) return finishLeaseWithResult(peer.room, lease, socket, { operationId: message.commit.operationId, accepted: false, reason: 'host_unavailable', projectRevision: peer.room.revision })
    peer.room.operationLeases.set(message.commit.operationId, lease.targetKey)
    send(host.socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'edit_transform_request', commit: message.commit, participantId: peer.participantId, displayName: participant.displayName })
    return
  }
  if (message.type === 'editor_shot_patch') {
    const participant = peer.room.participants.get(peer.participantId)
    if (!participant || (participant.role !== 'editor' && participant.role !== 'host') || !peer.room.hostConnected || !isLiveReviewShotPatch(message.patch)) return sendEditResult(socket, { operationId: message.patch.operationId, accepted: false, reason: peer.room.hostConnected ? 'invalid_payload' : 'host_unavailable', projectRevision: peer.room.revision })
    if (!rememberLiveReviewOperation(peer.room, message.patch.operationId)) return sendEditResult(socket, { operationId: message.patch.operationId, accepted: false, reason: 'duplicate_operation', projectRevision: peer.room.revision })
    const lease = leaseForParticipant(peer.room, message.patch.leaseId, peer.participantId)
    if (!lease) return sendEditResult(socket, { operationId: message.patch.operationId, accepted: false, reason: 'lease_expired', projectRevision: peer.room.revision })
    if (message.patch.baseProjectRevision !== peer.room.revision) return finishLeaseWithResult(peer.room, lease, socket, { operationId: message.patch.operationId, accepted: false, reason: 'stale_revision', projectRevision: peer.room.revision })
    const host = [...peers.values()].find((candidate) => candidate.room === peer.room && candidate.role === 'host')
    if (!host) return finishLeaseWithResult(peer.room, lease, socket, { operationId: message.patch.operationId, accepted: false, reason: 'host_unavailable', projectRevision: peer.room.revision })
    peer.room.operationLeases.set(message.patch.operationId, lease.targetKey)
    send(host.socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'edit_shot_request', patch: message.patch, participantId: peer.participantId, displayName: participant.displayName })
    return
  }
  if (message.type === 'editor_timeline_commit') {
    const participant = peer.room.participants.get(peer.participantId)
    const commit = message.commit
    if (!participant || (participant.role !== 'editor' && participant.role !== 'host') || !peer.room.hostConnected || !isLiveReviewTimelineCommit(commit)) return sendEditResult(socket, { operationId: commit.operationId, accepted: false, reason: peer.room.hostConnected ? 'invalid_payload' : 'host_unavailable', projectRevision: peer.room.revision })
    if (!rememberLiveReviewOperation(peer.room, commit.operationId)) return sendEditResult(socket, { operationId: commit.operationId, accepted: false, reason: 'duplicate_operation', projectRevision: peer.room.revision })
    const lease = leaseForParticipant(peer.room, commit.leaseId, peer.participantId)
    const expectedTargetKey = targetKey('Timeline', `${commit.sceneId}:${commit.entityType.toLowerCase()}:${commit.entityId}:${commit.property}`)
    if (!lease || lease.targetKey !== expectedTargetKey) return sendEditResult(socket, { operationId: commit.operationId, accepted: false, reason: 'lease_expired', projectRevision: peer.room.revision })
    if (commit.baseProjectRevision !== peer.room.revision) return finishLeaseWithResult(peer.room, lease, socket, { operationId: commit.operationId, accepted: false, reason: 'stale_revision', projectRevision: peer.room.revision })
    const host = [...peers.values()].find((candidate) => candidate.room === peer.room && candidate.role === 'host')
    if (!host) return finishLeaseWithResult(peer.room, lease, socket, { operationId: commit.operationId, accepted: false, reason: 'host_unavailable', projectRevision: peer.room.revision })
    lease.expiresAt = Date.now() + config.editLeaseMs
    peer.room.operationLeases.set(commit.operationId, lease.targetKey)
    send(host.socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'edit_timeline_request', commit, participantId: peer.participantId, displayName: participant.displayName })
    return
  }
  if (message.type === 'host_edit_result') {
    if (peer.role !== 'host') return reject(socket, 'permission_denied', 'Only the Host can resolve collaborative edits.')
    const lease = leaseForOperation(peer.room, message.result.operationId)
    const result = { ...message.result, projectRevision: Number.isFinite(message.result.projectRevision) ? message.result.projectRevision : peer.room.revision }
    if (lease) {
      const target = [...peers.values()].find((candidate) => candidate.room === peer.room && candidate.participantId === lease.participantId)
      if (target) sendEditResult(target.socket, result)
      peer.room.leases.delete(lease.targetKey)
      broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease: null, targetKey: lease.targetKey })
    }
    return
  }
  if (message.type === 'host_pointer') {
    if (peer.role !== 'host' || !isLiveReviewPointer(message.pointer) || message.pointer.participantId !== peer.participantId || !allowPointer(meta)) return reject(socket, 'host_only_or_invalid_pointer', 'Only the Host can publish a valid pointer.')
    peer.room.pointer = message.pointer.visible ? message.pointer : null
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'host_pointer', pointer: peer.room.pointer }, socket)
    return
  }
  if (message.type === 'chat_send') {
    if (!isLiveReviewChatText(message.text) || !allowChat(meta)) return reject(socket, 'invalid_chat', 'Chat messages must contain 1–1000 visible characters and respect the rate limit.')
    const participant = peer.room.participants.get(peer.participantId)
    if (!participant) return reject(socket, 'participant_missing', 'The Live Review participant is no longer active.')
    const chatMessage = { messageId: randomLiveReviewId(12), participantId: peer.participantId, displayName: participant.displayName, role: participant.role, timestamp: Date.now(), text: message.text.replace(/\s+/g, ' ').trim() }
    appendLiveReviewChat(peer.room, chatMessage)
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'chat_message', message: chatMessage })
    return
  }
  if (message.type === 'participant_profile') {
    const participant = peer.room.participants.get(peer.participantId)
    if (!participant) return reject(socket, 'participant_missing', 'The Live Review participant is no longer active.')
    participant.displayName = normalizeLiveReviewDisplayName(message.displayName, participant.displayName)
    broadcastParticipantUpdate(peer.room, participant)
    return
  }
  if (message.type === 'request_snapshot') {
    const participant = peer.room.participants.get(peer.participantId)
    if (peer.room.project && peer.room.state && participant) send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'session_snapshot', project: peer.room.project, state: peer.room.state, revision: peer.room.revision, projectRevision: peer.room.revision, hostConnected: peer.room.hostConnected, participantId: participant.participantId, participantToken: participant.participantToken, participants: publicLiveReviewParticipants(peer.room), chatHistory: peer.room.chat, pointer: peer.room.pointer, leases: publicLiveReviewLeases(peer.room) })
    return
  }
  if (message.type === 'end_session') {
    if (peer.role !== 'host') return reject(socket, 'viewer_read_only', 'Only the Host can end the Live Review.')
    endRoom(peer.room, 'The Host ended Live Review.')
    return
  }
  if (message.type === 'leave_session') {
    socket.close(1000, 'left-live-review')
    return
  }
  if (message.type === 'ping') send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'pong', t: message.t })
}

function createSession(socket: WebSocket, ip: string, displayName?: string, requestedParticipantId?: string): void {
  if (rooms.size >= config.maxSessions) return reject(socket, 'session_limit', 'The Live Review service is at its session limit.')
  const now = Date.now()
  const recentCreates = (sessionCreatesByIp.get(ip) ?? []).filter((timestamp) => timestamp > now - 60_000)
  if (recentCreates.length >= config.maxSessionCreatesPerIpPerMinute) return reject(socket, 'rate_limited', 'Too many Live Review sessions were created from this connection.')
  recentCreates.push(now)
  sessionCreatesByIp.set(ip, recentCreates)
  const room = createLiveReviewRoom(now, config.sessionTtlMs)
  room.hostConnected = true
  rooms.set(room.session, room)
  const participant = createParticipant('host', normalizeLiveReviewDisplayName(displayName, 'Host'), requestedParticipantId)
  addLiveReviewParticipant(room, participant)
  peers.set(socket, { socket, room, role: 'host', ip, participantId: participant.participantId })
  console.info(`[live-review] session created ${shortSession(room.session)}`)
  send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'session_created', session: room.session, token: room.token, expiresAt: room.expiresAt, participantId: participant.participantId, participantToken: participant.participantToken, participants: publicLiveReviewParticipants(room), chatHistory: room.chat, pointer: room.pointer, leases: publicLiveReviewLeases(room), hostConnected: room.hostConnected })
}

function joinSession(socket: WebSocket, session: string, token?: string, requestedParticipantId?: string, participantToken?: string, displayName?: string): void {
  const room = rooms.get(session)
  const now = Date.now()
  if (!room || isLiveReviewRoomExpired(room, now)) return reject(socket, 'session_missing', 'This Live Review session was not found or has expired.')
  const isHost = token !== undefined && token === room.token
  if (token !== undefined && !isHost) return reject(socket, 'host_token_invalid', 'The Host reconnect token is invalid.')
  if (isHost && room.hostGraceUntil !== null && now > room.hostGraceUntil) return reject(socket, 'host_reconnect_expired', 'The Host reconnect window has expired.')
  if (isHost && room.hostConnected) return reject(socket, 'host_already_connected', 'The Live Review Host is already connected.')
  const existingParticipant = (requestedParticipantId ? room.participants.get(requestedParticipantId) : undefined) ?? (isHost ? [...room.participants.values()].find((participant) => participant.role === 'host') : undefined)
  if (isHost && (!existingParticipant || existingParticipant.role !== 'host' || (participantToken !== undefined && participantToken !== existingParticipant.participantToken))) return reject(socket, 'host_identity_invalid', 'The Host identity could not be restored.')
  if (!isHost && existingParticipant && (existingParticipant.role === 'host' || participantToken !== existingParticipant.participantToken)) return reject(socket, 'participant_identity_invalid', 'The participant identity could not be restored.')
  if (!isHost && room.viewerCount >= config.maxViewersPerSession && !existingParticipant) return reject(socket, 'session_full', 'This Live Review session is full.')
  if (existingParticipant?.status === 'connected') return reject(socket, 'participant_already_connected', 'This Live Review participant is already connected.')
  room.expiresAt = now + config.sessionTtlMs
  const participant = existingParticipant ?? createParticipant('viewer', normalizeLiveReviewDisplayName(displayName, `Guest ${room.viewerCount + 1}`), requestedParticipantId)
  participant.displayName = normalizeLiveReviewDisplayName(displayName, participant.displayName)
  participant.status = 'connected'
  participant.reconnectUntil = null
  addLiveReviewParticipant(room, participant)
  if (isHost) { room.hostConnected = true; room.hostGraceUntil = null }
  else room.viewerCount = connectedLiveReviewParticipants(room).filter((entry) => entry.role === 'viewer').length
  peers.set(socket, { socket, room, role: isHost ? 'host' : 'viewer', ip: socketMeta.get(socket)?.ip ?? 'unknown', participantId: participant.participantId })
  console.info(`[live-review] ${isHost ? 'Host reconnected' : 'Viewer joined'} ${shortSession(room.session)}`)
  if (room.project && room.state) send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'session_snapshot', project: room.project, state: room.state, revision: room.revision, projectRevision: room.revision, hostConnected: room.hostConnected, participantId: participant.participantId, participantToken: participant.participantToken, participants: publicLiveReviewParticipants(room), chatHistory: room.chat, pointer: room.pointer, leases: publicLiveReviewLeases(room) })
  broadcastParticipantUpdate(room, participant, 'joined')
  if (isHost) broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'host_editing_paused', paused: false })
  broadcastPresence(room)
}

function handleClose(socket: WebSocket): void {
  const meta = socketMeta.get(socket)
  if (meta?.closed) return
  if (meta) {
    meta.closed = true
    const active = Math.max(0, (activeConnectionsByIp.get(meta.ip) ?? 1) - 1)
    if (active === 0) activeConnectionsByIp.delete(meta.ip)
    else activeConnectionsByIp.set(meta.ip, active)
  }
  const peer = peers.get(socket)
  peers.delete(socket)
  socketMeta.delete(socket)
  if (!peer) return
  releaseParticipantLeases(peer.room, peer.participantId)
  if (peer.role === 'host') {
    peer.room.hostConnected = false
    peer.room.hostGraceUntil = Date.now() + config.hostReconnectGraceMs
    peer.room.pointer = null
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'host_pointer', pointer: null })
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'host_editing_paused', paused: true })
    markParticipantDisconnected(peer.room, peer.participantId, peer.room.hostGraceUntil)
    broadcast(peer.room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'host_disconnected', graceUntil: peer.room.hostGraceUntil })
    console.info(`[live-review] Host disconnected ${shortSession(peer.room.session)}`)
  } else {
    peer.room.viewerCount = Math.max(0, peer.room.viewerCount - 1)
    markParticipantDisconnected(peer.room, peer.participantId, Date.now() + config.hostReconnectGraceMs)
    console.info(`[live-review] Viewer left ${shortSession(peer.room.session)}`)
  }
  broadcastPresence(peer.room)
}

function endRoom(room: LiveReviewRoom, reason: string): void {
  if (!rooms.has(room.session)) return
  broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'session_ended', reason })
  for (const [socket, peer] of peers) if (peer.room === room) { peers.delete(socket); socket.close(1000, 'session-ended') }
  rooms.delete(room.session)
  clearLiveReviewEphemeralState(room)
  console.info(`[live-review] room expired ${shortSession(room.session)}`)
}

function broadcastPresence(room: LiveReviewRoom): void {
  room.viewerCount = connectedLiveReviewParticipants(room).filter((participant) => participant.role === 'viewer').length
  broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'presence_snapshot', participants: publicLiveReviewParticipants(room), hostConnected: room.hostConnected })
  broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'presence', viewers: room.viewerCount, hostConnected: room.hostConnected })
}

function broadcastParticipantUpdate(room: LiveReviewRoom, participant: LiveReviewRoomParticipant, action: 'joined' | 'left' | 'updated' = 'updated'): void {
  broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'presence_update', action, participant: publicParticipant(participant) })
}

function publicParticipant(participant: LiveReviewRoomParticipant): LiveReviewParticipant {
  return { participantId: participant.participantId, displayName: participant.displayName, role: participant.role, status: participant.status }
}

function createParticipant(role: 'host' | 'viewer', displayName: string, requestedParticipantId?: string): LiveReviewRoomParticipant {
  return { participantId: requestedParticipantId && /^[a-z0-9-]{8,128}$/i.test(requestedParticipantId) ? requestedParticipantId : randomLiveReviewId(12), participantToken: randomLiveReviewId(24), displayName, role, status: 'connected', reconnectUntil: null }
}

function markParticipantDisconnected(room: LiveReviewRoom, participantId: string, reconnectUntil: number): void {
  const participant = room.participants.get(participantId)
  if (!participant) return
  participant.status = 'reconnecting'
  participant.reconnectUntil = reconnectUntil
  broadcastParticipantUpdate(room, participant)
}

function pruneParticipants(room: LiveReviewRoom, now: number): void {
  let changed = false
  for (const [id, participant] of room.participants) {
    if (participant.status === 'reconnecting' && participant.reconnectUntil !== null && now >= participant.reconnectUntil) {
      room.participants.delete(id)
      broadcastParticipantUpdate(room, participant, 'left')
      changed = true
    }
  }
  if (changed) broadcastPresence(room)
}

function targetKey(targetType: LiveReviewLeaseTargetType, targetId: string): string {
  return `${targetType.toLowerCase()}:${targetId}`
}

function createLease(room: LiveReviewRoom, participantId: string, targetType: LiveReviewLeaseTargetType, targetId: string, targetLabel: string, leaseId = randomLiveReviewId(16)): LiveReviewLease {
  const participant = room.participants.get(participantId)
  return { targetKey: targetKey(targetType, targetId), targetType, targetId, targetLabel: targetLabel.trim().slice(0, 128), participantId, displayName: participant?.displayName ?? 'Participant', leaseId, expiresAt: Date.now() + config.editLeaseMs }
}

function leaseForParticipant(room: LiveReviewRoom, leaseId: string, participantId: string): LiveReviewLease | null {
  const lease = [...room.leases.values()].find((candidate) => candidate.leaseId === leaseId && candidate.participantId === participantId)
  if (!lease || lease.expiresAt <= Date.now()) {
    if (lease) room.leases.delete(lease.targetKey)
    return null
  }
  return lease
}

function leaseTargetFromId(room: LiveReviewRoom, leaseId: string): string {
  return [...room.leases.values()].find((lease) => lease.leaseId === leaseId)?.targetKey ?? ''
}

function leaseForOperation(room: LiveReviewRoom, operationId: string): LiveReviewLease | null {
  const key = room.operationLeases.get(operationId)
  return key ? room.leases.get(key) ?? null : null
}

function releaseParticipantLeases(room: LiveReviewRoom, participantId: string): void {
  const released = [...room.leases.values()].filter((lease) => lease.participantId === participantId)
  released.forEach((lease) => room.leases.delete(lease.targetKey))
  released.forEach((lease) => broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease: null, targetKey: lease.targetKey }))
  if (released.length > 0) broadcastAuthoritativeState(room)
}

function pruneLeases(room: LiveReviewRoom, now: number): void {
  for (const [key, lease] of room.leases) {
    if (lease.expiresAt <= now) {
      room.leases.delete(key)
      broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease: null, targetKey: lease.targetKey })
      broadcastAuthoritativeState(room)
    }
  }
}

function updateParticipantRole(room: LiveReviewRoom, participantId: string, role: 'editor' | 'viewer'): void {
  const participant = room.participants.get(participantId)
  if (!participant || participant.role === 'host' || participant.status === 'reconnecting') return
  participant.role = role
  if (role === 'viewer') releaseParticipantLeases(room, participantId)
  broadcastParticipantUpdate(room, participant)
  broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'role_updated', participant: publicParticipant(participant) })
  broadcastPresence(room)
}

function sendLeaseDenied(socket: WebSocket, requestId: string, reason: LiveReviewEditRejection): void {
  send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_denied', requestId, reason })
}

function sendEditResult(socket: WebSocket, result: LiveReviewEditResult): void {
  send(socket, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'edit_result', result })
}

function finishLeaseWithResult(room: LiveReviewRoom, lease: LiveReviewLease, socket: WebSocket, result: LiveReviewEditResult): void {
  sendEditResult(socket, result)
  room.leases.delete(lease.targetKey)
  broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'lease_update', lease: null, targetKey: lease.targetKey })
  broadcastAuthoritativeState(room)
}

function broadcastAuthoritativeState(room: LiveReviewRoom): void {
  if (room.project) broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'project_update', project: room.project, revision: room.revision })
  if (room.state) broadcast(room, { v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'present_state', state: room.state })
}

function broadcast(room: LiveReviewRoom, message: LiveReviewServerMessage, except?: WebSocket): void {
  for (const peer of peers.values()) if (peer.room === room && peer.socket !== except) send(peer.socket, message)
}

function send(socket: WebSocket, message: LiveReviewServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(serializeLiveReviewMessage(message))
}

function reject(socket: WebSocket, code: string, message: string): void {
  const payload = serializeLiveReviewMessage({ v: LIVE_REVIEW_PROTOCOL_VERSION, type: 'error', code, message })
  if (socket.readyState === WebSocket.OPEN) socket.send(payload, () => socket.close(1008, code))
  else socket.close(1008, code)
}

function allowMessage(meta: SocketMeta): boolean {
  const now = Date.now()
  meta.messageTimes = meta.messageTimes.filter((timestamp) => timestamp > now - 1000)
  if (meta.messageTimes.length >= config.maxMessagesPerSecond) return false
  meta.messageTimes.push(now)
  return true
}

function allowTransform(meta: SocketMeta): boolean {
  const now = Date.now()
  meta.transformTimes = meta.transformTimes.filter((timestamp) => timestamp > now - 1000)
  if (meta.transformTimes.length >= config.maxTransformsPerSecond) return false
  meta.transformTimes.push(now)
  return true
}

function allowPointer(meta: SocketMeta): boolean {
  const now = Date.now()
  meta.pointerTimes = meta.pointerTimes.filter((timestamp) => timestamp > now - 1000)
  if (meta.pointerTimes.length >= config.maxPointersPerSecond) return false
  meta.pointerTimes.push(now)
  return true
}

function allowChat(meta: SocketMeta): boolean {
  const now = Date.now()
  meta.chatTimes = meta.chatTimes.filter((timestamp) => timestamp > now - 10_000)
  if (meta.chatTimes.length >= config.maxChatMessagesPerTenSeconds) return false
  meta.chatTimes.push(now)
  return true
}

function allowInvalidMessage(meta: SocketMeta): boolean {
  const now = Date.now()
  meta.invalidTimes = meta.invalidTimes.filter((timestamp) => timestamp > now - 60_000)
  if (meta.invalidTimes.length >= config.maxInvalidMessagesPerMinute) return false
  meta.invalidTimes.push(now)
  return true
}

function isKnownClientMessage(value: LiveReviewClientMessage | LiveReviewServerMessage): value is LiveReviewClientMessage {
  return ['create_session', 'join_session', 'participant_profile', 'host_project_snapshot', 'host_present_state', 'host_transform', 'host_pointer', 'chat_send', 'participant_role_update', 'lease_request', 'lease_renew', 'lease_release', 'lease_take_control', 'editor_transform_preview', 'editor_transform_commit', 'editor_shot_patch', 'editor_timeline_commit', 'host_edit_result', 'request_snapshot', 'end_session', 'leave_session', 'ping'].includes(value.type)
}

function shortSession(session: string): string { return session.slice(0, 10) }

function shutdown(signal: string): void {
  if (shuttingDown) return
  shuttingDown = true
  console.info(`[live-review] shutdown ${signal}`)
  clearInterval(cleanupTimer)
  clearInterval(heartbeatTimer)
  for (const room of [...rooms.values()]) endRoom(room, 'Live Review relay is shutting down.')
  wss.close()
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 5000).unref()
}

process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGINT', () => shutdown('SIGINT'))
