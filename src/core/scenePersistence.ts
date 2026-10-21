import { cameraDatabaseVersion, resolveCameraDefinition, resolveCaptureMode } from './cameraDatabase'
import { isActorPose, isActorPosePreset, normalizeActorPosePreset } from './actorPosePresets'
import { normalizeFrameGuideColor } from './frameGuides'
import { createStandingActorPose } from './sceneDocument'
import type { CameraDocument, CameraPhysicalSnapshot, SceneDocument } from './sceneDocument'

export const NDSCENE_FORMAT = 'ndscene' as const
export const CURRENT_NDSCENE_VERSION = 1

export type NdsceneFile = {
  format: typeof NDSCENE_FORMAT
  version: number
  scene: SceneDocument
}

export type SceneFileErrorCode = 'invalid-json' | 'invalid-file' | 'unsupported-newer-version' | 'invalid-scene'

export class SceneFileError extends Error {
  readonly code: SceneFileErrorCode

  constructor(code: SceneFileErrorCode, message: string) {
    super(message)
    this.name = 'SceneFileError'
    this.code = code
  }
}

export function cameraPhysicalSnapshot(camera: CameraDocument): CameraPhysicalSnapshot | null {
  const definition = resolveCameraDefinition(camera.cameraDefinitionId)
  if (!definition) return null
  const captureMode = resolveCaptureMode(definition, camera.captureModeId)
  return {
    manufacturer: definition.manufacturer,
    model: definition.model,
    captureModeName: captureMode.name,
    activeWidthMm: captureMode.activeWidthMm,
    activeHeightMm: captureMode.activeHeightMm,
    recordingWidthPx: captureMode.recordingWidthPx,
    recordingHeightPx: captureMode.recordingHeightPx,
    sensorFormatLabel: definition.sensor.name,
    databaseVersionAtSave: cameraDatabaseVersion,
  }
}

export function prepareSceneForSave(scene: SceneDocument, savedAt = new Date().toISOString()): SceneDocument {
  return {
    ...scene,
    metadata: { ...scene.metadata, updatedAt: savedAt },
    props: scene.props.map((prop) => ({ ...prop, scale: prop.scale ?? [1, 1, 1] })),
    cameras: scene.cameras.map((camera) => ({ ...camera, cameraSnapshot: camera.cameraSnapshot ?? cameraPhysicalSnapshot(camera) ?? undefined })),
  }
}

export function serializeScene(scene: SceneDocument, savedAt?: string): string {
  const prepared = prepareSceneForSave(scene, savedAt)
  const errors = validateSceneDocument(prepared)
  if (errors.length > 0) throw new SceneFileError('invalid-scene', errors[0])
  const file: NdsceneFile = { format: NDSCENE_FORMAT, version: CURRENT_NDSCENE_VERSION, scene: prepared }
  return JSON.stringify(file, null, 2)
}

export function parseSceneFile(text: string): SceneDocument {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new SceneFileError('invalid-json', 'This scene file could not be opened.')
  }
  const migrated = migrateSceneFile(value)
  const errors = validateSceneDocument(migrated.scene)
  if (errors.length > 0) throw new SceneFileError('invalid-scene', errors[0])
  return migrated.scene
}

export function migrateSceneFile(value: unknown): NdsceneFile {
  if (!isRecord(value) || value.format !== NDSCENE_FORMAT || !Number.isInteger(value.version) || !('scene' in value)) {
    throw new SceneFileError('invalid-file', 'This file is not a valid .ndscene file.')
  }
  const version = value.version as number
  if (version > CURRENT_NDSCENE_VERSION) throw new SceneFileError('unsupported-newer-version', 'This scene file was created by an unsupported newer version.')
  if (version === CURRENT_NDSCENE_VERSION) return { format: NDSCENE_FORMAT, version: CURRENT_NDSCENE_VERSION, scene: normalizeSceneDocument(value.scene) }
  if (version === 0) return { format: NDSCENE_FORMAT, version: CURRENT_NDSCENE_VERSION, scene: migrateVersionZeroScene(value.scene) }
  throw new SceneFileError('invalid-file', 'This scene file version is not supported.')
}

export function validateSceneDocument(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['Scene data is missing.']
  if (value.schemaVersion !== 'ndscene-v2') errors.push('Scene schema version is not supported.')
  if (!isRecord(value.metadata) || !stringField(value.metadata.id) || !stringField(value.metadata.name) || !stringField(value.metadata.createdAt) || !stringField(value.metadata.updatedAt)) errors.push('Scene metadata is incomplete.')
  if (!isRecord(value.stage) || !stringField(value.stage.name) || !Array.isArray(value.actors) || !Array.isArray(value.props) || !Array.isArray(value.walls) || !Array.isArray(value.openings) || !Array.isArray(value.cameras) || !Array.isArray(value.lights) || (value.groups !== undefined && !Array.isArray(value.groups)) || !isRecord(value.timeline)) errors.push('Scene collections or Stage metadata are incomplete.')
  if (errors.length > 0) return errors

  const actors = value.actors as unknown[]
  const props = value.props as unknown[]
  const walls = value.walls as unknown[]
  const openings = value.openings as unknown[]
  const cameras = value.cameras as unknown[]
  const lights = value.lights as unknown[]
  const groups = Array.isArray(value.groups) ? value.groups as unknown[] : []
  const ids = [...actors, ...props, ...walls, ...openings, ...cameras, ...lights].map((entity) => isRecord(entity) ? entity.id : null)
  if (ids.some((id) => !stringField(id))) errors.push('Every scene entity needs a stable ID.')
  const validIds = ids.filter((id): id is string => typeof id === 'string')
  if (new Set(validIds).size !== validIds.length) errors.push('Scene entity IDs must be unique.')
  actors.forEach((actor, index) => validateActor(actor, `actors[${index}]`, errors))
  props.forEach((prop, index) => validateProp(prop, `props[${index}]`, errors))
  walls.forEach((wall, index) => validateWall(wall, `walls[${index}]`, errors))
  openings.forEach((opening, index) => validateOpening(opening, `openings[${index}]`, errors))
  cameras.forEach((camera, index) => validateCamera(camera, `cameras[${index}]`, errors))
  lights.forEach((light, index) => validateSun(light, `lights[${index}]`, errors))
  groups.forEach((group, index) => validateGroup(group, `groups[${index}]`, new Set(validIds), errors))
  const groupIds = groups.map((group) => isRecord(group) ? group.id : null)
  if (groupIds.some((id) => !stringField(id)) || new Set(groupIds.filter((id): id is string => typeof id === 'string')).size !== groupIds.length) errors.push('Scene group IDs must be unique.')
  const validGroupIds = groupIds.filter((id): id is string => typeof id === 'string')
  if (validGroupIds.some((id) => validIds.includes(id))) errors.push('Scene group IDs must not collide with entity IDs.')
  const childGroupIds = groups.flatMap((group) => isRecord(group) && Array.isArray(group.childIds) ? group.childIds.filter((id): id is string => typeof id === 'string') : [])
  if (new Set(childGroupIds).size !== childGroupIds.length) errors.push('An entity may belong to only one Scene group.')
  if (value.activeCameraId !== null && (!stringField(value.activeCameraId) || !cameras.some((camera) => isRecord(camera) && camera.id === value.activeCameraId))) errors.push('Active Camera does not resolve to a Camera in the scene.')
  validateTimeline(value.timeline as Record<string, unknown>, new Set([...validIds, ...groupIds.filter((id): id is string => typeof id === 'string')]), new Set(actors.flatMap((actor) => isRecord(actor) && typeof actor.id === 'string' ? [actor.id] : [])), new Set(props.flatMap((prop) => isRecord(prop) && typeof prop.id === 'string' ? [prop.id] : [])), new Set(walls.flatMap((wall) => isRecord(wall) && typeof wall.id === 'string' ? [wall.id] : [])), new Set(openings.flatMap((opening) => isRecord(opening) && typeof opening.id === 'string' ? [opening.id] : [])), new Set(lights.flatMap((light) => isRecord(light) && typeof light.id === 'string' ? [light.id] : [])), new Set(cameras.flatMap((camera) => isRecord(camera) && typeof camera.id === 'string' ? [camera.id] : [])), new Set(groupIds.filter((id): id is string => typeof id === 'string')), errors)
  return errors
}

/** Adds V2.10 collections to older V2 scene payloads without changing existing entities. */
export function normalizeSceneDocument(value: unknown): SceneDocument {
  if (!isRecord(value)) throw new SceneFileError('invalid-file', 'The scene payload is missing.')
  const normalizeEntity = (entity: unknown, fallbackColor: string): unknown => {
    if (!isRecord(entity)) return entity
    return { ...entity, primaryColor: typeof entity.primaryColor === 'string' ? entity.primaryColor : fallbackColor }
  }
  const actors = Array.isArray(value.actors) ? value.actors.map((actor) => {
    if (!isRecord(actor)) return actor
    const appearance = isRecord(actor.appearance) ? actor.appearance : {}
    return {
      ...actor,
      appearance: {
        ...appearance,
        bodyVariant: appearance.bodyVariant === 'male' || appearance.bodyVariant === 'female' ? appearance.bodyVariant : 'neutral',
        primaryColor: typeof appearance.primaryColor === 'string' ? appearance.primaryColor : '#7f72c9',
      },
      pose: isActorPose(actor.pose) ? actor.pose : createStandingActorPose(),
      posePreset: normalizeActorPosePreset(actor.posePreset),
      visualStyle: actor.visualStyle === 'mannequin' ? 'mannequin' : 'character',
    }
  }) : []
  const props = Array.isArray(value.props) ? value.props.map((prop) => {
    const normalized = normalizeEntity(prop, '#9b91df')
    return isRecord(normalized) ? { ...normalized, scale: vector3(normalized.scale) ? normalized.scale : [1, 1, 1] } : normalized
  }) : []
  const walls = Array.isArray(value.walls) ? value.walls.map((wall) => normalizeEntity(wall, '#c2ad95')) : []
  const openings = Array.isArray(value.openings) ? value.openings.map((opening) => {
    const normalized = normalizeEntity(opening, '#7ba2b4')
    if (!isRecord(normalized)) return normalized
    const rawAngle = typeof normalized.openAngle === 'number' && Number.isFinite(normalized.openAngle) ? normalized.openAngle : 0
    const openAngle = normalized.openingType === 'window' ? Math.min(90, Math.max(0, rawAngle)) : rawAngle
    return { ...normalized, hingeSide: normalized.hingeSide === 'right' ? 'right' : 'left', openAngle }
  }) : []
  const cameras = Array.isArray(value.cameras) ? value.cameras.map((camera) => isRecord(camera) ? {
    ...camera,
    proxyColor: typeof camera.proxyColor === 'string' ? camera.proxyColor : '#4e5665',
    targetEntityId: typeof camera.targetEntityId === 'string' ? camera.targetEntityId : null,
    lockTarget: camera.lockTarget === true,
    targetAimPoint: ['center', 'chest', 'head', 'eyes'].includes(String(camera.targetAimPoint)) ? camera.targetAimPoint : 'center',
    compositionCenter: camera.compositionCenter === true,
    compositionThirds: camera.compositionThirds === true,
    compositionSafeAreas: camera.compositionSafeAreas === true,
    compositionFrameGuideEnabled: camera.compositionFrameGuideEnabled === true,
    compositionFrameGuideAspect: typeof camera.compositionFrameGuideAspect === 'number' && Number.isFinite(camera.compositionFrameGuideAspect) && camera.compositionFrameGuideAspect > 0 ? camera.compositionFrameGuideAspect : 2.39,
    compositionHeadroom: camera.compositionHeadroom === true,
  } : camera) : []
  const timeline = normalizeTimelineDocument(isRecord(value.timeline) ? value.timeline : {})
  const validEntityIds = new Set([...actors, ...props, ...walls, ...openings, ...cameras].flatMap((entity) => isRecord(entity) && typeof entity.id === 'string' ? [entity.id] : []))
  const safeCameras = cameras.map((camera) => isRecord(camera) ? {
    ...camera,
    targetEntityId: typeof camera.targetEntityId === 'string' && camera.targetEntityId !== camera.id && validEntityIds.has(camera.targetEntityId) ? camera.targetEntityId : null,
    lockTarget: typeof camera.targetEntityId === 'string' && camera.targetEntityId !== camera.id && validEntityIds.has(camera.targetEntityId) && camera.lockTarget === true,
  } : camera)
  return {
    ...value,
    actors,
    props,
    walls,
    openings,
    cameras: safeCameras,
    lights: Array.isArray(value.lights) ? value.lights : [],
    groups: Array.isArray(value.groups) ? value.groups.map((group) => normalizeGroup(group)).filter((group): group is NonNullable<typeof group> => group !== null) : [],
    timeline,
  } as SceneDocument
}

function normalizeTimelineDocument(value: Record<string, unknown>): SceneDocument['timeline'] {
  const startFrame = Number.isInteger(value.startFrame) ? Number(value.startFrame) : 0
  const existingEnd = Number.isInteger(value.endFrame) ? Number(value.endFrame) : startFrame + 120
  const markIn = Number.isInteger(value.markIn) ? Number(value.markIn) : startFrame
  // Early project files used zero as an "unset" Mark Out value. Preserve a
  // real positive mark, but restore that legacy sentinel to the document end
  // so playback does not immediately resolve to a zero-length range.
  const configuredMarkOut = Number.isInteger(value.markOut) ? Number(value.markOut) : existingEnd
  const markOut = configuredMarkOut === 0 && existingEnd > startFrame ? existingEnd : configuredMarkOut
  const tracks = Array.isArray(value.tracks) ? value.tracks : []
  const furthestKey = tracks.reduce((furthest, track) => {
    if (!isRecord(track) || !Array.isArray(track.keyframes)) return furthest
    return Math.max(furthest, ...track.keyframes.map((keyframe) => isRecord(keyframe) && Number.isInteger(keyframe.frame) ? Number(keyframe.frame) : startFrame))
  }, startFrame)
  const configuredDuration = Number.isInteger(value.durationFrames) && Number(value.durationFrames) > 0 ? Number(value.durationFrames) : 0
  const durationFrames = Math.max(1, configuredDuration || existingEnd - startFrame, markOut - startFrame, furthestKey - startFrame)
  return {
    currentFrame: Number.isInteger(value.currentFrame) ? Number(value.currentFrame) : startFrame,
    startFrame,
    durationFrames,
    endFrame: startFrame + durationFrames,
    markIn,
    markOut,
    frameRate: positiveRational(value.frameRate) ? value.frameRate as SceneDocument['timeline']['frameRate'] : { numerator: 24, denominator: 1 },
    tracks: tracks as SceneDocument['timeline']['tracks'],
  }
}

export function sceneFilename(name: string): string {
  const printableName = Array.from(name.trim(), (character) => character.charCodeAt(0) < 32 ? '_' : character).join('')
  const safeName = printableName.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^\.+|\.+$/g, '') || 'Untitled_Scene'
  return `${safeName}.ndscene`
}

function migrateVersionZeroScene(value: unknown): SceneDocument {
  if (!isRecord(value)) throw new SceneFileError('invalid-file', 'The older scene file does not contain a SceneDocument.')
  const cameras = Array.isArray(value.cameras) ? value.cameras.map((camera) => {
    if (!isRecord(camera)) return camera
    const guides = Array.isArray(camera.frameGuides) ? camera.frameGuides.map((guide) => migrateGuide(guide)) : []
    return { ...camera, frameGuides: guides }
  }) : value.cameras
  return normalizeSceneDocument({ ...value, cameras })
}

function migrateGuide(value: unknown): unknown {
  if (!isRecord(value)) return value
  const legacyToken = value.colorToken
  const color = typeof value.color === 'string' ? value.color : legacyToken === 'accent' ? '#F0B866' : legacyToken === 'muted' ? '#AAB6C9' : '#D7DDE8'
  return { ...value, color: normalizeFrameGuideColor(color) }
}

function validateActor(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !vector3(value.position) || !vector3(value.rotation) || !vector3(value.scale) || !isRecord(value.appearance) || !['neutral', 'male', 'female'].includes(String(value.appearance.bodyVariant)) || !stringField(value.appearance.primaryColor) || !isActorPose(value.pose) || (value.posePreset !== undefined && !isActorPosePreset(value.posePreset)) || (value.visualStyle !== undefined && !['mannequin', 'character'].includes(String(value.visualStyle)))) {
    errors.push(`${path} is not a valid Actor.`)
    return
  }
  Object.values(value.pose).forEach((joint) => { if (!vector3(joint)) errors.push(`${path}.pose contains an invalid joint value.`) })
}

function validateProp(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || value.type !== 'Prop' || !vector3(value.position) || !vector3(value.rotation) || !['cube', 'sphere', 'cylinder'].includes(String(value.shape)) || (value.propType !== undefined && !['cube', 'sphere', 'cylinder', 'table', 'chair', 'window', 'door', 'bicycle', 'motorbike', 'car'].includes(String(value.propType))) || (value.dimensions !== undefined && !vector3(value.dimensions)) || (value.scale !== undefined && !vector3(value.scale)) || !stringField(value.primaryColor)) errors.push(`${path} is not a valid Prop.`)
}

function validateWall(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || value.type !== 'Wall' || !vector3(value.position) || !vector3(value.rotation) || !positiveNumber(value.length) || !positiveNumber(value.height) || !positiveNumber(value.thickness) || !stringField(value.primaryColor)) errors.push(`${path} is not a valid Wall.`)
}

function validateOpening(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || value.type !== 'Opening' || !['door', 'window'].includes(String(value.openingType)) || !vector3(value.position) || !vector3(value.rotation) || !positiveNumber(value.width) || !positiveNumber(value.height) || !positiveNumber(value.depth) || !finiteNumber(value.sillHeight) || (value.hingeSide !== undefined && !['left', 'right'].includes(String(value.hingeSide))) || (value.openAngle !== undefined && !finiteNumber(value.openAngle)) || (value.wallId !== null && value.wallId !== undefined && !stringField(value.wallId)) || (value.offsetAlongWallMeters !== undefined && !finiteNumber(value.offsetAlongWallMeters)) || !stringField(value.primaryColor)) errors.push(`${path} is not a valid Door or Window opening.`)
}

function validateSun(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || value.type !== 'Sun' || !finiteNumber(value.azimuth) || !finiteNumber(value.elevation) || !finiteNumber(value.intensity) || value.intensity < 0 || !stringField(value.color) || !/^#[0-9a-f]{6}$/i.test(value.color)) errors.push(`${path} is not a valid Sun.`)
}

function validateCamera(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !vector3(value.position) || !vector3(value.rotation) || !stringField(value.cameraDefinitionId) || !stringField(value.captureModeId) || !finiteNumber(value.focalLengthMm) || !['Spherical', 'Anamorphic'].includes(String(value.lensType)) || ![1, 1.3, 1.33, 1.5, 1.6, 1.8, 2].includes(Number(value.anamorphicSqueeze)) || !['sensor', '16:9', '1.85', '2.00', '2.39'].includes(String(value.deliveryAspectRatio)) || (value.proxyColor !== undefined && (!stringField(value.proxyColor) || !/^#[0-9a-f]{6}$/i.test(value.proxyColor))) || (value.targetEntityId !== undefined && value.targetEntityId !== null && !stringField(value.targetEntityId)) || (value.lockTarget !== undefined && typeof value.lockTarget !== 'boolean') || (value.targetAimPoint !== undefined && !['center', 'chest', 'head', 'eyes'].includes(String(value.targetAimPoint))) || (value.compositionFrameGuideAspect !== undefined && (!finiteNumber(value.compositionFrameGuideAspect) || Number(value.compositionFrameGuideAspect) <= 0)) || !Array.isArray(value.frameGuides)) {
    errors.push(`${path} is not a valid Camera.`)
    return
  }
  const guideIds = (value.frameGuides as unknown[]).map((guide) => isRecord(guide) ? guide.id : null)
  if (guideIds.some((id) => !stringField(id)) || new Set(guideIds.filter((id): id is string => typeof id === 'string')).size !== guideIds.length) errors.push(`${path}.frameGuides must have unique IDs.`)
  ;(value.frameGuides as unknown[]).forEach((guide, index) => validateGuide(guide, `${path}.frameGuides[${index}]`, errors))
  if (value.cameraSnapshot !== undefined) validateSnapshot(value.cameraSnapshot, `${path}.cameraSnapshot`, errors)
}

function validateGuide(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !finiteNumber(value.aspectRatio) || Number(value.aspectRatio) <= 0 || typeof value.enabled !== 'boolean' || !['solid', 'dashed'].includes(String(value.lineStyle)) || !finiteNumber(value.opacity) || Number(value.opacity) < 0 || Number(value.opacity) > 1 || !finiteNumber(value.lineWeight) || Number(value.lineWeight) <= 0 || !stringField(value.color) || !/^#[0-9a-f]{6}$/i.test(value.color) || typeof value.shadeOutside !== 'boolean' || !finiteNumber(value.shadeOpacity) || Number(value.shadeOpacity) < 0 || Number(value.shadeOpacity) > 1 || !finiteNumber(value.safeMarginPercent) || Number(value.safeMarginPercent) < 0 || Number(value.safeMarginPercent) >= 50) errors.push(`${path} is not a valid Frame Guide.`)
}

function validateSnapshot(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.manufacturer) || !stringField(value.model) || !stringField(value.captureModeName) || !positiveNumber(value.activeWidthMm) || !positiveNumber(value.activeHeightMm) || !positiveInteger(value.recordingWidthPx) || !positiveInteger(value.recordingHeightPx) || !stringField(value.sensorFormatLabel) || !positiveInteger(value.databaseVersionAtSave)) errors.push(`${path} is not a valid Camera physical snapshot.`)
}

function validateGroup(value: unknown, path: string, entityIds: Set<string>, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !vector3(value.position) || !vector3(value.rotation) || !vector3(value.pivot) || !Array.isArray(value.childIds) || value.childIds.some((id) => !stringField(id) || !entityIds.has(id)) || (Array.isArray(value.childIds) && new Set(value.childIds).size !== value.childIds.length)) errors.push(`${path} is not a valid Group.`)
}

function normalizeGroup(value: unknown): { id: string; name: string; position: [number, number, number]; rotation: [number, number, number]; pivot: [number, number, number]; childIds: string[] } | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return null
  const vector = (input: unknown): [number, number, number] => vector3(input) ? [...input] as [number, number, number] : [0, 0, 0]
  const childIds = Array.isArray(value.childIds) ? value.childIds.filter((id): id is string => typeof id === 'string') : []
  return { id: value.id, name: value.name.trim() || 'Group', position: vector(value.position), rotation: vector(value.rotation), pivot: vector(value.pivot), childIds: [...new Set(childIds)] }
}

function validateTimeline(value: Record<string, unknown>, ids: Set<string>, actorIds: Set<string>, propIds: Set<string>, wallIds: Set<string>, openingIds: Set<string>, sunIds: Set<string>, cameraIds: Set<string>, groupIds: Set<string>, errors: string[]): void {
  if (!positiveRational(value.frameRate) || !integerFields(value, ['currentFrame', 'startFrame', 'durationFrames', 'endFrame', 'markIn', 'markOut']) || Number(value.durationFrames) < 1 || !Array.isArray(value.tracks)) {
    errors.push('Timeline data is invalid.')
    return
  }
  const trackIds = (value.tracks as unknown[]).map((track) => isRecord(track) ? track.id : null)
  if (trackIds.some((id) => !stringField(id)) || new Set(trackIds.filter((id): id is string => typeof id === 'string')).size !== trackIds.length) errors.push('Timeline track IDs must be unique.')
  ;(value.tracks as unknown[]).forEach((track, index) => validateTrack(track, `timeline.tracks[${index}]`, ids, actorIds, propIds, wallIds, openingIds, sunIds, cameraIds, groupIds, errors))
}

function validateTrack(value: unknown, path: string, ids: Set<string>, actorIds: Set<string>, propIds: Set<string>, wallIds: Set<string>, openingIds: Set<string>, sunIds: Set<string>, cameraIds: Set<string>, groupIds: Set<string>, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.entityId) || !ids.has(value.entityId) || !['Actor', 'Prop', 'Wall', 'Opening', 'Sun', 'Camera', 'Group'].includes(String(value.entityType)) || !['position', 'heading', 'rotation', 'scale', 'focalLengthMm', 'openAngle', 'azimuth', 'elevation', 'intensity', 'color'].includes(String(value.property)) || !Array.isArray(value.keyframes)) {
    errors.push(`${path} is not a valid Timeline track.`)
    return
  }
  if ((value.entityType === 'Actor' && !actorIds.has(value.entityId)) || (value.entityType === 'Prop' && !propIds.has(value.entityId)) || (value.entityType === 'Wall' && !wallIds.has(value.entityId)) || (value.entityType === 'Opening' && !openingIds.has(value.entityId)) || (value.entityType === 'Sun' && !sunIds.has(value.entityId)) || (value.entityType === 'Camera' && !cameraIds.has(value.entityId)) || (value.entityType === 'Group' && !groupIds.has(value.entityId))) errors.push(`${path} references the wrong entity type.`)
  const invalidProperty = value.entityType === 'Actor' ? ['focalLengthMm', 'openAngle', 'azimuth', 'elevation', 'intensity', 'color'].includes(String(value.property))
    : value.entityType === 'Prop' || value.entityType === 'Wall' ? ['heading', 'focalLengthMm', 'openAngle', 'azimuth', 'elevation', 'intensity', 'color'].includes(String(value.property))
      : value.entityType === 'Opening' ? ['heading', 'focalLengthMm', 'position', 'azimuth', 'elevation', 'intensity', 'color'].includes(String(value.property))
        : value.entityType === 'Sun' ? !['azimuth', 'elevation', 'intensity', 'color'].includes(String(value.property))
        : value.entityType === 'Camera' ? ['heading', 'openAngle', 'azimuth', 'elevation', 'intensity', 'color', 'scale'].includes(String(value.property))
          : value.entityType === 'Group' ? !['position', 'rotation'].includes(String(value.property)) : false
  if (invalidProperty) errors.push(`${path} uses an invalid property for its entity type.`)
  const keyframeIds = (value.keyframes as unknown[]).map((keyframe) => isRecord(keyframe) ? keyframe.id : null)
  if (keyframeIds.some((id) => !stringField(id)) || new Set(keyframeIds.filter((id): id is string => typeof id === 'string')).size !== keyframeIds.length) errors.push(`${path} keyframe IDs must be unique.`)
  ;(value.keyframes as unknown[]).forEach((keyframe, index) => validateKeyframe(keyframe, `${path}.keyframes[${index}]`, errors))
}

function validateKeyframe(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !positiveOrZeroInteger(value.frame) || !['linear', 'hold'].includes(String(value.interpolation)) || (value.easeIn !== undefined && typeof value.easeIn !== 'boolean') || (value.easeOut !== undefined && typeof value.easeOut !== 'boolean') || !(finiteNumber(value.value) || typeof value.value === 'string' || vector3(value.value))) errors.push(`${path} is not a valid keyframe.`)
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function stringField(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function finiteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) }
function positiveNumber(value: unknown): value is number { return finiteNumber(value) && value > 0 }
function positiveInteger(value: unknown): value is number { return positiveNumber(value) && Number.isInteger(value) }
function positiveOrZeroInteger(value: unknown): value is number { return finiteNumber(value) && Number.isInteger(value) && value >= 0 }
function integerFields(value: Record<string, unknown>, fields: string[]): boolean { return fields.every((field) => positiveOrZeroInteger(value[field])) }
function vector3(value: unknown): value is [number, number, number] { return Array.isArray(value) && value.length === 3 && value.every((item) => finiteNumber(item)) }
function positiveRational(value: unknown): value is { numerator: number; denominator: number } { return isRecord(value) && positiveInteger(value.numerator) && positiveInteger(value.denominator) }
