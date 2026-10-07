import type { ActorDocument, ActorVector3, CameraDocument, OpeningDocument, PropDocument, SceneDocument, SunDocument, TimelineEntityType, TimelineProperty, TimelineValue, WallDocument } from '../core/sceneDocument'
import { applySceneEntityTransform } from '../core/sceneDocument'
import { upsertTimelineKeyframe } from './timelineMath'

export type TimelineTransformCommit = {
  entityId: string
  position: ActorVector3
  rotation: ActorVector3
  scale?: ActorVector3
  editedProperty?: 'position' | 'rotation' | 'heading'
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

  const entityType: TimelineEntityType = camera ? 'Camera' : wall ? 'Wall' : opening ? 'Opening' : prop ? 'Prop' : 'Actor'
  const animatedProperty = change.editedProperty
  const hasAnimatedProperty = animatedProperty !== undefined && document.timeline.tracks.some((track) => track.entityId === change.entityId && track.property === animatedProperty && track.keyframes.length > 0)
  const keyframeValue = animatedProperty === 'position'
    ? [...change.position] as ActorVector3
    : animatedProperty === 'rotation'
      ? [...change.rotation] as ActorVector3
      : animatedProperty === 'heading'
        ? change.rotation[1]
        : undefined
  const timeline = hasAnimatedProperty && keyframeValue !== undefined
    ? upsertTimelineKeyframe(document.timeline, change.entityId, entityType, animatedProperty, document.timeline.currentFrame, keyframeValue)
    : document.timeline
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
    } : item),
    timeline,
  }
  return { document: nextDocument, changedKeyframe: hasAnimatedProperty, suspendEvaluation: false }
}
