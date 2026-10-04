import { describe, expect, it } from 'vitest'
import {
  ACTOR_HEIGHT_RANGE_M,
  addCamera,
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
  setCameraFocalLength,
  setCameraFocusDistance,
  setCameraFrameGuide,
  setCameraLensProfile,
  setCameraModel,
  setCameraRecordingOutput,
  setCameraSensorMode,
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

  it('switches character without changing the Actor identity or blocking state', () => {
    const actor = addActor(project(), () => 'actor-1')
    const posed = setActorPose(
      setActorHeight(
        setActorColor(
          setEntityPlacement(actor.project, actor.entityId, {
            position: [2, 0, -3],
            rotation: { order: 'XYZ', radians: [0, 0.7, 0] },
          }),
          actor.entityId,
          '#336699',
        ),
        actor.entityId,
        1.92,
      ),
      actor.entityId,
      'lying-supine',
    )
    const before = posed.shots[0].actors[0]
    const switched = setActorCharacter(posed, actor.entityId, 'female-01').shots[0].actors[0]

    expect(switched.id).toBe(before.id)
    expect(switched.name).toBe(before.name)
    expect(switched.character).toEqual({ characterId: 'female-01' })
    expect(switched.appearance).toEqual(before.appearance)
    expect(switched.pose).toEqual(before.pose)
    expect(switched.placement).toEqual(before.placement)
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

  it('creates deterministic generic cameras with a valid frozen capture snapshot', () => {
    const first = addCamera(project(), () => 'camera-1')
    const second = addCamera(first.project, () => 'camera-2')
    expect(second.project.shots[0].cameras.map((camera) => camera.name)).toEqual(['Camera 01', 'Camera 02'])
    expect(second.project.shots[0].activeCameraId).toBe('camera-1')
    expect(first.project.shots[0].cameras[0]).toMatchObject({
      cameraModelId: 'generic.camera',
      sensorModeId: 'generic.camera.open-gate',
      resolvedCapture: { datasetVersion: '1.0.0', activeWidthMm: 36, activeHeightMm: 24 },
      lens: { focalLengthMm: 50, focusDistanceM: 5 },
      frameGuide: { preset: 'capture' },
    })
    expect(() => serializeProject(first.project)).not.toThrow()
  })

  it('resolves model, sensor mode, and recording format dependencies without stale IDs', () => {
    const added = addCamera(project(), () => 'camera-1')
    const model = setCameraModel(added.project, added.entityId, 'arri.alexa-lf')
    const camera = model.shots[0].cameras[0]
    expect(camera.cameraModelId).toBe('arri.alexa-lf')
    expect(camera.sensorModeId).toBe('arri.alexa-lf.open-gate')
    expect(camera.recordingOutputId).toBe('arri.alexa-lf.open-gate.arriraw')
    expect(() => setCameraSensorMode(model, added.entityId, 'arri.alexa-mini-lf.4_5k-lf-open-gate')).toThrow()

    const mode = setCameraSensorMode(model, added.entityId, 'arri.alexa-lf.16_9')
    const output = setCameraRecordingOutput(mode, added.entityId, 'arri.alexa-lf.16_9.prores-hd')
    expect(output.shots[0].cameras[0]).toMatchObject({
      sensorModeId: 'arri.alexa-lf.16_9',
      recordingOutputId: 'arri.alexa-lf.16_9.prores-hd',
      resolvedCapture: { activeWidthMm: 31.68, activeHeightMm: 17.82 },
    })
  })

  it('validates camera lens, focus, anamorphic, and frame-guide controls', () => {
    const added = addCamera(project(), () => 'camera-1')
    expect(() => setCameraFocalLength(added.project, added.entityId, 0)).toThrow()
    expect(() => setCameraFocusDistance(added.project, added.entityId, Number.NaN)).toThrow()
    const lens = setCameraLensProfile(added.project, added.entityId, { type: 'anamorphic', preset: '2.0', squeezeFactor: 2 })
    const guide = setCameraFrameGuide(lens, added.entityId, { preset: '2.39:1' })
    expect(guide.shots[0].cameras[0].lens.profile).toEqual({ type: 'anamorphic', preset: '2.0', squeezeFactor: 2 })
    expect(guide.shots[0].cameras[0].frameGuide).toEqual({ preset: '2.39:1' })
    expect(setCameraFocalLength(guide, added.entityId, 85).shots[0].cameras[0].lens.focalLengthMm).toBe(85)
  })

  it('keeps Camera Height mapped to the canonical Y placement value', () => {
    const added = addCamera(project(), () => 'camera-1')
    const updated = setEntityPlacement(added.project, added.entityId, {
      position: [2, 2.4, -1],
      rotation: { order: 'XYZ', radians: [0, 0, 0] },
    })
    expect(updated.shots[0].cameras[0].placement.position).toEqual([2, 2.4, -1])
    expect(updated.shots[0].cameras[0].placement.position[1]).toBe(2.4)
  })

  it('keeps multiple camera placement and capture settings independent and deletes safely', () => {
    const first = addCamera(project(), () => 'camera-1')
    const second = addCamera(first.project, () => 'camera-2')
    const changed = setCameraModel(second.project, 'camera-2', 'arri.amira')
    const independent = setEntityPlacement(changed, 'camera-1', { position: [4, 2, 1], rotation: { order: 'XYZ', radians: [0.1, 0.2, 0.3] } })
    expect(independent.shots[0].cameras[0].placement.position).toEqual([4, 2, 1])
    expect(independent.shots[0].cameras[1].placement.position).toEqual([0, 1.5, 4])
    expect(independent.shots[0].cameras[1].cameraModelId).toBe('arri.amira')
    const deleted = deleteEntity(independent, 'camera-1')
    expect(deleted.shots[0].cameras.map((camera) => camera.id)).toEqual(['camera-2'])
    expect(deleted.shots[0].activeCameraId).toBeNull()
  })
})
