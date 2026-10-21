import type { SceneDocument } from './sceneDocument'
import type { ShotDocument } from './shotDocument'
import { createMasterSequenceDocument, type MasterSequenceDocument } from './masterSequence'
import { createDefaultShotListSettings, type ShotListSettings } from './shotListSettings'

export type ProjectSettings = {
  shotList?: ShotListSettings
  [key: string]: unknown
}

export type ProjectSceneEntry = {
  id: string
  name: string
  scene: SceneDocument
}

export type ProjectDocument = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  scenes: ProjectSceneEntry[]
  activeSceneId: string
  shots: ShotDocument[]
  activeShotId: string | null
  masterSequence: MasterSequenceDocument
  settings: ProjectSettings
}

export function createProjectDocument(id: string, name: string, scene: SceneDocument, now = new Date().toISOString()): ProjectDocument {
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    scenes: [{ id: scene.metadata.id, name: scene.metadata.name, scene: clone(scene) }],
    activeSceneId: scene.metadata.id,
    shots: [],
    activeShotId: null,
    masterSequence: createMasterSequenceDocument(),
    settings: { shotList: createDefaultShotListSettings() },
  }
}

export function cloneSceneWithIdentity(scene: SceneDocument, sceneId: string, sceneName: string, suffix: string): SceneDocument {
  const copied = clone(scene)
  const entityIds = [...copied.actors, ...copied.props, ...copied.walls, ...copied.openings, ...copied.lights, ...copied.cameras].map((entity) => entity.id)
  const entityIdMap = new Map(entityIds.map((id) => [id, remapId(id, suffix)]))
  const groupIdMap = new Map(copied.groups.map((group) => [group.id, remapId(group.id, suffix)]))
  const guideIds = copied.cameras.flatMap((camera) => camera.frameGuides.map((guide) => guide.id))
  const guideIdMap = new Map(guideIds.map((id) => [id, remapId(id, suffix)]))
  const trackIds = copied.timeline.tracks.map((track) => track.id)
  const trackIdMap = new Map(trackIds.map((id) => [id, remapId(id, suffix)]))
  const keyframeIds = copied.timeline.tracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.id))
  const keyframeIdMap = new Map(keyframeIds.map((id) => [id, remapId(id, suffix)]))
  const remapEntityId = (id: string) => entityIdMap.get(id) ?? id
  const remapSceneId = (id: string) => entityIdMap.get(id) ?? groupIdMap.get(id) ?? id

  return {
    ...copied,
    metadata: { ...copied.metadata, id: sceneId, name: sceneName },
    actors: copied.actors.map((actor) => ({ ...actor, id: remapEntityId(actor.id) })),
    props: copied.props.map((prop) => ({ ...prop, id: remapEntityId(prop.id) })),
    walls: copied.walls.map((wall) => ({ ...wall, id: remapEntityId(wall.id) })),
    openings: copied.openings.map((opening) => ({ ...opening, id: remapEntityId(opening.id), wallId: opening.wallId ? remapEntityId(opening.wallId) : null })),
    lights: copied.lights.map((light) => ({ ...light, id: remapEntityId(light.id) })),
    cameras: copied.cameras.map((camera) => ({
      ...camera,
      id: remapEntityId(camera.id),
      frameGuides: camera.frameGuides.map((guide) => ({ ...guide, id: guideIdMap.get(guide.id) ?? guide.id })),
    })),
    groups: copied.groups.map((group) => ({
      ...group,
      id: groupIdMap.get(group.id) ?? group.id,
      childIds: group.childIds.map((childId) => remapEntityId(childId)),
    })),
    activeCameraId: copied.activeCameraId ? remapEntityId(copied.activeCameraId) : null,
    timeline: {
      ...copied.timeline,
      tracks: copied.timeline.tracks.map((track) => ({
        ...track,
        id: trackIdMap.get(track.id) ?? track.id,
        entityId: remapSceneId(track.entityId),
        keyframes: track.keyframes.map((keyframe) => ({ ...keyframe, id: keyframeIdMap.get(keyframe.id) ?? keyframe.id })),
      })),
    },
  }
}

function remapId(id: string, suffix: string): string {
  return `${id}-${suffix}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
