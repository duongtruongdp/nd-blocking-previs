import { randomBytes } from 'node:crypto'
import { LIVE_REVIEW_CHAT_HISTORY_LIMIT, LIVE_REVIEW_SESSION_TTL_MS, type LiveReviewChatMessage, type LiveReviewLease, type LiveReviewParticipant, type LiveReviewPointer, type LiveReviewProjectSnapshot, type LiveReviewRole, type LiveReviewState } from '../src/liveReview/protocol.js'

export type LiveReviewRoomParticipant = LiveReviewParticipant & {
  participantToken: string
  reconnectUntil: number | null
}

export type LiveReviewRoom = {
  session: string
  token: string
  expiresAt: number
  hostConnected: boolean
  hostGraceUntil: number | null
  viewerCount: number
  project: LiveReviewProjectSnapshot['project'] | null
  state: LiveReviewState | null
  revision: number
  participants: Map<string, LiveReviewRoomParticipant>
  leases: Map<string, LiveReviewLease>
  operations: Map<string, number>
  operationLeases: Map<string, string>
  chat: LiveReviewChatMessage[]
  pointer: LiveReviewPointer | null
}

export function createLiveReviewRoom(now = Date.now(), ttlMs = LIVE_REVIEW_SESSION_TTL_MS): LiveReviewRoom {
  return {
    session: randomBytes(18).toString('hex'),
    token: randomBytes(32).toString('hex'),
    expiresAt: now + ttlMs,
    hostConnected: false,
    hostGraceUntil: null,
    viewerCount: 0,
    project: null,
    state: null,
    revision: 0,
    participants: new Map(),
    leases: new Map(),
    operations: new Map(),
    operationLeases: new Map(),
    chat: [],
    pointer: null,
  }
}

export function addLiveReviewParticipant(room: LiveReviewRoom, participant: LiveReviewRoomParticipant): void {
  room.participants.set(participant.participantId, participant)
}

export function connectedLiveReviewParticipants(room: LiveReviewRoom): LiveReviewParticipant[] {
  return [...room.participants.values()].filter((participant) => participant.status === 'connected').map(toPublicParticipant)
}

export function publicLiveReviewParticipants(room: LiveReviewRoom): LiveReviewParticipant[] {
  return [...room.participants.values()].map(toPublicParticipant)
}

export function appendLiveReviewChat(room: LiveReviewRoom, message: LiveReviewChatMessage): void {
  room.chat.push(message)
  if (room.chat.length > LIVE_REVIEW_CHAT_HISTORY_LIMIT) room.chat.splice(0, room.chat.length - LIVE_REVIEW_CHAT_HISTORY_LIMIT)
}

export function clearLiveReviewEphemeralState(room: LiveReviewRoom): void {
  room.participants.clear()
  room.chat = []
  room.pointer = null
  room.leases.clear()
  room.operations.clear()
  room.operationLeases.clear()
}

export function publicLiveReviewLeases(room: LiveReviewRoom): LiveReviewLease[] {
  return [...room.leases.values()]
}

export function rememberLiveReviewOperation(room: LiveReviewRoom, operationId: string, now = Date.now()): boolean {
  if (room.operations.has(operationId)) return false
  room.operations.set(operationId, now)
  for (const [id, timestamp] of room.operations) if (timestamp < now - 5 * 60_000) room.operations.delete(id)
  if (room.operations.size > 256) room.operations.delete(room.operations.keys().next().value as string)
  return true
}

function toPublicParticipant(participant: LiveReviewRoomParticipant): LiveReviewParticipant {
  return { participantId: participant.participantId, displayName: participant.displayName, role: participant.role, status: participant.status }
}

export function isLiveReviewRoomExpired(room: LiveReviewRoom, now = Date.now()): boolean {
  return now >= room.expiresAt
}

export function acceptLiveReviewProject(room: LiveReviewRoom, project: LiveReviewRoom['project'], revision: number, now = Date.now(), ttlMs = LIVE_REVIEW_SESSION_TTL_MS): boolean {
  if (!project || !Number.isInteger(revision) || revision <= room.revision) return false
  room.project = project
  room.revision = revision
  room.expiresAt = now + ttlMs
  if (room.state) room.state = { ...room.state, projectRevision: revision }
  return true
}

export function canAcceptLiveReviewEditorProject(role: LiveReviewRole | undefined, baseRevision: number, currentRevision: number, hostConnected: boolean): boolean {
  return role === 'editor' && hostConnected && Number.isInteger(baseRevision) && baseRevision === currentRevision
}

export function setLiveReviewState(room: LiveReviewRoom, state: LiveReviewState, now = Date.now(), ttlMs = LIVE_REVIEW_SESSION_TTL_MS): boolean {
  if (!Number.isFinite(state.sceneFrame) || !Number.isFinite(state.masterFrame)) return false
  room.state = { ...state, projectRevision: room.revision }
  room.expiresAt = now + ttlMs
  return true
}
