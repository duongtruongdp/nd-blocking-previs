import { describe, expect, it } from 'vitest'
import { applyCollaborativePlanning, canEditCollaborativeShotCamera } from '../core/collaborativePlanning'
import { createProjectDocument } from '../core/projectDocument'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createShotDocument } from '../core/shotDocument'

function projectWithCamera() {
  const scene = createEmptySceneDocument()
  const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 4], [0, 0, 0], 'alexa-35', 'open-gate-4.6k')
  const document = { ...createProjectDocument('planning-project', 'Planning', { ...scene, cameras: [camera], activeCameraId: camera.id }) }
  return document
}

describe('collaborative Shot and Master planning', () => {
  it('creates a Shot only from an existing Scene and Camera', () => {
    const project = projectWithCamera()
    const result = applyCollaborativePlanning(project, { operation: 'shot_create', operationId: 'op-1', leaseId: 'lease-1', sceneId: project.activeSceneId, cameraId: 'camera-01', baseProjectRevision: 0 })
    expect(result?.project.shots).toHaveLength(1)
    expect(result?.project.shots[0]).toMatchObject({ sceneId: project.activeSceneId, cameraId: 'camera-01', startFrame: 0 })
    expect(result?.createdId).toBe(result?.project.shots[0].id)
    expect(applyCollaborativePlanning(project, { operation: 'shot_create', operationId: 'op-2', leaseId: 'lease-2', sceneId: project.activeSceneId, cameraId: 'missing', baseProjectRevision: 0 })).toBeNull()
  })

  it('updates and reorders Shot metadata without changing its Scene/Camera references', () => {
    const project = projectWithCamera()
    const first = createShotDocument({ id: 'shot-01', name: 'Shot 01', sceneId: project.activeSceneId, cameraId: 'camera-01', startFrame: 0, endFrame: 48, order: 0, notes: '', thumbnail: null })
    const second = createShotDocument({ ...first, id: 'shot-02', name: 'Shot 02', order: 1 })
    const withShots = { ...project, shots: [first, second] }
    const updated = applyCollaborativePlanning(withShots, { operation: 'shot_update', operationId: 'op-3', leaseId: 'lease-3', shotId: 'shot-01', patch: { name: 'Wide', notes: 'Editor note', startFrame: 4, endFrame: 40 }, baseProjectRevision: 0 })
    expect(updated?.project.shots[0]).toMatchObject({ name: 'Wide', notes: 'Editor note', startFrame: 4, endFrame: 40, sceneId: project.activeSceneId, cameraId: 'camera-01' })
    const reordered = applyCollaborativePlanning(withShots, { operation: 'shot_reorder', operationId: 'op-4', leaseId: 'lease-4', shotId: 'shot-02', targetIndex: 0, baseProjectRevision: 0 })
    expect(reordered?.project.shots.map((shot) => shot.id)).toEqual(['shot-02', 'shot-01'])
  })

  it('accepts only a valid same-scene camera assignment', () => {
    const project = projectWithCamera()
    const otherScene = createEmptySceneDocument()
    const otherCamera = createCameraDocument('camera-02', 'Camera 02', [0, 1, 4], [0, 0, 0], 'alexa-35', 'open-gate-4.6k')
    const shot = createShotDocument({ id: 'shot-01', name: 'Shot 01', sceneId: project.activeSceneId, cameraId: 'camera-01', startFrame: 0, endFrame: 48, order: 0, notes: '', thumbnail: null })
    const withScenes = { ...project, scenes: [...project.scenes, { id: 'scene-02', name: 'Scene 02', scene: { ...otherScene, cameras: [otherCamera] } }], shots: [shot] }
    const accepted = applyCollaborativePlanning(withScenes, { operation: 'shot_update', operationId: 'camera-1', leaseId: 'lease-1', shotId: shot.id, patch: { cameraId: 'camera-01' }, baseProjectRevision: 0 })
    expect(accepted?.project.shots[0].cameraId).toBe('camera-01')
    expect(applyCollaborativePlanning(withScenes, { operation: 'shot_update', operationId: 'camera-2', leaseId: 'lease-2', shotId: shot.id, patch: { cameraId: 'camera-02' }, baseProjectRevision: 0 })).toBeNull()
    expect(applyCollaborativePlanning(withScenes, { operation: 'shot_update', operationId: 'camera-3', leaseId: 'lease-3', shotId: shot.id, patch: { cameraId: 'missing' }, baseProjectRevision: 0 })).toBeNull()
  })

  it('keeps Shot camera edit permission role- and lease-aware', () => {
    expect(canEditCollaborativeShotCamera(null, false)).toBe(true)
    expect(canEditCollaborativeShotCamera('host', true)).toBe(true)
    expect(canEditCollaborativeShotCamera('editor', false)).toBe(true)
    expect(canEditCollaborativeShotCamera('editor', true)).toBe(false)
    expect(canEditCollaborativeShotCamera('viewer', false)).toBe(false)
  })

  it('adds, trims, duplicates, removes, and reorders Master clip references', () => {
    const project = projectWithCamera()
    const shot = createShotDocument({ id: 'shot-01', name: 'Shot 01', sceneId: project.activeSceneId, cameraId: 'camera-01', startFrame: 0, endFrame: 48, order: 0, notes: '', thumbnail: null })
    const withShot = { ...project, shots: [shot] }
    const added = applyCollaborativePlanning(withShot, { operation: 'master_clip_add', operationId: 'op-5', leaseId: 'lease-5', shotId: shot.id, targetIndex: 0, baseProjectRevision: 0 })
    const clipId = added?.project.masterSequence.clips[0].id
    expect(clipId).toBeTruthy()
    const trimmed = applyCollaborativePlanning(added!.project, { operation: 'master_clip_update', operationId: 'op-6', leaseId: 'lease-6', clipId: clipId!, sourceStartFrame: 8, sourceEndFrame: 32, baseProjectRevision: 0 })
    expect(trimmed?.project.masterSequence.clips[0]).toMatchObject({ sourceStartFrame: 8, sourceEndFrame: 32 })
    const duplicated = applyCollaborativePlanning(trimmed!.project, { operation: 'master_clip_duplicate', operationId: 'op-7', leaseId: 'lease-7', clipId: clipId!, baseProjectRevision: 0 })
    expect(duplicated?.project.masterSequence.clips).toHaveLength(2)
    const removed = applyCollaborativePlanning(duplicated!.project, { operation: 'master_clip_remove', operationId: 'op-8', leaseId: 'lease-8', clipId: clipId!, baseProjectRevision: 0 })
    expect(removed?.project.masterSequence.clips).toHaveLength(1)
  })
})

