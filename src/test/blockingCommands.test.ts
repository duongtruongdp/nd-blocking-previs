import { describe, expect, it } from 'vitest'
import {
  ACTOR_HEIGHT_RANGE_M,
  DEFAULT_ACTOR_HEIGHT_M,
  DEFAULT_PROP_DIMENSIONS_M,
  addActor,
  addProp,
  deleteEntity,
  renameEntity,
  setActorCharacter,
  setActorColor,
  setActorHeight,
  setActorPose,
  setEntityPlacement,
  setPropDimensions,
} from '../domain/blockingCommands'
import { createMinimumValidProject } from '../domain/project'
import { serializeProject } from '../domain/serialization'
import type { Placement } from '../domain/types'

function project() {
  return createMinimumValidProject(() => 'project-id')
}

describe('blocking domain commands', () => {
  it('starts with a valid empty shot and adds actors with deterministic defaults', () => {
    const initial = project()
    expect(initial.shots[0].actors).toHaveLength(0)
    expect(initial.shots[0].props).toHaveLength(0)
    expect(initial.shots[0].cameras).toHaveLength(0)
    expect(initial.shots[0].activeCameraId).toBeNull()
    expect(() => serializeProject(initial)).not.toThrow()

    const first = addActor(initial, () => 'actor-1')
    const second = addActor(first.project, () => 'actor-2')

    expect(second.project.shots[0].actors.map((actor) => actor.name)).toEqual(['Actor 01', 'Actor 02'])
    expect(second.project.shots[0].actors[0].appearance.heightM).toBe(DEFAULT_ACTOR_HEIGHT_M)
    expect(second.project.shots[0].actors[0].character.characterId).toBe('male-01')
    expect(second.project.shots[0].actors[0].pose.poseId).toBe('standing-neutral')
    expect(second.project.shots[0].actors[0].placement.position).toEqual([-1.8, 0, 0])
  })

  it('persists character, color, and pose choices without runtime objects', () => {
    const actor = addActor(project(), () => 'actor-1')
    const character = setActorCharacter(actor.project, actor.entityId, 'female-01')
    const color = setActorColor(character, actor.entityId, '#336699')
    const posed = setActorPose(color, actor.entityId, 'sitting-neutral')
    const saved = posed.shots[0].actors[0]

    expect(saved.character).toEqual({ characterId: 'female-01' })
    expect(saved.appearance.color).toBe('#336699')
    expect(saved.pose).toEqual({ poseId: 'sitting-neutral' })
    expect(() => serializeProject(posed)).not.toThrow()
    expect(() => setActorCharacter(posed, actor.entityId, 'missing-character')).toThrow()
    expect(() => setActorPose(posed, actor.entityId, 'missing-pose')).toThrow()
    expect(() => setActorColor(posed, actor.entityId, 'gold')).toThrow()
  })

  it('adds all blocking prop types with practical defaults', () => {
    const propTypes = ['cube', 'cylinder', 'wall', 'floor', 'table', 'chair'] as const
    let current = project()

    propTypes.forEach((propType, index) => {
      const result = addProp(current, propType, () => `prop-${index}`)
      current = result.project
    })

    expect(current.shots[0].props.map((prop) => prop.appearance.propType)).toEqual(propTypes)
    expect(current.shots[0].props[4].appearance.dimensionsM).toEqual(DEFAULT_PROP_DIMENSIONS_M.table)
    expect(() => serializeProject(current)).not.toThrow()
  })

  it('clamps practical height and dimension edits without accepting non-finite values', () => {
    const actor = addActor(project(), () => 'actor-1')
    const tall = setActorHeight(actor.project, actor.entityId, 99)
    expect(tall.shots[0].actors[0].appearance.heightM).toBe(ACTOR_HEIGHT_RANGE_M.max)
    expect(() => setActorHeight(tall, actor.entityId, Number.NaN)).toThrow()

    const prop = addProp(project(), 'table', () => 'table-1')
    const resized = setPropDimensions(prop.project, prop.entityId, [1.5, 0, 999])
    expect(resized.shots[0].props[0].appearance.dimensionsM).toEqual([1.5, 0.01, 50])
  })

  it('updates placement, names entities, and deletes them cleanly', () => {
    const actor = addActor(project(), () => 'actor-1')
    const placement: Placement = {
      position: [1, 0, -2],
      rotation: { order: 'XYZ', radians: [0, Math.PI / 2, 0] },
    }
    const moved = setEntityPlacement(actor.project, actor.entityId, placement)
    const renamed = renameEntity(moved, actor.entityId, 'Lead')
    expect(renamed.shots[0].actors[0].name).toBe('Lead')
    expect(renamed.shots[0].actors[0].placement).toEqual(placement)
    expect(deleteEntity(renamed, actor.entityId).shots[0].actors).toHaveLength(0)
  })
})
