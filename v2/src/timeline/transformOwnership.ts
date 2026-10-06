import type { ActorDocument, ActorVector3, CameraDocument, OpeningDocument, PropDocument, SceneDocument, SunDocument, TimelineProperty, TimelineValue, WallDocument } from '../core/sceneDocument'
import { applySceneEntityTransform } from '../core/sceneDocument'
import { evaluateTimeline } from './timelineEvaluator'

export type TimelineTransformCommit = {
  entityId: string
  position: ActorVector3
  rotation: ActorVector3
  scale?: ActorVector3
}

export type TimelineTransformCommitResult = {
  document: SceneDocument
  changedKeyframe: boolean
  suspendEvaluation: boolean
}

export function timelineEditingEnabled(isPlaying: boolean): boolean {
  return !isPlaying
}

export function shouldApplyTimelineEvaluation(entityId: string, transformingEntityId: string | null, suspendedEntityIds: ReadonlySet<string>): boolean {
  return entityId !== transformingEntityId && !suspendedEntityIds.has(entityId)
}

export function captureTimelineValue(entity: ActorDocument | CameraDocument | PropDocument | OpeningDocument | WallDocument | SunDocument, property: TimelineProperty): TimelineValue | undefined {
  if (property === 'position') return 'position' in entity ? [...entity.position] as ActorVector3 : undefined
  if (property === 'rotation') return 'rotation' in entity ? [...entity.rotation] as ActorVector3 : undefined
  if (property === 'heading') return 'rotation' in entity ? entity.rotation[1] : undefined
  if (property === 'focalLengthMm') return 'focalLengthMm' in entity ? entity.focalLengthMm : undefined
  if (property === 'openAngle') return 'openAngle' in entity ? entity.openAngle : undefined
  if ('azimuth' in entity && property === 'azimuth') return entity.azimuth
  if ('elevation' in entity && property === 'elevation') return entity.elevation
  if ('intensity' in entity && property === 'intensity') return entity.intensity
  if ('color' in entity && property === 'color') return entity.color
  return undefined
}

export function commitTimelineTransform(document: SceneDocument, change: TimelineTransformCommit): TimelineTransformCommitResult {
  const actor = document.actors.find((item) => item.id === change.entityId)
  const prop = document.props.find((item) => item.id === change.entityId)
  const wall = document.walls.find((item) => item.id === change.entityId)
  const opening = document.openings.find((item) => item.id === change.entityId)
  const camera = document.cameras.find((item) => item.id === change.entityId)
  if (!actor && !prop && !wall && !opening && !camera) return { document: applySceneEntityTransform(document, change), changedKeyframe: false, suspendEvaluation: false }

  const rotationProperty = camera || prop || wall || opening ? 'rotation' : 'heading'
  const hasPositionTrack = document.timeline.tracks.some((track) => track.entityId === change.entityId && track.property === 'position')
  const hasRotationTrack = document.timeline.tracks.some((track) => track.entityId === change.entityId && track.property === rotationProperty)
  const hasFocalTrack = Boolean(camera && document.timeline.tracks.some((track) => track.entityId === change.entityId && track.property === 'focalLengthMm'))
  const evaluated = evaluateTimeline(document, document.timeline.currentFrame)[change.entityId]
  const currentFocalLength = camera ? evaluated?.focalLengthMm ?? camera.focalLengthMm : undefined
  const nextDocument: SceneDocument = {
    ...document,
    actors: document.actors.map((item) => item.id === change.entityId ? {
      ...item,
      position: [...change.position] as ActorVector3,
      rotation: [...change.rotation] as ActorVector3,
    } : item),
    props: document.props.map((item) => item.id === change.entityId ? {
      ...item,
      position: [...change.position] as ActorVector3,
      rotation: [...change.rotation] as ActorVector3,
      ...(change.scale ? { scale: [...change.scale] as ActorVector3 } : {}),
    } : item),
    walls: document.walls.map((item) => item.id === change.entityId ? {
      ...item,
      position: [...change.position] as ActorVector3,
      rotation: [...change.rotation] as ActorVector3,
    } : item),
    openings: document.openings.map((item) => item.id === change.entityId ? {
      ...item,
      position: [...change.position] as ActorVector3,
      rotation: [...change.rotation] as ActorVector3,
    } : item),
    cameras: document.cameras.map((item) => item.id === change.entityId ? {
      ...item,
      position: [...change.position] as ActorVector3,
      rotation: [...change.rotation] as ActorVector3,
      ...(currentFocalLength === undefined ? {} : { focalLengthMm: currentFocalLength }),
    } : item),
    timeline: document.timeline,
  }
  return { document: nextDocument, changedKeyframe: false, suspendEvaluation: hasPositionTrack || hasRotationTrack || hasFocalTrack }
}
