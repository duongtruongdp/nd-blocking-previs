import { normalizeSceneDocument, prepareSceneForSave, validateSceneDocument } from './scenePersistence'
import type { ProjectDocument } from './projectDocument'
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
  return {
    format: NDBLOCK_FORMAT,
    version: CURRENT_NDBLOCK_VERSION,
    project: { ...project, shots, activeShotId, masterSequence, settings, scenes: Array.isArray(project.scenes) ? project.scenes.map((entry) => ({ ...entry, scene: normalizeSceneDocument(entry.scene) })) : project.scenes },
  }
}

export function validateProjectDocument(value: unknown): string[] {
  const errors: string[] = []
  if (!isRecord(value)) return ['Project data is missing.']
  if (!stringField(value.id) || !stringField(value.name) || !stringField(value.createdAt) || !stringField(value.updatedAt)) errors.push('Project metadata is incomplete.')
  if (!Array.isArray(value.scenes) || value.scenes.length === 0 || !stringField(value.activeSceneId) || !isRecord(value.settings)) errors.push('Project scenes or settings are incomplete.')
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
  if (!isRecord(value) || !stringField(value.id) || !stringField(value.shotId) || !finiteNumber(value.sourceStartFrame) || !finiteNumber(value.sourceEndFrame) || Number(value.sourceEndFrame) <= Number(value.sourceStartFrame) || !finiteNumber(value.order)) errors.push(`${path} is not a valid Master Clip.`)
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
