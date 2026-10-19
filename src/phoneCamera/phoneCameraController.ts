import type { CameraDocument, RationalFrameRate } from '../core/sceneDocument'
import { frameRateValue } from '../timeline/timelineMath'
import { controlPresetForChannels, channelsForPreset, FULL_PHONE_CAMERA_CHANNELS, ROTATE_PHONE_CAMERA_CHANNELS, type PhoneCameraControlChannels, type PhoneCameraControlMode, type PhoneCameraControlPreset, type PhoneCameraPairingData, type PhoneCameraPose, type PhoneCameraScreenOrientation } from './protocol'
import { eulerRotationFromQuaternion, hasMovementChannels, hasRotationChannels, relativeSemanticRotation, semanticCameraQuaternion, semanticPositionDelta, smoothQuaternion, smoothVector, quaternionFromEulerRotation } from './poseMath'
import { PhoneCameraSession, createPhoneCameraPairing, type PhoneCameraSessionStatus } from './phoneCameraSession'
import * as THREE from 'three'
import { composeFinalCameraPose, type PhoneCameraLiveLayer } from './cameraPoseComposition'

type RotationChannel = 'pan' | 'tilt' | 'dutch'
type MovementChannel = 'truck' | 'pedestal' | 'dolly'
const rotationChannels: RotationChannel[] = ['pan', 'tilt', 'dutch']
const movementChannels: MovementChannel[] = ['truck', 'pedestal', 'dolly']

function channelMode(channels: PhoneCameraControlChannels): PhoneCameraControlMode {
  if (!hasMovementChannels(channels)) return 'rotation'
  if (!hasRotationChannels(channels)) return 'position'
  return 'positionRotation'
}

function cloneChannels(channels: PhoneCameraControlChannels): PhoneCameraControlChannels {
  return { ...channels }
}

function cloneLiveLayer(layer: PhoneCameraLiveLayer | null): PhoneCameraLiveLayer | null {
  if (!layer) return null
  return { ...layer, positionDelta: [...layer.positionDelta] as [number, number, number], rotationDelta: [...layer.rotationDelta] as [number, number, number], rotationDeltaQuaternion: [...layer.rotationDeltaQuaternion] as [number, number, number, number] }
}

function emptyRotationReferences(): Record<RotationChannel, THREE.Quaternion | null> { return { pan: null, tilt: null, dutch: null } }
function emptyRotationBases(): Record<RotationChannel, number> { return { pan: 0, tilt: 0, dutch: 0 } }
function emptyPositionReferences(): Record<MovementChannel, THREE.Vector3 | null> { return { truck: null, pedestal: null, dolly: null } }
function emptyPositionOrientations(): Record<MovementChannel, THREE.Quaternion | null> { return { truck: null, pedestal: null, dolly: null } }
function emptyPositionFrames(): Record<MovementChannel, THREE.Quaternion | null> { return { truck: null, pedestal: null, dolly: null } }
function emptyPositionContributions(): Record<MovementChannel, THREE.Vector3> { return { truck: new THREE.Vector3(), pedestal: new THREE.Vector3(), dolly: new THREE.Vector3() } }
function singleMovementChannel(channel: MovementChannel): PhoneCameraControlChannels { return { truck: channel === 'truck', pedestal: channel === 'pedestal', dolly: channel === 'dolly', pan: false, tilt: false, dutch: false } }
function rotationChannelIndex(channel: RotationChannel): 0 | 1 | 2 { return channel === 'tilt' ? 0 : channel === 'pan' ? 1 : 2 }

export type PhoneCameraControllerState = {
  status: PhoneCameraSessionStatus
  pairingUrl: string | null
  isRecording: boolean
  activeCameraId: string | null
  orientation: PhoneCameraScreenOrientation
  controlMode: PhoneCameraControlMode
  controlPreset: PhoneCameraControlPreset
  controlChannels: PhoneCameraControlChannels
  requiresRecenter: boolean
  sourceMode: 'rotation-only' | 'position-rotation'
  movementScale: number
  rotationSensitivity: number
  message: string | null
}

export type PhoneCameraControllerCallbacks = {
  getActiveCamera: () => CameraDocument | null
  getCurrentFrame: () => number
  getFrameRate: () => RationalFrameRate
  onLiveLayer?: (layer: PhoneCameraLiveLayer | null) => void
  applyLivePose?: (cameraId: string, position: [number, number, number] | null, rotation: [number, number, number]) => void
  applyLiveRotation?: (cameraId: string, rotation: [number, number, number]) => void
  onState: (state: PhoneCameraControllerState, message?: string) => void
  onRecordSample: (frame: number, rotation: [number, number, number]) => void
  onRecordingFinished: () => void
  onSetCameraKey: () => boolean
}

export class PhoneCameraController {
  private readonly session: PhoneCameraSession
  private callbacks: PhoneCameraControllerCallbacks
  private activeCamera: CameraDocument | null = null
  private latestPhone: THREE.Quaternion | null = null
  private latestPhonePosition: THREE.Vector3 | null = null
  private liveRotation: THREE.Quaternion | null = null
  private livePosition: THREE.Vector3 | null = null
  private rotationValues: [number, number, number] | null = null
  private rotationReferences = emptyRotationReferences()
  private rotationBases = emptyRotationBases()
  private positionBase: THREE.Vector3 | null = null
  private compositionBasePosition: THREE.Vector3 | null = null
  private compositionBaseRotation: THREE.Quaternion | null = null
  private positionReferences = emptyPositionReferences()
  private positionReferenceOrientations = emptyPositionOrientations()
  private positionFrames = emptyPositionFrames()
  private positionContributions = emptyPositionContributions()
  private remoteSupportsControlChannels: boolean | null = null
  private recenterHoldActive = false
  private heldLiveLayer: PhoneCameraLiveLayer | null = null
  private smoothing = 0.3
  private diagnosticsWindowStartedAt = Date.now()
  private diagnosticsPoseCount = 0
  private diagnosticsLiveLayerChangedCount = 0
  private diagnosticsInvalidPoseCount = 0
  private diagnosticsLastPoseTimestamp: number | null = null
  private diagnosticsLastPoseReceivedAt = 0
  private diagnosticsLastLiveLayerSignature = ''
  private state: PhoneCameraControllerState = {
    status: 'idle', pairingUrl: null, isRecording: false, activeCameraId: null, orientation: 'unknown', controlMode: 'rotation', controlPreset: 'rotate', controlChannels: cloneChannels(ROTATE_PHONE_CAMERA_CHANNELS), requiresRecenter: false, sourceMode: 'rotation-only', movementScale: 1, rotationSensitivity: 1, message: null,
  }
  private recordingTimer: number | null = null
  private lastRecordedFrame = -1

  constructor(callbacks: PhoneCameraControllerCallbacks) {
    this.callbacks = callbacks
    this.session = new PhoneCameraSession({
      onStatus: (status, message) => {
        if (status === 'idle' && this.state.isRecording) this.stopRecording()
        if (status === 'idle') {
          this.clearLiveState(false)
          this.remoteSupportsControlChannels = null
          this.updateState({ status, pairingUrl: null, activeCameraId: this.activeCamera?.id ?? null, orientation: 'unknown', controlMode: 'rotation', controlPreset: 'rotate', controlChannels: cloneChannels(ROTATE_PHONE_CAMERA_CHANNELS), requiresRecenter: false, sourceMode: 'rotation-only' }, message)
        } else this.updateState({ status }, message)
      },
      onPose: (pose) => this.handlePose(pose),
      onCapabilities: (capabilities) => {
        if (capabilities.controlChannels !== undefined) this.remoteSupportsControlChannels = capabilities.controlChannels
        const sourceMode = capabilities.position ? 'position-rotation' : 'rotation-only'
        if (this.state.sourceMode !== sourceMode) this.updateState({ sourceMode })
        if (capabilities.position && capabilities.controlChannels !== true && controlPresetForChannels(this.state.controlChannels) === 'rotate') {
          this.setControlChannels(FULL_PHONE_CAMERA_CHANNELS, false, 'Recenter to continue.')
          this.updateState({ requiresRecenter: true }, 'Recenter to continue.')
        }
        if (capabilities.controlChannels === true) this.publishControlState()
      },
      onMessage: (message) => {
        if (message.type === 'recenter') {
          const accepted = this.recenter(undefined, false)
          this.session.sendRecenterAck(accepted, accepted ? 'Recentered.' : 'Recenter requires an active Camera and usable tracking.')
        }
        if (message.type === 'recenterHoldStart') {
          const accepted = this.beginRecenterHold()
          this.session.sendRecenterHoldState(accepted, accepted, accepted ? 'Repositioning.' : 'Recenter hold requires an active Camera.')
        }
        if (message.type === 'recenterHoldEnd') {
          const accepted = this.endRecenterHold()
          this.session.sendRecenterAck(accepted, accepted ? 'Recentered.' : 'Recenter hold was not active.')
          this.session.sendRecenterHoldState(false, accepted, accepted ? 'Recentered.' : 'Recenter hold was not active.')
        }
        if (message.type === 'setMovementScale') {
          this.setMovementScale(message.scale, false)
          this.publishControlState()
        }
        if (message.type === 'setRotationSensitivity') {
          this.setRotationSensitivity(message.sensitivity, false)
          this.publishControlState()
        }
        if (message.type === 'controlChannels') {
          this.remoteSupportsControlChannels = true
          this.setControlChannels(message.channels, false)
          this.publishControlState()
        }
        if (message.type === 'controlState') {
          this.remoteSupportsControlChannels = true
          this.setControlChannels(message.state.channels, false)
          this.setMovementScale(message.state.movementScale, false)
          this.setRotationSensitivity(message.state.rotationSensitivity, false)
        }
        if (message.type === 'controlMode' && this.remoteSupportsControlChannels !== true) this.setControlMode(message.mode, false)
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

  connect(pairing: PhoneCameraPairingData): void { this.session.connect(pairing); this.updateState({ pairingUrl: this.session.pairingUrl }) }

  disconnect(): void {
    this.stopRecording()
    this.session.disconnect()
    this.clearLiveState(false)
    this.remoteSupportsControlChannels = null
    this.updateState({ status: 'idle', pairingUrl: null, activeCameraId: this.activeCamera?.id ?? null, orientation: 'unknown', controlMode: 'rotation', controlPreset: 'rotate', controlChannels: cloneChannels(ROTATE_PHONE_CAMERA_CHANNELS), requiresRecenter: false, sourceMode: 'rotation-only' }, 'Phone Camera disconnected.')
  }

  setActiveCamera(camera: CameraDocument | null): void {
    this.activeCamera = camera
    this.updateState({ activeCameraId: camera?.id ?? null })
    if (camera && this.state.status === 'connected' && this.latestPhone && this.state.orientation !== 'portrait' && !this.state.requiresRecenter) this.recenter()
    else {
      this.clearLiveState(false)
      if (camera && this.state.status === 'connected') this.updateState({ requiresRecenter: true }, 'Recenter to resume Camera control.')
    }
  }

  setSensitivity(value: number): void { this.setRotationSensitivity(value) }

  setMovementScale(value: number, notifyRelay = true): void {
    const next = Math.min(10, Math.max(0.1, Number.isFinite(value) ? value : 1))
    this.updateState({ movementScale: next })
    if (notifyRelay) this.publishControlState()
  }

  setRotationSensitivity(value: number, notifyRelay = true): void {
    const next = Math.min(3, Math.max(0.25, Number.isFinite(value) ? value : 1))
    this.updateState({ rotationSensitivity: next })
    if (notifyRelay) this.publishControlState()
  }

  setControlMode(mode: PhoneCameraControlMode, notifyRelay = true): void {
    const channels = mode === 'position' ? channelsForPreset('move') : mode === 'positionRotation' ? channelsForPreset('full') : channelsForPreset('rotate')
    this.setControlChannels(channels, notifyRelay)
  }

  setControlChannels(channels: PhoneCameraControlChannels, notifyRelay = true, message = 'Camera controls updated.'): void {
    const next = cloneChannels(channels)
    const visible = this.captureVisiblePose()
    const currentRotationValues = eulerRotationFromQuaternion(visible.rotation)
    this.rotationValues = currentRotationValues
    this.liveRotation = visible.rotation.clone()
    this.positionBase = this.positionBase ?? visible.position.clone()
    const was = this.state.controlChannels
    for (const channel of rotationChannels) {
      if (next[channel]) {
        if (!was[channel] || !this.rotationReferences[channel]) {
          this.rotationReferences[channel] = this.latestPhone?.clone() ?? null
          this.rotationBases[channel] = currentRotationValues[rotationChannelIndex(channel)]
        }
      } else this.rotationReferences[channel] = null
    }
    for (const channel of movementChannels) {
      if (next[channel]) {
        if (!was[channel] || !this.positionReferences[channel]) {
          this.positionReferences[channel] = this.latestPhonePosition?.clone() ?? null
          this.positionReferenceOrientations[channel] = this.latestPhone?.clone() ?? null
          this.positionFrames[channel] = visible.rotation.clone()
        }
      } else this.positionReferences[channel] = null
    }
    this.updateState({ controlChannels: next, controlMode: channelMode(next), controlPreset: controlPresetForChannels(next) }, message)
    if (notifyRelay) this.publishControlState()
  }

  beginRecenterHold(): boolean {
    if (this.recenterHoldActive || this.state.status !== 'connected' || !(this.callbacks.getActiveCamera() ?? this.activeCamera)) return false
    this.heldLiveLayer = cloneLiveLayer(this.getLiveLayer())
    this.recenterHoldActive = true
    this.updateState({ message: 'Repositioning…' })
    return true
  }

  endRecenterHold(): boolean {
    if (!this.recenterHoldActive) return false
    const heldLayer = cloneLiveLayer(this.heldLiveLayer)
    this.recenterHoldActive = false
    this.heldLiveLayer = null
    return this.recenter(undefined, false, heldLayer)
  }

  recenter(camera = this.callbacks.getActiveCamera() ?? this.activeCamera, notifyRelay = true, preservedLayer: PhoneCameraLiveLayer | null = null): boolean {
    if (!camera) return false
    if (this.state.orientation === 'portrait') {
      this.updateState({ requiresRecenter: true }, 'Rotate your phone sideways first.')
      return false
    }
    const previousLayer = preservedLayer ?? this.getLiveLayer()
    const basePosition = new THREE.Vector3(...(camera.position ?? [0, 0, 0]))
    const baseRotation = quaternionFromEulerRotation(camera.rotation)
    const visible = previousLayer
      ? composeFinalCameraPose({ position: basePosition.toArray() as [number, number, number], rotation: camera.rotation }, previousLayer)
      : { rotation: baseRotation, position: basePosition }
    const visibleRotation = Array.isArray(visible.rotation) ? quaternionFromEulerRotation(visible.rotation) : visible.rotation
    const visiblePosition = Array.isArray(visible.position) ? new THREE.Vector3(...visible.position) : visible.position
    this.rotationValues = eulerRotationFromQuaternion(visibleRotation)
    this.liveRotation = visibleRotation.clone()
    this.positionBase = visiblePosition.clone()
    this.compositionBasePosition = basePosition
    this.compositionBaseRotation = baseRotation
    this.positionContributions = emptyPositionContributions()
    for (const channel of rotationChannels) {
      this.rotationReferences[channel] = this.state.controlChannels[channel] ? this.latestPhone?.clone() ?? null : null
      this.rotationBases[channel] = this.rotationValues[rotationChannelIndex(channel)]
    }
    for (const channel of movementChannels) {
      this.positionReferences[channel] = this.state.controlChannels[channel] ? this.latestPhonePosition?.clone() ?? null : null
      this.positionReferenceOrientations[channel] = this.state.controlChannels[channel] ? this.latestPhone?.clone() ?? null : null
      this.positionFrames[channel] = this.state.controlChannels[channel] ? visibleRotation.clone() : null
    }
    this.livePosition = hasMovementChannels(this.state.controlChannels) && this.latestPhonePosition ? visiblePosition.clone() : null
    this.updateState({ requiresRecenter: false, message: 'Phone Camera connected.' })
    this.apply(this.liveRotation, this.livePosition)
    if (notifyRelay && this.remoteSupportsControlChannels === true) this.session.sendRecenterAck(true, 'Recentered.')
    return true
  }

  private publishControlState(): void {
    if (this.remoteSupportsControlChannels !== true) return
    this.session.sendControlState({ channels: cloneChannels(this.state.controlChannels), movementScale: this.state.movementScale, rotationSensitivity: this.state.rotationSensitivity })
  }

  getCurrentRotation(): [number, number, number] | null {
    const camera = this.callbacks.getActiveCamera() ?? this.activeCamera
    if (!camera) return null
    const pose = composeFinalCameraPose({ position: camera.position ?? [0, 0, 0], rotation: camera.rotation }, this.getLiveLayer())
    return pose.rotation
  }

  getCurrentPosition(): [number, number, number] | null {
    const camera = this.callbacks.getActiveCamera() ?? this.activeCamera
    if (!camera) return null
    const pose = composeFinalCameraPose({ position: camera.position ?? [0, 0, 0], rotation: camera.rotation }, this.getLiveLayer())
    return pose.position
  }

  startRecording(notifyRelay = true): boolean {
    if (this.state.status !== 'connected' || !this.activeCamera || this.state.isRecording) return false
    this.lastRecordedFrame = -1
    const fps = frameRateValue(this.callbacks.getFrameRate())
    // Recording samples the canonical Timeline frame. The timer only bounds
    // sampling frequency; it does not create an independent recording clock.
    this.recordingTimer = window.setInterval(() => this.sampleRecording(), Math.max(10, Math.round(1000 / fps)))
    this.updateState({ isRecording: true })
    if (notifyRelay) this.session.sendRecordStart()
    this.sampleRecording()
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

  dispose(): void { this.stopRecording(); this.session.disconnect('disposed'); this.clearLiveState(false) }

  private handlePose(pose: PhoneCameraPose): void {
    this.diagnosticsPoseCount += 1
    this.diagnosticsLastPoseTimestamp = pose.t
    this.diagnosticsLastPoseReceivedAt = Date.now()
    if (!isFinitePhonePose(pose)) {
      this.diagnosticsInvalidPoseCount += 1
      this.emitDiagnosticsIfNeeded()
      return
    }
    const next = new THREE.Quaternion(...pose.orientation).normalize()
    this.latestPhone = next
    this.latestPhonePosition = pose.position ? new THREE.Vector3(...pose.position) : null
    const sourceMode = this.latestPhonePosition ? 'position-rotation' : 'rotation-only'
    if (this.state.sourceMode !== sourceMode) this.updateState({ sourceMode })
    const orientation = pose.screenOrientation ?? 'unknown'
    const orientationChanged = this.state.orientation !== 'unknown' && orientation !== 'unknown' && orientation !== this.state.orientation
    if (orientation !== this.state.orientation) this.updateState({ orientation, ...(orientationChanged ? { requiresRecenter: true } : {}) }, orientation === 'portrait' ? 'Rotate your phone sideways.' : orientationChanged ? 'Phone orientation changed. Recenter to resume Camera control.' : undefined)
    if (orientation === 'portrait') {
      if (!this.state.requiresRecenter) this.updateState({ requiresRecenter: true }, 'Rotate your phone sideways.')
      this.emitDiagnosticsIfNeeded()
      return
    }
    if (orientationChanged || this.state.requiresRecenter || !this.activeCamera || this.state.status !== 'connected') {
      this.emitDiagnosticsIfNeeded()
      return
    }
    if (this.recenterHoldActive) {
      this.emitDiagnosticsIfNeeded()
      return
    }
    if (!this.liveRotation || !this.positionBase || !this.rotationValues) this.initializeRuntime()
    if (!this.liveRotation || !this.positionBase || !this.rotationValues) {
      this.emitDiagnosticsIfNeeded()
      return
    }

    const nextRotationValues: [number, number, number] = [...this.rotationValues]
    for (const channel of rotationChannels) {
      if (!this.state.controlChannels[channel]) continue
      const reference = this.rotationReferences[channel] ?? next
      this.rotationReferences[channel] ??= next.clone()
      const delta = relativeSemanticRotation(reference, next)
      nextRotationValues[rotationChannelIndex(channel)] = this.rotationBases[channel] + delta[rotationChannelIndex(channel)] * this.state.rotationSensitivity
    }
    this.rotationValues = nextRotationValues
    const targetRotation = semanticCameraQuaternion(nextRotationValues)
    this.liveRotation = smoothQuaternion(this.liveRotation, targetRotation, this.smoothing)

    if (this.latestPhonePosition && hasMovementChannels(this.state.controlChannels)) {
      for (const channel of movementChannels) {
        if (!this.state.controlChannels[channel]) continue
        const reference = this.positionReferences[channel] ?? this.latestPhonePosition
        const referenceOrientation = this.positionReferenceOrientations[channel] ?? next
        const frame = this.positionFrames[channel] ?? this.liveRotation
        this.positionReferences[channel] ??= this.latestPhonePosition.clone()
        this.positionReferenceOrientations[channel] ??= next.clone()
        this.positionFrames[channel] ??= frame.clone()
        const targetContribution = semanticPositionDelta(reference, this.latestPhonePosition, referenceOrientation, frame, singleMovementChannel(channel), this.state.movementScale)
        this.positionContributions[channel] = targetContribution
      }
      const targetPosition = this.positionBase.clone()
      for (const channel of movementChannels) targetPosition.add(this.positionContributions[channel])
      this.livePosition = smoothVector(this.livePosition ?? this.positionBase, targetPosition, this.smoothing)
    } else this.livePosition = null
    this.apply(this.liveRotation, this.livePosition)
    this.emitDiagnosticsIfNeeded()
  }

  private initializeRuntime(): void {
    const camera = this.callbacks.getActiveCamera() ?? this.activeCamera
    if (!camera) return
    this.liveRotation = quaternionFromEulerRotation(camera.rotation)
    this.rotationValues = eulerRotationFromQuaternion(this.liveRotation)
    this.positionBase = new THREE.Vector3(...(camera.position ?? [0, 0, 0]))
    this.compositionBasePosition = this.positionBase.clone()
    this.compositionBaseRotation = this.liveRotation.clone()
    for (const channel of rotationChannels) {
      this.rotationReferences[channel] = this.state.controlChannels[channel] ? this.latestPhone?.clone() ?? null : null
      this.rotationBases[channel] = this.rotationValues[rotationChannelIndex(channel)]
    }
    for (const channel of movementChannels) {
      this.positionReferences[channel] = this.state.controlChannels[channel] ? this.latestPhonePosition?.clone() ?? null : null
      this.positionReferenceOrientations[channel] = this.state.controlChannels[channel] ? this.latestPhone?.clone() ?? null : null
      this.positionFrames[channel] = this.state.controlChannels[channel] ? this.liveRotation.clone() : null
    }
    this.livePosition = hasMovementChannels(this.state.controlChannels) && this.latestPhonePosition ? this.positionBase.clone() : null
  }

  private captureVisiblePose(camera = this.activeCamera): { rotation: THREE.Quaternion; position: THREE.Vector3 } {
    const baseCamera = this.callbacks.getActiveCamera() ?? camera
    if (!baseCamera) return { rotation: new THREE.Quaternion(), position: new THREE.Vector3() }
    const final = composeFinalCameraPose({ position: baseCamera.position ?? [0, 0, 0], rotation: baseCamera.rotation }, this.getLiveLayer())
    return { rotation: quaternionFromEulerRotation(final.rotation), position: new THREE.Vector3(...final.position) }
  }

  private sampleRecording(): void {
    if (!this.state.isRecording) return
    const frame = Math.round(this.callbacks.getCurrentFrame())
    if (frame === this.lastRecordedFrame) return
    this.lastRecordedFrame = frame
    const rotation = this.getCurrentRotation()
    if (rotation) this.callbacks.onRecordSample(frame, rotation)
  }

  private apply(quaternion: THREE.Quaternion, position: THREE.Vector3 | null = null): void {
    if (!this.activeCamera) return
    const layer = this.getLiveLayer()
    const signature = liveLayerSignature(layer)
    if (signature !== this.diagnosticsLastLiveLayerSignature) {
      this.diagnosticsLastLiveLayerSignature = signature
      this.diagnosticsLiveLayerChangedCount += 1
    }
    if (this.callbacks.onLiveLayer) {
      this.callbacks.onLiveLayer(layer)
      return
    }
    const camera = this.callbacks.getActiveCamera() ?? this.activeCamera
    const final = composeFinalCameraPose({ position: camera.position ?? [0, 0, 0], rotation: camera.rotation }, layer)
    const nextPosition = hasMovementChannels(this.state.controlChannels) && position ? final.position : null
    if (this.callbacks.applyLivePose) this.callbacks.applyLivePose(this.activeCamera.id, nextPosition, final.rotation)
    else this.callbacks.applyLiveRotation?.(this.activeCamera.id, final.rotation)
  }

  private clearLiveState(clearCamera = true): void {
    this.latestPhone = null; this.latestPhonePosition = null; this.liveRotation = null; this.livePosition = null; this.rotationValues = null
    this.rotationReferences = emptyRotationReferences(); this.rotationBases = emptyRotationBases(); this.positionBase = null; this.compositionBasePosition = null; this.compositionBaseRotation = null; this.positionReferences = emptyPositionReferences(); this.positionReferenceOrientations = emptyPositionOrientations(); this.positionFrames = emptyPositionFrames(); this.positionContributions = emptyPositionContributions()
    this.callbacks.onLiveLayer?.(null)
    this.recenterHoldActive = false
    this.heldLiveLayer = null
    if (clearCamera) this.activeCamera = null
  }

  private getLiveLayer(): PhoneCameraLiveLayer | null {
    if (!this.activeCamera) return null
    const basePosition = this.compositionBasePosition ?? new THREE.Vector3(...(this.activeCamera.position ?? [0, 0, 0]))
    const currentPosition = this.livePosition ?? this.positionBase ?? basePosition
    const positionDelta = hasMovementChannels(this.state.controlChannels) ? currentPosition.clone().sub(basePosition) : new THREE.Vector3()
    const baseRotation = this.compositionBaseRotation ?? quaternionFromEulerRotation(this.activeCamera.rotation)
    const currentRotation = this.liveRotation ?? baseRotation
    const deltaRotation = baseRotation.clone().invert().multiply(currentRotation).normalize()
    return {
      cameraId: this.activeCamera.id,
      positionDelta: positionDelta.toArray() as [number, number, number],
      rotationDelta: eulerRotationFromQuaternion(deltaRotation),
      rotationDeltaQuaternion: deltaRotation.toArray() as [number, number, number, number],
    }
  }

  private updateState(changes: Partial<PhoneCameraControllerState>, message?: string): void {
    this.state = { ...this.state, ...changes, message: message ?? changes.message ?? this.state.message }
    this.callbacks.onState(this.state, this.state.message ?? undefined)
  }

  private emitDiagnosticsIfNeeded(): void {
    if (!import.meta.env.DEV) return
    const now = Date.now()
    const elapsed = now - this.diagnosticsWindowStartedAt
    if (elapsed < 1000) return
    const seconds = elapsed / 1000
    const lastPoseAgeMs = this.diagnosticsLastPoseTimestamp === null ? null : Math.max(0, now - this.diagnosticsLastPoseTimestamp)
    const layer = this.getLiveLayer()
    const finite = isFiniteLiveLayer(layer) && Boolean(this.liveRotation?.x === this.liveRotation?.x && this.livePosition?.x === this.livePosition?.x)
    console.debug('[Phone Camera Diagnostics]', {
      phoneReceiveHz: Number((this.diagnosticsPoseCount / seconds).toFixed(1)),
      desktopReceiveHz: Number((this.diagnosticsPoseCount / seconds).toFixed(1)),
      lastPoseAgeMs,
      latestPoseTimestamp: this.diagnosticsLastPoseTimestamp,
      liveLayerChangedHz: Number((this.diagnosticsLiveLayerChangedCount / seconds).toFixed(1)),
      hold: this.recenterHoldActive,
      smoothingFinite: Number.isFinite(this.smoothing),
      baselineFinite: Boolean(this.positionBase && this.positionBase.toArray().every(Number.isFinite)),
      quaternionFinite: Boolean(this.liveRotation && [this.liveRotation.x, this.liveRotation.y, this.liveRotation.z, this.liveRotation.w].every(Number.isFinite)),
      positionFinite: Boolean(!this.livePosition || this.livePosition.toArray().every(Number.isFinite)),
      liveLayerFinite: finite,
      invalidPoseCount: this.diagnosticsInvalidPoseCount,
    })
    this.diagnosticsWindowStartedAt = now
    this.diagnosticsPoseCount = 0
    this.diagnosticsLiveLayerChangedCount = 0
    this.diagnosticsInvalidPoseCount = 0
  }
}

function isFinitePhonePose(pose: PhoneCameraPose): boolean {
  return pose.orientation.length === 4 && pose.orientation.every(Number.isFinite) && (!pose.position || (pose.position.length === 3 && pose.position.every(Number.isFinite))) && Number.isFinite(pose.t)
}

function isFiniteLiveLayer(layer: PhoneCameraLiveLayer | null): boolean {
  return Boolean(layer && [...layer.positionDelta, ...layer.rotationDelta, ...layer.rotationDeltaQuaternion].every(Number.isFinite))
}

function liveLayerSignature(layer: PhoneCameraLiveLayer | null): string {
  if (!layer) return 'none'
  return [...layer.positionDelta, ...layer.rotationDeltaQuaternion].map((value) => value.toFixed(8)).join(',')
}
