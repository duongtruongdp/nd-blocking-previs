import type { RationalFrameRate } from '../core/sceneDocument'
import { frameRateValue } from './timelineMath'

export type PlaybackClock = {
  startedAtMs: number
  startFrame: number
}

export function createPlaybackClock(startFrame: number, startedAtMs: number): PlaybackClock {
  return { startFrame, startedAtMs }
}

export function playbackFrameAt(clock: PlaybackClock, nowMs: number, rate: RationalFrameRate, markOut: number): number {
  const elapsedSeconds = Math.max(0, nowMs - clock.startedAtMs) / 1000
  return Math.min(markOut, clock.startFrame + Math.floor(elapsedSeconds * frameRateValue(rate) + 1e-9))
}

export function playbackReachedMarkOut(clock: PlaybackClock, nowMs: number, rate: RationalFrameRate, markOut: number): boolean {
  return playbackFrameAt(clock, nowMs, rate, markOut) >= markOut
}

export function playbackStartFrame(currentFrame: number, rangeStart: number, rangeEnd: number): number {
  return currentFrame < rangeStart || currentFrame >= rangeEnd ? rangeStart : currentFrame
}

export function playbackFrameAtLoop(clock: PlaybackClock, nowMs: number, rate: RationalFrameRate, rangeStart: number, rangeEnd: number): number {
  const elapsedFrames = Math.floor(Math.max(0, nowMs - clock.startedAtMs) / 1000 * frameRateValue(rate) + 1e-9)
  const span = Math.max(1, rangeEnd - rangeStart + 1)
  return rangeStart + ((clock.startFrame - rangeStart + elapsedFrames) % span + span) % span
}

export function playbackLoopCycle(clock: PlaybackClock, nowMs: number, rate: RationalFrameRate, rangeStart: number, rangeEnd: number): number {
  const elapsedFrames = Math.floor(Math.max(0, nowMs - clock.startedAtMs) / 1000 * frameRateValue(rate) + 1e-9)
  const span = Math.max(1, rangeEnd - rangeStart + 1)
  return Math.floor((clock.startFrame - rangeStart + elapsedFrames) / span)
}
