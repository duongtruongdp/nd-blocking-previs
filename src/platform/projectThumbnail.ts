import type { ProjectDocument } from '../core/projectDocument'
import { recentProjectThumbnailKey } from './projectLibrary'

export type ProjectThumbnailWrite = {
  readonly path: string | null
  readonly byteLength: number
}

export type ProjectThumbnailCaptureResult =
  | { readonly status: 'saved'; readonly key: string; readonly write: ProjectThumbnailWrite }
  | { readonly status: 'skipped'; readonly key: string; readonly reason: 'no-active-camera' | 'invalid-active-camera' | 'capture-unavailable' }
  | { readonly status: 'failed'; readonly key: string; readonly stage: 'capture' | 'write' | 'ready'; readonly error: unknown }

type CaptureAndStoreOptions = {
  readonly path: string
  readonly key?: string
  readonly project: ProjectDocument
  readonly capture: () => Promise<Blob | null>
  readonly save: (key: string, blob: Blob) => Promise<ProjectThumbnailWrite>
  readonly onReady: (key: string, blob: Blob, write: ProjectThumbnailWrite) => Promise<void>
  readonly wait?: (milliseconds: number) => Promise<void>
  readonly log?: (message: string, details?: Record<string, unknown>) => void
}

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export async function captureAndStoreProjectThumbnail(options: CaptureAndStoreOptions): Promise<ProjectThumbnailCaptureResult> {
  const key = options.key ?? recentProjectThumbnailKey(options.path)
  const scene = options.project.scenes.find((entry) => entry.id === options.project.activeSceneId)?.scene
  if (!scene?.activeCameraId) {
    options.log?.('skipped: no active camera', { projectPath: options.path })
    return { status: 'skipped', key, reason: 'no-active-camera' }
  }
  if (!scene.cameras.some((camera) => camera.id === scene.activeCameraId)) {
    options.log?.('skipped: invalid active camera', { projectPath: options.path, activeCameraId: scene.activeCameraId })
    return { status: 'skipped', key, reason: 'invalid-active-camera' }
  }

  let blob: Blob | null = null
  let captureError: unknown = null
  for (const delay of [0, 40, 120]) {
    if (delay > 0) await (options.wait ?? wait)(delay)
    try {
      options.log?.('capture requested', { projectPath: options.path, activeCameraId: scene.activeCameraId, attemptDelayMs: delay, width: 320 })
      blob = await options.capture()
      if (blob && blob.size > 0) break
      captureError = new Error('Camera thumbnail capture returned no PNG bytes.')
    } catch (error: unknown) {
      captureError = error
    }
  }
  if (!blob || blob.size === 0) {
    options.log?.('FAILED at capture', { projectPath: options.path, error: captureError })
    return { status: 'failed', key, stage: 'capture', error: captureError ?? new Error('Camera thumbnail capture returned no PNG bytes.') }
  }
  options.log?.('capture complete', { projectPath: options.path, blobBytes: blob.size })

  let write: ProjectThumbnailWrite
  try {
    write = await options.save(key, blob)
  } catch (error: unknown) {
    options.log?.('FAILED at write', { projectPath: options.path, key, blobBytes: blob.size, error })
    return { status: 'failed', key, stage: 'write', error }
  }

  try {
    await options.onReady(key, blob, write)
  } catch (error: unknown) {
    options.log?.('FAILED at Recent update', { projectPath: options.path, key, error })
    return { status: 'failed', key, stage: 'ready', error }
  }
  options.log?.('Recent updated', { projectPath: options.path, key, writePath: write.path, byteLength: write.byteLength })
  return { status: 'saved', key, write }
}
