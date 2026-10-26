import { describe, expect, it } from 'vitest'
import { insertSceneEntryAt, insertShotRelative, reorderSceneEntries, reorderShotsWithinScene, sceneShotOrdinal } from '../core/sceneShotOrdering'
import type { ProjectSceneEntry } from '../core/projectDocument'
import type { ShotDocument } from '../core/shotDocument'

const scene = (id: string): ProjectSceneEntry => ({ id, name: id, scene: { metadata: { id, name: id, createdAt: '', updatedAt: '' } } as ProjectSceneEntry['scene'] })
const shot = (id: string, sceneId: string, order: number): ShotDocument => ({ id, name: id, sceneId, cameraId: null, startFrame: 0, endFrame: 10, order, notes: '', shotSize: null, angle: null, movement: null, equipment: null, thumbnail: null, thumbnailFrame: null, metadata: { status: 'planned' } })

describe('scene and shot ordering', () => {
  it('reorders scenes without changing stable IDs', () => {
    const original = [scene('scene-a'), scene('scene-b'), scene('scene-c')]
    const next = reorderSceneEntries(original, 'scene-c', 0)
    expect(next.map((entry) => entry.id)).toEqual(['scene-c', 'scene-a', 'scene-b'])
    expect(next.find((entry) => entry.id === 'scene-a')).toBe(original[0])
  })

  it('inserts a scene at a display position', () => {
    const next = insertSceneEntryAt([scene('scene-a'), scene('scene-c')], scene('scene-b'), 1)
    expect(next.map((entry) => entry.id)).toEqual(['scene-a', 'scene-b', 'scene-c'])
  })

  it('reorders only shots in the target Scene', () => {
    const original = [shot('a-1', 'a', 0), shot('b-1', 'b', 1), shot('a-2', 'a', 2)]
    const next = reorderShotsWithinScene(original, 'a-2', 0)
    expect(next.map((item) => item.id)).toEqual(['a-2', 'b-1', 'a-1'])
    expect(next.filter((item) => item.sceneId === 'a').map((item) => item.order)).toEqual([0, 2])
    expect(next.find((item) => item.id === 'b-1')?.order).toBe(1)
  })

  it('inserts a Shot only beside a Shot in the same Scene', () => {
    const original = [shot('a-1', 'a', 0), shot('b-1', 'b', 1)]
    const inserted = shot('a-2', 'a', 2)
    expect(insertShotRelative(original, inserted, 'a-1', 'after').map((item) => item.id)).toEqual(['a-1', 'a-2', 'b-1'])
    expect(insertShotRelative(original, { ...inserted, sceneId: 'b' }, 'a-1', 'after')).toEqual(original)
  })

  it('derives Shot ordinals per Scene', () => {
    const shots = [shot('a-1', 'a', 0), shot('b-1', 'b', 1), shot('a-2', 'a', 2)]
    expect(sceneShotOrdinal(shots, 'a-1')).toBe(0)
    expect(sceneShotOrdinal(shots, 'a-2')).toBe(1)
    expect(sceneShotOrdinal(shots, 'missing')).toBe(0)
  })
})
