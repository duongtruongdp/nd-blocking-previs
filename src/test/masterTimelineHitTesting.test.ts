import { describe, expect, it } from 'vitest'
import { masterClipEdgeHitZonePx, masterClipInteractionMode, MASTER_CLIP_EDGE_HIT_ZONE_PX } from '../core/masterTimelineHitTesting'

describe('Master Shot pointer hit testing', () => {
  const rect = { left: 100, width: 200 }

  it('centralizes a 13px default edge target and scales it for medium clips', () => {
    expect(MASTER_CLIP_EDGE_HIT_ZONE_PX).toBe(13)
    expect(masterClipEdgeHitZonePx(200)).toBe(13)
    expect(masterClipEdgeHitZonePx(40)).toBe(12)
    expect(masterClipEdgeHitZonePx(20)).toBe(0)
  })

  it('uses screen-pixel edge zones and keeps the body in Move mode', () => {
    expect(masterClipInteractionMode(rect, 100)).toBe('trim-left')
    expect(masterClipInteractionMode(rect, 107)).toBe('trim-left')
    expect(masterClipInteractionMode(rect, 114)).toBe('move')
    expect(masterClipInteractionMode(rect, 200)).toBe('move')
    expect(masterClipInteractionMode(rect, 286)).toBe('move')
    expect(masterClipInteractionMode(rect, 293)).toBe('trim-right')
    expect(masterClipInteractionMode(rect, 300)).toBe('trim-right')
  })

  it('adapts medium edge zones and prioritizes body Move for narrow clips', () => {
    expect(masterClipInteractionMode({ left: 100, width: 20 }, 100)).toBe('move')
    expect(masterClipInteractionMode({ left: 100, width: 20 }, 110)).toBe('move')
    expect(masterClipInteractionMode({ left: 100, width: 20 }, 120)).toBe('move')
    expect(masterClipInteractionMode({ left: 100, width: 40 }, 100)).toBe('trim-left')
    expect(masterClipInteractionMode({ left: 100, width: 40 }, 111)).toBe('trim-left')
    expect(masterClipInteractionMode({ left: 100, width: 40 }, 113)).toBe('move')
    expect(masterClipInteractionMode({ left: 100, width: 40 }, 139)).toBe('trim-right')
  })

  it('does not confuse timeline frames with screen pixels', () => {
    expect(masterClipInteractionMode({ left: 500, width: 80 }, 505, 8)).toBe('trim-left')
    expect(masterClipInteractionMode({ left: 500, width: 80 }, 575, 8)).toBe('trim-right')
  })
})
