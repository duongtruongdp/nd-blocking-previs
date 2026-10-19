import * as THREE from 'three'

export const PHONE_CAMERA_PROTOCOL_VERSION = 1 as const
export const PHONE_CAMERA_MAX_MESSAGE_BYTES = 8 * 1024
export const PHONE_CAMERA_SESSION_TTL_MS = 10 * 60 * 1000

export type PhoneCameraRole = 'desktop' | 'phone'
export type PhoneCameraControlMode = 'rotation' | 'position' | 'positionRotation'
export type PhoneCameraControlPreset = 'move' | 'rotate' | 'full' | 'custom'
export type PhoneCameraControlChannels = {
  truck: boolean
  pedestal: boolean
  dolly: boolean
  pan: boolean
  tilt: boolean
  dutch: boolean
}
export type PhoneCameraScreenOrientation = 'landscape-left' | 'landscape-right' | 'portrait' | 'unknown'
export type PhoneCameraCapabilities = {
  orientation: boolean
  position: boolean
  /** Channel-capable native companions send the authoritative six-channel mask. */
  controlChannels?: boolean
}

export type PhoneCameraHello = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'hello'
  role: PhoneCameraRole
  session: string
  capabilities?: PhoneCameraCapabilities
}

export type PhoneCameraReady = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'ready'
  session: string
  device?: string
  capabilities?: PhoneCameraCapabilities
}

export type PhoneCameraPose = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'pose'
  session: string
  t: number
  orientation: [number, number, number, number]
  /** Optional for V1 Web companions; present for native 6DoF pose sources. */
  position: [number, number, number] | null
  screenOrientation: PhoneCameraScreenOrientation
}

export type PhoneCameraRecenter = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'recenter'
  session: string
}

export type PhoneCameraRecenterHoldCommand = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'recenterHoldStart' | 'recenterHoldEnd'
  session: string
}

export type PhoneCameraRecenterHoldState = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'recenterHoldState'
  session: string
  active: boolean
  accepted: boolean
  message?: string
}

export type PhoneCameraSetCameraKey = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'setCameraKey'
  session: string
}

export type PhoneCameraSetMovementScale = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'setMovementScale'
  session: string
  scale: number
}

export type PhoneCameraSetRotationSensitivity = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'setRotationSensitivity'
  session: string
  sensitivity: number
}

export type PhoneCameraControlChannelsMessage = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'controlChannels'
  session: string
  channels: PhoneCameraControlChannels
}

export type PhoneCameraControlState = {
  channels: PhoneCameraControlChannels
  movementScale: number
  rotationSensitivity: number
}

export type PhoneCameraControlStateMessage = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'controlState'
  session: string
  state: PhoneCameraControlState
}

export type PhoneCameraRecenterAck = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'recenterAck'
  session: string
  accepted: boolean
  message?: string
}

export type PhoneCameraControlModeMessage = {
  v: typeof PHONE_CAMERA_PROTOCOL_VERSION
  type: 'controlMode'
  session: string
  mode: PhoneCameraControlMode
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

export type PhoneCameraClientMessage = PhoneCameraHello | PhoneCameraReady | PhoneCameraPose | PhoneCameraRecenter | PhoneCameraRecenterHoldCommand | PhoneCameraSetCameraKey | PhoneCameraSetMovementScale | PhoneCameraSetRotationSensitivity | PhoneCameraControlChannelsMessage | PhoneCameraControlModeMessage | PhoneCameraControlStateMessage | PhoneCameraRecenterAck | PhoneCameraSetCameraKeyAck | PhoneCameraRecord | PhoneCameraRecordAck | PhoneCameraHeartbeat | PhoneCameraTerminate

export type PhoneCameraServerMessage =
  | PhoneCameraHello
  | PhoneCameraReady
  | PhoneCameraPose
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'paired'; session: string; peer: PhoneCameraRole }
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'recenter'; session: string }
  | PhoneCameraRecenterHoldCommand
  | PhoneCameraRecenterHoldState
  | { v: typeof PHONE_CAMERA_PROTOCOL_VERSION; type: 'setCameraKey'; session: string }
  | PhoneCameraSetMovementScale
  | PhoneCameraSetRotationSensitivity
  | PhoneCameraControlChannelsMessage
  | PhoneCameraControlStateMessage
  | PhoneCameraRecenterAck
  | PhoneCameraControlModeMessage
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

export function isFinitePosition(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

function isCapabilities(value: unknown): value is PhoneCameraCapabilities {
  if (!value || typeof value !== 'object') return false
  const capabilities = value as Record<string, unknown>
  return typeof capabilities.orientation === 'boolean' && typeof capabilities.position === 'boolean' && (capabilities.controlChannels === undefined || typeof capabilities.controlChannels === 'boolean')
}

function normalizedCapabilities(value: unknown): PhoneCameraCapabilities | undefined {
  return isCapabilities(value) ? { orientation: value.orientation, position: value.position, ...(value.controlChannels !== undefined ? { controlChannels: value.controlChannels } : {}) } : undefined
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

function isControlMode(value: unknown): value is PhoneCameraControlMode {
  return value === 'rotation' || value === 'position' || value === 'positionRotation'
}

export const FULL_PHONE_CAMERA_CHANNELS: PhoneCameraControlChannels = { truck: true, pedestal: true, dolly: true, pan: true, tilt: true, dutch: true }
export const MOVE_PHONE_CAMERA_CHANNELS: PhoneCameraControlChannels = { truck: true, pedestal: true, dolly: true, pan: false, tilt: false, dutch: false }
export const ROTATE_PHONE_CAMERA_CHANNELS: PhoneCameraControlChannels = { truck: false, pedestal: false, dolly: false, pan: true, tilt: true, dutch: true }

function isControlChannels(value: unknown): value is PhoneCameraControlChannels {
  if (!value || typeof value !== 'object') return false
  const channels = value as Record<string, unknown>
  return ['truck', 'pedestal', 'dolly', 'pan', 'tilt', 'dutch'].every((key) => typeof channels[key] === 'boolean')
}

function isControlState(value: unknown): value is PhoneCameraControlState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  return isControlChannels(state.channels) && typeof state.movementScale === 'number' && Number.isFinite(state.movementScale) && state.movementScale >= 0.1 && state.movementScale <= 10 && typeof state.rotationSensitivity === 'number' && Number.isFinite(state.rotationSensitivity) && state.rotationSensitivity >= 0.25 && state.rotationSensitivity <= 3
}

export function controlChannelsEqual(left: PhoneCameraControlChannels, right: PhoneCameraControlChannels): boolean {
  return left.truck === right.truck && left.pedestal === right.pedestal && left.dolly === right.dolly && left.pan === right.pan && left.tilt === right.tilt && left.dutch === right.dutch
}

export function controlPresetForChannels(channels: PhoneCameraControlChannels): PhoneCameraControlPreset {
  if (controlChannelsEqual(channels, MOVE_PHONE_CAMERA_CHANNELS)) return 'move'
  if (controlChannelsEqual(channels, ROTATE_PHONE_CAMERA_CHANNELS)) return 'rotate'
  if (controlChannelsEqual(channels, FULL_PHONE_CAMERA_CHANNELS)) return 'full'
  return 'custom'
}

export function channelsForPreset(preset: Exclude<PhoneCameraControlPreset, 'custom'>): PhoneCameraControlChannels {
  if (preset === 'move') return { ...MOVE_PHONE_CAMERA_CHANNELS }
  if (preset === 'rotate') return { ...ROTATE_PHONE_CAMERA_CHANNELS }
  return { ...FULL_PHONE_CAMERA_CHANNELS }
}

export function phoneCameraChannelSummary(channels: PhoneCameraControlChannels): string {
  const movement = [['truck', 'Truck'], ['pedestal', 'Pedestal'], ['dolly', 'Dolly']].filter(([key]) => channels[key as keyof PhoneCameraControlChannels]).map(([, label]) => label)
  const rotation = [['pan', 'Pan'], ['tilt', 'Tilt'], ['dutch', 'Dutch']].filter(([key]) => channels[key as keyof PhoneCameraControlChannels]).map(([, label]) => label)
  const preset = controlPresetForChannels(channels)
  if (preset === 'move') return 'Move'
  if (preset === 'rotate') return 'Rotate'
  if (preset === 'full') return 'Full'
  return [...movement, ...rotation].join(' + ') || 'None'
}

/** Parse only the small, versioned allowlist shared by the browser and relay. */
export function parsePhoneCameraMessage(raw: string, session: string): PhoneCameraClientMessage | PhoneCameraServerMessage | null {
  if (raw.length === 0 || new TextEncoder().encode(raw).byteLength > PHONE_CAMERA_MAX_MESSAGE_BYTES) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (!value || typeof value !== 'object') return null
  const message = value as Record<string, unknown>
  if (message.v !== PHONE_CAMERA_PROTOCOL_VERSION || typeof message.type !== 'string' || !isSession(message.session, session)) return null

  if (message.type === 'hello' && isRole(message.role)) {
    const capabilities = normalizedCapabilities(message.capabilities)
    return { v: 1, type: 'hello', role: message.role, session, ...(capabilities ? { capabilities } : {}) }
  }
  if (message.type === 'ready' && (message.device === undefined || typeof message.device === 'string')) {
    const capabilities = normalizedCapabilities(message.capabilities)
    return { v: 1, type: 'ready', session, ...(message.device ? { device: message.device.slice(0, 120) } : {}), ...(capabilities ? { capabilities } : {}) }
  }
  if (message.type === 'pose' && typeof message.t === 'number' && Number.isFinite(message.t) && isFiniteQuaternion(message.orientation) && (message.position === undefined || message.position === null || isFinitePosition(message.position)) && (message.screenOrientation === undefined || message.screenOrientation === 'landscape-left' || message.screenOrientation === 'landscape-right' || message.screenOrientation === 'portrait' || message.screenOrientation === 'unknown')) return { v: 1, type: 'pose', session, t: message.t, orientation: normalizedQuaternion(message.orientation), position: isFinitePosition(message.position) ? [...message.position] : null, screenOrientation: message.screenOrientation ?? 'unknown' }
  if (message.type === 'recenter') return { v: 1, type: 'recenter', session }
  if (message.type === 'recenterHoldStart' || message.type === 'recenterHoldEnd') return { v: 1, type: message.type, session }
  if (message.type === 'recenterHoldState' && typeof message.active === 'boolean' && typeof message.accepted === 'boolean' && (message.message === undefined || typeof message.message === 'string')) return { v: 1, type: 'recenterHoldState', session, active: message.active, accepted: message.accepted, ...(message.message ? { message: message.message.slice(0, 160) } : {}) }
  if (message.type === 'setCameraKey') return { v: 1, type: 'setCameraKey', session }
  if (message.type === 'setMovementScale' && typeof message.scale === 'number' && Number.isFinite(message.scale) && message.scale >= 0.1 && message.scale <= 10) return { v: 1, type: 'setMovementScale', session, scale: message.scale }
  if (message.type === 'setRotationSensitivity' && typeof message.sensitivity === 'number' && Number.isFinite(message.sensitivity) && message.sensitivity >= 0.25 && message.sensitivity <= 3) return { v: 1, type: 'setRotationSensitivity', session, sensitivity: message.sensitivity }
  if (message.type === 'controlChannels' && isControlChannels(message.channels)) return { v: 1, type: 'controlChannels', session, channels: { ...message.channels } }
  if (message.type === 'controlState' && isControlState(message.state)) return { v: 1, type: 'controlState', session, state: { channels: { ...message.state.channels }, movementScale: message.state.movementScale, rotationSensitivity: message.state.rotationSensitivity } }
  if (message.type === 'recenterAck' && typeof message.accepted === 'boolean' && (message.message === undefined || typeof message.message === 'string')) return { v: 1, type: 'recenterAck', session, accepted: message.accepted, ...(message.message ? { message: message.message.slice(0, 160) } : {}) }
  if (message.type === 'controlMode' && isControlMode(message.mode)) return { v: 1, type: 'controlMode', session, mode: message.mode }
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
