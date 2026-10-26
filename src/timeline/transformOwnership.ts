import type { ActorDocument, ActorVector3, CameraDocument, OpeningDocument, PropDocument, SceneDocument, SceneGroup, SunDocument, TimelineEntityType, TimelineProperty, TimelineValue, WallDocument } from '../core/sceneDocument'
import { applySceneEntityTransform } from '../core/sceneDocument'
import { upsertTimelineKeyframe } from './timelineMath'

export type TimelineTransformCommit = {
  entityId: string
  position: ActorVector3
  rotation: ActorVector3
  scale?: ActorVector3
  editedProperty?: 'position' | 'rotation' | 'heading' | 'scale'
}

export type TimelineTransformCommitResult = {
  document: SceneDocument
  changedKeyframe: boolean
  suspendEvaluation: boolean
}

function hasAuthoredTrack(document: SceneDocument, entityId: string, property: TimelineProperty): boolean {
  return document.timeline.tracks.some((track) => track.entityId === entityId && track.property === property && track.keyframes.length > 0)
}

export function timelineEditingEnabled(isPlaying: boolean): boolean {
  return !isPlaying
}

export function shouldApplyTimelineEvaluation(entityId: string, transformingEntityId: string | null, suspendedEntityIds: ReadonlySet<string>): boolean {
  return entityId !== transformingEntityId && !suspendedEntityIds.has(entityId)
}

export type SuspendedTimelineProperties = Readonly<Record<string, ReadonlySet<TimelineProperty>>>

/**
 * Timeline ownership can be suspended per property. This is intentionally
 * separate from entity-level transform suspension: a live phone Rotation
 * recording must not freeze a Camera's authored Position track.
 */
export function shouldApplyTimelinePropertyEvaluation(
  entityId: string,
  property: TimelineProperty,
  transformingEntityId: string | null,
  suspendedEntityIds: ReadonlySet<string>,
  suspendedProperties: SuspendedTimelineProperties,
): boolean {
  if (!shouldApplyTimelineEvaluation(entityId, transformingEntityId, suspendedEntityIds)) return false
  return !(suspendedProperties[entityId]?.has(property) ?? false)
}

export function captureTimelineValue(entity: ActorDocument | CameraDocument | PropDocument | OpeningDocument | WallDocument | SunDocument | SceneGroup, property: TimelineProperty): TimelineValue | undefined {
  if (property === 'position') return 'position' in entity ? [...entity.position] as ActorVector3 : undefined
  if (property === 'rotation') return 'rotation' in entity ? [...entity.rotation] as ActorVector3 : undefined
  if (property === 'scale') return 'scale' in entity && entity.scale ? [...entity.scale] as ActorVector3 : undefined
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
  const group = document.groups.find((item) => item.id === change.entityId)
  if (group) {
    const hasAnimatedProperty = change.editedProperty !== undefined && document.timeline.tracks.some((track) => track.entityId === change.entityId && track.property === change.editedProperty && track.keyframes.length > 0)
    const keyframeValue = change.editedProperty === 'position' ? [...change.position] as ActorVector3 : change.editedProperty === 'rotation' ? [...change.rotation] as ActorVector3 : undefined
    const timeline = hasAnimatedProperty && keyframeValue && change.editedProperty ? upsertTimelineKeyframe(document.timeline, group.id, 'Group', change.editedProperty, document.timeline.currentFrame, keyframeValue) : document.timeline
    const position = hasAuthoredTrack(document, group.id, 'position') ? [...group.position] as ActorVector3 : [...change.position] as ActorVector3
    const rotation = hasAuthoredTrack(document, group.id, 'rotation') ? [...group.rotation] as ActorVector3 : [...change.rotation] as ActorVector3
    return { document: { ...document, groups: document.groups.map((item) => item.id === group.id ? { ...item, position, rotation } : item), timeline }, changedKeyframe: hasAnimatedProperty, suspendEvaluation: false }
  }
  if (!actor && !prop && !wall && !opening && !camera) return { document: applySceneEntityTransform(document, change), changedKeyframe: false, suspendEvaluation: false }

  const entityType: TimelineEntityType = camera ? 'Camera' : wall ? 'Wall' : opening ? 'Opening' : prop ? 'Prop' : 'Actor'
  const animatedProperty = change.editedProperty
  const hasPositionTrack = hasAuthoredTrack(document, change.entityId, 'position')
  const hasRotationTrack = hasAuthoredTrack(document, change.entityId, 'rotation')
  const hasHeadingTrack = hasAuthoredTrack(document, change.entityId, 'heading')
  const hasScaleTrack = hasAuthoredTrack(document, change.entityId, 'scale')
  // Actor heading is retained as a legacy scalar channel. New Actor gizmo and
  // Inspector edits target the full Rotation channel; when an older Actor only
  // has Heading, update that existing channel instead of creating a competing
  // animation stream.
  const effectiveProperty: TimelineTransformCommit['editedProperty'] = animatedProperty === 'rotation' && entityType === 'Actor' && !hasRotationTrack && hasHeadingTrack ? 'heading' : animatedProperty
  const hasAnimatedProperty = effectiveProperty !== undefined && (
    effectiveProperty === 'position' ? hasPositionTrack
      : effectiveProperty === 'rotation' ? hasRotationTrack
        : effectiveProperty === 'heading' ? hasHeadingTrack
          : effectiveProperty === 'scale' ? hasScaleTrack
            : false
  )
  const keyframeValue = effectiveProperty === 'position'
    ? [...change.position] as ActorVector3
    : effectiveProperty === 'rotation'
      ? [...change.rotation] as ActorVector3
      : effectiveProperty === 'scale'
        ? [...(change.scale ?? [1, 1, 1])] as ActorVector3
      : effectiveProperty === 'heading'
        ? change.rotation[1]
        : undefined
  const timeline = hasAnimatedProperty && keyframeValue !== undefined && effectiveProperty
    ? upsertTimelineKeyframe(document.timeline, change.entityId, entityType, effectiveProperty, document.timeline.currentFrame, keyframeValue)
    : document.timeline
  // Only the explicitly edited, unanimated base channel is written back to
  // the document. The other channels must remain the persisted baseline;
  // evaluated animation and the temporary gizmo pose are not authoring input.
  const position = animatedProperty === undefined || animatedProperty === 'position' ? [...change.position] as ActorVector3 : [...(actor ?? prop ?? wall ?? opening ?? camera)!.position] as ActorVector3
  const rotation = animatedProperty === undefined || animatedProperty === 'rotation' || animatedProperty === 'heading'
    ? [...change.rotation] as ActorVector3
    : [...(actor ?? prop ?? wall ?? opening ?? camera)!.rotation] as ActorVector3
  const scale = prop && (animatedProperty === undefined || animatedProperty === 'scale') ? [...(change.scale ?? prop.scale ?? [1, 1, 1])] as ActorVector3 : prop?.scale
  const nextDocument: SceneDocument = {
    ...document,
    actors: document.actors.map((item) => item.id === change.entityId ? {
      ...item,
      position,
      rotation,
    } : item),
    props: document.props.map((item) => item.id === change.entityId ? {
      ...item,
      position,
      rotation,
      ...(scale ? { scale } : {}),
    } : item),
    walls: document.walls.map((item) => item.id === change.entityId ? {
      ...item,
      position,
      rotation,
    } : item),
    openings: document.openings.map((item) => item.id === change.entityId ? {
      ...item,
      position,
      rotation,
    } : item),
    cameras: document.cameras.map((item) => item.id === change.entityId ? {
      ...item,
      position,
      rotation,
    } : item),
    timeline,
  }
  return { document: nextDocument, changedKeyframe: hasAnimatedProperty, suspendEvaluation: false }
}
