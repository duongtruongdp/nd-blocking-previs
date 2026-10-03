import { describe, expect, it } from 'vitest'
import { createMinimumValidProject } from '../domain/project'
import { ProjectFileError } from '../domain/errors'
import {
  deserializeProject,
  migrateProjectFile,
  serializeProject,
} from '../domain/serialization'
import { validateProjectFile } from '../domain/validation'

const fixtureModules = import.meta.glob('./fixtures/*.ndblock', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function fixture(name: string): string {
  const value = fixtureModules[`./fixtures/${name}`]
  if (!value) throw new Error(`Missing test fixture: ${name}`)
  return value
}

describe('.ndblock project format', () => {
  it('serializes a portable, versioned project file', () => {
    const project = createMinimumValidProject(() => 'fixed-id')
    const contents = serializeProject(project, 'test-version')
    const parsed = JSON.parse(contents) as Record<string, unknown>

    expect(parsed).toMatchObject({
      format: 'nd-blocking-previs',
      formatVersion: 1,
      generator: { application: 'ND Blocking & Previs', version: 'test-version' },
    })
    expect(deserializeProject(contents)).toEqual(project)
  })

  it('accepts the minimum and representative V1 fixtures', () => {
    expect(validateProjectFile(JSON.parse(fixture('minimum-valid.ndblock'))).valid).toBe(true)
    expect(validateProjectFile(JSON.parse(fixture('valid-v1.ndblock'))).valid).toBe(true)
  })

  it('normalizes legacy Actors with explicit default character and pose IDs', () => {
    const loaded = deserializeProject(fixture('valid-v1.ndblock'))
    const actor = loaded.shots[0].actors[0]
    expect(actor.character).toEqual({ characterId: 'male-01' })
    expect(actor.pose).toEqual({ poseId: 'standing-neutral' })

    const serialized = JSON.parse(serializeProject(loaded)) as { project: { shots: Array<{ actors: Array<unknown> }> } }
    expect(serialized.project.shots[0].actors[0]).toMatchObject({
      character: { characterId: 'male-01' },
      pose: { poseId: 'standing-neutral' },
    })
  })

  it('rejects malformed format identifiers and project data', () => {
    const invalidFormat = validateProjectFile(JSON.parse(fixture('invalid-format.ndblock')))
    const malformed = validateProjectFile(JSON.parse(fixture('malformed-project.ndblock')))

    expect(invalidFormat.valid).toBe(false)
    expect(malformed.valid).toBe(false)
    expect(() => deserializeProject(fixture('malformed-project.ndblock'))).toThrow(ProjectFileError)
  })

  it('rejects unsupported newer versions instead of silently loading them', () => {
    const result = validateProjectFile(JSON.parse(fixture('unsupported-future-version.ndblock')))

    expect(result).toMatchObject({ valid: false, code: 'unsupported-version' })
    expect(() => migrateProjectFile(JSON.parse(fixture('unsupported-future-version.ndblock')))).toThrow(ProjectFileError)
  })

  it('rejects invalid JSON and unknown runtime-shaped fields', () => {
    expect(() => deserializeProject('{')).toThrowError(/not valid JSON/)

    const project = createMinimumValidProject(() => 'fixed-id') as unknown as Record<string, unknown>
    project.runtime = { renderer: 'not portable' }
    expect(() => serializeProject(project as never)).toThrowError(/Unexpected field/)
  })
})
