import { LIVE_REVIEW_MAX_MESSAGE_BYTES, LIVE_REVIEW_PROTOCOL_VERSION, parseLiveReviewMessage, randomLiveReviewId, serializeLiveReviewMessage, type LiveReviewClientMessage, type LiveReviewServerMessage } from './protocol'
import { liveReviewRelayConfig, liveReviewRelayUrl } from './liveReviewConfig'

export type LiveReviewTransportStatus = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'disconnected' | 'ended' | 'error'

export type LiveReviewTransportCallbacks = {
  onStatus?: (status: LiveReviewTransportStatus, message?: string) => void
  onMessage?: (message: LiveReviewServerMessage) => void
}

export class LiveReviewTransport {
  private socket: WebSocket | null = null
  private relayUrl: string | null
  private callbacks: LiveReviewTransportCallbacks
  private role: 'host' | 'viewer' | null = null
  private session: string | null = null
  private token: string | null = null
  private participantToken: string | null = null
  private participantIdInternal = randomLiveReviewId(12)
  private displayName = 'Guest'
  private reconnectTimer: number | null = null
  private reconnectAttempts = 0
  private intentionallyClosed = false
  private heartbeatTimer: number | null = null
  private configurationError: string | null

  constructor(relayUrl: string | null | undefined = undefined, callbacks: LiveReviewTransportCallbacks = {}) {
    const config = relayUrl === undefined ? liveReviewRelayConfig() : { url: relayUrl, error: null }
    this.relayUrl = config.url
    this.configurationError = config.error
    this.callbacks = callbacks
  }

  get sessionId(): string | null { return this.session }
  get participantId(): string { return this.participantIdInternal }
  get participantDisplayName(): string { return this.displayName }
  get connected(): boolean { return this.socket?.readyState === WebSocket.OPEN }
  get canConnect(): boolean { return this.relayUrl !== null && this.configurationError === null }
  get configError(): string | null { return this.configurationError }

  async createSession(displayName = 'Host'): Promise<Extract<LiveReviewServerMessage, { type: 'session_created' }>> {
    this.displayName = displayName
    this.role = 'host'
    this.intentionallyClosed = false
    await this.open()
    const response = await this.request('create_session', { participantId: this.participantIdInternal, displayName: this.displayName })
    if (response.type !== 'session_created') throw new Error(response.type === 'error' ? response.message : 'The Live Review session could not be created.')
    this.session = response.session
    this.token = response.token
    this.participantIdInternal = response.participantId
    this.participantToken = response.participantToken
    return response
  }

  async joinSession(session: string, displayName = 'Guest'): Promise<Extract<LiveReviewServerMessage, { type: 'session_snapshot' }>> {
    this.displayName = displayName
    this.role = 'viewer'
    this.session = session
    this.intentionallyClosed = false
    await this.open()
    const response = await this.request('join_session', { session, participantId: this.participantIdInternal, participantToken: this.participantToken ?? undefined, displayName: this.displayName })
    if (response.type === 'session_snapshot') {
      this.participantIdInternal = response.participantId
      this.participantToken = response.participantToken
      return response
    }
    throw new Error(response.type === 'error' ? response.message : 'The Live Review session snapshot was not received.')
  }

  send(message: { type: LiveReviewClientMessage['type']; [key: string]: unknown }): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    const payload = serializeLiveReviewMessage({ v: LIVE_REVIEW_PROTOCOL_VERSION, ...message } as LiveReviewClientMessage)
    if (new TextEncoder().encode(payload).byteLength > LIVE_REVIEW_MAX_MESSAGE_BYTES) return false
    this.socket.send(payload)
    return true
  }

  close(): void {
    this.intentionallyClosed = true
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.stopHeartbeat()
    this.socket?.close(1000, 'leave-live-review')
    this.socket = null
    this.callbacks.onStatus?.('idle')
  }

  private open(): Promise<void> {
    const relayUrl = this.relayUrl
    if (!relayUrl || this.configurationError) {
      const message = this.configurationError ?? 'Live Review server is not configured.'
      this.callbacks.onStatus?.('error', message)
      return Promise.reject(new Error(message))
    }
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve()
    this.callbacks.onStatus?.(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting')
    return new Promise((resolve, reject) => {
      let socket: WebSocket
      try { socket = new WebSocket(relayUrl) } catch { reject(new Error('The Live Review relay URL is invalid.')); return }
      this.socket = socket
      socket.addEventListener('open', () => {
        this.reconnectAttempts = 0
        this.startHeartbeat()
        this.callbacks.onStatus?.('live')
        resolve()
      }, { once: true })
      socket.addEventListener('message', (event) => {
        const message = parseLiveReviewMessage(typeof event.data === 'string' ? event.data : null)
        if (message && isServerMessage(message)) {
          if (message.type === 'error') this.callbacks.onStatus?.('error', message.message)
          this.callbacks.onMessage?.(message)
        }
      })
      socket.addEventListener('error', () => {
        this.callbacks.onStatus?.('error', 'The Live Review relay connection failed.')
        reject(new Error('The Live Review relay connection failed.'))
      }, { once: true })
      socket.addEventListener('close', () => {
        this.stopHeartbeat()
        if (this.socket === socket) this.socket = null
        if (!this.intentionallyClosed && this.session && this.role) this.scheduleReconnect()
        else if (!this.intentionallyClosed) this.callbacks.onStatus?.('disconnected')
      })
    })
  }

  private request(type: 'create_session' | 'join_session', fields: { session?: string; token?: string; participantId?: string; participantToken?: string; displayName?: string } = {}): Promise<LiveReviewServerMessage> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => { this.callbacks.onMessage = previous; reject(new Error('The Live Review relay did not respond.')) }, 8000)
      const previous = this.callbacks.onMessage
      this.callbacks.onMessage = (message) => {
        if (message.type === 'session_created' || message.type === 'session_snapshot' || message.type === 'error') {
          window.clearTimeout(timeout)
          this.callbacks.onMessage = previous
          if (message.type === 'error') reject(new Error(message.message))
          else {
            if (message.type === 'session_snapshot') previous?.(message)
            resolve(message)
          }
          return
        }
        previous?.(message)
      }
      if (!this.send({ type, ...fields } as Omit<LiveReviewClientMessage, 'v'>)) {
        window.clearTimeout(timeout)
        this.callbacks.onMessage = previous
        reject(new Error('The Live Review relay is not connected.'))
      }
    })
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return
    this.reconnectAttempts += 1
    if (this.reconnectAttempts > 10) {
      this.callbacks.onStatus?.('disconnected', 'Live Review server is unavailable. Reconnect attempts stopped; retry from the Live panel.')
      return
    }
    this.callbacks.onStatus?.('reconnecting')
    const baseDelay = Math.min(8000, 500 * (2 ** Math.min(this.reconnectAttempts - 1, 4)))
    const jitter = baseDelay * (0.8 + Math.random() * 0.4)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      void this.reconnect()
    }, jitter)
  }

  private async reconnect(): Promise<void> {
    try {
      await this.open()
      if (this.role === 'host' && this.session && this.token) await this.request('join_session', { session: this.session, token: this.token, participantId: this.participantIdInternal, participantToken: this.participantToken ?? undefined, displayName: this.displayName })
      else if (this.session) {
        const response = await this.request('join_session', { session: this.session, participantId: this.participantIdInternal, participantToken: this.participantToken ?? undefined, displayName: this.displayName })
        if (response.type === 'session_snapshot') {
          this.participantIdInternal = response.participantId
          this.participantToken = response.participantToken
        }
      }
    } catch {
      if (!this.intentionallyClosed) this.scheduleReconnect()
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) this.send({ type: 'ping', t: Date.now() })
    }, 15_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }
}

export { liveReviewRelayConfig, liveReviewRelayUrl }

function isServerMessage(value: LiveReviewServerMessage | LiveReviewClientMessage): value is LiveReviewServerMessage {
  return ['session_created', 'session_snapshot', 'project_update', 'present_state', 'transform_update', 'transform_preview', 'edit_transform_request', 'edit_shot_request', 'edit_result', 'presence', 'presence_snapshot', 'presence_update', 'role_updated', 'lease_granted', 'lease_denied', 'lease_update', 'lease_snapshot', 'host_editing_paused', 'host_disconnected', 'host_pointer', 'chat_message', 'chat_history', 'session_ended', 'pong', 'error'].includes(value.type)
}
