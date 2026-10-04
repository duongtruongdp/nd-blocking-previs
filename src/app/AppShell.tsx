import { useEffect } from 'react'
import { Inspector } from '../components/Inspector'
import { ScenePanel } from '../components/ScenePanel'
import { Stage } from '../components/Stage'
import { TimelinePanel } from '../components/TimelinePanel'
import { TopBar } from '../components/TopBar'
import { PoseCalibrationPanel } from '../components/PoseCalibrationPanel'
import { blockingStore } from '../state/blockingStore'
import { isPoseCalibrationMode } from '../state/poseCalibrationStore'

export function AppShell() {
  const poseCalibrationEnabled = isPoseCalibrationMode()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return
      if (event.key.toLowerCase() === 'q') blockingStore.setTool('select')
      if (event.key.toLowerCase() === 'w') blockingStore.setTool('move')
      if (event.key.toLowerCase() === 'e') blockingStore.setTool('rotate')
      if (event.key === 'Delete' || event.key === 'Backspace') blockingStore.deleteSelected()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <main className="app-shell">
      <TopBar />
      <ScenePanel />
      <Stage />
      <Inspector />
      <TimelinePanel />
      {poseCalibrationEnabled ? <PoseCalibrationPanel /> : null}
    </main>
  )
}
