import { describe, expect, it } from 'vitest'
import { committedEntityName, normalizeEntityName } from '../core/entityNaming'

describe('object rename commit semantics', () => {
  it('trims a valid name and permits duplicate names', () => {
    expect(normalizeEntityName('  Hero  ')).toBe('Hero')
    expect(committedEntityName('Actor 01', '  Hero  ')).toBe('Hero')
    expect(committedEntityName('Actor 01', 'Hero')).toBe('Hero')
  })

  it('rejects whitespace-only names and treats unchanged names as no-ops', () => {
    expect(committedEntityName('Actor 01', '   ')).toBeNull()
    expect(committedEntityName('Actor 01', 'Actor 01')).toBeNull()
  })
})
