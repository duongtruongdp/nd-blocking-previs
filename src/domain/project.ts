import { createId, type IdFactory } from './ids'
import type {
  ActorDocument,
  CameraDocument,
  FrameRate,
  FrameSettings,
  LightDocument,
  Placement,
  ProjectDocument,
  PropDocument,
  ShotDocument,
} from './types'

export const DEFAULT_FRAME_RATE: FrameRate = { numerator: 24, denominator: 1 }

export const DEFAULT_FRAME_SETTINGS: FrameSettings = {
  aspectRatio: { width: 16, height: 9 },
  guideOptions: {
    showSafeAreas: true,
    showCenterMarks: true,
    showThirds: false,
    showHorizon: false,
  },
  safeAreaPercent: 90,
}

export const DEFAULT_PLACEMENT: Placement = {
  position: [0, 0, 0],
  rotation: { order: 'XYZ', radians: [0, 0, 0] },
}

export function createMinimumValidProject(idFactory: IdFactory = createId): ProjectDocument {
  const projectId = idFactory()
  const shotId = idFactory()
  const shot: ShotDocument = {
    id: shotId,
    name: 'Shot 01',
    startFrame: 0,
    endFrame: 240,
    markIn: 0,
    markOut: 240,
    frame: structuredClone(DEFAULT_FRAME_SETTINGS),
    actors: [],
    props: [],
    cameras: [],
    lights: [],
    timeline: { tracks: [] },
    activeCameraId: null,
  }

  return {
    schemaVersion: 1,
    id: projectId,
    name: 'Untitled Previs',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
    unitSystem: 'metric',
    frameRate: DEFAULT_FRAME_RATE,
    shots: [shot],
    activeShotId: shotId,
  }
}

export type ProjectEntity = ActorDocument | PropDocument | CameraDocument | LightDocument

export function findShot(project: ProjectDocument, shotId: string): ShotDocument | undefined {
  return project.shots.find((shot) => shot.id === shotId)
}

export function findEntity(shot: ShotDocument, entityId: string): ProjectEntity | undefined {
  return [
    ...shot.actors,
    ...shot.props,
    ...shot.cameras,
    ...shot.lights,
  ].find((entity) => entity.id === entityId)
}
