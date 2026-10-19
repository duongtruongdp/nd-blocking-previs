import type { TimelineEntityType, TimelineTrack } from '../core/sceneDocument'

export type TimelineEntityDescriptor = {
  id: string
  name: string
  entityType: TimelineEntityType
}

export type TimelineTrackGroup = TimelineEntityDescriptor & {
  displayName: string
  tracks: readonly TimelineTrack[]
}

const propertyOrder: Record<TimelineTrack['property'], number> = { position: 0, heading: 1, rotation: 2, scale: 3, focalLengthMm: 4, openAngle: 5, azimuth: 6, elevation: 7, intensity: 8, color: 9 }

const defaultNameBases: Record<TimelineEntityType, readonly string[]> = {
  Actor: ['actor'],
  Prop: ['prop', 'cube', 'sphere', 'cylinder', 'table', 'chair', 'window', 'door', 'bicycle', 'motorbike', 'car'],
  Wall: ['wall'],
  Opening: ['opening', 'door', 'window'],
  Sun: ['sun', 'light'],
  Camera: ['camera'],
}

export function isDefaultTimelineEntityName(entity: TimelineEntityDescriptor): boolean {
  const name = entity.name.trim().toLowerCase()
  if (!name) return true
  return defaultNameBases[entity.entityType].some((base) => new RegExp(`^${base}(?:\\s+\\d+)?$`, 'i').test(name))
}

export function compactTimelineEntityName(entity: TimelineEntityDescriptor, visibleEntities: readonly TimelineEntityDescriptor[]): string {
  if (!isDefaultTimelineEntityName(entity)) return entity.name.trim()
  const sameTypeDefaults = visibleEntities.filter((candidate) => candidate.entityType === entity.entityType && isDefaultTimelineEntityName(candidate))
  if (sameTypeDefaults.length < 2) return entity.entityType
  const number = sameTypeDefaults.findIndex((candidate) => candidate.id === entity.id) + 1
  return `${entity.entityType} ${String(Math.max(1, number)).padStart(2, '0')}`
}

/** Returns only animated entities, in the same Actor / Prop / Camera order as the Scene panel. */
export function groupTimelineTracks(tracks: readonly TimelineTrack[], entities: readonly TimelineEntityDescriptor[]): TimelineTrackGroup[] {
  const tracksByEntity = new Map<string, TimelineTrack[]>()
  tracks.forEach((track) => {
    if (track.keyframes.length === 0) return
    const entityTracks = tracksByEntity.get(track.entityId) ?? []
    entityTracks.push(track)
    tracksByEntity.set(track.entityId, entityTracks)
  })
  const animatedEntities = entities.filter((entity) => (tracksByEntity.get(entity.id)?.length ?? 0) > 0)
  return animatedEntities.flatMap((entity) => {
    const entityTracks = tracksByEntity.get(entity.id)
    if (!entityTracks || entityTracks.length === 0) return []
    entityTracks.sort((left, right) => propertyOrder[left.property] - propertyOrder[right.property])
    return [{ ...entity, displayName: compactTimelineEntityName(entity, animatedEntities), tracks: entityTracks }]
  })
}
