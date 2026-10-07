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
