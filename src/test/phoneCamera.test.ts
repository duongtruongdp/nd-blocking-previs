import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { canForwardMessage, isSessionExpired, validRelaySession, validRelayToken } from '../../relay/sessionPolicy'
import type { CameraDocument } from '../core/sceneDocument'
import { parsePhoneCameraMessage } from '../phoneCamera/protocol'
import { createPhoneCameraPairing, PhoneCameraSession } from '../phoneCamera/phoneCameraSession'
import { PhoneCameraController } from '../phoneCamera/phoneCameraController'
import { deviceOrientationQuaternion, eulerRotationFromQuaternion, quaternionFromEulerRotation, relativeCameraQuaternion, screenOrientationState } from '../phoneCamera/poseMath'

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
  it('accepts versioned finite normalized pose packets and rejects unknown packets', () => {
    const pose = parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'pose', session: 'session-01', t: 10, orientation: [0, 0, 0, 2], position: null }), 'session-01')
    expect(pose?.type).toBe('pose')
    expect(pose && pose.type === 'pose' ? pose.orientation : null).toEqual([0, 0, 0, 1])
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'setCameraKey', session: 'session-01' }), 'session-01')?.type).toBe('setCameraKey')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'recordAck', session: 'session-01', action: 'start', accepted: true }), 'session-01')?.type).toBe('recordAck')
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'mesh', session: 'session-01' }), 'session-01')).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 2, type: 'pose', session: 'session-01', t: 10, orientation: [0, 0, 0, 1], position: null }), 'session-01')).toBeNull()
    expect(parsePhoneCameraMessage(JSON.stringify({ v: 1, type: 'terminate', session: 'session-01' }), 'session-01')?.type).toBe('terminate')
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
})

describe('Phone Camera relay policy', () => {
    it('limits roles and forwarded message directions', () => {
    expect(validRelaySession('abcdef012345')).toBe(true)
    expect(validRelayToken('abcdef012345678901234567')).toBe(true)
      expect(canForwardMessage('phone', 'pose')).toBe(true)
      expect(canForwardMessage('desktop', 'pose')).toBe(false)
      expect(canForwardMessage('phone', 'recenter')).toBe(true)
      expect(canForwardMessage('desktop', 'recenter')).toBe(true)
      expect(canForwardMessage('phone', 'setCameraKey')).toBe(true)
      expect(canForwardMessage('desktop', 'setCameraKey')).toBe(false)
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
