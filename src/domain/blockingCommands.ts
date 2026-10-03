import { createId, type IdFactory } from './ids'
import { DEFAULT_CHARACTER_ID, getCharacterDefinition } from '../characters/characterRegistry'
import { DEFAULT_POSE_ID, getPoseDefinition } from '../characters/poseLibrary'
import type {
  ActorDocument,
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
  })
}

function updateEntity(
  project: ProjectDocument,
  entityId: string,
  update: (entity: ActorDocument | PropDocument) => ActorDocument | PropDocument,
): ProjectDocument {
  const shot = requireActiveShot(project)
  const actor = shot.actors.find((entity) => entity.id === entityId)
  if (actor) return replaceShot(project, { ...shot, actors: shot.actors.map((entity) => entity.id === entityId ? update(entity) as ActorDocument : entity) })
  const prop = shot.props.find((entity) => entity.id === entityId)
  if (prop) return replaceShot(project, { ...shot, props: shot.props.map((entity) => entity.id === entityId ? update(entity) as PropDocument : entity) })
  throw new BlockingCommandError('Blocking element not found.')
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
