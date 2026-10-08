export const RELAY_PROTOCOL_VERSION = 1
export const RELAY_SESSION_TTL_MS = 10 * 60 * 1000
export const RELAY_MAX_MESSAGE_BYTES = 8 * 1024

export type RelayRole = 'desktop' | 'phone'

export function isRelayRole(value: string | null): value is RelayRole {
  return value === 'desktop' || value === 'phone'
}

export function validRelayToken(value: string | null): value is string {
  return Boolean(value && /^[a-f0-9]{24,128}$/i.test(value))
}

export function validRelaySession(value: string | null): value is string {
  return Boolean(value && /^[a-f0-9]{12,128}$/i.test(value))
}

export function canForwardMessage(role: RelayRole, type: string): boolean {
  if (type === 'pose') return role === 'phone'
  if (type === 'recenter') return true
  if (type === 'setCameraKey') return role === 'phone'
  if (type === 'setCameraKeyAck' || type === 'recordAck') return role === 'desktop'
  if (type === 'recordStart' || type === 'recordStop') return true
  if (type === 'terminate') return role === 'desktop'
  if (type === 'hello' || type === 'ready') return true
  return type === 'ping' || type === 'pong'
}

export function isSessionExpired(expiresAt: number, now = Date.now()): boolean {
  return now >= expiresAt
}
