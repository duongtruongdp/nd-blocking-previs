import { describe, expect, it, vi } from 'vitest'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { captureAndStoreProjectThumbnail } from '../platform/projectThumbnail'
import { recentProjectThumbnailKey } from '../platform/projectLibrary'

function projectWithCamera(activeCameraId: string | null = 'camera-01') {
  const scene = createEmptySceneDocument()
  const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1.6, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
  return createProjectDocument('project-01', 'Thumbnail Test', { ...scene, cameras: [camera], activeCameraId })
}

describe('desktop Project thumbnail orchestration', () => {
  it('captures, writes, and marks a valid active-camera thumbnail ready', async () => {
    const project = projectWithCamera()
    const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const save = vi.fn(async () => ({ path: '/app/project-thumbnails/key.png', byteLength: blob.size }))
    const onReady = vi.fn(async () => {})
    const result = await captureAndStoreProjectThumbnail({ path: '/Projects/Shot.ndblock', project, capture: async () => blob, save, onReady, wait: async () => {} })
    expect(result.status).toBe('saved')
    expect(save).toHaveBeenCalledWith(recentProjectThumbnailKey('/Projects/Shot.ndblock'), blob)
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('skips capture when there is no active Camera', async () => {
    const save = vi.fn()
    const result = await captureAndStoreProjectThumbnail({ path: '/Projects/NoCamera.ndblock', project: projectWithCamera(null), capture: vi.fn(), save, onReady: async () => {}, wait: async () => {} })
    expect(result).toMatchObject({ status: 'skipped', reason: 'no-active-camera' })
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps Save independent from capture failure and preserves the existing cache', async () => {
    const save = vi.fn()
    const result = await captureAndStoreProjectThumbnail({ path: '/Projects/CaptureFail.ndblock', project: projectWithCamera(), capture: async () => null, save, onReady: async () => {}, wait: async () => {} })
    expect(result).toMatchObject({ status: 'failed', stage: 'capture' })
    expect(save).not.toHaveBeenCalled()
  })

  it('does not report Recent readiness when the PNG write fails', async () => {
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    const onReady = vi.fn(async () => {})
    const result = await captureAndStoreProjectThumbnail({ path: '/Projects/WriteFail.ndblock', project: projectWithCamera(), capture: async () => blob, save: async () => { throw new Error('write failed') }, onReady, wait: async () => {} })
    expect(result).toMatchObject({ status: 'failed', stage: 'write' })
    expect(onReady).not.toHaveBeenCalled()
  })

  it('uses the new Save As path for the thumbnail key', async () => {
    const project = projectWithCamera()
    const blob = new Blob([new Uint8Array([1])], { type: 'image/png' })
    const save = vi.fn(async () => ({ path: '/app/project-thumbnails/new.png', byteLength: blob.size }))
    const result = await captureAndStoreProjectThumbnail({ path: '/Projects/New Take.ndblock', project, capture: async () => blob, save, onReady: async () => {}, wait: async () => {} })
    expect(result.status).toBe('saved')
    expect(save).toHaveBeenCalledWith(recentProjectThumbnailKey('/Projects/New Take.ndblock'), blob)
  })
})
