import { Inspector } from '../components/Inspector'
import { ScenePanel } from '../components/ScenePanel'
import { Stage } from '../components/Stage'
import { TimelinePanel } from '../components/TimelinePanel'
import { TopBar } from '../components/TopBar'

export function AppShell() {
  return (
    <main className="app-shell">
      <TopBar />
      <ScenePanel />
      <Stage />
      <Inspector />
      <TimelinePanel />
    </main>
  )
}
