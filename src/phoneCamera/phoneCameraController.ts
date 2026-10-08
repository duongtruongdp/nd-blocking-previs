import type { CameraDocument, RationalFrameRate } from '../core/sceneDocument'
import { frameRateValue } from '../timeline/timelineMath'
import { eulerRotationFromQuaternion, quaternionFromEulerRotation, relativeCameraQuaternion, smoothQuaternion } from './poseMath'
import { PhoneCameraSession, createPhoneCameraPairing, type PhoneCameraSessionStatus } from './phoneCameraSession'
import type { PhoneCameraPairingData, PhoneCameraPose, PhoneCameraScreenOrientation } from './protocol'
import * as THREE from 'three'

export type PhoneCameraControllerState = {
  status: PhoneCameraSessionStatus
  pairingUrl: string | null
  isRecording: boolean
  activeCameraId: string | null
  orientation: PhoneCameraScreenOrientation
  requiresRecenter: boolean
  message: string | null
}

export type PhoneCameraControllerCallbacks = {
  getActiveCamera: () => CameraDocument | null
  getCurrentFrame: () => number
  getFrameRate: () => RationalFrameRate
  applyLiveRotation: (cameraId: string, rotation: [number, number, number]) => void
  onState: (state: PhoneCameraControllerState, message?: string) => void
  onRecordSample: (frame: number, rotation: [number, number, number]) => void
  onRecordingFinished: () => void
  onSetCameraKey: () => boolean
}

export class PhoneCameraController {
  private readonly session: PhoneCameraSession
  private callbacks: PhoneCameraControllerCallbacks
  private activeCamera: CameraDocument | null = null
  private referencePhone: THREE.Quaternion | null = null
  private latestPhone: THREE.Quaternion | null = null
  private liveRotation: THREE.Quaternion | null = null
  private sensitivity = 1
  private smoothing = 0.3
  private state: PhoneCameraControllerState = { status: 'idle', pairingUrl: null, isRecording: false, activeCameraId: null, orientation: 'unknown', requiresRecenter: false, message: null }
  private recordingTimer: number | null = null
  private recordingStartedAt = 0
  private recordingStartFrame = 0
  private lastRecordedFrame = -1

  constructor(callbacks: PhoneCameraControllerCallbacks) {
    this.callbacks = callbacks
    this.session = new PhoneCameraSession({
      onStatus: (status, message) => {
        if (status === 'idle' && this.state.isRecording) this.stopRecording()
        if (status === 'idle') {
          this.clearLiveState(false)
          this.updateState({ status, pairingUrl: null, activeCameraId: this.activeCamera?.id ?? null, orientation: 'unknown', requiresRecenter: false }, message)
        } else this.updateState({ status }, message)
      },
      onPose: (pose) => this.handlePose(pose),
      onMessage: (message) => {
        if (message.type === 'recenter') this.recenter(this.activeCamera, false)
        if (message.type === 'setCameraKey') {
          const accepted = this.callbacks.onSetCameraKey()
          this.session.sendSetCameraKeyAck(accepted, accepted ? 'Key set.' : 'Set Camera Key requires an active Camera.')
        }
        if (message.type === 'recordStart') {
          const accepted = this.startRecording(false)
          this.session.sendRecordAck('start', accepted, accepted ? 'Recording Camera movement.' : 'Record Move requires an active Camera.')
        }
        if (message.type === 'recordStop') {
          const accepted = this.stopRecording(false)
          this.session.sendRecordAck('stop', accepted, accepted ? 'Camera movement recording stopped.' : 'No Camera movement recording is active.')
        }
      },
    })
  }

  setCallbacks(callbacks: PhoneCameraControllerCallbacks): void { this.callbacks = callbacks }

  get currentState(): PhoneCameraControllerState { return this.state }
  get pairingUrl(): string | null { return this.session.pairingUrl }
  get pairingData(): PhoneCameraPairingData | null { return this.session.pairingData }

  beginPairing(): string {
    const pairing = createPhoneCameraPairing()
    this.session.connect(pairing)
    const url = this.session.pairingUrl
    if (!url) throw new Error('Phone Camera pairing URL could not be created.')
    this.updateState({ pairingUrl: url, status: 'waiting', message: 'Waiting for Phone Camera…' })
    return url
  }

  connect(pairing: PhoneCameraPairingData): void {
    this.session.connect(pairing)
    this.updateState({ pairingUrl: this.session.pairingUrl })
  }

  disconnect(): void {
    this.stopRecording()
    this.session.disconnect()
    this.clearLiveState(false)
    this.updateState({ status: 'idle', pairingUrl: null, activeCameraId: this.activeCamera?.id ?? null, orientation: 'unknown', requiresRecenter: false }, 'Phone Camera disconnected.')
  }

  setActiveCamera(camera: CameraDocument | null): void {
    this.activeCamera = camera
    this.updateState({ activeCameraId: camera?.id ?? null })
    if (camera && this.state.status === 'connected' && this.latestPhone && this.state.orientation !== 'portrait' && !this.state.requiresRecenter) this.recenter(camera)
    else {
      this.clearLiveState(false)
      if (camera && this.state.status === 'connected') this.updateState({ requiresRecenter: true }, 'Recenter to resume Camera control.')
    }
  }

  setSensitivity(value: number): void { this.sensitivity = Math.min(2, Math.max(0.1, value)) }

  recenter(camera = this.activeCamera, notifyRelay = true): void {
    if (!camera) return
    if (this.state.orientation === 'portrait') {
      this.updateState({ requiresRecenter: true }, 'Rotate your phone sideways first.')
      return
    }
    const base = quaternionFromEulerRotation(camera.rotation)
    this.referencePhone = this.latestPhone?.clone() ?? this.referencePhone
    this.liveRotation = base
    this.updateState({ requiresRecenter: false, message: 'Phone Camera connected.' })
    this.apply(base)
    if (notifyRelay) this.session.sendRecenter()
  }

  getCurrentRotation(): [number, number, number] | null {
    if (!this.activeCamera) return null
    return eulerRotationFromQuaternion(this.liveRotation ?? quaternionFromEulerRotation(this.activeCamera.rotation))
  }

  startRecording(notifyRelay = true): boolean {
    if (this.state.status !== 'connected' || !this.activeCamera || this.state.isRecording) return false
    this.recordingStartedAt = performance.now()
    this.recordingStartFrame = this.callbacks.getCurrentFrame()
    this.lastRecordedFrame = -1
    const fps = frameRateValue(this.callbacks.getFrameRate())
    this.recordingTimer = window.setInterval(() => this.sampleRecording(fps), Math.max(10, Math.round(1000 / fps)))
    this.updateState({ isRecording: true })
    if (notifyRelay) this.session.sendRecordStart()
    this.sampleRecording(fps)
    return true
  }

  stopRecording(notifyRelay = true): boolean {
    const wasRecording = this.state.isRecording
    if (this.recordingTimer !== null) window.clearInterval(this.recordingTimer)
    this.recordingTimer = null
    this.lastRecordedFrame = -1
    this.updateState({ isRecording: false })
    if (wasRecording) {
      if (notifyRelay) this.session.sendRecordStop()
      this.callbacks.onRecordingFinished()
    }
    return wasRecording
  }

  dispose(): void {
    this.stopRecording()
    this.session.disconnect('disposed')
    this.clearLiveState(false)
  }

  private handlePose(pose: PhoneCameraPose): void {
    const next = new THREE.Quaternion(...pose.orientation).normalize()
    this.latestPhone = next
    const orientation = pose.screenOrientation ?? 'unknown'
    const orientationChanged = this.state.orientation !== 'unknown' && orientation !== 'unknown' && orientation !== this.state.orientation
    if (orientation !== this.state.orientation) this.updateState({ orientation, ...(orientationChanged ? { requiresRecenter: true } : {}) }, orientation === 'portrait' ? 'Rotate your phone sideways.' : orientationChanged ? 'Phone orientation changed. Recenter to resume Camera control.' : undefined)
    if (orientation === 'portrait') {
      if (!this.state.requiresRecenter) this.updateState({ requiresRecenter: true }, 'Rotate your phone sideways.')
      return
    }
    if (orientationChanged || this.state.requiresRecenter || !this.activeCamera || this.state.status !== 'connected') return
    if (!this.referencePhone || !this.liveRotation) {
      this.referencePhone = next.clone()
      this.liveRotation = quaternionFromEulerRotation(this.activeCamera.rotation)
      return
    }
    const target = relativeCameraQuaternion(quaternionFromEulerRotation(this.activeCamera.rotation), this.referencePhone, next, this.sensitivity)
    this.liveRotation = smoothQuaternion(this.liveRotation, target, this.smoothing)
    this.apply(this.liveRotation)
  }

  private sampleRecording(fps: number): void {
    if (!this.state.isRecording || !this.liveRotation) return
    const elapsedSeconds = Math.max(0, (performance.now() - this.recordingStartedAt) / 1000)
    const frame = this.recordingStartFrame + Math.floor(elapsedSeconds * fps + 1e-7)
    if (frame === this.lastRecordedFrame) return
    this.lastRecordedFrame = frame
    this.callbacks.onRecordSample(frame, eulerRotationFromQuaternion(this.liveRotation))
  }

  private apply(quaternion: THREE.Quaternion): void {
    if (!this.activeCamera) return
    this.callbacks.applyLiveRotation(this.activeCamera.id, eulerRotationFromQuaternion(quaternion))
  }

  private clearLiveState(clearCamera = true): void {
    this.referencePhone = null
    this.latestPhone = null
    this.liveRotation = null
    if (clearCamera) this.activeCamera = null
  }

  private updateState(changes: Partial<PhoneCameraControllerState>, message?: string): void {
    this.state = { ...this.state, ...changes, message: message ?? changes.message ?? this.state.message }
    this.callbacks.onState(this.state, this.state.message ?? undefined)
  }
}
