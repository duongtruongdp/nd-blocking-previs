import { canForwardMessage, isRelayRole, isSessionExpired, RELAY_MAX_MESSAGE_BYTES, RELAY_PROTOCOL_VERSION, RELAY_SESSION_TTL_MS, validRelaySession, validRelayToken, type RelayRole } from './sessionPolicy'

interface Env {
  PHONE_SESSIONS: DurableObjectNamespace
}

type SocketAttachment = { role: RelayRole; token: string; session: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/health') return json({ ok: true, service: 'nd-blocking-phone-relay', protocol: RELAY_PROTOCOL_VERSION })
    if (url.pathname !== '/session') return json({ error: 'not_found' }, 404)
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'websocket_required' }, 426)
    const session = url.searchParams.get('session')
    const token = url.searchParams.get('token')
    const role = url.searchParams.get('role')
    if (!validRelaySession(session) || !validRelayToken(token) || !isRelayRole(role)) return json({ error: 'invalid_pairing' }, 401)
    const id = env.PHONE_SESSIONS.idFromName(session)
    return env.PHONE_SESSIONS.get(id).fetch(request)
  },
}

export class PhoneSessionRoom {
  private readonly state: DurableObjectState
  private sessionId = ''
  private expiresAt = 0
  private sessionClosed = false

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const session = url.searchParams.get('session')
    const token = url.searchParams.get('token')
    const role = url.searchParams.get('role')
    if (!validRelayToken(token) || !isRelayRole(role) || !validRelaySession(session)) return json({ error: 'invalid_pairing' }, 401)
    if (!await this.hydrate(session)) return json({ error: 'invalid_pairing' }, 401)
    if (this.sessionClosed) return json({ error: 'session_closed' }, 410)
    if (this.expiresAt && isSessionExpired(this.expiresAt)) {
      await this.invalidateSession('Pairing expired.')
      return json({ error: 'pairing_expired' }, 410)
    }
    const sockets = this.state.getWebSockets()
    const sameRole = sockets.some((socket) => (socket.deserializeAttachment() as SocketAttachment | null)?.role === role)
    if (sameRole) return json({ error: 'role_already_connected' }, 409)
    const existing = sockets[0]
    const existingAttachment = existing?.deserializeAttachment() as SocketAttachment | null
    if (existingAttachment && existingAttachment.token !== token) return json({ error: 'token_mismatch' }, 401)
    if (sockets.length >= 2) return json({ error: 'session_full' }, 409)

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.state.acceptWebSocket(server)
    server.serializeAttachment({ role, token, session } satisfies SocketAttachment)
    this.expiresAt = Date.now() + RELAY_SESSION_TTL_MS
    await this.state.storage.put('expiresAt', this.expiresAt)
    await this.state.storage.setAlarm(this.expiresAt)
    if (existing) {
      this.send(existing, { v: 1, type: 'paired', session, peer: role })
      this.send(server, { v: 1, type: 'paired', session, peer: existingAttachment?.role ?? (role === 'desktop' ? 'phone' : 'desktop') })
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > RELAY_MAX_MESSAGE_BYTES) return this.reject(socket, 'message_too_large')
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    if (!attachment || !await this.hydrate(attachment.session) || this.sessionClosed || !this.expiresAt || isSessionExpired(this.expiresAt)) return this.reject(socket, this.sessionClosed ? 'session_closed' : 'pairing_expired')
    let message: Record<string, unknown>
    try { message = JSON.parse(raw) as Record<string, unknown> } catch { return this.reject(socket, 'invalid_json') }
    if (message.v !== RELAY_PROTOCOL_VERSION || message.session !== attachment.session || typeof message.type !== 'string') return this.reject(socket, 'invalid_protocol')
    if (message.type === 'hello' && message.role !== attachment.role) return this.reject(socket, 'role_mismatch')
    if (message.type === 'pose' && (!Array.isArray(message.orientation) || message.orientation.length !== 4 || !message.orientation.every((value) => typeof value === 'number' && Number.isFinite(value)) || message.position !== null || typeof message.t !== 'number' || !Number.isFinite(message.t) || (message.screenOrientation !== undefined && message.screenOrientation !== 'landscape-left' && message.screenOrientation !== 'landscape-right' && message.screenOrientation !== 'portrait' && message.screenOrientation !== 'unknown'))) return this.reject(socket, 'invalid_pose')
    if ((message.type === 'ping' || message.type === 'pong') && (typeof message.t !== 'number' || !Number.isFinite(message.t))) return this.reject(socket, 'invalid_heartbeat')
    if (!canForwardMessage(attachment.role, message.type)) return this.reject(socket, 'message_not_allowed')
    if (message.type === 'hello' || message.type === 'ready') return
    if (message.type === 'terminate') {
      if (attachment.role !== 'desktop') return this.reject(socket, 'message_not_allowed')
      await this.invalidateSession('Desktop disconnected.')
      return
    }
    if (message.type === 'ping' || message.type === 'pong') {
      this.send(socket, JSON.stringify(message))
      return
    }
    this.state.getWebSockets().forEach((peer) => {
      if (peer !== socket) this.send(peer, JSON.stringify(message))
    })
  }

  webSocketClose(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    this.state.getWebSockets().forEach((peer) => {
      if (peer !== socket) this.send(peer, JSON.stringify({ v: 1, type: 'disconnected', session: attachment?.session ?? this.sessionId, reason: `${attachment?.role ?? 'peer'} disconnected` }))
    })
  }

  webSocketError(socket: WebSocket): void { this.webSocketClose(socket) }

  async alarm(): Promise<void> {
    await this.hydrate()
    if (this.sessionClosed || !this.expiresAt) return
    if (isSessionExpired(this.expiresAt)) await this.invalidateSession('Pairing expired.')
    else await this.state.storage.setAlarm(this.expiresAt)
  }

  private async hydrate(expectedSession?: string): Promise<boolean> {
    const storedSession = await this.state.storage.get<string>('session')
    if (storedSession && expectedSession && storedSession !== expectedSession) return false
    if (expectedSession) {
      this.sessionId = expectedSession
      if (!storedSession) await this.state.storage.put('session', expectedSession)
    } else if (storedSession) this.sessionId = storedSession
    if (!this.expiresAt) this.expiresAt = (await this.state.storage.get<number>('expiresAt')) ?? 0
    if (!this.sessionClosed) this.sessionClosed = Boolean(await this.state.storage.get<boolean>('closed'))
    return true
  }

  private async invalidateSession(reason: string): Promise<void> {
    if (this.sessionClosed) return
    this.sessionClosed = true
    await this.state.storage.put('closed', true)
    await this.state.storage.deleteAlarm()
    const session = this.sessionId
    this.state.getWebSockets().forEach((peer) => {
      this.send(peer, { v: 1, type: 'disconnected', session, reason })
      try { peer.close(1000, 'session-closed') } catch { /* Peer may already be closed. */ }
    })
  }

  private reject(socket: WebSocket, code: string): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null
    this.send(socket, JSON.stringify({ v: 1, type: 'error', session: attachment?.session ?? this.sessionId, code, message: 'The Phone Camera relay rejected this message.' }))
    socket.close(1008, code)
  }

  private send(socket: WebSocket, message: string | object): void {
    try { socket.send(typeof message === 'string' ? message : JSON.stringify(message)) } catch { /* Peer closed between lookup and send. */ }
  }
}
