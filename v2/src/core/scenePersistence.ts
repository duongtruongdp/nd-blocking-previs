import { cameraDatabaseVersion, resolveCameraDefinition, resolveCaptureMode } from './cameraDatabase'
import { normalizeFrameGuideColor } from './frameGuides'
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
  if (version === CURRENT_NDSCENE_VERSION) return { format: NDSCENE_FORMAT, version: CURRENT_NDSCENE_VERSION, scene: value.scene as SceneDocument }
  if (version === 0) return { format: NDSCENE_FORMAT, version: CURRENT_NDSCENE_VERSION, scene: migrateVersionZeroScene(value.scene) }
  throw new SceneFileError('invalid-file', 'This scene file version is not supported.')
}

export function validateSceneDocument(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['Scene data is missing.']
  if (value.schemaVersion !== 'ndscene-v2') errors.push('Scene schema version is not supported.')
  if (!isRecord(value.metadata) || !stringField(value.metadata.id) || !stringField(value.metadata.name) || !stringField(value.metadata.createdAt) || !stringField(value.metadata.updatedAt)) errors.push('Scene metadata is incomplete.')
  if (!isRecord(value.stage) || !stringField(value.stage.name) || !Array.isArray(value.actors) || !Array.isArray(value.props) || !Array.isArray(value.cameras) || !Array.isArray(value.lights) || !isRecord(value.timeline)) errors.push('Scene collections or Stage metadata are incomplete.')
  if (errors.length > 0) return errors

  const actors = value.actors as unknown[]
  const props = value.props as unknown[]
  const cameras = value.cameras as unknown[]
  const ids = [...actors, ...props, ...cameras].map((entity) => isRecord(entity) ? entity.id : null)
  if (ids.some((id) => !stringField(id))) errors.push('Every scene entity needs a stable ID.')
  const validIds = ids.filter((id): id is string => typeof id === 'string')
  if (new Set(validIds).size !== validIds.length) errors.push('Scene entity IDs must be unique.')
  actors.forEach((actor, index) => validateActor(actor, `actors[${index}]`, errors))
  props.forEach((prop, index) => validateProp(prop, `props[${index}]`, errors))
  cameras.forEach((camera, index) => validateCamera(camera, `cameras[${index}]`, errors))
  if (value.activeCameraId !== null && (!stringField(value.activeCameraId) || !cameras.some((camera) => isRecord(camera) && camera.id === value.activeCameraId))) errors.push('Active Camera does not resolve to a Camera in the scene.')
  validateTimeline(value.timeline as Record<string, unknown>, new Set(validIds), new Set(actors.flatMap((actor) => isRecord(actor) && typeof actor.id === 'string' ? [actor.id] : [])), new Set(props.flatMap((prop) => isRecord(prop) && typeof prop.id === 'string' ? [prop.id] : [])), new Set(cameras.flatMap((camera) => isRecord(camera) && typeof camera.id === 'string' ? [camera.id] : [])), errors)
  return errors
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
  return { ...value, cameras } as SceneDocument
}

function migrateGuide(value: unknown): unknown {
  if (!isRecord(value)) return value
  const legacyToken = value.colorToken
  const color = typeof value.color === 'string' ? value.color : legacyToken === 'accent' ? '#F0B866' : legacyToken === 'muted' ? '#AAB6C9' : '#D7DDE8'
  return { ...value, color: normalizeFrameGuideColor(color) }
}

function validateActor(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !vector3(value.position) || !vector3(value.rotation) || !vector3(value.scale) || !isRecord(value.appearance) || value.appearance.bodyVariant !== 'neutral' || !stringField(value.appearance.primaryColor) || !isRecord(value.pose)) {
    errors.push(`${path} is not a valid Actor.`)
    return
  }
  Object.values(value.pose).forEach((joint) => { if (!vector3(joint)) errors.push(`${path}.pose contains an invalid joint value.`) })
}

function validateProp(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || value.type !== 'Prop' || !vector3(value.position) || !vector3(value.rotation) || !['cube', 'sphere', 'cylinder'].includes(String(value.shape)) || !stringField(value.primaryColor)) errors.push(`${path} is not a valid Prop.`)
}

function validateCamera(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !vector3(value.position) || !vector3(value.rotation) || !stringField(value.cameraDefinitionId) || !stringField(value.captureModeId) || !finiteNumber(value.focalLengthMm) || !['Spherical', 'Anamorphic'].includes(String(value.lensType)) || ![1, 1.3, 1.33, 1.5, 1.6, 1.8, 2].includes(Number(value.anamorphicSqueeze)) || !['sensor', '16:9', '1.85', '2.00', '2.39'].includes(String(value.deliveryAspectRatio)) || !Array.isArray(value.frameGuides)) {
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

function validateTimeline(value: Record<string, unknown>, ids: Set<string>, actorIds: Set<string>, propIds: Set<string>, cameraIds: Set<string>, errors: string[]): void {
  if (!positiveRational(value.frameRate) || !integerFields(value, ['currentFrame', 'startFrame', 'endFrame', 'markIn', 'markOut']) || !Array.isArray(value.tracks)) {
    errors.push('Timeline data is invalid.')
    return
  }
  const trackIds = (value.tracks as unknown[]).map((track) => isRecord(track) ? track.id : null)
  if (trackIds.some((id) => !stringField(id)) || new Set(trackIds.filter((id): id is string => typeof id === 'string')).size !== trackIds.length) errors.push('Timeline track IDs must be unique.')
  ;(value.tracks as unknown[]).forEach((track, index) => validateTrack(track, `timeline.tracks[${index}]`, ids, actorIds, propIds, cameraIds, errors))
}

function validateTrack(value: unknown, path: string, ids: Set<string>, actorIds: Set<string>, propIds: Set<string>, cameraIds: Set<string>, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.entityId) || !ids.has(value.entityId) || !['Actor', 'Prop', 'Camera'].includes(String(value.entityType)) || !['position', 'heading', 'rotation', 'focalLengthMm'].includes(String(value.property)) || !Array.isArray(value.keyframes)) {
    errors.push(`${path} is not a valid Timeline track.`)
    return
  }
  if ((value.entityType === 'Actor' && !actorIds.has(value.entityId)) || (value.entityType === 'Prop' && !propIds.has(value.entityId)) || (value.entityType === 'Camera' && !cameraIds.has(value.entityId))) errors.push(`${path} references the wrong entity type.`)
  if ((value.entityType === 'Actor' && value.property === 'focalLengthMm') || (value.entityType === 'Prop' && (value.property === 'heading' || value.property === 'focalLengthMm')) || (value.entityType === 'Camera' && value.property === 'heading')) errors.push(`${path} uses an invalid property for its entity type.`)
  const keyframeIds = (value.keyframes as unknown[]).map((keyframe) => isRecord(keyframe) ? keyframe.id : null)
  if (keyframeIds.some((id) => !stringField(id)) || new Set(keyframeIds.filter((id): id is string => typeof id === 'string')).size !== keyframeIds.length) errors.push(`${path} keyframe IDs must be unique.`)
  ;(value.keyframes as unknown[]).forEach((keyframe, index) => validateKeyframe(keyframe, `${path}.keyframes[${index}]`, errors))
}

function validateKeyframe(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !positiveOrZeroInteger(value.frame) || !['linear', 'hold'].includes(String(value.interpolation)) || !(finiteNumber(value.value) || vector3(value.value))) errors.push(`${path} is not a valid keyframe.`)
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
