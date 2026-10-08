import { buildPhoneCameraPairingUrl, phoneCameraCompanionUrl, phoneCameraRelaySocketUrl, phoneCameraRelayUrl } from './phoneCameraConfig'
import { PHONE_CAMERA_PROTOCOL_VERSION, PHONE_CAMERA_SESSION_TTL_MS, type PhoneCameraPairingData, type PhoneCameraPose, type PhoneCameraServerMessage, serializePhoneCameraMessage } from './protocol'

export type PhoneCameraSessionStatus = 'idle' | 'waiting' | 'connected' | 'error'

export type PhoneCameraSessionCallbacks = {
  onStatus?: (status: PhoneCameraSessionStatus, message?: string) => void
  onPose?: (pose: PhoneCameraPose) => void
  onMessage?: (message: PhoneCameraServerMessage) => void
}

function randomToken(bytes = 18): string {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
}

export function createPhoneCameraPairing(overrides: Partial<Pick<PhoneCameraPairingData, 'relay' | 'companion'>> = {}): PhoneCameraPairingData {
  const data = {
    session: randomToken(12),
    token: randomToken(24),
    relay: overrides.relay ?? phoneCameraRelayUrl(),
    companion: overrides.companion ?? phoneCameraCompanionUrl(),
  }
  return data
}

export class PhoneCameraSession {
  private socket: WebSocket | null = null
  private heartbeat: number | null = null
  private expiresAt = 0
  private pairing: PhoneCameraPairingData | null = null
  private callbacks: PhoneCameraSessionCallbacks
  private generation = 0

  constructor(callbacks: PhoneCameraSessionCallbacks = {}) {
    this.callbacks = callbacks
  }

  setCallbacks(callbacks: PhoneCameraSessionCallbacks): void {
    this.callbacks = callbacks
  }

  get pairingData(): PhoneCameraPairingData | null { return this.pairing }
  get pairingUrl(): string | null { return this.pairing ? buildPhoneCameraPairingUrl(this.pairing) : null }
  get isConnected(): boolean { return this.socket?.readyState === WebSocket.OPEN }

  connect(pairing: PhoneCameraPairingData = createPhoneCameraPairing()): void {
    this.disconnect('replaced')
    const generation = ++this.generation
    this.pairing = pairing
    this.expiresAt = Date.now() + PHONE_CAMERA_SESSION_TTL_MS
    let socket: WebSocket
    try {
      const url = new URL(phoneCameraRelaySocketUrl(pairing.relay))
      url.searchParams.set('session', pairing.session)
      url.searchParams.set('token', pairing.token)
      url.searchParams.set('role', 'desktop')
      socket = new WebSocket(url)
    } catch {
      if (generation === this.generation) this.callbacks.onStatus?.('error', 'The Phone Camera relay URL is invalid.')
      return
    }
    this.socket = socket
    const isCurrent = () => generation === this.generation && socket === this.socket
    this.callbacks.onStatus?.('waiting', 'Waiting for Phone Camera…')
    socket.addEventListener('open', () => {
      if (!isCurrent()) {
        try { socket.send(serializePhoneCameraMessage({ v: PHONE_CAMERA_PROTOCOL_VERSION, type: 'terminate', session: pairing.session })) } catch { /* The stale socket may never have reached the relay. */ }
        try { socket.close(1000, 'stale-session') } catch { /* Ignore a socket already closed by the browser. */ }
        return
      }
      this.send({ v: 1, type: 'hello', role: 'desktop', session: pairing.session })
      this.heartbeat = window.setInterval(() => this.sendPing(), 15000)
    })
    socket.addEventListener('message', (event) => { if (isCurrent()) this.handleMessage(event.data, generation, socket) })
    socket.addEventListener('error', () => { if (isCurrent()) this.callbacks.onStatus?.('error', 'Phone Camera relay connection failed.') })
    socket.addEventListener('close', () => {
      if (!isCurrent()) return
      this.generation += 1
      this.stopHeartbeat()
      this.socket = null
      this.pairing = null
      this.expiresAt = 0
      this.callbacks.onStatus?.('idle', 'Phone Camera disconnected.')
    })
  }

  disconnect(reason = 'desktop-disconnected', message = 'Phone Camera disconnected.'): void {
    const pairing = this.pairing
    this.stopHeartbeat()
    const socket = this.socket
    const hadSession = Boolean(socket || pairing)
    this.generation += 1
    this.socket = null
    this.pairing = null
    this.expiresAt = 0
    if (socket && socket.readyState === WebSocket.OPEN && pairing) {
      try { socket.send(serializePhoneCameraMessage({ v: PHONE_CAMERA_PROTOCOL_VERSION, type: 'terminate', session: pairing.session })) } catch { /* The peer may already be closing. */ }
    }
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, reason)
    if (hadSession) this.callbacks.onStatus?.('idle', message)
  }

  sendRecenter(): boolean { return this.sendForCurrentSession((session) => ({ v: 1, type: 'recenter', session })) }
  sendSetCameraKey(): boolean { return this.sendForCurrentSession((session) => ({ v: 1, type: 'setCameraKey', session })) }
  sendSetCameraKeyAck(accepted: boolean, message?: string): boolean { return this.sendForCurrentSession((session) => ({ v: 1, type: 'setCameraKeyAck', session, accepted, ...(message ? { message } : {}) })) }
  sendRecordStart(): boolean { return this.sendForCurrentSession((session) => ({ v: 1, type: 'recordStart', session })) }
  sendRecordStop(): boolean { return this.sendForCurrentSession((session) => ({ v: 1, type: 'recordStop', session })) }
  sendRecordAck(action: 'start' | 'stop', accepted: boolean, message?: string): boolean { return this.sendForCurrentSession((session) => ({ v: 1, type: 'recordAck', session, action, accepted, ...(message ? { message } : {}) })) }

  private sendForCurrentSession(createMessage: (session: string) => Parameters<typeof serializePhoneCameraMessage>[0]): boolean {
    const session = this.pairing?.session
    return session ? this.send(createMessage(session)) : false
  }

  private send(message: Parameters<typeof serializePhoneCameraMessage>[0]): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || Date.now() > this.expiresAt) return false
    this.socket.send(serializePhoneCameraMessage(message))
    return true
  }

  private sendPing(): void {
    const pairing = this.pairing
    if (!pairing || Date.now() > this.expiresAt) {
      this.disconnect('expired', 'Pairing expired. Generate a new code.')
      return
    }
    this.send({ v: PHONE_CAMERA_PROTOCOL_VERSION, type: 'ping', session: pairing.session, t: Date.now() })
  }

  private handleMessage(raw: unknown, generation: number, socket: WebSocket): void {
    if (generation !== this.generation || socket !== this.socket) return
    if (typeof raw !== 'string') return
    let message: PhoneCameraServerMessage
    try { message = JSON.parse(raw) as PhoneCameraServerMessage } catch { return }
    if (!message || message.v !== PHONE_CAMERA_PROTOCOL_VERSION) return
    this.callbacks.onMessage?.(message)
    if (message.type === 'paired') this.callbacks.onStatus?.('connected', 'Phone Camera connected.')
    if (message.type === 'pose') this.callbacks.onPose?.(message)
    if (message.type === 'error') {
      if (message.code === 'pairing_expired' || message.code === 'session_closed') this.disconnect('expired', 'Pairing expired. Generate a new code.')
      else this.callbacks.onStatus?.('error', message.message)
    }
    if (message.type === 'ping') this.send({ v: 1, type: 'pong', session: message.session, t: message.t })
    if (message.type === 'disconnected') this.callbacks.onStatus?.('idle', message.reason ?? 'Phone Camera disconnected.')
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat)
    this.heartbeat = null
  }
}
