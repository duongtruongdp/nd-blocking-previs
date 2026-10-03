import { useEffect } from 'react'
import { useBlockingSelector } from '../state/blockingStore'
import { isPoseCalibrationMode, poseCalibrationStore, usePoseCalibrationSelector } from '../state/poseCalibrationStore'
import { serializePoseDefinition } from '../characters/poseLibrary'
import type { ActorDocument, Vec3 } from '../domain/types'
import type { SemanticJoint } from '../characters/rigProfiles'

const JOINTS: Array<{ id: SemanticJoint; label: string }> = [
  { id: 'hips', label: 'Root / Pelvis' },
  { id: 'spine', label: 'Spine / Belly' },
  { id: 'chest', label: 'Chest' },
  { id: 'neck', label: 'Neck' },
  { id: 'head', label: 'Head' },
  { id: 'shoulder.L', label: 'Left Shoulder' },
  { id: 'upperArm.L', label: 'Left Upper Arm' },
  { id: 'lowerArm.L', label: 'Left Forearm' },
  { id: 'hand.L', label: 'Left Hand' },
  { id: 'shoulder.R', label: 'Right Shoulder' },
  { id: 'upperArm.R', label: 'Right Upper Arm' },
  { id: 'lowerArm.R', label: 'Right Forearm' },
  { id: 'hand.R', label: 'Right Hand' },
  { id: 'upperLeg.L', label: 'Left Thigh' },
  { id: 'lowerLeg.L', label: 'Left Knee / Lower Leg' },
  { id: 'foot.L', label: 'Left Foot' },
  { id: 'upperLeg.R', label: 'Right Thigh' },
  { id: 'lowerLeg.R', label: 'Right Knee / Lower Leg' },
  { id: 'foot.R', label: 'Right Foot' },
]

export function PoseCalibrationPanel() {
  const enabled = isPoseCalibrationMode()
  const blockingState = useBlockingSelector((snapshot) => snapshot)
  const calibration = usePoseCalibrationSelector((snapshot) => snapshot)
  const shot = blockingState.project.shots.find((entry) => entry.id === blockingState.project.activeShotId)
  const actor = blockingState.selection.kind === 'actor'
    ? shot?.actors.find((entry) => entry.id === blockingState.selection.entityId)
    : undefined

  useEffect(() => {
    if (enabled && actor) poseCalibrationStore.begin(actor)
    if (enabled && !actor) poseCalibrationStore.clear()
  }, [actor, enabled])

  if (!enabled) return null
  if (!actor || !calibration.pose) {
    return <aside className="pose-calibration-panel"><strong>POSE CALIBRATION</strong><p>Select an Actor to inspect semantic joints.</p></aside>
  }

  const pose = calibration.pose
  const diagnostics = calibration.runtimeDiagnostics?.poseId === actor.pose.poseId ? calibration.runtimeDiagnostics : null
  const selected = pose.bones[calibration.selectedJoint]
  const rotation = quaternionToEulerDegrees(selected?.rotationQuaternion)
  const selectedLabel = JOINTS.find((joint) => joint.id === calibration.selectedJoint)?.label ?? calibration.selectedJoint

  return (
    <aside className="pose-calibration-panel" aria-label="Development pose calibration">
      <div className="pose-calibration-heading"><strong>POSE CALIBRATION</strong><span>Development</span></div>
      <p className="pose-calibration-note">Actor: {actor.name}. Changes are runtime-only until exported.</p>
      <label className="calibration-field">
        <span>Joint</span>
        <select value={calibration.selectedJoint} onChange={(event) => poseCalibrationStore.selectJoint(event.currentTarget.value as SemanticJoint)}>
          {JOINTS.map((joint) => <option key={joint.id} value={joint.id}>{joint.label}</option>)}
        </select>
      </label>
      <div className="calibration-joint-label">{selectedLabel} rotation</div>
      <div className="calibration-rotation-grid">
        {(['X', 'Y', 'Z'] as const).map((axis, index) => (
          <label key={axis} className="calibration-field">
            <span>{axis}</span>
            <input type="number" value={formatNumber(rotation[index])} step="1" onChange={(event) => updateRotation(actor, index, Number(event.currentTarget.value), rotation)} />
          </label>
        ))}
      </div>
      <div className="pose-calibration-actions">
        <button type="button" onClick={() => copyPoseJson(pose)}>Copy Pose JSON</button>
        <button type="button" onClick={() => poseCalibrationStore.begin(actor, true)}>Reset</button>
      </div>
      <div className="pose-calibration-debug">
        <div className="calibration-joint-label">Diagnostics</div>
        <label><input type="checkbox" checked={calibration.showRig} onChange={(event) => poseCalibrationStore.setDebugOption('showRig', event.currentTarget.checked)} /> Show Rig</label>
        <label><input type="checkbox" checked={calibration.showJointAxes} onChange={(event) => poseCalibrationStore.setDebugOption('showJointAxes', event.currentTarget.checked)} /> Show Joint Axes</label>
        <label><input type="checkbox" checked={calibration.showContact} onChange={(event) => poseCalibrationStore.setDebugOption('showContact', event.currentTarget.checked)} /> Show Contact</label>
        <label><input type="checkbox" checked={calibration.showPoseTargets} onChange={(event) => poseCalibrationStore.setDebugOption('showPoseTargets', event.currentTarget.checked)} /> Show Pose Targets</label>
      </div>
      {diagnostics ? <PoseDiagnosticsBlock diagnostics={diagnostics} /> : null}
      <p className="pose-calibration-note">Male and Female use the same semantic pose definition through the Rig Profile.</p>
    </aside>
  )
}

function PoseDiagnosticsBlock({ diagnostics }: { diagnostics: NonNullable<ReturnType<typeof poseCalibrationStore.getSnapshot>['runtimeDiagnostics']> }) {
  const metrics = diagnostics.validation.metrics
  return (
    <div className="pose-calibration-report" aria-label="Pose validation report">
      <div className="calibration-joint-label">Pose Validation <strong className={diagnostics.validation.valid ? 'report-pass' : 'report-fail'}>{diagnostics.validation.valid ? 'PASS' : 'FAIL'}</strong></div>
      <div className="pose-report-row"><span>Torso Orientation</span><strong>{diagnostics.torsoOrientation}</strong></div>
      <div className="pose-report-row"><span>Pre-contact Bounds</span><strong>{formatBounds(diagnostics.preContactBounds)}</strong></div>
      <div className="pose-report-row"><span>Post-contact Bounds</span><strong>{formatBounds(diagnostics.postContactBounds)}</strong></div>
      <div className="pose-report-row"><span>Contact Mode</span><strong>{diagnostics.contactMode}</strong></div>
      {diagnostics.poseId.startsWith('lying-') ? <div className="pose-report-row"><span>Support Orientation</span><strong>{diagnostics.supportOrientation}</strong></div> : null}
      {diagnostics.poseId === 'sitting-neutral' ? <>
        <div className="pose-report-row"><span>Hip Flexion L/R</span><strong>{formatMetric(metrics.hipFlexionL)}° / {formatMetric(metrics.hipFlexionR)}°</strong></div>
        <div className="pose-report-row"><span>Knee Flexion L/R</span><strong>{formatMetric(metrics.kneeFlexionL)}° / {formatMetric(metrics.kneeFlexionR)}°</strong></div>
        <div className="pose-report-row"><span>Shoulder Width</span><strong>{formatMetric(metrics.shoulderWidth)}</strong></div>
        <div className="pose-report-row"><span>Arm Clearance</span><strong>{formatMetric(metrics.minimumArmToTorsoClearance)}</strong></div>
      </> : null}
      {diagnostics.poseId.startsWith('lying-') ? <>
        <div className="pose-report-row"><span>Torso Horizontal Alignment</span><strong>{formatMetric(metrics.preContactTorsoHorizontalAlignment)}</strong></div>
        <div className="pose-report-row"><span>Body Longitudinal Alignment</span><strong>{formatMetric(metrics.bodyLongitudinalHorizontal)}</strong></div>
        <div className="pose-report-row"><span>Longitudinal Extent</span><strong>{formatMetric(metrics.preContactHorizontalLengthRatio)}</strong></div>
        <div className="pose-report-row"><span>Support Alignment</span><strong>{formatMetric(metrics.supportOrientationAlignment)}</strong></div>
        {diagnostics.poseId === 'lying-reclined' ? <div className="pose-report-row"><span>Torso Elevation</span><strong>{formatMetric(metrics.torsoElevation)}</strong></div> : null}
        {diagnostics.poseId === 'lying-curled' ? <div className="pose-report-row"><span>Curled Compactness</span><strong>{formatMetric(metrics.curledCompactness)}</strong></div> : null}
        <div className="pose-report-row"><span>Shoulder Width</span><strong>{formatMetric(metrics.shoulderWidth)}</strong></div>
        <div className="pose-report-row"><span>Arm Clearance</span><strong>{formatMetric(metrics.minimumArmToTorsoClearance)}</strong></div>
      </> : null}
      {diagnostics.validation.warnings.length > 0 ? <p className="pose-report-warning">{diagnostics.validation.warnings[0]}</p> : null}
    </div>
  )
}

function updateRotation(actor: ActorDocument, axis: number, degrees: number, current: Vec3): void {
  if (!Number.isFinite(degrees)) return
  const next: Vec3 = [...current]
  next[axis] = degrees
  poseCalibrationStore.setJointRotation(calibrationJoint(actor), eulerDegreesToQuaternion(next))
}

function calibrationJoint(actor: ActorDocument): SemanticJoint {
  const state = poseCalibrationStore.getSnapshot()
  return state.actorId === actor.id ? state.selectedJoint : 'hips'
}

function eulerDegreesToQuaternion([x, y, z]: Vec3): [number, number, number, number] {
  const radians: Vec3 = [x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180]
  const cx = Math.cos(radians[0] / 2)
  const sx = Math.sin(radians[0] / 2)
  const cy = Math.cos(radians[1] / 2)
  const sy = Math.sin(radians[1] / 2)
  const cz = Math.cos(radians[2] / 2)
  const sz = Math.sin(radians[2] / 2)
  return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz]
}

function quaternionToEulerDegrees(quaternion: [number, number, number, number] | undefined): Vec3 {
  if (!quaternion) return [0, 0, 0]
  const [x, y, z, w] = quaternion
  const sinr = 2 * (w * x + y * z)
  const cosr = 1 - 2 * (x * x + y * y)
  const sinp = 2 * (w * y - z * x)
  const siny = 2 * (w * z + x * y)
  const cosy = 1 - 2 * (y * y + z * z)
  return [Math.atan2(sinr, cosr) * 180 / Math.PI, Math.asin(Math.max(-1, Math.min(1, sinp))) * 180 / Math.PI, Math.atan2(siny, cosy) * 180 / Math.PI]
}

function formatNumber(value: number): string {
  return Number(value.toFixed(1)).toString()
}

function formatMetric(value: number | undefined): string {
  return Number.isFinite(value) ? value!.toFixed(2) : '—'
}

function formatBounds(bounds: [number, number, number]): string {
  return bounds.map((value) => value.toFixed(2)).join(' × ')
}

function copyPoseJson(pose: NonNullable<ReturnType<typeof poseCalibrationStore.getSnapshot>['pose']>): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard) void navigator.clipboard.writeText(serializePoseDefinition(pose))
}
