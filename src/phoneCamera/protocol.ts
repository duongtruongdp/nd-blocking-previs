import * as THREE from 'three'

export const PHONE_CAMERA_PROTOCOL_VERSION = 1 as const
export const PHONE_CAMERA_MAX_MESSAGE_BYTES = 8 * 1024
export const PHONE_CAMERA_SESSION_TTL_MS = 10 * 60 * 1000

export type PhoneCameraRole = 'desktop' | 'phone'
export type PhoneCameraScreenOrientation = 'landscape-left' | 'landscape-right' | 'portrait' | 'unknown'

export type PhoneCameraHello = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'hello'
  role: PhoneCameraRole
  session: string
}

export type PhoneCameraReady = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'ready'
  session: string
  device?: string
}

export type PhoneCameraPose = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'pose'
  session: string
  t: number
  orientation: [number, number, number, number]
  position: null
  screenOrientation: PhoneCameraScreenOrientation
}

export type PhoneCameraRecenter = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'recenter'
  session: string
}

export type PhoneCameraSetCameraKey = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'setCameraKey'
  session: string
}

export type PhoneCameraSetCameraKeyAck = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'setCameraKeyAck'
  session: string
  accepted: boolean
  message?: string
}

export type PhoneCameraRecordAck = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'recordAck'
  session: string
  action: 'start' | 'stop'
  accepted: boolean
  message?: string
}

export type PhoneCameraRecord = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'recordStart' | 'recordStop'
  session: string
}

export type PhoneCameraHeartbeat = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'ping' | 'pong'
  session: string
  t: number
}

export type PhoneCameraTerminate = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'terminate'
  session: string
}

export type PhoneCameraClientMessage = PhoneCameraHello | PhoneCameraReady | PhoneCameraPose | PhoneCameraRecenter | PhoneCameraSetCameraKey | PhoneCameraSetCameraKeyAck | PhoneCameraRecord | PhoneCameraRecordAck | PhoneCameraHeartbeat | PhoneCameraTerminate

export type PhoneCameraServerMessage =
  | PhoneCameraPose
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'paired'; session: string; peer: PhoneCameraRole }
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'recenter'; session: string }
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'setCameraKey'; session: string }
  | PhoneCameraSetCameraKeyAck
  | PhoneCameraRecordAck
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'recordStart' | 'recordStop'; session: string }
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'ping' | 'pong'; session: string; t: number }
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'disconnected'; session: string; reason?: string }
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'error'; session?: string; code: string; message: string }

export type PhoneCameraPairingData = {
  session: string
  token: string
  relay: string
  companion: string
}

export function isFiniteQuaternion(value: unknown): value is [number, number, number, number] {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

export function normalizedQuaternion(value: [number, number, number, number]): [number, number, number, number] {
  const quaternion = new THREE.Quaternion(value[0], value[1], value[2], value[3])
  if (quaternion.lengthSq() < 1e-10) return [0, 0, 0, 1]
  quaternion.normalize()
  return quaternion.toArray() as [number, number, number, number]
}

function isSession(value: unknown, session: string): value is string {
  return typeof value === 'string' && value === session && value.length > 0 && value.length <= 128
}

function isRole(value: unknown): value is PhoneCameraRole {
  return value === 'desktop' || value === 'phone'
}

/** Parse only the small, versioned allowlist shared by the browser and relay. */
export function parsePhoneCameraMessage(raw: string, session: string): PhoneCameraClientMessage | null {
  if (raw.length === 0 || new TextEncoder().encode(raw).byteLength > PHONE_CAMERA_MAX_MESSAGE_BYTES) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value !== 'object') return null
  const message = value as Record<string, unknown>
  if (message.v !== PHONE_CAMERA_PROTOCOL_VERSION || typeof message.type !== 'string' || !isSession(message.session, session)) return null

  if (message.type === 'hello' && isRole(message.role)) return { v: 1, type: 'hello', role: message.role, session }
  if (message.type === 'ready' && (message.device === undefined || typeof message.device === 'string')) return { v: 1, type: 'ready', session, ...(message.device ? { device: message.device.slice(0, 120) } : {}) }
  if (message.type === 'pose' && typeof message.t === 'number' && Number.isFinite(message.t) && isFiniteQuaternion(message.orientation) && message.position === null && (message.screenOrientation === undefined || message.screenOrientation === 'landscape-left' || message.screenOrientation === 'landscape-right' || message.screenOrientation === 'portrait' || message.screenOrientation === 'unknown')) return { v: 1, type: 'pose', session, t: message.t, orientation: normalizedQuaternion(message.orientation), position: null, screenOrientation: message.screenOrientation ?? 'unknown' }
  if (message.type === 'recenter') return { v: 1, type: 'recenter', session }
  if (message.type === 'setCameraKey') return { v: 1, type: 'setCameraKey', session }
  if (message.type === 'setCameraKeyAck' && typeof message.accepted === 'boolean' && (message.message === undefined || typeof message.message === 'string')) return { v: 1, type: 'setCameraKeyAck', session, accepted: message.accepted, ...(message.message ? { message: message.message.slice(0, 160) } : {}) }
  if (message.type === 'recordAck' && (message.action === 'start' || message.action === 'stop') && typeof message.accepted === 'boolean' && (message.message === undefined || typeof message.message === 'string')) return { v: 1, type: 'recordAck', session, action: message.action, accepted: message.accepted, ...(message.message ? { message: message.message.slice(0, 160) } : {}) }
  if ((message.type === 'recordStart' || message.type === 'recordStop')) return { v: 1, type: message.type, session }
  if ((message.type === 'ping' || message.type === 'pong') && typeof message.t === 'number' && Number.isFinite(message.t)) return { v: 1, type: message.type, session, t: message.t }
  if (message.type === 'terminate') return { v: 1, type: 'terminate', session }
  return null
}

export function serializePhoneCameraMessage(message: PhoneCameraClientMessage | PhoneCameraServerMessage): string {
  return JSON.stringify(message)
}
