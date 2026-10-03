import type { FrameRate } from '../domain/types'

export const STANDARD_FRAME_RATES = [
  { label: '23.976', numerator: 24_000, denominator: 1_001 },
  { label: '24', numerator: 24, denominator: 1 },
  { label: '25', numerator: 25, denominator: 1 },
  { label: '29.97', numerator: 30_000, denominator: 1_001 },
  { label: '30', numerator: 30, denominator: 1 },
  { label: '50', numerator: 50, denominator: 1 },
  { label: '59.94', numerator: 60_000, denominator: 1_001 },
  { label: '60', numerator: 60, denominator: 1 },
] as const

export function isValidFrameRate(rate: FrameRate): boolean {
  return (
    Number.isInteger(rate.numerator) &&
    Number.isInteger(rate.denominator) &&
    rate.numerator > 0 &&
    rate.denominator > 0
  )
}

export function frameRateEquals(left: FrameRate, right: FrameRate): boolean {
  return left.numerator * right.denominator === right.numerator * left.denominator
}

export function frameRateLabel(rate: FrameRate): string {
  const standard = STANDARD_FRAME_RATES.find((candidate) =>
    frameRateEquals(rate, candidate),
  )

  if (standard) return standard.label

  return (rate.numerator / rate.denominator).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

export function frameDurationSeconds(rate: FrameRate): number {
  assertValidFrameRate(rate)
  return rate.denominator / rate.numerator
}

export function frameToSeconds(frame: number, rate: FrameRate): number {
  assertValidFrameRate(rate)
  assertFiniteNumber(frame, 'frame')
  return frame * frameDurationSeconds(rate)
}

export function secondsToNearestFrame(seconds: number, rate: FrameRate): number {
  assertValidFrameRate(rate)
  assertFiniteNumber(seconds, 'seconds')
  return Math.round(seconds / frameDurationSeconds(rate))
}

function assertValidFrameRate(rate: FrameRate): void {
  if (!isValidFrameRate(rate)) {
    throw new RangeError('Frame rate must use positive integer numerator and denominator values.')
  }
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`)
}
