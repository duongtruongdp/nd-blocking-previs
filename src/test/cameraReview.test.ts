import { describe, expect, it } from 'vitest'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { cameraMoveReviewRange } from '../timeline/cameraReview'
import { cameraPathSegmentForSelection } from '../timeline/cameraPath'
import { retimeCameraPathSegment, upsertTimelineKeyframe } from '../timeline/timelineMath'
import { createPlaybackClock, playbackFrameAt, playbackFrameAtLoop, playbackReachedMarkOut } from '../timeline/playbackClock'

function cameraPositionTimeline() {
  let timeline = createEmptySceneDocument().timeline
  timeline = upsertTimelineKeyframe(timeline, 'camera-01', 'Camera', 'position', 24, [0, 1, 4])
  timeline = upsertTimelineKeyframe(timeline, 'camera-01', 'Camera', 'position', 72, [4, 1, 4])
  return timeline
}

const selection = { cameraId: 'camera-01', trackId: 'camera-01:position', fromKeyframeId: 'camera-01:position:24', toKeyframeId: 'camera-01:position:72' }

describe('camera move review range', () => {
  it('uses the selected A→B segment without changing project marks', () => {
    const timeline = { ...cameraPositionTimeline(), markIn: 100, markOut: 300 }
    expect(cameraMoveReviewRange(timeline, selection)).toEqual({ startFrame: 24, endFrame: 72 })
    expect(timeline.markIn).toBe(100)
    expect(timeline.markOut).toBe(300)
  })

  it('resolves the retimed end frame on demand instead of using a stale cache', () => {
    const timeline = cameraPositionTimeline()
    const retimed = retimeCameraPathSegment(timeline, selection, 96, 'moveEnd')
    expect(retimed.changed).toBe(true)
    expect(cameraMoveReviewRange(retimed.timeline, selection)).toEqual({ startFrame: 24, endFrame: 120 })
  })

  it('supports a one-frame review segment and rejects missing segments safely', () => {
    let timeline = createEmptySceneDocument().timeline
    timeline = upsertTimelineKeyframe(timeline, 'camera-01', 'Camera', 'position', 48, [0, 1, 4])
    timeline = upsertTimelineKeyframe(timeline, 'camera-01', 'Camera', 'position', 49, [0, 1, 4])
    const oneFrame = { cameraId: 'camera-01', trackId: 'camera-01:position', fromKeyframeId: 'camera-01:position:48', toKeyframeId: 'camera-01:position:49' }
    expect(cameraMoveReviewRange(timeline, oneFrame)).toEqual({ startFrame: 48, endFrame: 49 })
    expect(cameraMoveReviewRange(timeline, null)).toBeNull()
    expect(cameraPathSegmentForSelection(timeline, selection)).toBeNull()
  })

  it('keeps preview playback inclusive at B and loops directly from B to A', () => {
    const rate = { numerator: 24, denominator: 1 }
    const clock = createPlaybackClock(24, 1000)
    expect(playbackFrameAt(clock, 1000 + (48 / 24) * 1000, rate, 72)).toBe(72)
    expect(playbackReachedMarkOut(clock, 1000 + (48 / 24) * 1000, rate, 72)).toBe(true)
    expect(playbackFrameAtLoop(clock, 1000 + (49 / 24) * 1000, rate, 24, 72)).toBe(24)
  })
})
