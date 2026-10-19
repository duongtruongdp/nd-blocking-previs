export type LiveRelayConfig = {
  port: number
  host: string
  websocketPath: string
  allowedOrigins: string[]
  production: boolean
  sessionTtlMs: number
  hostReconnectGraceMs: number
  maxMessageBytes: number
  maxViewersPerSession: number
  maxSessions: number
  maxMessagesPerSecond: number
  maxTransformsPerSecond: number
  maxPointersPerSecond: number
  maxChatMessagesPerTenSeconds: number
  editLeaseMs: number
  maxInvalidMessagesPerMinute: number
  maxConnectionsPerIp: number
  maxSessionCreatesPerIpPerMinute: number
  heartbeatIntervalMs: number
}

const DEFAULTS = {
  port: 8787,
  websocketPath: '/live',
  sessionTtlMs: 60 * 60 * 1000,
  hostReconnectGraceMs: 30 * 1000,
  maxMessageBytes: 16 * 1024 * 1024,
  maxViewersPerSession: 25,
  maxSessions: 100,
  maxMessagesPerSecond: 120,
  maxTransformsPerSecond: 60,
  maxPointersPerSecond: 40,
  maxChatMessagesPerTenSeconds: 5,
  editLeaseMs: 8000,
  maxInvalidMessagesPerMinute: 8,
  maxConnectionsPerIp: 20,
  maxSessionCreatesPerIpPerMinute: 5,
  heartbeatIntervalMs: 15 * 1000,
} as const

function positiveInt(value: string | undefined, fallback: number, minimum = 1): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback
}

function nonNegativeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function liveRelayConfig(env: NodeJS.ProcessEnv = process.env): LiveRelayConfig {
  const production = env.NODE_ENV === 'production'
  const allowedOrigins = (env.LIVE_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean)
  return {
    port: positiveInt(env.PORT ?? env.LIVE_RELAY_PORT, DEFAULTS.port),
    host: env.HOST?.trim() || '127.0.0.1',
    websocketPath: env.LIVE_WEBSOCKET_PATH?.trim() || DEFAULTS.websocketPath,
    allowedOrigins,
    production,
    sessionTtlMs: positiveInt(env.LIVE_SESSION_TTL_MS, DEFAULTS.sessionTtlMs),
    hostReconnectGraceMs: nonNegativeInt(env.LIVE_HOST_RECONNECT_GRACE_MS, DEFAULTS.hostReconnectGraceMs),
    maxMessageBytes: positiveInt(env.LIVE_MAX_MESSAGE_BYTES, DEFAULTS.maxMessageBytes),
    maxViewersPerSession: positiveInt(env.LIVE_MAX_VIEWERS_PER_SESSION, DEFAULTS.maxViewersPerSession),
    maxSessions: positiveInt(env.LIVE_MAX_SESSIONS, DEFAULTS.maxSessions),
    maxMessagesPerSecond: positiveInt(env.LIVE_MAX_MESSAGES_PER_SECOND, DEFAULTS.maxMessagesPerSecond),
    maxTransformsPerSecond: positiveInt(env.LIVE_MAX_TRANSFORMS_PER_SECOND, DEFAULTS.maxTransformsPerSecond),
    maxPointersPerSecond: positiveInt(env.LIVE_MAX_POINTERS_PER_SECOND, DEFAULTS.maxPointersPerSecond),
    maxChatMessagesPerTenSeconds: positiveInt(env.LIVE_MAX_CHAT_MESSAGES_PER_TEN_SECONDS, DEFAULTS.maxChatMessagesPerTenSeconds),
    editLeaseMs: positiveInt(env.LIVE_EDIT_LEASE_MS, DEFAULTS.editLeaseMs, 1000),
    maxInvalidMessagesPerMinute: positiveInt(env.LIVE_MAX_INVALID_MESSAGES_PER_MINUTE, DEFAULTS.maxInvalidMessagesPerMinute),
    maxConnectionsPerIp: positiveInt(env.LIVE_MAX_CONNECTIONS_PER_IP, DEFAULTS.maxConnectionsPerIp),
    maxSessionCreatesPerIpPerMinute: positiveInt(env.LIVE_MAX_SESSION_CREATES_PER_IP_PER_MINUTE, DEFAULTS.maxSessionCreatesPerIpPerMinute),
    heartbeatIntervalMs: positiveInt(env.LIVE_HEARTBEAT_INTERVAL_MS, DEFAULTS.heartbeatIntervalMs, 1000),
  }
}

export function originAllowed(origin: string | undefined, config: LiveRelayConfig): boolean {
  // Native WebViews and command-line smoke clients may omit Origin. They are
  // authenticated by the session protocol and are not browser cross-origin
  // requests, so they remain usable for the desktop contract.
  if (!origin) return true
  if (config.allowedOrigins.length > 0) return config.allowedOrigins.includes(origin)
  if (config.production) return false
  return origin === 'http://localhost' || origin.startsWith('http://localhost:') || origin === 'http://127.0.0.1' || origin.startsWith('http://127.0.0.1:')
}

export function clientIp(request: { socket: { remoteAddress?: string } }): string {
  return request.socket.remoteAddress?.replace(/^::ffff:/, '') || 'unknown'
}
