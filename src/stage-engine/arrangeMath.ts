export type Bounds3 = {
  min: [number, number, number]
  max: [number, number, number]
}

export type BoundsItem = Bounds3 & { id: string }

export type ArrangeAxis = 'x' | 'y' | 'z'
export type ArrangeEdge = 'min' | 'center' | 'max'

export type ArrangePopoverRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export type ArrangePopoverSize = {
  width: number
  height: number
}

export type ArrangePopoverPosition = {
  left: number
  top: number
}

export function arrangePopoverPosition(trigger: ArrangePopoverRect, popover: ArrangePopoverSize, viewport: ArrangePopoverRect, gap = 6, padding = 8): ArrangePopoverPosition {
  const minLeft = viewport.left + padding
  const maxLeft = Math.max(minLeft, viewport.right - popover.width - padding)
  let left = trigger.right - popover.width
  if (left < minLeft) left = trigger.left
  left = Math.min(maxLeft, Math.max(minLeft, left))

  const minTop = viewport.top + padding
  const maxTop = Math.max(minTop, viewport.bottom - popover.height - padding)
  let top = trigger.bottom + gap
  if (top + popover.height > viewport.bottom - padding) top = trigger.top - popover.height - gap
  top = Math.min(maxTop, Math.max(minTop, top))

  return { left, top }
}

function axisIndex(axis: ArrangeAxis): 0 | 1 | 2 {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2
}

export function boundsCenter(bounds: Bounds3): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ]
}

export function combinedBounds(bounds: readonly Bounds3[]): Bounds3 | null {
  if (bounds.length === 0) return null
  return {
    min: [
      Math.min(...bounds.map((item) => item.min[0])),
      Math.min(...bounds.map((item) => item.min[1])),
      Math.min(...bounds.map((item) => item.min[2])),
    ],
    max: [
      Math.max(...bounds.map((item) => item.max[0])),
      Math.max(...bounds.map((item) => item.max[1])),
      Math.max(...bounds.map((item) => item.max[2])),
    ],
  }
}

export function alignOffset(bounds: Bounds3, axis: ArrangeAxis, edge: ArrangeEdge, target: number): number {
  const index = axisIndex(axis)
  const current = edge === 'min' ? bounds.min[index] : edge === 'max' ? bounds.max[index] : (bounds.min[index] + bounds.max[index]) / 2
  return target - current
}

export function distributeOffsets(items: readonly BoundsItem[], axis: ArrangeAxis): Map<string, number> {
  const index = axisIndex(axis)
  const ordered = [...items].sort((a, b) => {
    const delta = a.min[index] - b.min[index]
    return Math.abs(delta) > 1e-9 ? delta : a.id.localeCompare(b.id)
  })
  const offsets = new Map<string, number>()
  if (ordered.length < 3) return offsets
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const middle = ordered.slice(1, -1)
  const totalMiddleSize = middle.reduce((sum, item) => sum + item.max[index] - item.min[index], 0)
  const available = last.min[index] - first.max[index]
  const gap = (available - totalMiddleSize) / (ordered.length - 1)
  let cursor = first.max[index] + gap
  middle.forEach((item) => {
    offsets.set(item.id, cursor - item.min[index])
    cursor += item.max[index] - item.min[index] + gap
  })
  return offsets
}

export function rotatePointAroundY(point: [number, number, number], pivot: [number, number, number], radians: number): [number, number, number] {
  const x = point[0] - pivot[0]
  const z = point[2] - pivot[2]
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return [
    pivot[0] + x * cosine - z * sine,
    point[1],
    pivot[2] + x * sine + z * cosine,
  ]
}

export function snapAngle(radians: number, incrementRadians: number): number {
  if (!Number.isFinite(incrementRadians) || incrementRadians <= 0) return radians
  return Math.round(radians / incrementRadians) * incrementRadians
}
