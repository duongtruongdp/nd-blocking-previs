import { useSyncExternalStore } from 'react'
import type { ActorDocument } from '../domain/types'
import { getPoseDefinition, type PoseDefinition, type QuaternionValue } from '../characters/poseLibrary'
import type { SemanticJoint } from '../characters/rigProfiles'
import type { PoseDiagnosticsSnapshot } from '../runtime/rigDiagnostics'

export type PoseCalibrationState = {
  actorId: string | null
  pose: PoseDefinition | null
  selectedJoint: SemanticJoint
  showRig: boolean
  showJointAxes: boolean
  showContact: boolean
  showPoseTargets: boolean
  runtimeDiagnostics: PoseDiagnosticsSnapshot | null
}

type Listener = () => void

const DEFAULT_JOINT: SemanticJoint = 'hips'

class PoseCalibrationStore {
  private state: PoseCalibrationState = {
    actorId: null,
    pose: null,
    selectedJoint: DEFAULT_JOINT,
    showRig: false,
    showJointAxes: false,
    showContact: false,
    showPoseTargets: false,
    runtimeDiagnostics: null,
  }

  private readonly listeners = new Set<Listener>()

  getSnapshot = (): PoseCalibrationState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  begin(actor: ActorDocument, force = false): void {
    if (!force && this.state.actorId === actor.id && this.state.pose?.id === actor.pose.poseId) return
    const pose = getPoseDefinition(actor.pose.poseId)
    if (!pose) return
    this.update({ actorId: actor.id, pose: structuredClone(pose), selectedJoint: DEFAULT_JOINT, runtimeDiagnostics: null })
  }

  selectJoint(joint: SemanticJoint): void {
    this.update({ selectedJoint: joint })
  }

  setJointRotation(joint: SemanticJoint, rotationQuaternion: QuaternionValue): void {
    if (!this.state.pose) return
    this.update({
      pose: {
        ...this.state.pose,
        bones: {
          ...this.state.pose.bones,
          [joint]: { ...(this.state.pose.bones[joint] ?? {}), rotationQuaternion },
        },
      },
    })
  }

  clear(): void {
    this.update({ actorId: null, pose: null, runtimeDiagnostics: null })
  }

  setRuntimeDiagnostics(runtimeDiagnostics: PoseDiagnosticsSnapshot | null): void {
    this.update({ runtimeDiagnostics })
  }

  setDebugOption(option: 'showRig' | 'showJointAxes' | 'showContact' | 'showPoseTargets', enabled: boolean): void {
    this.update({ [option]: enabled })
  }

  private update(patch: Partial<PoseCalibrationState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
}

export const poseCalibrationStore = new PoseCalibrationStore()

export function usePoseCalibrationSelector<T>(selector: (state: PoseCalibrationState) => T): T {
  return useSyncExternalStore(
    poseCalibrationStore.subscribe,
    () => selector(poseCalibrationStore.getSnapshot()),
    () => selector(poseCalibrationStore.getSnapshot()),
  )
}

export function isPoseCalibrationMode(): boolean {
  return import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('poseCalibration') === '1'
}
