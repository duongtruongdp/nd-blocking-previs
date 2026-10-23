import { describe, expect, it } from 'vitest'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { projectCameraCreationSpec } from '../core/projectCameraDefaults'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { creativeProjectFingerprint } from '../core/projectDirty'
import { normalizeCameraDefaults, parseProjectFile, serializeProject } from '../core/projectPersistence'

describe('M5D.8 project camera defaults', () => {
  it('stores an explicit project default and resolves creation by ID, independent of database order', () => {
    const fx5 = CAMERA_DATABASE.find((camera) => camera.id === 'sony.fx5')!
    const reordered = [CAMERA_DATABASE[0], fx5, ...CAMERA_DATABASE.filter((camera) => camera.id !== CAMERA_DATABASE[0].id && camera.id !== fx5.id)]
    const spec = projectCameraCreationSpec('sony.fx5', reordered)
    expect(spec?.definition.id).toBe('sony.fx5')
    expect(spec?.captureMode.id).toBe(fx5.captureModes[0].id)
  })

  it('round-trips the project default and uses it for a canonical new camera spec', () => {
    const project = createProjectDocument('project-01', 'Project', createEmptySceneDocument())
    const changed = { ...project, cameraDefaults: { cameraModelId: 'sony.fx5' } }
    const loaded = parseProjectFile(serializeProject(changed))
    expect(loaded.cameraDefaults.cameraModelId).toBe('sony.fx5')
    expect(projectCameraCreationSpec(loaded.cameraDefaults.cameraModelId)?.definition.id).toBe('sony.fx5')
  })

  it('migrates a legacy project from its active camera without changing that camera', () => {
    const scene = createEmptySceneDocument()
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], 'sony.fx5', 'sony-fx5-ff-5k-open-gate')
    const project = createProjectDocument('project-01', 'Project', { ...scene, cameras: [camera], activeCameraId: camera.id })
    const legacy = JSON.parse(serializeProject(project)) as { project: Record<string, unknown> }
    delete legacy.project.cameraDefaults
    const loaded = parseProjectFile(JSON.stringify(legacy))
    expect(loaded.cameraDefaults.cameraModelId).toBe('sony.fx5')
    expect(loaded.scenes[0].scene.cameras[0].cameraDefinitionId).toBe('sony.fx5')
  })

  it('falls back safely for an unavailable project default and preserves existing cameras', () => {
    const scene = createEmptySceneDocument()
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], 'sony.fx5', 'sony-fx5-ff-5k-open-gate')
    const project = { ...createProjectDocument('project-01', 'Project', { ...scene, cameras: [camera], activeCameraId: camera.id }), cameraDefaults: { cameraModelId: 'missing-camera' } }
    const loaded = parseProjectFile(serializeProject(project))
    expect(loaded.cameraDefaults.cameraModelId).toBe('sony.fx5')
    expect(loaded.scenes[0].scene.cameras[0].cameraDefinitionId).toBe('sony.fx5')
    expect(projectCameraCreationSpec(loaded.cameraDefaults.cameraModelId)?.definition.id).toBe('sony.fx5')
  })

  it('treats a project default edit as creative dirty data', () => {
    const project = createProjectDocument('project-01', 'Project', createEmptySceneDocument())
    const changed = { ...project, cameraDefaults: { cameraModelId: 'sony.fx6' } }
    expect(creativeProjectFingerprint(changed)).not.toBe(creativeProjectFingerprint(project))
  })

  it('normalizes a missing default deterministically when no camera exists', () => {
    const project = createProjectDocument('project-01', 'Project', createEmptySceneDocument())
    const legacy = { ...project, cameraDefaults: undefined }
    expect(normalizeCameraDefaults(legacy).cameraModelId).toBe(CAMERA_DATABASE[0].id)
  })
})
