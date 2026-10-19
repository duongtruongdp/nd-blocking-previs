import { describe, expect, it } from 'vitest'
import { normalizeSelection, toggleSelection } from '../stage-engine/selectionMath'

describe('stage selection math', () => {
  const valid = new Set(['actor-1', 'actor-2', 'prop-1'])

  it('keeps ordered, valid ids and a valid primary', () => {
    expect(normalizeSelection(['actor-2', 'missing', 'actor-1', 'actor-2'], 'missing', valid)).toEqual({ ids: ['actor-2', 'actor-1'], primaryId: 'actor-1' })
  })

  it('toggles with Shift semantics without changing unrelated order', () => {
    const first = toggleSelection({ ids: ['actor-1'], primaryId: 'actor-1' }, 'actor-2', valid)
    expect(first).toEqual({ ids: ['actor-1', 'actor-2'], primaryId: 'actor-2' })
    expect(toggleSelection(first, 'actor-2', valid)).toEqual({ ids: ['actor-1'], primaryId: 'actor-1' })
    expect(toggleSelection(first, 'missing', valid)).toEqual(first)
  })
})
