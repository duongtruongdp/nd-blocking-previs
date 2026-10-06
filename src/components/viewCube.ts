import * as THREE from 'three'
import type { StageViewDirection } from '../runtime/navigation'

export const VIEW_CUBE_LAYOUT = {
  top: 14,
  right: 14,
  width: 112,
  height: 114,
  faceArea: 88,
} as const

export const VIEW_CUBE_FACES: ReadonlyArray<{
  direction: StageViewDirection
  label: string
  className: string
}> = [
  { direction: 'front', label: 'FRONT', className: 'view-cube-face-front' },
  { direction: 'back', label: 'BACK', className: 'view-cube-face-back' },
  { direction: 'left', label: 'LEFT', className: 'view-cube-face-left' },
  { direction: 'right', label: 'RIGHT', className: 'view-cube-face-right' },
  { direction: 'top', label: 'TOP', className: 'view-cube-face-top' },
  { direction: 'bottom', label: 'BOTTOM', className: 'view-cube-face-bottom' },
]

export type ViewCubeDirection = readonly [number, number, number]

export type ViewCubeZone = {
  key: string
  direction: ViewCubeDirection
  label?: string
}

const directionKey = (direction: ViewCubeDirection): string => direction.join(',')

const directionLabel = (direction: ViewCubeDirection): string => {
  const [x, y, z] = direction
  const horizontal = x > 0 ? 'Right' : x < 0 ? 'Left' : ''
  const vertical = y > 0 ? 'Top' : y < 0 ? 'Bottom' : ''
  const depth = z > 0 ? 'Front' : z < 0 ? 'Back' : ''
  return [vertical, horizontal, depth].filter(Boolean).join(' ')
}

export const VIEW_CUBE_ZONES: ReadonlyArray<ViewCubeZone> = [-1, 0, 1]
  .flatMap((y) => [-1, 0, 1].flatMap((x) => [-1, 0, 1].map((z) => [x, y, z] as const)))
  .filter(([x, y, z]) => x !== 0 || y !== 0 || z !== 0)
  .map((direction) => ({
    key: directionKey(direction),
    direction,
    label: directionLabel(direction),
  }))

type ViewCubePanel = {
  key: string
  className: string
  zones: ReadonlyArray<ViewCubeZone>
}

const makePanel = (
  key: string,
  className: string,
  mapCell: (column: number, row: number) => ViewCubeDirection,
): ViewCubePanel => ({
  key,
  className,
  zones: [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => {
    const direction = mapCell(column, row)
    const zone = VIEW_CUBE_ZONES.find((entry) => directionKey(entry.direction) === directionKey(direction))
    if (!zone) throw new Error(`Unknown View Cube zone: ${directionKey(direction)}`)
    return zone
  })),
})

/** Six rendered panels provide all 26 semantic face, edge, and corner zones. */
export const VIEW_CUBE_PANELS: ReadonlyArray<ViewCubePanel> = [
  makePanel('front', 'view-cube-panel-front', (column, row) => [column - 1, 1 - row, 1]),
  makePanel('back', 'view-cube-panel-back', (column, row) => [1 - column, 1 - row, -1]),
  makePanel('right', 'view-cube-panel-right', (column, row) => [1, 1 - row, 1 - column]),
  makePanel('left', 'view-cube-panel-left', (column, row) => [-1, 1 - row, column - 1]),
  makePanel('top', 'view-cube-panel-top', (column, row) => [column - 1, 1, row - 1]),
  makePanel('bottom', 'view-cube-panel-bottom', (column, row) => [column - 1, -1, 1 - row]),
]

export type ViewCubeOrientation = readonly [number, number, number, number]

export function viewCubeCssTransform(orientation: ViewCubeOrientation): string {
  const inverse = new THREE.Quaternion(...orientation).invert()
  const matrix = new THREE.Matrix4().makeRotationFromQuaternion(inverse)
  return `matrix3d(${matrix.elements.join(',')})`
}
