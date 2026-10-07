import { describe, expect, it } from 'vitest'
import { createActorDocument, createCameraDocument, createEmptySceneDocument, type FrameGuide } from '../core/sceneDocument'
import { cloneSceneWithIdentity, createProjectDocument } from '../core/projectDocument'
import { creativeProjectFingerprint } from '../core/projectDirty'
import { parseProjectFile, projectFilename, serializeProject, validateProjectDocument } from '../core/projectPersistence'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

function populatedScene() {
  const scene = createEmptySceneDocument()
  const actor = createActorDocument('actor-01', 'Actor 01', [1, 0, 0])
  const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
  const guide: FrameGuide = { id: 'guide-01', name: 'Delivery', aspectRatio: 2.39, enabled: true, lineStyle: 'solid', opacity: 1, lineWeight: 1, color: '#F0B866', shadeOutside: false, shadeOpacity: 0.2, safeMarginPercent: 0 }
  camera.frameGuides = [guide]
  let timeline = upsertTimelineKeyframe(scene.timeline, actor.id, 'Actor', 'position', 0, actor.position)
  timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 24, 35)
  return { ...scene, actors: [actor], cameras: [camera], activeCameraId: camera.id, timeline }
}

describe('V2.9 ProjectDocument and .ndblock persistence', () => {
  it('round-trips multiple embedded SceneDocuments and active Scene identity', () => {
    const scene = populatedScene()
    const second = { ...createEmptySceneDocument(), metadata: { ...createEmptySceneDocument().metadata, id: 'scene-02', name: 'Scene 02' } }
    const project = createProjectDocument('project-01', 'Commercial Previs', scene)
    const multi = { ...project, scenes: [...project.scenes, { id: second.metadata.id, name: second.metadata.name, scene: second }], activeSceneId: second.metadata.id }
    const loaded = parseProjectFile(serializeProject(multi, '2026-10-06T00:00:00.000Z'))
    expect(loaded.name).toBe('Commercial Previs')
    expect(loaded.scenes).toHaveLength(2)
    expect(loaded.activeSceneId).toBe('scene-02')
    expect(loaded.scenes[0].scene.timeline.tracks).toHaveLength(2)
    expect(validateProjectDocument(loaded)).toEqual([])
  })

  it('duplicates a Scene with independent entity, guide, track, keyframe, and active Camera IDs', () => {
    const original = populatedScene()
    const duplicate = cloneSceneWithIdentity(original, 'scene-02', 'Scene 02 Copy', 'copy-02')
    expect(duplicate.metadata.id).toBe('scene-02')
    expect(duplicate.actors[0].id).not.toBe(original.actors[0].id)
    expect(duplicate.cameras[0].id).not.toBe(original.cameras[0].id)
    expect(duplicate.activeCameraId).toBe(duplicate.cameras[0].id)
    expect(duplicate.cameras[0].frameGuides[0].id).not.toBe(original.cameras[0].frameGuides[0].id)
    expect(duplicate.timeline.tracks.map((track) => track.entityId)).toContain(duplicate.actors[0].id)
    expect(duplicate.timeline.tracks.map((track) => track.entityId)).not.toContain(original.actors[0].id)
    duplicate.actors[0].position[0] = 99
    expect(original.actors[0].position[0]).toBe(1)
  })

  it('round-trips an Actor pose preset through the portable Project format', () => {
    const scene = populatedScene()
    scene.actors[0].posePreset = 'reaching'
    const loaded = parseProjectFile(serializeProject(createProjectDocument('project-01', 'Project', scene), '2026-10-07T00:00:00.000Z'))

    expect(loaded.scenes[0].scene.actors[0].posePreset).toBe('reaching')
  })

  it('does not treat active Scene switching as creative dirty data', () => {
    const project = createProjectDocument('project-01', 'Project', populatedScene())
    const second = { ...createEmptySceneDocument(), metadata: { ...createEmptySceneDocument().metadata, id: 'scene-02', name: 'Scene 02' } }
    const withScenes = { ...project, scenes: [...project.scenes, { id: second.metadata.id, name: second.metadata.name, scene: second }] }
    const switched = { ...withScenes, activeSceneId: second.metadata.id }
    const originalActive = { ...withScenes, activeSceneId: withScenes.scenes[0].id }
    expect(creativeProjectFingerprint(originalActive)).toBe(creativeProjectFingerprint(switched))
  })

  it('rejects unsupported or invalid project files and sanitizes filenames', () => {
    expect(() => parseProjectFile(JSON.stringify({ format: 'ndblock', version: 2, project: {} }))).toThrow('unsupported newer')
    expect(projectFilename('Short Film / Alley')).toBe('Short_Film_Alley.ndblock')
  })
})
