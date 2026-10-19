import { describe, expect, it } from 'vitest'
import { createEmptySceneDocument, createCameraDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { createShotDocument } from '../core/shotDocument'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { buildShotListCards, filterShotListCards, reorderShotDocuments } from '../core/shotListModel'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

function sceneEntry(id: string, name = id) {
  const scene = createEmptySceneDocument()
  const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 5], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)
  return { id, name, scene: { ...scene, metadata: { ...scene.metadata, id, name }, cameras: [camera], activeCameraId: camera.id } }
}

function shot(id: string, sceneId: string, order: number, cameraId: string | null = 'camera-01') {
  return createShotDocument({ id, name: `Shot ${order + 1}`, sceneId, cameraId, startFrame: 12, endFrame: 36, order, notes: '', thumbnail: null })
}

describe('Shot List presentation model', () => {
  it('derives card order, scene, camera, lens, and canonical duration from Shots', () => {
    const scene = sceneEntry('scene-a', 'Kitchen')
    const project = { ...createProjectDocument('project-01', 'Previs', scene.scene), scenes: [scene], shots: [shot('shot-a', scene.id, 0)] }
    const card = buildShotListCards(project)[0]

    expect(card.numberLabel).toBe('01')
    expect(card.sceneName).toBe('Kitchen')
    expect(card.cameraName).toBe('Camera 01')
    expect(card.lensLabel).toBe('35mm')
    expect(card.durationFrames).toBe(24)
    expect(card.durationLabel).toBe('00:00:01:00')
    expect(card.masterUseCount).toBe(0)
  })

  it('keeps missing Scene and Camera references safe and visible', () => {
    const scene = sceneEntry('scene-a')
    const project = { ...createProjectDocument('project-01', 'Previs', scene.scene), scenes: [scene], shots: [shot('shot-a', 'missing-scene', 0), shot('shot-b', scene.id, 1, 'missing-camera')] }
    const cards = buildShotListCards(project)

    expect(cards[0]).toMatchObject({ sceneName: 'Missing Scene', cameraName: 'Missing Camera', lensLabel: '—' })
    expect(cards[1]).toMatchObject({ sceneName: 'scene-a', cameraName: 'Missing Camera', lensLabel: '—' })
  })

  it('filters by Scene without changing derived order', () => {
    const first = sceneEntry('scene-a')
    const second = sceneEntry('scene-b')
    const project = { ...createProjectDocument('project-01', 'Previs', first.scene), scenes: [first, second], shots: [shot('shot-a', first.id, 0), shot('shot-b', second.id, 1)] }
    const cards = buildShotListCards(project)

    expect(filterShotListCards(cards, second.id).map((card) => card.shot.id)).toEqual(['shot-b'])
    expect(filterShotListCards(cards, null).map((card) => card.numberLabel)).toEqual(['01', '02'])
  })

  it('resolves animated focal length at thumbnailFrame and marks the lens as animated', () => {
    const entry = sceneEntry('scene-a')
    const cameraId = entry.scene.cameras[0].id
    const timeline = upsertTimelineKeyframe(entry.scene.timeline, cameraId, 'Camera', 'focalLengthMm', 24, 50)
    const animatedScene = { ...entry, scene: { ...entry.scene, timeline } }
    const project = { ...createProjectDocument('project-01', 'Previs', animatedScene.scene), scenes: [animatedScene], shots: [createShotDocument({ ...shot('shot-a', animatedScene.id, 0), thumbnailFrame: 24 })] }

    expect(buildShotListCards(project)[0]).toMatchObject({ lensLabel: '50mm · animated', lensMillimeters: 50, representativeFrame: 24 })
  })

  it('reorders project Shots while preserving IDs and leaving Master clips untouched', () => {
    const shots = [shot('shot-a', 'scene-a', 0), shot('shot-b', 'scene-a', 1), shot('shot-c', 'scene-a', 2)]
    const reordered = reorderShotDocuments(shots, 'shot-c', 0)

    expect(reordered.map((item) => item.id)).toEqual(['shot-c', 'shot-a', 'shot-b'])
    expect(reordered.map((item) => item.order)).toEqual([0, 1, 2])
    expect(shots.map((item) => item.id)).toEqual(['shot-a', 'shot-b', 'shot-c'])
  })
})
