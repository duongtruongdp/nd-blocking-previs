import { describe, expect, it } from 'vitest'
import { committedEntityName, nextNumberedEntityName, normalizeEntityName } from '../core/entityNaming'

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

  it('creates stable numbered names without Copy chains', () => {
    expect(nextNumberedEntityName([], 'Actor 01')).toBe('Actor 02')
    expect(nextNumberedEntityName(['Actor 01'], 'Actor 01')).toBe('Actor 02')
    expect(nextNumberedEntityName(['Actor 01', 'Actor 02'], 'Actor 01')).toBe('Actor 03')
    expect(nextNumberedEntityName(['Camera 09'], 'Camera 09')).toBe('Camera 10')
    expect(nextNumberedEntityName(['Chair 01', 'Chair 02', 'Chair 04'], 'Chair')).toBe('Chair 03')
    expect(nextNumberedEntityName(['Actor 01', 'Actor 02'], 'Actor 01')).not.toContain('Copy')
  })
})
