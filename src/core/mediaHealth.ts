import type { MasterImageAssetDocument, MasterImageClipDocument, MasterSequenceDocument } from './masterSequence'
import { loadImageAsset } from './imageAssetStore'

export type ImageAssetHealthStatus = 'available' | 'missing' | 'loading' | 'unsupported' | 'corrupt'

export type ImageAssetHealth = {
  assetId: string
  status: ImageAssetHealthStatus
  message: string
  width: number | null
  height: number | null
  actualMimeType: string | null
}

export type ImageAssetReference = {
  clipId: string
  trackId: string
  trackName: string
  startMasterFrame: number
  durationFrames: number
}

export type RelinkMatch = {
  assetId: string
  originalFileName: string
  candidates: File[]
  selectedIndex: number | null
  reason: 'exact-filename' | 'ambiguous' | 'unmatched'
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg'])

export function isSupportedImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) || /\.(png|jpe?g)$/i.test(file.name)
}

export function imageAssetReferences(sequence: MasterSequenceDocument, assetId: string): ImageAssetReference[] {
  const tracks = new Map((sequence.graphicsTracks ?? []).map((track) => [track.id, track.name]))
  return (sequence.imageClips ?? []).filter((clip) => clip.assetId === assetId).map((clip) => ({
    clipId: clip.id,
    trackId: clip.trackId,
    trackName: tracks.get(clip.trackId) ?? 'Missing Track',
    startMasterFrame: clip.startMasterFrame,
    durationFrames: clip.durationFrames,
  }))
}

export async function decodeImageBlob(blob: Blob, expectedMimeType?: string): Promise<{ width: number; height: number; actualMimeType: string }> {
  const blobName = 'name' in blob && typeof blob.name === 'string' ? blob.name : ''
  const inferredMimeType = /\.png$/i.test(blobName) ? 'image/png' : /\.jpe?g$/i.test(blobName) ? 'image/jpeg' : ''
  const actualMimeType = (blob.type || expectedMimeType || inferredMimeType).toLowerCase()
  if (!SUPPORTED_IMAGE_TYPES.has(actualMimeType)) throw new Error('Unsupported image format. Use PNG or JPEG.')
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    const result = { width: bitmap.width, height: bitmap.height, actualMimeType }
    bitmap.close()
    return result
  }
  if (typeof URL === 'undefined' || typeof Image === 'undefined') throw new Error('Image decoding is unavailable in this environment.')
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Image data could not be decoded.'))
      element.src = url
    })
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image data has no usable dimensions.')
    return { width: image.naturalWidth, height: image.naturalHeight, actualMimeType }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function resolveImageAssetHealth(projectId: string, asset: MasterImageAssetDocument, load = loadImageAsset): Promise<ImageAssetHealth> {
  if (!isSupportedImageFile({ name: asset.fileName, type: asset.mimeType })) return { assetId: asset.id, status: 'unsupported', message: 'Unsupported image format. Use PNG or JPEG.', width: null, height: null, actualMimeType: null }
  let blob: Blob | null
  try {
    blob = await load(projectId, asset.id)
  } catch {
    return { assetId: asset.id, status: 'loading', message: 'The image sidecar could not be read. Try Refresh.', width: null, height: null, actualMimeType: null }
  }
  if (!blob) return { assetId: asset.id, status: 'missing', message: 'No image sidecar is available for this asset.', width: null, height: null, actualMimeType: null }
  try {
    const decoded = await decodeImageBlob(blob, asset.mimeType)
    const metadataMismatch = asset.width > 0 && asset.height > 0 && (asset.width !== decoded.width || asset.height !== decoded.height)
    return { assetId: asset.id, status: 'available', message: metadataMismatch ? `Available; decoded ${decoded.width} × ${decoded.height}.` : 'Available', width: decoded.width, height: decoded.height, actualMimeType: decoded.actualMimeType }
  } catch (error: unknown) {
    return { assetId: asset.id, status: 'corrupt', message: error instanceof Error ? error.message : 'Image data could not be decoded.', width: null, height: null, actualMimeType: blob.type || null }
  }
}

export async function scanImageAssets(projectId: string, sequence: MasterSequenceDocument): Promise<ImageAssetHealth[]> {
  return Promise.all((sequence.imageAssets ?? []).map((asset) => resolveImageAssetHealth(projectId, asset)))
}

export function buildRelinkMatches(assets: readonly MasterImageAssetDocument[], files: readonly File[]): RelinkMatch[] {
  const supported = files.filter(isSupportedImageFile)
  const assetsByName = new Map<string, number>()
  assets.forEach((asset) => assetsByName.set(asset.fileName, (assetsByName.get(asset.fileName) ?? 0) + 1))
  return assets.map((asset) => {
    const candidates = supported.filter((file) => file.name === asset.fileName)
    const sharedName = (assetsByName.get(asset.fileName) ?? 0) > 1
    return {
      assetId: asset.id,
      originalFileName: asset.fileName,
      candidates: [...candidates],
      selectedIndex: candidates.length === 1 && !sharedName ? 0 : null,
      reason: candidates.length === 1 && !sharedName ? 'exact-filename' : candidates.length > 0 ? 'ambiguous' : 'unmatched',
    }
  })
}

export function selectedRelinkFiles(matches: readonly RelinkMatch[]): Map<string, File> {
  const result = new Map<string, File>()
  matches.forEach((match) => {
    if (match.selectedIndex !== null && match.candidates[match.selectedIndex]) result.set(match.assetId, match.candidates[match.selectedIndex])
  })
  return result
}

export function assetIsMissingOrInvalid(health: ImageAssetHealth | undefined): boolean {
  return Boolean(health && health.status !== 'available')
}

export function imageClipsIntersectingRange(sequence: MasterSequenceDocument, startFrame: number, endFrame: number): MasterImageClipDocument[] {
  return (sequence.imageClips ?? []).filter((clip) => clip.startMasterFrame < endFrame && clip.startMasterFrame + clip.durationFrames > startFrame)
}
