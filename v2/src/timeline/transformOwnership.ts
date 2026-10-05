import type { ActorVector3, SceneDocument } from '../core/sceneDocument'
import { applySceneEntityTransform } from '../core/sceneDocument'
import { trackHasKeyframe, upsertTimelineKeyframe } from './timelineMath'

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

export function commitTimelineTransform(document: SceneDocument, change: TimelineTransformCommit): TimelineTransformCommitResult {
  const actor = document.actors.find((item) => item.id === change.entityId)
  const camera = document.cameras.find((item) => item.id === change.entityId)
  if (!actor && !camera) return { document: applySceneEntityTransform(document, change), changedKeyframe: false, suspendEvaluation: false }

  const entityType = camera ? 'Camera' : 'Actor'
  const rotationProperty = camera ? 'rotation' : 'heading'
  const exactPosition = trackHasKeyframe(document.timeline, change.entityId, 'position', document.timeline.currentFrame)
  const exactRotation = trackHasKeyframe(document.timeline, change.entityId, rotationProperty, document.timeline.currentFrame)
  let timeline = document.timeline
  if (exactPosition) timeline = upsertTimelineKeyframe(timeline, change.entityId, entityType, 'position', document.timeline.currentFrame, change.position)
  if (exactRotation) timeline = upsertTimelineKeyframe(timeline, change.entityId, entityType, rotationProperty, document.timeline.currentFrame, camera ? change.rotation : change.rotation[1])

  const hasPositionTrack = document.timeline.tracks.some((track) => track.entityId === change.entityId && track.property === 'position')
  const hasRotationTrack = document.timeline.tracks.some((track) => track.entityId === change.entityId && track.property === rotationProperty)
  const nextDocument: SceneDocument = {
    ...document,
    actors: document.actors.map((item) => item.id === change.entityId ? {
      ...item,
      position: exactPosition ? [...item.position] as ActorVector3 : [...change.position] as ActorVector3,
      rotation: [change.rotation[0], exactRotation ? item.rotation[1] : change.rotation[1], change.rotation[2]],
    } : item),
    cameras: document.cameras.map((item) => item.id === change.entityId ? {
      ...item,
      position: exactPosition ? [...item.position] as ActorVector3 : [...change.position] as ActorVector3,
      rotation: exactRotation ? [...item.rotation] as ActorVector3 : [...change.rotation] as ActorVector3,
    } : item),
    timeline,
  }
  return { document: nextDocument, changedKeyframe: exactPosition || exactRotation, suspendEvaluation: (hasPositionTrack && !exactPosition) || (hasRotationTrack && !exactRotation) }
}
