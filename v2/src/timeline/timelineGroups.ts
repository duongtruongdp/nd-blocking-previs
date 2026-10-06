import type { TimelineEntityType, TimelineTrack } from '../core/sceneDocument'

export type TimelineEntityDescriptor = {
  id: string
  name: string
  entityType: TimelineEntityType
}

export type TimelineTrackGroup = TimelineEntityDescriptor & {
  tracks: readonly TimelineTrack[]
}

const propertyOrder: Record<TimelineTrack['property'], number> = { position: 0, heading: 1, rotation: 2, focalLengthMm: 3, openAngle: 4, azimuth: 5, elevation: 6, intensity: 7, color: 8 }

/** Returns only animated entities, in the same Actor / Prop / Camera order as the Scene panel. */
export function groupTimelineTracks(tracks: readonly TimelineTrack[], entities: readonly TimelineEntityDescriptor[]): TimelineTrackGroup[] {
  const tracksByEntity = new Map<string, TimelineTrack[]>()
  tracks.forEach((track) => {
    if (track.keyframes.length === 0) return
    const entityTracks = tracksByEntity.get(track.entityId) ?? []
    entityTracks.push(track)
    tracksByEntity.set(track.entityId, entityTracks)
  })
  return entities.flatMap((entity) => {
    const entityTracks = tracksByEntity.get(entity.id)
    if (!entityTracks || entityTracks.length === 0) return []
    entityTracks.sort((left, right) => propertyOrder[left.property] - propertyOrder[right.property])
    return [{ ...entity, tracks: entityTracks }]
  })
}
