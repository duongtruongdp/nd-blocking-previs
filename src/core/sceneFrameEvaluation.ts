import type { ActorDocument, CameraDocument, PropDocument, SceneDocument, SceneGroup, SunDocument, WallDocument } from './sceneDocument'
import { evaluateGroupTransforms } from './groupMath'
import { resolveOpeningAgainstWalls } from '../architecture/wallMath'
import { cameraDocumentWithTimelineEvaluation, evaluateTimeline, type EvaluatedEntityState } from '../timeline/timelineEvaluator'

export type EvaluatedSceneFrame = {
  evaluated: Record<string, EvaluatedEntityState>
  groups: SceneGroup[]
  actors: ActorDocument[]
  props: PropDocument[]
  walls: WallDocument[]
  openings: SceneDocument['openings']
  lights: SunDocument[]
  cameras: CameraDocument[]
}

/**
 * Resolves one scene frame for rendering. Timeline channels are evaluated
 * first, then the non-destructive world-space group deltas are composed onto
 * the same child documents used by the Stage and export renderers.
 */
export function evaluateSceneFrame(document: SceneDocument, frame: number, evaluatedOverride?: Record<string, EvaluatedEntityState>): EvaluatedSceneFrame {
  const evaluated = evaluatedOverride ?? evaluateTimeline(document, frame)
  const groups = document.groups.map((group) => evaluated[group.id]
    ? { ...group, position: [...evaluated[group.id].position] as SceneGroup['position'], rotation: [...evaluated[group.id].rotation] as SceneGroup['rotation'] }
    : group)
  const actors = evaluateGroupTransforms(document.actors.map((actor) => ({ ...actor, ...(evaluated[actor.id] ?? {}) })), groups)
  const props = evaluateGroupTransforms(document.props.map((prop) => ({ ...prop, ...(evaluated[prop.id] ?? {}) })), groups)
  const walls = evaluateGroupTransforms(document.walls.map((wall) => ({ ...wall, ...(evaluated[wall.id] ?? {}) })), groups)
  const evaluatedWalls = document.walls.map((wall) => ({ ...wall, ...(evaluated[wall.id] ?? {}) }))
  const openings = document.openings.map((opening) => {
    const value = evaluated[opening.id]
    return resolveOpeningAgainstWalls({ ...opening, ...(value ?? {}), openAngle: value?.openAngle ?? opening.openAngle }, evaluatedWalls)
  })
  const lights = document.lights.map((sun) => {
    const value = evaluated[sun.id]
    return { ...sun, ...(value ?? {}), azimuth: value?.azimuth ?? sun.azimuth, elevation: value?.elevation ?? sun.elevation, intensity: value?.intensity ?? sun.intensity, color: value?.color ?? sun.color }
  })
  const cameras = evaluateGroupTransforms(document.cameras.map((camera) => cameraDocumentWithTimelineEvaluation(camera, evaluated[camera.id])), groups)
  return { evaluated, groups, actors, props, walls, openings, lights, cameras }
}
