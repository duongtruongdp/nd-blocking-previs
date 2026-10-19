import { describe, expect, it } from 'vitest'
import { cameraViewEntityCollections, sceneScopeChanged, staleRuntimeEntityIds } from '../runtime/cameraViewReconciliation'

describe('Camera View runtime reconciliation bookkeeping', () => {
  it('removes a deleted Prop from the authoritative scenic ID set', () => {
    const before = cameraViewEntityCollections([], [{ id: 'prop-01' }, { id: 'wall-01' }])
    const after = cameraViewEntityCollections([], [{ id: 'wall-01' }])

    expect(staleRuntimeEntityIds(before.scenicIds, after.scenicIds)).toEqual(['prop-01'])
  })

  it('replaces all runtime IDs when switching Projects or Scenes', () => {
    const before = cameraViewEntityCollections([{ id: 'actor-old' }], [{ id: 'prop-old' }, { id: 'sun-old' }])
    const after = cameraViewEntityCollections([{ id: 'actor-new' }], [{ id: 'wall-new' }, { id: 'sun-new' }])

    expect(staleRuntimeEntityIds(before.actorIds, after.actorIds)).toEqual(['actor-old'])
    expect(staleRuntimeEntityIds(before.scenicIds, after.scenicIds)).toEqual(['prop-old', 'sun-old'])
  })

  it('retains IDs for in-place document updates while identifying additions', () => {
    const before = cameraViewEntityCollections([{ id: 'actor-01' }], [{ id: 'prop-01' }])
    const after = cameraViewEntityCollections([{ id: 'actor-01' }], [{ id: 'prop-01' }, { id: 'wall-01' }])

    expect(staleRuntimeEntityIds(before.actorIds, after.actorIds)).toEqual([])
    expect(staleRuntimeEntityIds(before.scenicIds, after.scenicIds)).toEqual([])
    expect(staleRuntimeEntityIds(after.scenicIds, before.scenicIds)).toEqual(['wall-01'])
  })

  it('treats scene identity as the ownership boundary even when entity IDs repeat', () => {
    expect(sceneScopeChanged(null, 'scene-01')).toBe(false)
    expect(sceneScopeChanged('scene-01', 'scene-01')).toBe(false)
    expect(sceneScopeChanged('scene-01', 'scene-02')).toBe(true)
  })
})
