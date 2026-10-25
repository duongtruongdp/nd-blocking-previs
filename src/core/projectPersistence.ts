import { normalizeSceneDocument, prepareSceneForSave, validateSceneDocument } from './scenePersistence'
import type { ProjectDocument, ProjectCameraDefaults } from './projectDocument'
import { CAMERA_DATABASE, resolveCameraDefinition } from './cameraDatabase'
import { normalizeShotDocuments } from './shotDocument'
import { normalizeMasterSequence } from './masterSequence'
import { normalizeShotListSettings } from './shotListSettings'

export const NDBLOCK_FORMAT = 'ndblock' as const
export const CURRENT_NDBLOCK_VERSION = 1

export type NdblockFile = {
  format: typeof NDBLOCK_FORMAT
  version: number
  project: ProjectDocument
}

export type ProjectFileErrorCode = 'invalid-json' | 'invalid-file' | 'unsupported-newer-version' | 'invalid-project'

export class ProjectFileError extends Error {
  readonly code: ProjectFileErrorCode

  constructor(code: ProjectFileErrorCode, message: string) {
    super(message)
    this.name = 'ProjectFileError'
    this.code = code
  }
}

export function prepareProjectForSave(project: ProjectDocument, savedAt = new Date().toISOString()): ProjectDocument {
  const shots = normalizeShotDocuments(project.shots)
  const settings = isRecord(project) && isRecord(project.settings) ? { ...project.settings, shotList: normalizeShotListSettings(project.settings.shotList) } : { shotList: normalizeShotListSettings(undefined) }
  return {
    ...project,
    updatedAt: savedAt,
    scenes: project.scenes.map((entry) => ({ ...entry, scene: prepareSceneForSave(entry.scene, savedAt) })),
    shots,
    activeShotId: shots.some((shot) => shot.id === project.activeShotId) ? project.activeShotId : null,
    masterSequence: normalizeMasterSequence(project.masterSequence),
    settings,
    cameraDefaults: normalizeCameraDefaults(project),
  }
}

export function serializeProject(project: ProjectDocument, savedAt?: string): string {
  const prepared = prepareProjectForSave(project, savedAt)
  const errors = validateProjectDocument(prepared)
  if (errors.length > 0) throw new ProjectFileError('invalid-project', errors[0])
  const file: NdblockFile = { format: NDBLOCK_FORMAT, version: CURRENT_NDBLOCK_VERSION, project: prepared }
  return JSON.stringify(file, null, 2)
}

export function parseProjectFile(text: string): ProjectDocument {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch {
    throw new ProjectFileError('invalid-json', 'This Project file could not be opened.')
  }
  const migrated = migrateProjectFile(value)
  const errors = validateProjectDocument(migrated.project)
  if (errors.length > 0) throw new ProjectFileError('invalid-project', errors[0])
  return migrated.project
}

export function migrateProjectFile(value: unknown): NdblockFile {
  if (!isRecord(value) || value.format !== NDBLOCK_FORMAT || !Number.isInteger(value.version) || !('project' in value)) {
    throw new ProjectFileError('invalid-file', 'This file is not a valid .ndblock Project file.')
  }
  const version = value.version as number
  if (version > CURRENT_NDBLOCK_VERSION) throw new ProjectFileError('unsupported-newer-version', 'This Project file was created by an unsupported newer version.')
  if (version !== CURRENT_NDBLOCK_VERSION) throw new ProjectFileError('invalid-file', 'This Project file version is not supported.')
  const project = value.project as ProjectDocument
  const shots = normalizeShotDocuments(isRecord(project) ? project.shots : [])
  const masterSequence = normalizeMasterSequence(isRecord(project) ? project.masterSequence : undefined)
  const activeShotId = isRecord(project) && typeof project.activeShotId === 'string' && shots.some((shot) => shot.id === project.activeShotId) ? project.activeShotId : null
  const settings = isRecord(project) && isRecord(project.settings) ? { ...project.settings, shotList: normalizeShotListSettings(project.settings.shotList) } : { shotList: normalizeShotListSettings(undefined) }
  const cameraDefaults = normalizeCameraDefaults(project)
  return {
    format: NDBLOCK_FORMAT,
    version: CURRENT_NDBLOCK_VERSION,
    project: { ...project, shots, activeShotId, masterSequence, settings, cameraDefaults, scenes: Array.isArray(project.scenes) ? project.scenes.map((entry) => ({ ...entry, scene: normalizeSceneDocument(entry.scene) })) : project.scenes },
  }
}

export function validateProjectDocument(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['Project data is missing.']
  if (!stringField(value.id) || !stringField(value.name) || !stringField(value.createdAt) || !stringField(value.updatedAt)) errors.push('Project metadata is incomplete.')
  if (!Array.isArray(value.scenes) || value.scenes.length === 0 || !stringField(value.activeSceneId) || !isRecord(value.settings)) errors.push('Project scenes or settings are incomplete.')
  if (!isRecord(value.cameraDefaults) || !stringField(value.cameraDefaults.cameraModelId)) errors.push('Project Camera Defaults are incomplete.')
  if (errors.length > 0) return errors
  const scenes = value.scenes as unknown[]
  const sceneIds = scenes.map((entry) => isRecord(entry) ? entry.id : null)
  if (sceneIds.some((id) => !stringField(id)) || new Set(sceneIds.filter((id): id is string => typeof id === 'string')).size !== sceneIds.length) errors.push('Project Scene IDs must be unique.')
  if (!sceneIds.includes(value.activeSceneId)) errors.push('Active Scene does not resolve to a Project Scene.')
  scenes.forEach((entry, index) => validateProjectSceneEntry(entry, `scenes[${index}]`, errors))
  if (value.shots !== undefined && !Array.isArray(value.shots)) errors.push('Project Shots are invalid.')
  if (Array.isArray(value.shots)) {
    const shots = value.shots as unknown[]
    const shotIds = shots.map((shot) => isRecord(shot) ? shot.id : null)
    if (shotIds.some((id) => !stringField(id)) || new Set(shotIds.filter((id): id is string => typeof id === 'string')).size !== shotIds.length) errors.push('Project Shot IDs must be unique.')
    shots.forEach((shot, index) => validateShot(shot, `shots[${index}]`, errors))
    if (value.activeShotId !== null && value.activeShotId !== undefined && !shotIds.includes(value.activeShotId)) errors.push('Active Shot does not resolve to a Project Shot.')
  }
  if (value.masterSequence !== undefined && (!isRecord(value.masterSequence) || !Array.isArray(value.masterSequence.clips))) errors.push('Project Master Sequence is invalid.')
  if (isRecord(value.masterSequence) && Array.isArray(value.masterSequence.clips)) {
    const clipIds = value.masterSequence.clips.map((clip) => isRecord(clip) ? clip.id : null)
    if (clipIds.some((id) => !stringField(id)) || new Set(clipIds.filter((id): id is string => typeof id === 'string')).size !== clipIds.length) errors.push('Master Clip IDs must be unique.')
    value.masterSequence.clips.forEach((clip, index) => validateMasterClip(clip, `masterSequence.clips[${index}]`, errors))
    validateMasterGraphics(value.masterSequence, errors)
  }
  return errors
}

export function projectFilename(name: string): string {
  const printableName = Array.from(name.trim(), (character) => character.charCodeAt(0) < 32 ? '_' : character).join('')
  const safeName = printableName.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^\.+|\.+$/g, '') || 'Untitled_Project'
  return `${safeName}.ndblock`
}

function validateProjectSceneEntry(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !isRecord(value.scene)) {
    errors.push(`${path} is not a valid Project Scene.`)
    return
  }
  const metadata = isRecord(value.scene.metadata) ? value.scene.metadata : null
  if (value.id !== metadata?.id) errors.push(`${path} ID must match its SceneDocument ID.`)
  errors.push(...validateSceneDocument(value.scene).map((error) => `${path}: ${error}`))
}

function validateShot(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.name) || !stringField(value.sceneId) || (value.cameraId !== null && value.cameraId !== undefined && !stringField(value.cameraId)) || !finiteNumber(value.startFrame) || !finiteNumber(value.endFrame) || Number(value.endFrame) <= Number(value.startFrame) || !finiteNumber(value.order) || typeof value.notes !== 'string' || (value.thumbnailFrame !== null && value.thumbnailFrame !== undefined && !finiteNumber(value.thumbnailFrame))) errors.push(`${path} is not a valid Project Shot.`)
}

function validateMasterClip(value: unknown, path: string, errors: string[]): void {
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.shotId) || !finiteNumber(value.sourceStartFrame) || !finiteNumber(value.sourceEndFrame) || Number(value.sourceEndFrame) <= Number(value.sourceStartFrame) || (value.startMasterFrame !== undefined && (!finiteNumber(value.startMasterFrame) || Number(value.startMasterFrame) < 0)) || !finiteNumber(value.order)) errors.push(`${path} is not a valid Master Clip.`)
}

function validateMasterGraphics(sequence: Record<string, unknown>, errors: string[]): void {
  if (sequence.graphicsTracks !== undefined && !Array.isArray(sequence.graphicsTracks)) errors.push('Project Graphics Tracks are invalid.')
  if (sequence.imageAssets !== undefined && !Array.isArray(sequence.imageAssets)) errors.push('Project Image Assets are invalid.')
  if (sequence.imageClips !== undefined && !Array.isArray(sequence.imageClips)) errors.push('Project Image Clips are invalid.')
  if (Array.isArray(sequence.graphicsTracks)) {
    const ids = sequence.graphicsTracks.map((track) => isRecord(track) ? track.id : null)
    if (ids.some((id) => !stringField(id)) || new Set(ids.filter((id): id is string => typeof id === 'string')).size !== ids.length) errors.push('Graphics Track IDs must be unique.')
  }
  if (Array.isArray(sequence.imageAssets)) {
    const ids = sequence.imageAssets.map((asset) => isRecord(asset) ? asset.id : null)
    if (ids.some((id) => !stringField(id)) || new Set(ids.filter((id): id is string => typeof id === 'string')).size !== ids.length) errors.push('Image Asset IDs must be unique.')
    sequence.imageAssets.forEach((asset, index) => {
      if (!isRecord(asset) || !stringField(asset.id) || !stringField(asset.fileName) || !stringField(asset.mimeType) || !finiteNumber(asset.sizeBytes) || !finiteNumber(asset.width) || !finiteNumber(asset.height) || Number(asset.width) <= 0 || Number(asset.height) <= 0) errors.push(`masterSequence.imageAssets[${index}] is not a valid Image Asset.`)
    })
  }
  if (Array.isArray(sequence.imageClips)) {
    const ids = sequence.imageClips.map((clip) => isRecord(clip) ? clip.id : null)
    if (ids.some((id) => !stringField(id)) || new Set(ids.filter((id): id is string => typeof id === 'string')).size !== ids.length) errors.push('Image Clip IDs must be unique.')
    sequence.imageClips.forEach((clip, index) => {
      if (!isRecord(clip) || !stringField(clip.id) || !stringField(clip.trackId) || !stringField(clip.assetId) || !finiteNumber(clip.startMasterFrame) || !finiteNumber(clip.durationFrames) || Number(clip.durationFrames) <= 0 || !finiteNumber(clip.positionX) || !finiteNumber(clip.positionY) || !finiteNumber(clip.scale) || Number(clip.scale) <= 0 || !finiteNumber(clip.rotation) || !finiteNumber(clip.opacity) || !finiteNumber(clip.fadeInFrames) || !finiteNumber(clip.fadeOutFrames)) errors.push(`masterSequence.imageClips[${index}] is not a valid Image Clip.`)
    })
  }
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Project defaults were added after the first .ndblock format. Resolve them
 * at the persistence boundary so legacy and stale projects remain readable
 * without rewriting any existing CameraDocument.
 */
export function normalizeCameraDefaults(project: unknown): ProjectCameraDefaults {
  if (!isRecord(project)) return { cameraModelId: CAMERA_DATABASE[0]?.id ?? '' }
  const requested = isRecord(project.cameraDefaults) && stringField(project.cameraDefaults.cameraModelId) ? project.cameraDefaults.cameraModelId : null
  if (requested && resolveCameraDefinition(requested)) return { cameraModelId: requested }

  const scenes = Array.isArray(project.scenes) ? project.scenes : []
  const activeSceneId = stringField(project.activeSceneId) ? project.activeSceneId : null
  const activeEntry = scenes.find((entry) => isRecord(entry) && entry.id === activeSceneId)
  const orderedEntries = activeEntry ? [activeEntry, ...scenes.filter((entry) => entry !== activeEntry)] : scenes
  for (const entry of orderedEntries) {
    if (!isRecord(entry) || !isRecord(entry.scene) || !Array.isArray(entry.scene.cameras)) continue
    const cameras = entry.scene.cameras
    const activeCameraId = stringField(entry.scene.activeCameraId) ? entry.scene.activeCameraId : null
    const primary = activeCameraId ? cameras.find((camera) => isRecord(camera) && camera.id === activeCameraId) : undefined
    const candidates = primary ? [primary, ...cameras.filter((camera) => camera !== primary)] : cameras
    const existing = candidates.find((camera) => isRecord(camera) && stringField(camera.cameraDefinitionId) && resolveCameraDefinition(camera.cameraDefinitionId))
    if (existing && isRecord(existing) && stringField(existing.cameraDefinitionId)) return { cameraModelId: existing.cameraDefinitionId }
  }
  return { cameraModelId: CAMERA_DATABASE[0]?.id ?? '' }
}
