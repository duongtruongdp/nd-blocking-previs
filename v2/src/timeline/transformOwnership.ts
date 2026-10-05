import type { ActorDocument, ActorVector3, CameraDocument, SceneDocument, TimelineProperty, TimelineValue } from '../core/sceneDocument'
import { applySceneEntityTransform } from '../core/sceneDocument'
import { evaluateTimeline } from './timelineEvaluator'

export type TimelineTransformCommit = {
  entityId: string
  position: ActorVector3
  rotation: ActorVector3
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

export function captureTimelineValue(entity: ActorDocument | CameraDocument, property: TimelineProperty): TimelineValue | undefined {
  if (property === 'position') return [...entity.position] as ActorVector3
  if (property === 'rotation') return [...entity.rotation] as ActorVector3
  if (property === 'heading') return entity.rotation[1]
  return 'focalLengthMm' in entity ? entity.focalLengthMm : undefined
}

export function commitTimelineTransform(document: SceneDocument, change: TimelineTransformCommit): TimelineTransformCommitResult {
  const actor = document.actors.find((item) => item.id === change.entityId)
  const camera = document.cameras.find((item) => item.id === change.entityId)
  if (!actor && !camera) return { document: applySceneEntityTransform(document, change), changedKeyframe: false, suspendEvaluation: false }

  const rotationProperty = camera ? 'rotation' : 'heading'
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
