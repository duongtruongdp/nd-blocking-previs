import { createId, type IdFactory } from './ids'
import { DEFAULT_CHARACTER_ID, getCharacterDefinition } from '../characters/characterRegistry'
import { DEFAULT_POSE_ID, getPoseDefinition } from '../characters/poseLibrary'
import { resolveCaptureSelection } from '../cameras/cameraData'
import { ARRI_CAMERA_DATASET } from '../cameras/data/arri'
import type {
  ActorDocument,
  CameraDocument,
  CameraFrameGuide,
  LensProfile,
  Placement,
  ProjectDocument,
  PropDocument,
  ShotDocument,
  Vec3,
} from './types'

export type PropType = PropDocument['appearance']['propType']

export const DEFAULT_ACTOR_HEIGHT_M = 1.75
export const DEFAULT_ACTOR_COLOR = '#c6a574'
export const ACTOR_COLOR_PRESETS = ['#c6a574', '#7ea8c4', '#b96d5a', '#8a9b78', '#b58bb8'] as const
export const ACTOR_HEIGHT_RANGE_M = { min: 0.5, max: 3 } as const
export const PROP_DIMENSION_RANGE_M = { min: 0.01, max: 50 } as const
export const CAMERA_FOCAL_LENGTH_RANGE_MM = { min: 0.1, max: 1000 } as const
export const CAMERA_FOCUS_DISTANCE_RANGE_M = { min: 0.1, max: 10000 } as const
export const DEFAULT_CAMERA_FOCAL_LENGTH_MM = 50
export const DEFAULT_CAMERA_FOCUS_DISTANCE_M = 5
export const DEFAULT_CAMERA_FRAME_GUIDE: CameraFrameGuide = { preset: 'capture' }

export const DEFAULT_PROP_DIMENSIONS_M: Record<PropType, Vec3> = {
  cube: [1, 1, 1],
  cylinder: [1, 1, 1],
  wall: [4, 2.8, 0.1],
  floor: [4, 0.05, 4],
  table: [1.5, 0.75, 0.8],
  chair: [0.5, 0.9, 0.5],
}

const PROP_LABELS: Record<PropType, string> = {
  cube: 'Cube',
  cylinder: 'Cylinder',
  wall: 'Wall',
  floor: 'Floor',
  table: 'Table',
  chair: 'Chair',
}

const PROP_COLORS: Record<PropType, string> = {
  cube: '#82909d',
  cylinder: '#82909d',
  wall: '#687783',
  floor: '#65717a',
  table: '#9b8067',
  chair: '#8d7561',
}

export class BlockingCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockingCommandError'
  }
}

export function addActor(
  project: ProjectDocument,
  idFactory: IdFactory = createId,
  requestedName?: string,
): { project: ProjectDocument; entityId: string } {
  const shot = requireActiveShot(project)
  const id = idFactory()
  const actor: ActorDocument = {
    id,
    name: requestedName?.trim() || nextName(shot.actors.map((entity) => entity.name), 'Actor'),
    character: { characterId: DEFAULT_CHARACTER_ID },
    appearance: {
      color: DEFAULT_ACTOR_COLOR,
      heightM: DEFAULT_ACTOR_HEIGHT_M,
      representation: 'person-proxy',
    },
    pose: { poseId: DEFAULT_POSE_ID },
    placement: createDefaultPlacement(shot),
  }

  return { project: replaceShot(project, { ...shot, actors: [...shot.actors, actor] }), entityId: id }
}

export function addProp(
  project: ProjectDocument,
  propType: PropType,
  idFactory: IdFactory = createId,
  requestedName?: string,
): { project: ProjectDocument; entityId: string } {
  const shot = requireActiveShot(project)
  const id = idFactory()
  const representation = propType === 'cylinder' ? 'cylinder-proxy' : propType === 'floor' ? 'plane-proxy' : 'box-proxy'
  const prop: PropDocument = {
    id,
    name: requestedName?.trim() || nextName(shot.props.map((entity) => entity.name), PROP_LABELS[propType]),
    appearance: {
      color: PROP_COLORS[propType],
      dimensionsM: [...DEFAULT_PROP_DIMENSIONS_M[propType]],
      propType,
      representation,
    },
    placement: createDefaultPlacement(shot),
  }

  return { project: replaceShot(project, { ...shot, props: [...shot.props, prop] }), entityId: id }
}

export function addCamera(
  project: ProjectDocument,
  idFactory: IdFactory = createId,
  requestedName?: string,
): { project: ProjectDocument; entityId: string } {
  const shot = requireActiveShot(project)
  const id = idFactory()
  const camera: CameraDocument = {
    id,
    name: requestedName?.trim() || nextName(shot.cameras.map((entity) => entity.name), 'Camera'),
    cameraModelId: 'generic.camera',
    sensorModeId: 'generic.camera.open-gate',
    resolvedCapture: {
      datasetVersion: '1.0.0',
      cameraId: 'generic.camera',
      recordingModeId: 'generic.camera.open-gate',
      physicalSensorId: 'generic.camera.sensor',
      activeWidthMm: 36,
      activeHeightMm: 24,
    },
    placement: {
      position: [0, 1.5, 4],
      rotation: { order: 'XYZ', radians: [0, 0, 0] },
    },
    lens: {
      focalLengthMm: DEFAULT_CAMERA_FOCAL_LENGTH_MM,
      sensorFormat: { kind: 'custom', widthMm: 36, heightMm: 24 },
      profile: { type: 'spherical', preset: 'spherical', squeezeFactor: 1 },
      focusDistanceM: DEFAULT_CAMERA_FOCUS_DISTANCE_M,
    },
    frameGuide: structuredClone(DEFAULT_CAMERA_FRAME_GUIDE),
    aim: { mode: 'free' },
  }
  return {
    project: replaceShot(project, { ...shot, cameras: [...shot.cameras, camera], activeCameraId: shot.activeCameraId ?? id }),
    entityId: id,
  }
}

export function setCameraModel(project: ProjectDocument, entityId: string, cameraModelId: string): ProjectDocument {
  requireCamera(project, entityId)
  const model = ARRI_CAMERA_DATASET.cameras.find((candidate) => candidate.id === cameraModelId)
  if (!model) throw new BlockingCommandError('Camera model is not available.')
  const mode = model.recordingModes[0]
  if (!mode) throw new BlockingCommandError('Camera model has no sensor modes.')
  const output = mode.recordingOutputs?.[0]
  return updateCamera(project, entityId, (current) => applyCaptureSelection(current, model.id, mode.id, output?.id))
}

export function setCameraSensorMode(project: ProjectDocument, entityId: string, sensorModeId: string): ProjectDocument {
  const camera = requireCamera(project, entityId)
  const model = ARRI_CAMERA_DATASET.cameras.find((candidate) => candidate.id === camera.cameraModelId)
  if (!model) throw new BlockingCommandError('Camera model is not available.')
  const mode = model.recordingModes.find((candidate) => candidate.id === sensorModeId)
  if (!mode) throw new BlockingCommandError('Sensor mode is not available for this camera.')
  return updateCamera(project, entityId, (current) => applyCaptureSelection(current, model.id, mode.id, mode.recordingOutputs?.[0]?.id))
}

export function setCameraRecordingOutput(project: ProjectDocument, entityId: string, recordingOutputId: string | undefined): ProjectDocument {
  const camera = requireCamera(project, entityId)
  const model = ARRI_CAMERA_DATASET.cameras.find((candidate) => candidate.id === camera.cameraModelId)
  if (!model) throw new BlockingCommandError('Camera model is not available.')
  const mode = model.recordingModes.find((candidate) => candidate.id === camera.sensorModeId)
  if (!mode || (recordingOutputId !== undefined && !mode.recordingOutputs?.some((output) => output.id === recordingOutputId))) {
    throw new BlockingCommandError('Recording format is not available for this sensor mode.')
  }
  return updateCamera(project, entityId, (current) => applyCaptureSelection(current, model.id, mode.id, recordingOutputId))
}

export function setCameraFocalLength(project: ProjectDocument, entityId: string, focalLengthMm: number): ProjectDocument {
  assertFiniteNumber(focalLengthMm, 'Focal length')
  if (focalLengthMm <= 0) throw new BlockingCommandError('Focal length must be greater than zero.')
  return updateCamera(project, entityId, (camera) => ({ ...camera, lens: { ...camera.lens, focalLengthMm } }))
}

export function setCameraFocusDistance(project: ProjectDocument, entityId: string, focusDistanceM: number): ProjectDocument {
  assertFiniteNumber(focusDistanceM, 'Focus distance')
  if (focusDistanceM <= 0) throw new BlockingCommandError('Focus distance must be greater than zero.')
  return updateCamera(project, entityId, (camera) => ({ ...camera, lens: { ...camera.lens, focusDistanceM } }))
}

export function setCameraLensProfile(project: ProjectDocument, entityId: string, profile: LensProfile): ProjectDocument {
  assertFiniteNumber(profile.squeezeFactor, 'Squeeze factor')
  if (profile.squeezeFactor <= 0 || (profile.type === 'spherical' && profile.squeezeFactor !== 1)) throw new BlockingCommandError('Lens squeeze must be greater than zero and spherical lenses must remain 1.0x.')
  return updateCamera(project, entityId, (camera) => ({ ...camera, lens: { ...camera.lens, profile } }))
}

export function setCameraFrameGuide(project: ProjectDocument, entityId: string, frameGuide: CameraFrameGuide): ProjectDocument {
  validateFrameGuide(frameGuide)
  return updateCamera(project, entityId, (camera) => ({ ...camera, frameGuide: structuredClone(frameGuide) }))
}

export function renameEntity(project: ProjectDocument, entityId: string, name: string): ProjectDocument {
  const nextNameValue = name.trim()
  if (!nextNameValue) throw new BlockingCommandError('Name cannot be empty.')
  return updateEntity(project, entityId, (entity) => ({ ...entity, name: nextNameValue }))
}

export function setEntityPlacement(
  project: ProjectDocument,
  entityId: string,
  placement: Placement,
): ProjectDocument {
  assertFinitePlacement(placement)
  return updateEntity(project, entityId, (entity) => ({ ...entity, placement: clonePlacement(placement) }))
}

export function setActorHeight(project: ProjectDocument, entityId: string, heightM: number): ProjectDocument {
  assertFiniteNumber(heightM, 'Actor height')
  const height = clamp(heightM, ACTOR_HEIGHT_RANGE_M.min, ACTOR_HEIGHT_RANGE_M.max)
  const shot = requireActiveShot(project)
  const actor = shot.actors.find((entity) => entity.id === entityId)
  if (!actor) throw new BlockingCommandError('Actor not found.')
  return replaceShot(project, {
    ...shot,
    actors: shot.actors.map((entity) => entity.id === entityId ? { ...entity, appearance: { ...entity.appearance, heightM: height } } : entity),
  })
}

export function setActorCharacter(project: ProjectDocument, entityId: string, characterId: string): ProjectDocument {
  if (!getCharacterDefinition(characterId)) throw new BlockingCommandError('Character is not available.')
  const shot = requireActiveShot(project)
  const actor = shot.actors.find((entity) => entity.id === entityId)
  if (!actor) throw new BlockingCommandError('Actor not found.')
  return replaceShot(project, {
    ...shot,
    actors: shot.actors.map((entity) => entity.id === entityId ? { ...entity, character: { characterId } } : entity),
  })
}

export function setActorColor(project: ProjectDocument, entityId: string, color: string): ProjectDocument {
  if (!isHexColor(color)) throw new BlockingCommandError('Actor color must be a hexadecimal color.')
  return updateActor(project, entityId, (actor) => ({
    ...actor,
    appearance: { ...actor.appearance, color: color.toLowerCase() },
  }))
}

export function setActorPose(project: ProjectDocument, entityId: string, poseId: string): ProjectDocument {
  if (!getPoseDefinition(poseId)) throw new BlockingCommandError('Pose is not available.')
  return updateActor(project, entityId, (actor) => ({ ...actor, pose: { poseId } }))
}

export function setPropDimensions(project: ProjectDocument, entityId: string, dimensionsM: Vec3): ProjectDocument {
  dimensionsM.forEach((value) => assertFiniteNumber(value, 'Prop dimension'))
  const dimensions: Vec3 = dimensionsM.map((value) => clamp(value, PROP_DIMENSION_RANGE_M.min, PROP_DIMENSION_RANGE_M.max)) as Vec3
  const shot = requireActiveShot(project)
  const prop = shot.props.find((entity) => entity.id === entityId)
  if (!prop) throw new BlockingCommandError('Prop not found.')
  return replaceShot(project, {
    ...shot,
    props: shot.props.map((entity) => entity.id === entityId ? { ...entity, appearance: { ...entity.appearance, dimensionsM: [...dimensions] } } : entity),
  })
}

export function deleteEntity(project: ProjectDocument, entityId: string): ProjectDocument {
  const shot = requireActiveShot(project)
  return replaceShot(project, {
    ...shot,
    actors: shot.actors.filter((entity) => entity.id !== entityId),
    props: shot.props.filter((entity) => entity.id !== entityId),
    cameras: shot.cameras.filter((entity) => entity.id !== entityId),
    activeCameraId: shot.activeCameraId === entityId ? null : shot.activeCameraId,
  })
}

function updateEntity(
  project: ProjectDocument,
  entityId: string,
  update: (entity: ActorDocument | PropDocument | CameraDocument) => ActorDocument | PropDocument | CameraDocument,
): ProjectDocument {
  const shot = requireActiveShot(project)
  const actor = shot.actors.find((entity) => entity.id === entityId)
  if (actor) return replaceShot(project, { ...shot, actors: shot.actors.map((entity) => entity.id === entityId ? update(entity) as ActorDocument : entity) })
  const prop = shot.props.find((entity) => entity.id === entityId)
  if (prop) return replaceShot(project, { ...shot, props: shot.props.map((entity) => entity.id === entityId ? update(entity) as PropDocument : entity) })
  const camera = shot.cameras.find((entity) => entity.id === entityId)
  if (camera) return replaceShot(project, { ...shot, cameras: shot.cameras.map((entity) => entity.id === entityId ? update(entity) as CameraDocument : entity) })
  throw new BlockingCommandError('Blocking element not found.')
}

function updateCamera(project: ProjectDocument, entityId: string, update: (camera: CameraDocument) => CameraDocument): ProjectDocument {
  const shot = requireActiveShot(project)
  if (!shot.cameras.some((entity) => entity.id === entityId)) throw new BlockingCommandError('Camera not found.')
  return replaceShot(project, {
    ...shot,
    cameras: shot.cameras.map((entity) => entity.id === entityId ? update(entity) : entity),
  })
}

function requireCamera(project: ProjectDocument, entityId: string): CameraDocument {
  const shot = requireActiveShot(project)
  const camera = shot.cameras.find((entity) => entity.id === entityId)
  if (!camera) throw new BlockingCommandError('Camera not found.')
  return camera
}

function applyCaptureSelection(camera: CameraDocument, cameraModelId: string, sensorModeId: string, recordingOutputId?: string): CameraDocument {
  const resolvedCapture = resolveCaptureSelection(ARRI_CAMERA_DATASET, cameraModelId, sensorModeId, recordingOutputId)
  return {
    ...camera,
    cameraModelId,
    sensorModeId,
    ...(recordingOutputId === undefined ? {} : { recordingOutputId }),
    resolvedCapture,
    lens: {
      ...camera.lens,
      sensorFormat: { kind: 'custom', widthMm: resolvedCapture.activeWidthMm, heightMm: resolvedCapture.activeHeightMm },
    },
  }
}

function validateFrameGuide(frameGuide: CameraFrameGuide): void {
  if (frameGuide.preset === 'custom') {
    const width = frameGuide.width
    const height = frameGuide.height
    if (typeof width !== 'number' || typeof height !== 'number' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new BlockingCommandError('Custom frame guide dimensions must be greater than zero.')
    return
  }
  if (!['capture', '16:9', '1.85:1', '2.00:1', '2.39:1'].includes(frameGuide.preset)) throw new BlockingCommandError('Frame guide is not available.')
}

function updateActor(
  project: ProjectDocument,
  entityId: string,
  update: (actor: ActorDocument) => ActorDocument,
): ProjectDocument {
  const shot = requireActiveShot(project)
  if (!shot.actors.some((entity) => entity.id === entityId)) throw new BlockingCommandError('Actor not found.')
  return replaceShot(project, {
    ...shot,
    actors: shot.actors.map((entity) => entity.id === entityId ? update(entity) : entity),
  })
}

function createDefaultPlacement(shot: ShotDocument): Placement {
  const index = shot.actors.length + shot.props.length
  const column = index % 5
  const row = Math.floor(index / 5)
  return {
    position: [column * 0.9 - 1.8, 0, row * 0.9],
    rotation: { order: 'XYZ', radians: [0, 0, 0] },
  }
}

function replaceShot(project: ProjectDocument, shot: ShotDocument): ProjectDocument {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    shots: project.shots.map((entry) => entry.id === shot.id ? shot : entry),
  }
}

function requireActiveShot(project: ProjectDocument): ShotDocument {
  const shot = project.shots.find((entry) => entry.id === project.activeShotId)
  if (!shot) throw new BlockingCommandError('The active shot is unavailable.')
  return shot
}

function nextName(existingNames: string[], label: string): string {
  const prefix = new RegExp(`^${escapeRegExp(label)} (\\d+)$`)
  const largest = existingNames.reduce((max, name) => {
    const match = prefix.exec(name)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${label} ${String(largest + 1).padStart(2, '0')}`
}

function clonePlacement(placement: Placement): Placement {
  return {
    position: [...placement.position],
    rotation: { order: placement.rotation.order, radians: [...placement.rotation.radians] },
  }
}

function assertFinitePlacement(placement: Placement): void {
  placement.position.forEach((value) => assertFiniteNumber(value, 'Position'))
  placement.rotation.radians.forEach((value) => assertFiniteNumber(value, 'Rotation'))
  if (placement.rotation.order !== 'XYZ') throw new BlockingCommandError('Rotation order must be XYZ.')
}

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new BlockingCommandError(`${label} must be finite.`)
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
