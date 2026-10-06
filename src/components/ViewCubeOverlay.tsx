import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from 'react'
import { VIEW_CUBE_PANELS, viewCubeCssTransform, type ViewCubeDirection, type ViewCubeOrientation } from './viewCube'

export function ViewCubeOverlay({
  orientation,
  onZone,
  onHome,
  onOrbitDelta,
}: {
  orientation: ViewCubeOrientation
  onZone: (direction: ViewCubeDirection) => void
  onHome: () => void
  onOrbitDelta: (deltaX: number, deltaY: number) => void
}) {
  const cubePointer = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressNextZoneClick = useRef(false)
  const stopPropagation = (event: SyntheticEvent) => event.stopPropagation()

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.button !== 0) return
    cubePointer.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const pointer = cubePointer.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    const previousX = pointer.x
    const previousY = pointer.y
    pointer.x = event.clientX
    pointer.y = event.clientY
    if (!pointer.moved && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5) pointer.moved = true
    if (pointer.moved) onOrbitDelta(event.clientX - previousX, event.clientY - previousY)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const pointer = cubePointer.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    if (pointer.moved) {
      suppressNextZoneClick.current = true
      window.setTimeout(() => { suppressNextZoneClick.current = false }, 0)
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    cubePointer.current = null
  }

  return (
    <div
      className="stage-navigation-widget"
      aria-label="View Cube navigation"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={stopPropagation}
    >
      <div className="stage-navigation-header">
        <button
          type="button"
          className="stage-home-button"
          aria-label="Home View"
          title="Home View"
          onClick={(event) => {
            event.stopPropagation()
            onHome()
          }}
        >
          ⌂
        </button>
      </div>
      <div className="view-cube-hit-area" role="group" aria-label="Interactive Blocking View directions">
        <div className="view-cube-dom" style={{ transform: viewCubeCssTransform(orientation) }}>
          {VIEW_CUBE_PANELS.map((panel) => (
            <div key={panel.key} className={`view-cube-panel ${panel.className}`}>
              {panel.zones.map((zone, index) => (
                <button
                  key={`${panel.key}-${zone.key}`}
                  type="button"
                  className={`view-cube-zone ${index === 4 ? 'is-face' : ''}`}
                  aria-label={`Snap Blocking View to ${zone.label}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (suppressNextZoneClick.current) return
                    onZone(zone.direction)
                  }}
                >
                  {index === 4 ? panel.key.toUpperCase() : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
