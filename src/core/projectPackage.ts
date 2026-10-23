import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import type { MasterMusicClipDocument } from './masterSequence'
import type { ProjectDocument } from './projectDocument'
import { CURRENT_NDBLOCK_VERSION, parseProjectFile, projectFilename, serializeProject } from './projectPersistence'

export const NDPACK_FORMAT = 'nd-blocking-previs.ndpack' as const
export const CURRENT_NDPACK_VERSION = 1
export const PROJECT_PACKAGE_DOCUMENT_PATH = 'project.ndblock'
export const PROJECT_PACKAGE_MANIFEST_PATH = 'manifest.json'

export const PROJECT_PACKAGE_LIMITS = {
  maxArchiveBytes: 768 * 1024 * 1024,
  maxEntryBytes: 512 * 1024 * 1024,
  maxExpandedBytes: 1024 * 1024 * 1024,
  maxEntries: 2048,
  maxAssets: 512,
} as const

export type ProjectPackageAssetKind = 'image' | 'audio'

export type ProjectPackageAsset = {
  id: string
  kind: ProjectPackageAssetKind
  originalFileName: string
  mimeType: string
  byteSize: number
  sha256: string
  path: string
  references: {
    imageClipIds?: string[]
    musicClipIds?: string[]
  }
}

export type ProjectPackageManifest = {
  format: typeof NDPACK_FORMAT
  version: number
  project: {
    id: string
    name: string
    schemaVersion: number
    createdAt: string
    updatedAt: string
  }
  documentPath: typeof PROJECT_PACKAGE_DOCUMENT_PATH
  assets: ProjectPackageAsset[]
}

export type ProjectPackageBuildResult = {
  data: Uint8Array
  manifest: ProjectPackageManifest
  assetCount: number
}

export type ProjectPackageMedia = {
  entry: ProjectPackageAsset
  bytes: Uint8Array
}

export type ParsedProjectPackage = {
  project: ProjectDocument
  manifest: ProjectPackageManifest
  media: ProjectPackageMedia[]
}

export type ProjectPackageErrorCode =
  | 'invalid-archive'
  | 'unsafe-archive'
  | 'invalid-manifest'
  | 'invalid-document'
  | 'unsupported-version'
  | 'missing-media'
  | 'checksum-mismatch'
  | 'media-limit'
  | 'restore-failed'

export class ProjectPackageError extends Error {
  readonly code: ProjectPackageErrorCode
  readonly assetId?: string
  readonly assetName?: string

  constructor(code: ProjectPackageErrorCode, message: string, options?: { assetId?: string; assetName?: string; cause?: unknown }) {
    super(message, options)
    this.name = 'ProjectPackageError'
    this.code = code
    this.assetId = options?.assetId
    this.assetName = options?.assetName
  }
}

export class ProjectPackageMediaError extends ProjectPackageError {
  readonly kind: ProjectPackageAssetKind
  readonly referenceCount: number

  constructor(kind: ProjectPackageAssetKind, asset: { id: string; fileName: string }, referenceCount: number) {
    super('missing-media', `Media is unavailable: ${asset.fileName}. It is referenced ${referenceCount} time${referenceCount === 1 ? '' : 's'} in the Project.`, { assetId: asset.id, assetName: asset.fileName })
    this.kind = kind
    this.referenceCount = referenceCount
  }
}

export type ProjectPackageMediaLoader = (kind: ProjectPackageAssetKind, assetId: string) => Promise<Blob | null>

export function projectPackageFilename(name: string): string {
  return projectFilename(name).replace(/\.ndblock$/i, '.ndpack')
}

export function isProjectPackageName(name: string): boolean {
  return name.trim().toLowerCase().endsWith('.ndpack')
}

export function isProjectPackagePath(path: string): boolean {
  return isProjectPackageName(path)
}

export async function buildProjectPackage(project: ProjectDocument, loadMedia: ProjectPackageMediaLoader): Promise<ProjectPackageBuildResult> {
  const imageAssets = project.masterSequence.imageAssets ?? []
  const imageClips = project.masterSequence.imageClips ?? []
  const musicClip = project.masterSequence.musicClip ?? null
  const entries: ProjectPackageAsset[] = []
  const binaries: Record<string, Uint8Array> = {}
  const binaryByHash = new Map<string, string>()
  const documentText = serializeProject(project, project.updatedAt)

  const referencedImageIds = new Set(imageClips.map((clip) => clip.assetId))
  const knownImageIds = new Set(imageAssets.map((asset) => asset.id))
  const missingImageMetadata = [...referencedImageIds].filter((assetId) => !knownImageIds.has(assetId))
  if (missingImageMetadata.length > 0) throw new ProjectPackageError('missing-media', `The Project references image assets without metadata: ${missingImageMetadata.join(', ')}.`)
  for (const asset of imageAssets) {
    if (!referencedImageIds.has(asset.id)) continue
    const references = imageClips.filter((clip) => clip.assetId === asset.id).map((clip) => clip.id)
    const blob = await loadMedia('image', asset.id)
    if (!blob) throw new ProjectPackageMediaError('image', asset, references.length)
    const bytes = await blobBytes(blob, asset.id, asset.fileName)
    const sha256 = await sha256Hex(bytes)
    const path = addBinary(binaries, binaryByHash, 'image', asset, bytes, sha256)
    entries.push({ id: asset.id, kind: 'image', originalFileName: asset.fileName, mimeType: asset.mimeType, byteSize: bytes.byteLength, sha256, path, references: { imageClipIds: references } })
  }

  if (musicClip) {
    const blob = await loadMedia('audio', musicClip.asset.id)
    if (!blob) throw new ProjectPackageMediaError('audio', musicClip.asset, 1)
    const bytes = await blobBytes(blob, musicClip.asset.id, musicClip.asset.fileName)
    const sha256 = await sha256Hex(bytes)
    const path = addBinary(binaries, binaryByHash, 'audio', musicClip.asset, bytes, sha256)
    entries.push({ id: musicClip.asset.id, kind: 'audio', originalFileName: musicClip.asset.fileName, mimeType: musicClip.asset.mimeType, byteSize: bytes.byteLength, sha256, path, references: { musicClipIds: [musicClip.id] } })
  }

  if (entries.length > PROJECT_PACKAGE_LIMITS.maxAssets) throw new ProjectPackageError('media-limit', 'This Project contains too many referenced media assets to package.')
  const manifest: ProjectPackageManifest = {
    format: NDPACK_FORMAT,
    version: CURRENT_NDPACK_VERSION,
    project: { id: project.id, name: project.name, schemaVersion: CURRENT_NDBLOCK_VERSION, createdAt: project.createdAt, updatedAt: project.updatedAt },
    documentPath: PROJECT_PACKAGE_DOCUMENT_PATH,
    assets: entries,
  }
  const manifestText = JSON.stringify(manifest, null, 2)
  const archive = zipSync({ [PROJECT_PACKAGE_DOCUMENT_PATH]: strToU8(documentText), [PROJECT_PACKAGE_MANIFEST_PATH]: strToU8(manifestText), ...binaries }, { level: 6 })
  if (archive.byteLength === 0) throw new ProjectPackageError('invalid-archive', 'The Project Package was empty.')
  if (archive.byteLength > PROJECT_PACKAGE_LIMITS.maxArchiveBytes) throw new ProjectPackageError('media-limit', 'The Project Package is too large to save safely.')
  return { data: archive, manifest, assetCount: entries.length }
}

export async function parseProjectPackage(data: Uint8Array): Promise<ParsedProjectPackage> {
  const archiveEntries = inspectZip(data)
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(data)
  } catch (error: unknown) {
    throw new ProjectPackageError('invalid-archive', 'This Project Package could not be decompressed.', { cause: error })
  }
  const manifestBytes = files[PROJECT_PACKAGE_MANIFEST_PATH]
  const documentBytes = files[PROJECT_PACKAGE_DOCUMENT_PATH]
  if (!manifestBytes || !documentBytes) throw new ProjectPackageError('invalid-archive', 'The Project Package is missing its manifest or Project document.')
  let manifest: ProjectPackageManifest
  try {
    manifest = validateManifest(JSON.parse(strFromU8(manifestBytes)) as unknown, archiveEntries)
  } catch (error: unknown) {
    if (error instanceof ProjectPackageError) throw error
    throw new ProjectPackageError('invalid-manifest', 'The Project Package manifest is invalid.', { cause: error })
  }
  let project: ProjectDocument
  try {
    project = parseProjectFile(strFromU8(documentBytes))
  } catch (error: unknown) {
    throw new ProjectPackageError('invalid-document', error instanceof Error ? error.message : 'The Project document inside the package is invalid.', { cause: error })
  }
  if (project.id !== manifest.project.id) throw new ProjectPackageError('invalid-manifest', 'The package manifest does not match its Project document.')

  const media: ProjectPackageMedia[] = []
  for (const entry of manifest.assets) {
    const bytes = files[entry.path]
    if (!bytes) throw new ProjectPackageError('invalid-archive', `The package is missing media entry ${entry.path}.`)
    if (bytes.byteLength !== entry.byteSize) throw new ProjectPackageError('checksum-mismatch', `The size of ${entry.originalFileName} does not match the manifest.`, { assetId: entry.id, assetName: entry.originalFileName })
    if (await sha256Hex(bytes) !== entry.sha256) throw new ProjectPackageError('checksum-mismatch', `The checksum of ${entry.originalFileName} does not match the manifest.`, { assetId: entry.id, assetName: entry.originalFileName })
    media.push({ entry, bytes })
  }
  return { project, manifest, media }
}

export type ProjectPackageStorage = {
  load: (projectId: string, kind: ProjectPackageAssetKind, assetId: string) => Promise<Blob | null>
  save: (projectId: string, kind: ProjectPackageAssetKind, assetId: string, blob: Blob) => Promise<boolean>
  remove: (projectId: string, kind: ProjectPackageAssetKind, assetId: string) => Promise<void>
}

export type ProjectPackageImportPlan = {
  project: ProjectDocument
  media: Array<ProjectPackageMedia & { targetId: string; reuseExisting: boolean }>
}

export async function prepareProjectPackageImport(parsed: ParsedProjectPackage, storage: ProjectPackageStorage): Promise<ProjectPackageImportPlan> {
  const projectId = parsed.project.id
  const usedImageIds = new Set<string>()
  const usedAudioIds = new Set<string>()
  const remaps = new Map<string, string>()
  const media: ProjectPackageImportPlan['media'] = []

  for (const item of parsed.media) {
    const existing = await storage.load(projectId, item.entry.kind, item.entry.id)
    const sameContent = existing ? await sha256Hex(await existing.arrayBuffer().then((buffer) => new Uint8Array(buffer))) === item.entry.sha256 : false
    if (sameContent) {
      media.push({ ...item, targetId: item.entry.id, reuseExisting: true })
      continue
    }
    const ids = item.entry.kind === 'image' ? usedImageIds : usedAudioIds
    let targetId = item.entry.id
    if (existing || ids.has(targetId)) {
      targetId = `${item.entry.id}-import-${item.entry.sha256.slice(0, 10)}`
      let suffix = 2
      while (ids.has(targetId)) targetId = `${item.entry.id}-import-${item.entry.sha256.slice(0, 10)}-${suffix++}`
    }
    ids.add(targetId)
    remaps.set(`${item.entry.kind}:${item.entry.id}`, targetId)
    media.push({ ...item, targetId, reuseExisting: false })
  }

  const projectWithRemappedIds = remapProjectMediaIds(parsed.project, remaps)
  return { project: projectWithRemappedIds, media }
}

export async function restoreProjectPackageMedia(plan: ProjectPackageImportPlan, storage: ProjectPackageStorage): Promise<void> {
  const created: Array<{ kind: ProjectPackageAssetKind; id: string }> = []
  try {
    for (const item of plan.media) {
      if (item.reuseExisting) continue
      const blob = new Blob([item.bytes.slice().buffer], { type: item.entry.mimeType || 'application/octet-stream' })
      const stored = await storage.save(plan.project.id, item.entry.kind, item.targetId, blob)
      if (!stored) throw new ProjectPackageError('restore-failed', `Media could not be restored: ${item.entry.originalFileName}.`, { assetId: item.targetId, assetName: item.entry.originalFileName })
      created.push({ kind: item.entry.kind, id: item.targetId })
    }
  } catch (error: unknown) {
    await Promise.all(created.map((item) => storage.remove(plan.project.id, item.kind, item.id).catch(() => undefined)))
    if (error instanceof ProjectPackageError) throw error
    throw new ProjectPackageError('restore-failed', 'The Project Package could not be restored transactionally.', { cause: error })
  }
}

function remapProjectMediaIds(project: ProjectDocument, remaps: ReadonlyMap<string, string>): ProjectDocument {
  const imageAssets = (project.masterSequence.imageAssets ?? []).map((asset) => ({ ...asset, id: remaps.get(`image:${asset.id}`) ?? asset.id }))
  const imageClips = (project.masterSequence.imageClips ?? []).map((clip) => ({ ...clip, assetId: remaps.get(`image:${clip.assetId}`) ?? clip.assetId }))
  const sourceMusic = project.masterSequence.musicClip
  const musicClip: MasterMusicClipDocument | null | undefined = sourceMusic ? (() => {
    const id = remaps.get(`audio:${sourceMusic.asset.id}`) ?? sourceMusic.asset.id
    return { ...sourceMusic, asset: { ...sourceMusic.asset, id } }
  })() : sourceMusic
  return { ...project, masterSequence: { ...project.masterSequence, imageAssets, imageClips, musicClip } }
}

function addBinary(binaries: Record<string, Uint8Array>, binaryByHash: Map<string, string>, kind: ProjectPackageAssetKind, asset: { id: string; fileName: string }, bytes: Uint8Array, hash: string): string {
  const hashKey = `${kind}:${hash}`
  const existing = binaryByHash.get(hashKey)
  if (existing) return existing
  const directory = kind === 'image' ? 'media/images' : 'media/audio'
  const path = `${directory}/${sanitizePackageFileName(asset.id)}-${sanitizePackageFileName(asset.fileName)}`
  const uniquePath = binaries[path] ? `${path}-${hash.slice(0, 8)}` : path
  binaries[uniquePath] = bytes
  binaryByHash.set(hashKey, uniquePath)
  return uniquePath
}

async function blobBytes(blob: Blob, assetId: string, assetName: string): Promise<Uint8Array> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.byteLength > PROJECT_PACKAGE_LIMITS.maxEntryBytes) throw new ProjectPackageError('media-limit', `Media is too large to package: ${assetName}.`, { assetId, assetName })
  return bytes
}

function sanitizePackageFileName(value: string): string {
  const basename = value.replace(/\\/g, '/').split('/').pop() ?? 'asset'
  return Array.from(basename, (character) => character.charCodeAt(0) < 32 ? '_' : character).join('').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+|\.+$/g, '') || 'asset'
}

function validateManifest(value: unknown, archiveEntries: ReadonlySet<string>): ProjectPackageManifest {
  if (!isRecord(value) || value.format !== NDPACK_FORMAT || value.documentPath !== PROJECT_PACKAGE_DOCUMENT_PATH || !isRecord(value.project) || !Array.isArray(value.assets)) throw new ProjectPackageError('invalid-manifest', 'The Project Package manifest is not supported.')
  if (value.version !== CURRENT_NDPACK_VERSION) throw new ProjectPackageError(typeof value.version === 'number' && value.version > CURRENT_NDPACK_VERSION ? 'unsupported-version' : 'invalid-manifest', 'The Project Package version is not supported.')
  const project = value.project
  if (!stringValue(project.id) || !stringValue(project.name) || !stringValue(project.createdAt) || !stringValue(project.updatedAt) || project.schemaVersion !== CURRENT_NDBLOCK_VERSION) throw new ProjectPackageError('invalid-manifest', 'The Project Package project metadata is invalid.')
  if (value.assets.length > PROJECT_PACKAGE_LIMITS.maxAssets) throw new ProjectPackageError('media-limit', 'The Project Package contains too many media assets.')
  const ids = new Set<string>()
  const assets = value.assets.map((candidate) => {
    if (!isRecord(candidate) || !stringValue(candidate.id) || !stringValue(candidate.originalFileName) || !stringValue(candidate.mimeType) || !stringValue(candidate.path) || !isRecord(candidate.references)) throw new ProjectPackageError('invalid-manifest', 'A Project Package media entry is invalid.')
    const kind: ProjectPackageAssetKind = candidate.kind === 'image' ? 'image' : candidate.kind === 'audio' ? 'audio' : (() => { throw new ProjectPackageError('invalid-manifest', 'A Project Package media entry has an invalid kind.') })()
    const byteSize = typeof candidate.byteSize === 'number' ? candidate.byteSize : NaN
    if (!Number.isInteger(byteSize) || byteSize < 0 || byteSize > PROJECT_PACKAGE_LIMITS.maxEntryBytes || !/^[a-f0-9]{64}$/.test(String(candidate.sha256))) throw new ProjectPackageError('invalid-manifest', 'A Project Package media entry is invalid.')
    const sha256 = String(candidate.sha256)
    if (ids.has(candidate.id)) throw new ProjectPackageError('invalid-manifest', `Duplicate media asset ID: ${candidate.id}.`)
    ids.add(candidate.id)
    if (!archiveEntries.has(candidate.path) || !isPackageMediaPath(candidate.path, kind)) throw new ProjectPackageError('invalid-manifest', `Invalid media path: ${candidate.path}.`)
    return { id: candidate.id, kind, originalFileName: candidate.originalFileName, mimeType: candidate.mimeType, byteSize, sha256, path: candidate.path, references: { imageClipIds: stringArray(candidate.references.imageClipIds), musicClipIds: stringArray(candidate.references.musicClipIds) } }
  })
  return { format: NDPACK_FORMAT, version: CURRENT_NDPACK_VERSION, project: { id: project.id, name: project.name, schemaVersion: project.schemaVersion, createdAt: project.createdAt, updatedAt: project.updatedAt }, documentPath: PROJECT_PACKAGE_DOCUMENT_PATH, assets }
}

function inspectZip(data: Uint8Array): ReadonlySet<string> {
  if (data.byteLength < 22 || data.byteLength > PROJECT_PACKAGE_LIMITS.maxArchiveBytes) throw new ProjectPackageError('media-limit', 'This Project Package exceeds the safe archive size limit.')
  const eocd = findEndOfCentralDirectory(data)
  if (eocd < 0) throw new ProjectPackageError('invalid-archive', 'This file is not a valid ZIP Project Package.')
  const count = readU16(data, eocd + 10)
  const centralSize = readU32(data, eocd + 12)
  const centralOffset = readU32(data, eocd + 16)
  const commentLength = readU16(data, eocd + 20)
  if (eocd + 22 + commentLength !== data.byteLength || count > PROJECT_PACKAGE_LIMITS.maxEntries || centralOffset + centralSize > data.byteLength) throw new ProjectPackageError('unsafe-archive', 'The Project Package ZIP directory is invalid or too large.')
  const names = new Set<string>()
  let offset = centralOffset
  let total = 0
  for (let index = 0; index < count; index += 1) {
    if (readU32(data, offset) !== 0x02014b50) throw new ProjectPackageError('invalid-archive', 'The Project Package contains an invalid ZIP entry.')
    const compression = readU16(data, offset + 10)
    const compressedSize = readU32(data, offset + 20)
    const originalSize = readU32(data, offset + 24)
    const nameLength = readU16(data, offset + 28)
    const extraLength = readU16(data, offset + 30)
    const entryCommentLength = readU16(data, offset + 32)
    const localOffset = readU32(data, offset + 42)
    const end = offset + 46 + nameLength + extraLength + entryCommentLength
    if (end > data.byteLength || compression !== 0 && compression !== 8 || originalSize > PROJECT_PACKAGE_LIMITS.maxEntryBytes || compressedSize > data.byteLength || localOffset >= data.byteLength) throw new ProjectPackageError('unsafe-archive', 'The Project Package contains an unsafe ZIP entry.')
    let name: string
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(data.slice(offset + 46, offset + 46 + nameLength)) } catch { throw new ProjectPackageError('unsafe-archive', 'The Project Package contains an invalid ZIP path.') }
    if (!isSafePackagePath(name) || names.has(name) || (name !== PROJECT_PACKAGE_DOCUMENT_PATH && name !== PROJECT_PACKAGE_MANIFEST_PATH && !name.startsWith('media/images/') && !name.startsWith('media/audio/'))) throw new ProjectPackageError('unsafe-archive', 'The Project Package contains a duplicate, unsafe, or unsupported ZIP path.')
    names.add(name)
    total += originalSize
    if (total > PROJECT_PACKAGE_LIMITS.maxExpandedBytes) throw new ProjectPackageError('media-limit', 'The Project Package expands beyond the safe size limit.')
    offset = end
  }
  return names
}

function findEndOfCentralDirectory(data: Uint8Array): number {
  const start = Math.max(0, data.byteLength - 22 - 0xffff)
  for (let index = data.byteLength - 22; index >= start; index -= 1) if (readU32(data, index) === 0x06054b50) return index
  return -1
}

function readU16(data: Uint8Array, offset: number): number { return data[offset] | (data[offset + 1] << 8) }
function readU32(data: Uint8Array, offset: number): number { return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0 }

function isSafePackagePath(path: string): boolean {
  return Boolean(path) && !path.includes('\\') && !path.includes('\0') && !path.startsWith('/') && !path.split('/').some((part) => part === '' || part === '.' || part === '..')
}

function isPackageMediaPath(path: string, kind: ProjectPackageAssetKind): boolean {
  return isSafePackagePath(path) && (kind === 'image' ? path.startsWith('media/images/') : path.startsWith('media/audio/'))
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...value] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function stringValue(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new ProjectPackageError('invalid-archive', 'SHA-256 verification is unavailable in this runtime.')
  const digest = await subtle.digest('SHA-256', bytes.slice().buffer)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
