import * as THREE from 'three'

export type ScaleAxis = 'x' | 'y' | 'z' | 'uniform'

export const MIN_STAGE_SCALE = 0.05
export const MAX_STAGE_SCALE = 100

export function clampStageScale(value: number): number {
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 1, MIN_STAGE_SCALE, MAX_STAGE_SCALE)
}

export function scaleFromFactor(start: [number, number, number], axis: ScaleAxis, factor: number): [number, number, number] {
  const result: [number, number, number] = [...start]
  const safeFactor = Number.isFinite(factor) ? factor : 1
  if (axis === 'uniform') return result.map((value) => clampStageScale(value * safeFactor)) as [number, number, number]
  const index = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
  result[index] = clampStageScale(result[index] * safeFactor)
  return result
}

export function scaleFromPointer(start: [number, number, number], axis: ScaleAxis, pixelsAlongAxis: number, shiftConstrained: boolean): { scale: [number, number, number]; factor: number } {
  const factor = Math.exp(pixelsAlongAxis / 180)
  return { factor, scale: scaleFromFactor(start, shiftConstrained ? 'uniform' : axis, factor) }
}
