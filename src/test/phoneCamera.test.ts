import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { canForwardMessage, isSessionExpired, validRelaySession, validRelayToken } from '../../relay/sessionPolicy'
import type { CameraDocument } from '../core/sceneDocument'
import { controlPresetForChannels, channelsForPreset, parsePhoneCameraMessage, phoneCameraChannelSummary } from '../phoneCamera/protocol'
import { createPhoneCameraPairing, PhoneCameraSession } from '../phoneCamera/phoneCameraSession'
import { PhoneCameraController } from '../phoneCamera/phoneCameraController'
import { buildPhoneCameraPairingUrl, DEFAULT_PHONE_CAMERA_RELAY_URL, phoneCameraRelaySocketUrl } from '../phoneCamera/phoneCameraConfig'
import { deviceOrientationQuaternion, eulerRotationFromQuaternion, quaternionFromEulerRotation, recenteredCameraPositionDelta, relativeCameraQuaternion, relativeSemanticRotation, screenOrientationState, semanticPositionDelta, smoothQuaternion, smoothVector } from '../phoneCamera/poseMath'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []
  readonly sent: string[] = []
  readonly listeners = new Map<string, Array<(event: { data?: unknown }) => void>>()
  readyState = FakeWebSocket.CONNECTING
  constructor(readonly url: URL) {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.emit('open', {})
    })
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  send(message: string): void { this.sent.push(message) }
  close(): void {
    if (this.readyState >= FakeWebSocket.CLOSING) return
    this.readyState = FakeWebSocket.CLOSING
    this.emit('close', {})
    this.readyState = FakeWebSocket.CLOSED
  }
  emit(type: string, event: { data?: unknown }): void { this.listeners.get(type)?.forEach((listener) => listener(event)) }
}

describe('Phone Camera protocol', () => {
  it('uses the complete /session relay endpoint in pairing links', () => {
    expect(DEFAULT_PHONE_CAMERA_RELAY_URL).toBe('wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev/session')
    expect(phoneCameraRelaySocketUrl('wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev')).toBe(DEFAULT_PHONE_CAMERA_RELAY_URL)
    const pairingUrl = buildPhoneCameraPairingUrl({ session: 'session-01', token: 'token-01', relay: 'wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev', companion: 'https://companion.test/phone-camera/' })
    expect(new URL(pairingUrl).searchParams.get('relay')).toBe(DEFAULT_PHONE_CAMERA_RELAY_URL)
  })

  it('accepts versioned finite normalized pose packets and rejects unknown packets', () => {
    const pose = parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'pose', session: 'session-01', t: 10, orientation: [0, 0, 0, 2], position: null }), 'session-01')
    expect(pose?.type).toBe('pose')
    expect(pose && pose.type === 'pose' ? pose.orientation : null).toEqual([0, 0, 0, 1])
    const nativePose = parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'pose', session: 'session-01', t: 11, orientation: [0, 0, 0, 1], position: [1, 2, 3], screenOrientation: 'unknown' }), 'session-01')
    expect(nativePose && nativePose.type === 'pose' ? nativePose.position : null).toEqual([1, 2, 3])
    const legacyPose = parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'pose', session: 'session-01', t: 12, orientation: [0, 0, 0, 1] }), 'session-01')
    expect(legacyPose && legacyPose.type === 'pose' ? legacyPose.position : null).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'pose', session: 'session-01', t: 13, orientation: [0, 0, 0, 1], position: [1, 2] }), 'session-01')).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'setMovementScale', session: 'session-01', scale: 2 }) as string, 'session-01')?.type).toBe('setMovementScale')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'setMovementScale', session: 'session-01', scale: 0.1 }), 'session-01')?.type).toBe('setMovementScale')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'setMovementScale', session: 'session-01', scale: 10.01 }), 'session-01')).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'setRotationSensitivity', session: 'session-01', sensitivity: 2.5 }), 'session-01')?.type).toBe('setRotationSensitivity')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'hello', role: 'phone', session: 'session-01', capabilities: { orientation: true, position: true, controlChannels: true } }), 'session-01')).toMatchObject({ type: 'hello', capabilities: { controlChannels: true } })
    const channels = { truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false }
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'controlChannels', session: 'session-01', channels }), 'session-01')).toMatchObject({ type: 'controlChannels', channels })
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'controlState', session: 'session-01', state: { channels, movementScale: 2, rotationSensitivity: 1.25 } }), 'session-01')).toMatchObject({ type: 'controlState', state: { channels, movementScale: 2, rotationSensitivity: 1.25 } })
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'recenterAck', session: 'session-01', accepted: true }), 'session-01')?.type).toBe('recenterAck')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'recenterHoldStart', session: 'session-01' }), 'session-01')?.type).toBe('recenterHoldStart')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'recenterHoldState', session: 'session-01', active: true, accepted: true }), 'session-01')?.type).toBe('recenterHoldState')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'controlMode', session: 'session-01', mode: 'positionRotation' }), 'session-01')?.type).toBe('controlMode')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'controlMode', session: 'session-01', mode: 'unsupported' }), 'session-01')).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'setCameraKey', session: 'session-01' }), 'session-01')?.type).toBe('setCameraKey')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'recordAck', session: 'session-01', action: 'start', accepted: true }), 'session-01')?.type).toBe('recordAck')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'mesh', session: 'session-01' }), 'session-01')).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 2, type: 'pose', session: 'session-01', t: 10, orientation: [0, 0, 0, 1], position: null }), 'session-01')).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'terminate', session: 'session-01' }), 'session-01')?.type).toBe('terminate')
  })

  it('maps presets and produces deterministic active-channel summaries', () => {
    expect(controlPresetForChannels(channelsForPreset('move'))).toBe('move')
    expect(controlPresetForChannels(channelsForPreset('rotate'))).toBe('rotate')
    expect(controlPresetForChannels({ truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false })).toBe('custom')
    expect(phoneCameraChannelSummary({ truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false })).toBe('Dolly + Pan')
    expect(canForwardMessage('phone', 'controlChannels')).toBe(true)
    expect(canForwardMessage('phone', 'setRotationSensitivity')).toBe(true)
  })
})

describe('Phone Camera pose math', () => {
  it('keeps a neutral sensor orientation finite and normalized', () => {
    expect(deviceOrientationQuaternion(0, 0, 0).length()).toBeCloseTo(1)
  })

  it('reconstructs the baseline when the phone has not moved', () => {
    const base = quaternionFromEulerRotation([0.2, -0.5, 0.1])
    const result = relativeCameraQuaternion(base, new THREE.Quaternion(0, 0, 0, 1), new THREE.Quaternion(0, 0, 0, 1))
    expect(result.angleTo(base)).toBeCloseTo(0)
  })

  it('applies sensitivity to relative rotation without changing the base', () => {
    const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0))
    const current = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5)
    const result = relativeCameraQuaternion(base, new THREE.Quaternion(), current, 0.5)
    expect(result.angleTo(base)).toBeCloseTo(0.25, 3)
  })

  it('round-trips the app camera Euler convention', () => {
    const rotation: [number, number, number] = [0.2, -0.4, 0.3]
    const roundTrip = eulerRotationFromQuaternion(quaternionFromEulerRotation(rotation))
    expect(roundTrip[0]).toBeCloseTo(rotation[0])
    expect(roundTrip[1]).toBeCloseTo(rotation[1])
    expect(roundTrip[2]).toBeCloseTo(rotation[2])
  })

  it('normalizes both landscape directions and identifies portrait centrally', () => {
    expect(screenOrientationState(90)).toBe('landscape-right')
    expect(screenOrientationState(270)).toBe('landscape-left')
    expect(screenOrientationState(0)).toBe('portrait')
    expect(screenOrientationState(180)).toBe('portrait')
    expect(deviceOrientationQuaternion(0, 0, 0, Math.PI / 2).length()).toBeCloseTo(1)
    expect(deviceOrientationQuaternion(0, 0, 0, -Math.PI / 2).length()).toBeCloseTo(1)
  })

  it('maps recentered phone translation into the virtual Camera frame', () => {
    const referencePhone = new THREE.Vector3(8, -2, 4)
    const currentPhone = referencePhone.clone().add(new THREE.Vector3(1, 0.5, -2))
    const virtualCamera = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
    const delta = recenteredCameraPositionDelta(referencePhone, currentPhone, new THREE.Quaternion(), virtualCamera)
    expect(delta.x).toBeCloseTo(-2)
    expect(delta.y).toBeCloseTo(0.5)
    expect(delta.z).toBeCloseTo(-1)
    const scaled = recenteredCameraPositionDelta(referencePhone, currentPhone, new THREE.Quaternion(), new THREE.Quaternion(), 2)
    expect(scaled.toArray()).toEqual([2, 1, -4])
  })

  it('filters semantic movement channels independently', () => {
    const reference = new THREE.Vector3()
    const current = new THREE.Vector3(1, 0.5, -2)
    const identity = new THREE.Quaternion()
    const dollyOnly = { truck: false, pedestal: false, dolly: true, pan: false, tilt: false, dutch: false }
    const truckOnly = { truck: true, pedestal: false, dolly: false, pan: false, tilt: false, dutch: false }
    expect(semanticPositionDelta(reference, current, identity, identity, dollyOnly).toArray()).toEqual([0, 0, -2])
    expect(semanticPositionDelta(reference, current, identity, identity, truckOnly).toArray()).toEqual([1, 0, 0])
  })

  it('derives rotation channels as semantic Euler deltas', () => {
    const current = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0, 'XYZ'))
    const delta = relativeSemanticRotation(new THREE.Quaternion(), current)
    expect(delta[0]).toBeCloseTo(0)
    expect(delta[1]).toBeCloseTo(0.4)
    expect(delta[2]).toBeCloseTo(0)
  })

  it('keeps 100,000 synthetic pose calculations finite and responsive', () => {
    const identity = new THREE.Quaternion()
    const channels = { truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false }
    let smoothedRotation = identity.clone()
    let smoothedPosition = new THREE.Vector3()
    let lastTarget = identity.clone()
    let lastPosition = new THREE.Vector3()
    for (let index = 0; index < 100_000; index += 1) {
      const seconds = index / 30
      lastTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2 * Math.sin(seconds / 7), 0.6 * Math.sin(seconds / 11), 0.1 * Math.cos(seconds / 13), 'XYZ')).normalize()
      lastPosition = new THREE.Vector3(Math.sin(seconds / 5), 0.1 * Math.cos(seconds / 9), -Math.cos(seconds / 6))
      smoothedRotation = smoothQuaternion(smoothedRotation, lastTarget, 0.3)
      smoothedPosition = smoothVector(smoothedPosition, lastPosition, 0.3)
      const semanticDelta = semanticPositionDelta(new THREE.Vector3(), lastPosition, identity, smoothedRotation, channels, 5)
      expect([smoothedRotation.x, smoothedRotation.y, smoothedRotation.z, smoothedRotation.w, smoothedPosition.x, smoothedPosition.y, smoothedPosition.z, ...semanticDelta.toArray()].every(Number.isFinite)).toBe(true)
    }
    const nextTarget = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.8, 0, 'XYZ')).normalize()
    expect(smoothedQuaternionDistance(smoothedRotation, nextTarget)).toBeGreaterThan(0)
    expect(smoothedPosition.distanceTo(lastPosition)).toBeLessThan(0.1)
    expect(lastTarget.length()).toBeCloseTo(1)
  })
})

function smoothedQuaternionDistance(left: THREE.Quaternion, right: THREE.Quaternion): number {
  return left.angleTo(right)
}

describe('Phone Camera relay policy', () => {
    it('limits roles and forwarded message directions', () => {
    expect(validRelaySession('abcdef012345')).toBe(true)
    expect(validRelayToken('abcdef012345678901234567')).toBe(true)
      expect(canForwardMessage('phone', 'pose')).toBe(true)
      expect(canForwardMessage('desktop', 'pose')).toBe(false)
    expect(canForwardMessage('phone', 'recenter')).toBe(true)
      expect(canForwardMessage('desktop', 'recenter')).toBe(false)
      expect(canForwardMessage('phone', 'recenterHoldStart')).toBe(true)
      expect(canForwardMessage('phone', 'recenterHoldEnd')).toBe(true)
      expect(canForwardMessage('desktop', 'recenterHoldState')).toBe(true)
      expect(canForwardMessage('phone', 'setCameraKey')).toBe(true)
      expect(canForwardMessage('phone', 'setMovementScale')).toBe(true)
      expect(canForwardMessage('phone', 'controlMode')).toBe(true)
      expect(canForwardMessage('desktop', 'setCameraKey')).toBe(false)
    expect(canForwardMessage('desktop', 'controlMode')).toBe(false)
    expect(canForwardMessage('desktop', 'controlState')).toBe(true)
    expect(canForwardMessage('phone', 'controlState')).toBe(false)
    expect(canForwardMessage('desktop', 'recenterAck')).toBe(true)
    expect(canForwardMessage('phone', 'recenterAck')).toBe(false)
    expect(canForwardMessage('desktop', 'setCameraKeyAck')).toBe(true)
    expect(canForwardMessage('phone', 'setCameraKeyAck')).toBe(false)
    expect(canForwardMessage('desktop', 'recordStart')).toBe(true)
    expect(canForwardMessage('phone', 'recordStart')).toBe(true)
    expect(canForwardMessage('phone', 'recordStop')).toBe(true)
    expect(canForwardMessage('phone', 'recordAck')).toBe(false)
    expect(canForwardMessage('desktop', 'recordAck')).toBe(true)
    expect(canForwardMessage('desktop', 'terminate')).toBe(true)
    expect(canForwardMessage('phone', 'terminate')).toBe(false)
    expect(isSessionExpired(100, 100)).toBe(true)
  })
})

describe('Phone Camera session lifecycle', () => {
  it('creates fresh sessions and ignores callbacks from a replaced session', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const statuses: string[] = []
    const session = new PhoneCameraSession({ onStatus: (status) => statuses.push(status) })
    const first = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const second = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    session.connect(first)
    await Promise.resolve()
    const firstSocket = FakeWebSocket.instances[0]
    expect(session.pairingData?.session).toBe(first.session)
    session.disconnect()
    expect(session.pairingData).toBeNull()
    session.connect(second)
    await Promise.resolve()
    firstSocket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: first.session, peer: 'phone' }) })
    expect(statuses).not.toContain('connected')
    expect(session.pairingData?.session).toBe(second.session)
    session.disconnect()
    vi.unstubAllGlobals()
  })

  it('keeps the relay session open through the native handshake order', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const received: string[] = []
    const capabilities: Array<{ orientation: boolean; position: boolean }> = []
    const statuses: string[] = []
    const session = new PhoneCameraSession({
      onMessage: (message) => received.push(message.type),
      onCapabilities: (value) => capabilities.push(value),
      onStatus: (status) => statuses.push(status),
    })
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    session.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]

    expect(JSON.parse(socket.sent[0] ?? '{}')).toMatchObject({ type: 'hello', role: 'desktop' })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'ready', session: pairing.session, device: 'NDPhoneCamera iOS', capabilities: { orientation: true, position: true } }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlMode', session: pairing.session, mode: 'positionRotation' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: 1, orientation: [0, 0, 0, 1], position: [0, 0, 0], screenOrientation: 'unknown' }) })

    expect(received).toEqual(['paired', 'ready', 'controlMode', 'pose'])
    expect(capabilities).toEqual([{ orientation: true, position: true }])
    expect(statuses).toContain('connected')
    expect(socket.readyState).toBe(FakeWebSocket.OPEN)
    session.disconnect()
    vi.unstubAllGlobals()
  })

  it('supports five consecutive connect and disconnect sessions with unique credentials', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const session = new PhoneCameraSession()
    const pairings = Array.from({ length: 5 }, () => createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' }))
    for (const pairing of pairings) {
      session.connect(pairing)
      await Promise.resolve()
      expect(session.pairingData?.session).toBe(pairing.session)
      session.disconnect()
    }
    expect(new Set(pairings.map((pairing) => `${pairing.session}:${pairing.token}`)).size).toBe(5)
    vi.unstubAllGlobals()
  })

  it('preserves the selected active Camera while clearing live state on disconnect', () => {
    const states: string[] = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => null,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLiveRotation: () => {},
      onState: (state) => states.push(`${state.status}:${state.activeCameraId ?? 'none'}`),
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => false,
    })
    const camera = { id: 'camera-01', rotation: [0, 0, 0] } as CameraDocument
    controller.setActiveCamera(camera)
    controller.disconnect()
    expect(controller.currentState.status).toBe('idle')
    expect(controller.currentState.activeCameraId).toBe('camera-01')
    expect(states.at(-1)).toBe('idle:camera-01')
  })

  it('keeps the session alive when the phone requests repeated recenter operations', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', rotation: [0.1, 0.2, 0.3] } as CameraDocument
    const applied: Array<[number, number, number]> = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLiveRotation: (_cameraId, rotation) => applied.push(rotation),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: 1, orientation: [0, 0, 0, 1], position: null, screenOrientation: 'landscape-left' }) })
    for (let index = 0; index < 10; index += 1) socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    expect(socket.readyState).toBe(FakeWebSocket.OPEN)
    expect(controller.pairingData?.token).toBe(pairing.token)
    expect(applied.length).toBeGreaterThan(0)
    expect(socket.sent.map((message) => JSON.parse(message).type)).not.toContain('terminate')
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('applies native position and rotation through the live pose seam without document writes', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [4, 2, -3], rotation: [0, 0, 0] } as CameraDocument
    const applied: Array<{ position: [number, number, number] | null; rotation: [number, number, number] }> = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => applied.push({ position, rotation }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlMode', session: pairing.session, mode: 'positionRotation' }) })
    const pose = (position: [number, number, number]) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: Date.now(), orientation: [0, 0, 0, 1], position, screenOrientation: 'landscape-left' }) })
    pose([0, 0, 0])
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    pose([1, 0, 0])
    expect(controller.currentState.sourceMode).toBe('position-rotation')
    expect(applied.at(-1)?.position?.[0]).toBeCloseTo(4.3)
    expect(applied.at(-1)?.position?.slice(1)).toEqual([2, -3])
    expect(camera.position).toEqual([4, 2, -3])
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('publishes a latest live layer without invoking a runtime pose writer', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [4, 2, -3], rotation: [0, 0, 0] } as CameraDocument
    const layers: Array<{ positionDelta: [number, number, number]; cameraId: string }> = []
    let legacyWriterCalls = 0
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      onLiveLayer: (layer) => { if (layer) layers.push({ positionDelta: layer.positionDelta, cameraId: layer.cameraId }) },
      applyLivePose: () => { legacyWriterCalls += 1 },
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlChannels', session: pairing.session, channels: { truck: true, pedestal: false, dolly: false, pan: false, tilt: false, dutch: false } }) })
    const pose = (position: [number, number, number]) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: Date.now(), orientation: [0, 0, 0, 1], position, screenOrientation: 'landscape-left' }) })
    pose([0, 0, 0])
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    pose([1, 0, 0])
    pose([2, 0, 0])
    expect(layers.at(-1)?.cameraId).toBe('camera-01')
    expect(layers.at(-1)?.positionDelta[0]).toBeGreaterThan(layers.at(-2)?.positionDelta[0] ?? 0)
    expect(legacyWriterCalls).toBe(0)
    expect(camera.position).toEqual([4, 2, -3])
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('requires recenter when native position capability establishes the default mode', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const controller = new PhoneCameraController({
      getActiveCamera: () => ({ id: 'camera-01', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument),
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLiveRotation: () => {},
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera({ id: 'camera-01', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'hello', session: pairing.session, role: 'phone', capabilities: { orientation: true, position: true } }) })
    expect(controller.currentState.controlMode).toBe('positionRotation')
    expect(controller.currentState.requiresRecenter).toBe(true)
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('masks native translation in Rotation mode', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [1, 2, 3], rotation: [0, 0, 0] } as CameraDocument
    const applied: Array<{ position: [number, number, number] | null; rotation: [number, number, number] }> = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => applied.push({ position, rotation }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlMode', session: pairing.session, mode: 'rotation' }) })
    const pose = (position: [number, number, number]) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: Date.now(), orientation: [0, 0, 0, 1], position, screenOrientation: 'landscape-left' }) })
    pose([0, 0, 0])
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    pose([3, 0, 0])
    expect(applied.at(-1)?.position).toBeNull()
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('masks native rotation in Position mode while retaining translation', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] } as CameraDocument
    const applied: Array<{ position: [number, number, number] | null; rotation: [number, number, number] }> = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => applied.push({ position, rotation }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlMode', session: pairing.session, mode: 'position' }) })
    const pose = (orientation: [number, number, number, number], position: [number, number, number]) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: Date.now(), orientation, position, screenOrientation: 'landscape-left' }) })
    pose([0, 0, 0, 1], [0, 0, 0])
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    const baseline = applied.at(-1)?.rotation
    pose([0, Math.sin(0.3), 0, Math.cos(0.3)], [1, 0, 0])
    expect(applied.at(-1)?.position?.[0]).toBeCloseTo(1.3)
    expect(applied.at(-1)?.rotation).toEqual(baseline)
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('changes control channels without forcing a global recenter', () => {
    const applied: Array<{ position: [number, number, number] | null; rotation: [number, number, number] }> = []
    const camera = { id: 'camera-01', position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] } as CameraDocument
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => applied.push({ position, rotation }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.setControlMode('positionRotation')
    expect(controller.currentState.controlMode).toBe('positionRotation')
    expect(controller.currentState.requiresRecenter).toBe(false)
    expect(applied).toHaveLength(0)
  })

  it('publishes authoritative control state without reconnecting a native session', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLiveRotation: () => {},
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'hello', session: pairing.session, role: 'phone', capabilities: { orientation: true, position: true, controlChannels: true } }) })
    const socketCount = FakeWebSocket.instances.length
    controller.setControlChannels({ truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false })
    controller.setMovementScale(2)
    controller.setRotationSensitivity(1.5)
    expect(FakeWebSocket.instances).toHaveLength(socketCount)
    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toMatchObject({ type: 'controlState', state: { channels: { dolly: true, pan: true }, movementScale: 2, rotationSensitivity: 1.5 } })
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('freezes and rebases the live layer through a Dolly plus Pan hold', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument
    const applied: Array<{ position: [number, number, number] | null; rotation: [number, number, number] }> = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => applied.push({ position, rotation }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'hello', session: pairing.session, role: 'phone', capabilities: { orientation: true, position: true, controlChannels: true } }) })
    const channels = { truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false }
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlChannels', session: pairing.session, channels }) })
    const pose = (orientation: [number, number, number, number], position: [number, number, number]) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: Date.now(), orientation, position, screenOrientation: 'landscape-left' }) })
    pose([0, 0, 0, 1], [0, 0, 0])
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    pose([0, Math.sin(0.2), 0, Math.cos(0.2)], [0, 0, -1])
    const beforeHold = applied.at(-1)
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenterHoldStart', session: pairing.session }) })
    pose([0, Math.sin(0.9), 0, Math.cos(0.9)], [0, 0, -4])
    expect(applied.at(-1)).toEqual(beforeHold)
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenterHoldEnd', session: pairing.session }) })
    expect(applied.at(-1)).toEqual(beforeHold)
    pose([0, Math.sin(1.1), 0, Math.cos(1.1)], [0, 0, -5])
    expect(applied.at(-1)?.position?.[2]).not.toBeCloseTo(beforeHold?.position?.[2] ?? 0)
    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toMatchObject({ type: 'recenterHoldState', active: false, accepted: true })
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('processes 100,000 latest-state pose updates across a multi-hour timestamp span', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-long-run', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument
    let appliedCount = 0
    let lastApplied: { position: [number, number, number] | null; rotation: [number, number, number] } | null = null
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => { appliedCount += 1; lastApplied = { position, rotation } },
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'hello', session: pairing.session, role: 'phone', capabilities: { orientation: true, position: true, controlChannels: true } }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlChannels', session: pairing.session, channels: { truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false } }) })
    const pose = (index: number, positionZ = -Math.sin(index / 700)) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: 1_700_000_000_000 + index * 100, orientation: [0, Math.sin(Math.sin(index / 500) * 0.45), 0, Math.cos(Math.sin(index / 500) * 0.45)], position: [Math.sin(index / 300), 0, positionZ], screenOrientation: 'landscape-left' }) })
    pose(0)
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    for (let index = 1; index <= 100_000; index += 1) pose(index)
    const beforeFinalPose = lastApplied as { position: [number, number, number] | null; rotation: [number, number, number] } | null
    const beforeFinalPosition = beforeFinalPose === null ? null : beforeFinalPose.position
    pose(100_001, -1.5)
    const finalApplied = lastApplied as { position: [number, number, number] | null; rotation: [number, number, number] } | null
    const finalPosition = finalApplied === null ? null : finalApplied.position
    expect(controller.currentState.status).toBe('connected')
    expect(appliedCount).toBeGreaterThan(100_000)
    expect(finalApplied).not.toBeNull()
    expect(finalApplied && [...(finalApplied.position ?? []), ...finalApplied.rotation].every(Number.isFinite)).toBe(true)
    expect(finalPosition).not.toEqual(beforeFinalPosition)
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('keeps a static phone rotation invariant across 10,000 pose samples', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-static', position: [0, 0, 0], rotation: [0.12, -0.24, 0.08] } as CameraDocument
    type StaticLayer = { rotationDelta: [number, number, number]; rotationDeltaQuaternion: [number, number, number, number] }
    let latestLayer: StaticLayer | null = null
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      onLiveLayer: (layer) => {
        if (layer) latestLayer = { rotationDelta: layer.rotationDelta, rotationDeltaQuaternion: layer.rotationDeltaQuaternion }
      },
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    const staticPose = (timestamp: number) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: timestamp, orientation: [0, 0, 0, 1], position: null, screenOrientation: 'landscape-left' }) })
    staticPose(1)
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    const baseline = latestLayer as StaticLayer | null
    for (let index = 2; index <= 10_001; index += 1) staticPose(index)
    const finalLayer = latestLayer as StaticLayer | null
    expect(finalLayer).not.toBeNull()
    expect(baseline).not.toBeNull()
    if (!finalLayer || !baseline) throw new Error('Static phone test did not receive a live layer.')
    finalLayer.rotationDelta.forEach((value, index) => expect(value).toBeCloseTo(baseline.rotationDelta[index], 12))
    finalLayer.rotationDeltaQuaternion.forEach((value, index) => expect(value).toBeCloseTo(baseline.rotationDeltaQuaternion[index], 8))
    expect(camera.rotation).toEqual([0.12, -0.24, 0.08])
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('records 240 canonical static-phone frames without rotation drift', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-record-static', position: [0, 0, 0], rotation: [0.08, -0.18, 0.04] } as CameraDocument
    const samples: Array<{ frame: number; rotation: [number, number, number] }> = []
    let currentFrame = 0
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => currentFrame,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      onLiveLayer: () => {},
      onState: () => {},
      onRecordSample: (frame, rotation) => samples.push({ frame, rotation }),
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    const staticPose = (timestamp: number) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: timestamp, orientation: [0, 0, 0, 1], position: null, screenOrientation: 'landscape-left' }) })
    staticPose(1)
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    expect(controller.startRecording(false)).toBe(true)
    const sampleRecording = (controller as unknown as { sampleRecording: () => void }).sampleRecording.bind(controller)
    for (let frame = 0; frame < 240; frame += 1) {
      currentFrame = frame
      sampleRecording()
    }
    controller.stopRecording(false)
    expect(samples).toHaveLength(240)
    expect(new Set(samples.map((sample) => sample.frame)).size).toBe(samples.length)
    samples.slice(1).forEach((sample) => sample.rotation.forEach((value, index) => expect(value).toBeCloseTo(samples[0].rotation[index], 8)))
    expect(camera.rotation).toEqual([0.08, -0.18, 0.04])
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('clears an active hold when the session disconnects', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-hold-disconnect', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument
    const controller = new PhoneCameraController({ getActiveCamera: () => camera, getCurrentFrame: () => 0, getFrameRate: () => ({ numerator: 24, denominator: 1 }), onState: () => {}, onRecordSample: () => {}, onRecordingFinished: () => {}, onSetCameraKey: () => true })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'hello', session: pairing.session, role: 'phone', capabilities: { orientation: true, position: true, controlChannels: true } }) })
    expect(controller.beginRecenterHold()).toBe(true)
    controller.disconnect()
    expect(controller.currentState.status).toBe('idle')
    expect(controller.endRecenterHold()).toBe(false)
    vi.unstubAllGlobals()
  })

  it('clamps movement and rotation sensitivity to their independent ranges', () => {
    const controller = new PhoneCameraController({
      getActiveCamera: () => null,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => false,
    })
    controller.setMovementScale(0.01)
    expect(controller.currentState.movementScale).toBe(0.1)
    controller.setMovementScale(20)
    expect(controller.currentState.movementScale).toBe(10)
    controller.setRotationSensitivity(0.01)
    expect(controller.currentState.rotationSensitivity).toBe(0.25)
    controller.setRotationSensitivity(20)
    expect(controller.currentState.rotationSensitivity).toBe(3)
    controller.dispose()
  })

  it('rebases an enabled channel without a jump and freezes a disabled channel', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument
    const applied: Array<{ position: [number, number, number] | null; rotation: [number, number, number] }> = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => applied.push({ position, rotation }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    const channels = (value: { truck: boolean; pedestal: boolean; dolly: boolean; pan: boolean; tilt: boolean; dutch: boolean }) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlChannels', session: pairing.session, channels: value }) })
    const pose = (orientation: [number, number, number, number], position: [number, number, number]) => socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: Date.now(), orientation, position, screenOrientation: 'landscape-left' }) })
    const dollyOnly = { truck: false, pedestal: false, dolly: true, pan: false, tilt: false, dutch: false }
    const dollyPan = { truck: false, pedestal: false, dolly: true, pan: true, tilt: false, dutch: false }
    channels(dollyOnly)
    pose([0, 0, 0, 1], [0, 0, 0])
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'recenter', session: pairing.session }) })
    pose([0, 0, 0, 1], [0, 0, -1])
    const afterDolly = applied.at(-1)
    expect(afterDolly?.position?.[2]).toBeCloseTo(-0.3)
    channels(dollyPan)
    expect(applied.at(-1)).toEqual(afterDolly)
    pose([0, Math.sin(0.2), 0, Math.cos(0.2)], [0, 0, -1])
    const afterPan = applied.at(-1)
    expect(afterPan?.position?.[0]).toBe(0)
    expect(afterPan?.position?.[1]).toBe(0)
    expect(afterPan?.rotation[1]).not.toBeCloseTo(0)
    channels(dollyOnly)
    pose([0, Math.sin(0.5), 0, Math.cos(0.5)], [0, 0, -1])
    expect(applied.at(-1)?.rotation[0]).toBeCloseTo(afterPan?.rotation[0] ?? 0)
    expect(applied.at(-1)?.rotation[1]).toBeCloseTo(afterPan?.rotation[1] ?? 0)
    expect(applied.at(-1)?.rotation[2]).toBeCloseTo(afterPan?.rotation[2] ?? 0)
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('keeps the exact native channel mask authoritative over legacy modes', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    const camera = { id: 'camera-01', position: [0, 0, 0], rotation: [0, 0, 0] } as CameraDocument
    const applied: Array<{ position: [number, number, number] | null; rotation: [number, number, number] }> = []
    const controller = new PhoneCameraController({
      getActiveCamera: () => camera,
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLivePose: (_cameraId, position, rotation) => applied.push({ position, rotation }),
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => true,
    })
    controller.setActiveCamera(camera)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'hello', session: pairing.session, role: 'phone', capabilities: { orientation: true, position: true, controlChannels: true } }) })
    const customTilt = { truck: false, pedestal: false, dolly: false, pan: false, tilt: true, dutch: false }
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlChannels', session: pairing.session, channels: customTilt }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlMode', session: pairing.session, mode: 'positionRotation' }) })
    expect(controller.currentState.controlChannels).toEqual(customTilt)
    expect(controller.currentState.controlPreset).toBe('custom')
    const zeroChannels = { truck: false, pedestal: false, dolly: false, pan: false, tilt: false, dutch: false }
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlChannels', session: pairing.session, channels: zeroChannels }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'controlMode', session: pairing.session, mode: 'positionRotation' }) })
    expect(controller.currentState.controlChannels).toEqual(zeroChannels)
    expect(controller.currentState.controlPreset).toBe('custom')
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'pose', session: pairing.session, t: Date.now(), orientation: [0, 0, 0, 1], position: [4, 3, -2], screenOrientation: 'landscape-left' }) })
    expect(applied.at(-1)?.position).toBeNull()
    controller.disconnect()
    vi.unstubAllGlobals()
  })

  it('executes a phone Set Camera Key command and acknowledges the desktop result', async () => {
    vi.stubGlobal('window', { setInterval, clearInterval })
    vi.stubGlobal('WebSocket', FakeWebSocket)
    FakeWebSocket.instances = []
    const pairing = createPhoneCameraPairing({ relay: 'wss://relay.test', companion: 'https://companion.test/phone-camera/' })
    let setKeyCount = 0
    const controller = new PhoneCameraController({
      getActiveCamera: () => ({ id: 'camera-01', rotation: [0, 0, 0] } as CameraDocument),
      getCurrentFrame: () => 0,
      getFrameRate: () => ({ numerator: 24, denominator: 1 }),
      applyLiveRotation: () => {},
      onState: () => {},
      onRecordSample: () => {},
      onRecordingFinished: () => {},
      onSetCameraKey: () => { setKeyCount += 1; return true },
    })
    controller.setActiveCamera({ id: 'camera-01', rotation: [0, 0, 0] } as CameraDocument)
    controller.connect(pairing)
    await Promise.resolve()
    const socket = FakeWebSocket.instances[0]
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'paired', session: pairing.session, peer: 'phone' }) })
    socket.emit('message', { data: JSON.stringify({ v: 1, type: 'setCameraKey', session: pairing.session }) })
    expect(setKeyCount).toBe(1)
    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toMatchObject({ type: 'setCameraKeyAck', accepted: true })
    controller.disconnect()
    vi.unstubAllGlobals()
  })
})
