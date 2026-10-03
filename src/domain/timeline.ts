import type {
  EulerRotation,
  Keyframe,
  TimelineTrack,
  Vec3,
} from './types'

export type TimelineValue = Vec3 | EulerRotation | number

export type MarkRange = {
  startFrame: number
  endFrame: number
  markIn: number
  markOut: number
}

export function evaluateTimelineTrack(
  track: TimelineTrack,
  frame: number,
): TimelineValue | undefined {
  switch (track.property) {
    case 'position':
      return evaluateKeyframes(track.keyframes, frame)
    case 'rotation':
      return evaluateKeyframes(track.keyframes, frame)
    case 'focalLengthMm':
      return evaluateKeyframes(track.keyframes, frame)
    case 'focusDistanceM':
      return evaluateKeyframes(track.keyframes, frame)
  }
}

function evaluateKeyframes<TValue extends TimelineValue>(
  sourceKeyframes: Array<Keyframe<TValue>>,
  frame: number,
): TValue | undefined {
  const keyframes = resolveDuplicateFrames(sourceKeyframes)
  if (keyframes.length === 0) return undefined

  const first = keyframes[0]
  const last = keyframes[keyframes.length - 1]
  if (frame <= first.frame) return cloneTimelineValue(first.value) as TValue
  if (frame >= last.frame) return cloneTimelineValue(last.value) as TValue

  const nextIndex = keyframes.findIndex((keyframe) => keyframe.frame > frame)
  const next = keyframes[nextIndex]
  const previous = keyframes[nextIndex - 1]

  if (next.interpolation === 'step' || previous.interpolation === 'step') {
    return cloneTimelineValue(previous.value) as TValue
  }

  const amount = (frame - previous.frame) / (next.frame - previous.frame)
  return interpolateTimelineValue(previous.value, next.value, amount) as TValue
}

export function clampFrame(frame: number, startFrame: number, endFrame: number): number {
  assertFrameRange(startFrame, endFrame)
  if (!Number.isFinite(frame)) throw new RangeError('Frame must be finite.')
  return Math.min(endFrame, Math.max(startFrame, Math.round(frame)))
}

export function validateMarkRange(range: MarkRange): string[] {
  const errors: string[] = []

  if (!isInteger(range.startFrame)) errors.push('startFrame must be an integer.')
  if (!isInteger(range.endFrame)) errors.push('endFrame must be an integer.')
  if (!isInteger(range.markIn)) errors.push('markIn must be an integer.')
  if (!isInteger(range.markOut)) errors.push('markOut must be an integer.')

  if (
    errors.length === 0 &&
    !(range.startFrame <= range.markIn && range.markIn <= range.markOut && range.markOut <= range.endFrame)
  ) {
    errors.push('Mark In and Mark Out must remain inside the shot frame range.')
  }

  return errors
}

function resolveDuplicateFrames<TValue>(
  keyframes: Array<Keyframe<TValue>>,
): Array<Keyframe<TValue>> {
  const byFrame = new Map<number, Keyframe<TValue>>()
  for (const keyframe of keyframes) byFrame.set(keyframe.frame, keyframe)
  return [...byFrame.values()].sort((left, right) => left.frame - right.frame)
}

function interpolateTimelineValue(
  left: TimelineValue,
  right: TimelineValue,
  amount: number,
): TimelineValue {
  if (typeof left === 'number' && typeof right === 'number') {
    return left + (right - left) * amount
  }

  if (isVec3(left) && isVec3(right)) {
    return [
      left[0] + (right[0] - left[0]) * amount,
      left[1] + (right[1] - left[1]) * amount,
      left[2] + (right[2] - left[2]) * amount,
    ]
  }

  if (isEulerRotation(left) && isEulerRotation(right)) {
    return {
      order: 'XYZ',
      radians: [
        left.radians[0] + (right.radians[0] - left.radians[0]) * amount,
        left.radians[1] + (right.radians[1] - left.radians[1]) * amount,
        left.radians[2] + (right.radians[2] - left.radians[2]) * amount,
      ],
    }
  }

  throw new TypeError('Timeline keyframes must use matching value types.')
}

function cloneTimelineValue(value: TimelineValue): TimelineValue {
  if (typeof value === 'number') return value
  if (isVec3(value)) return [...value]
  return { order: value.order, radians: [...value.radians] }
}

function isVec3(value: TimelineValue): value is Vec3 {
  return Array.isArray(value) && value.length === 3
}

function isEulerRotation(value: TimelineValue): value is EulerRotation {
  return typeof value === 'object' && value !== null && 'order' in value && 'radians' in value
}

function assertFrameRange(startFrame: number, endFrame: number): void {
  if (!isInteger(startFrame) || !isInteger(endFrame) || startFrame > endFrame) {
    throw new RangeError('Frame range must use integers with startFrame <= endFrame.')
  }
}

function isInteger(value: number): boolean {
  return Number.isInteger(value)
}
