import { useEffect, useRef } from 'react'
import { SceneRuntime } from '../runtime/SceneRuntime'

export function Stage() {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = stageRef.current
    if (!container) return

    try {
      const runtime = new SceneRuntime(container)
      container.dataset.stageState = 'ready'
      return () => {
        delete container.dataset.stageState
        runtime.dispose()
      }
    } catch (initializationError) {
      console.error('Blocking View could not be initialized.', initializationError)
      container.dataset.stageState = 'failed'
    }
  }, [])

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
