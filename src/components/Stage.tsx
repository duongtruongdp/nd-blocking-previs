import { useEffect, useRef } from 'react'
import { SceneRuntime } from '../runtime/SceneRuntime'
import { blockingStore, useBlockingSelector } from '../state/blockingStore'
import { poseCalibrationStore, usePoseCalibrationSelector } from '../state/poseCalibrationStore'

export function Stage() {
  const stageRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SceneRuntime | null>(null)
  const state = useBlockingSelector((snapshot) => snapshot)
  const calibration = usePoseCalibrationSelector((snapshot) => snapshot)
  const shot = state.project.shots.find((entry) => entry.id === state.project.activeShotId)

  useEffect(() => {
    const container = stageRef.current
    if (!container) return

    try {
      const runtime = new SceneRuntime(container)
      runtime.setInteractionHandlers({
        onSelectionChange: (entityId) => blockingStore.selectEntity(entityId),
        onTransformCommit: (entityId, placement) => blockingStore.setEntityPlacement(entityId, placement),
        onPoseDiagnosticsChange: (snapshot) => poseCalibrationStore.setRuntimeDiagnostics(snapshot),
      })
      runtimeRef.current = runtime
      container.dataset.stageState = 'ready'
      return () => {
        delete container.dataset.stageState
        runtimeRef.current = null
        runtime.dispose()
      }
    } catch (initializationError) {
      console.error('Blocking View could not be initialized.', initializationError)
      container.dataset.stageState = 'failed'
    }
  }, [])

  useEffect(() => {
    runtimeRef.current?.syncBlockingEntities(shot?.actors ?? [], shot?.props ?? [], shot?.cameras ?? [])
  }, [shot?.actors, shot?.props, shot?.cameras])

  useEffect(() => {
    runtimeRef.current?.setSelectedEntity(state.selection.entityId)
  }, [state.selection.entityId])

  useEffect(() => {
    runtimeRef.current?.setTool(state.tool)
  }, [state.tool])

  useEffect(() => {
    runtimeRef.current?.setPoseCalibration(calibration.actorId, calibration.pose)
  }, [calibration.actorId, calibration.pose])

  useEffect(() => {
    runtimeRef.current?.setRigDebugOverlay(calibration.actorId, {
      showRig: calibration.showRig,
      showJointAxes: calibration.showJointAxes,
      showContact: calibration.showContact,
      showPoseTargets: calibration.showPoseTargets,
    })
  }, [calibration.actorId, calibration.showRig, calibration.showJointAxes, calibration.showContact, calibration.showPoseTargets])

  return (
    <section className="stage-panel" aria-label="Stage">
      <div className="stage-viewport" ref={stageRef} data-stage-state="starting">
        <div className="stage-error" role="alert">
          <span className="stage-error-mark">!</span>
          <div>
            <strong>Stage unavailable</strong>
            <p>The Stage could not be started on this device. Try a browser with 3D graphics enabled.</p>
          </div>
        </div>
        <div className="stage-chrome stage-chrome-top">
          <span className="view-chip">Blocking View</span>
          <span className="stage-status">Empty Stage</span>
        </div>
        <div className="stage-chrome stage-chrome-bottom">
          <span>Orbit · Pan · Zoom</span>
          <span className="stage-units">Meters</span>
        </div>
      </div>
    </section>
  )
}
