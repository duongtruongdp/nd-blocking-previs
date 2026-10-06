import { describe, expect, it } from 'vitest'
import { CAMERA_DATABASE, resolveCameraDefinition } from '../core/cameraDatabase'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createFrameGuide } from '../core/frameGuides'
import { cameraPhysicalSnapshot, CURRENT_NDSCENE_VERSION, migrateSceneFile, parseSceneFile, prepareSceneForSave, sceneFilename, serializeScene, SceneFileError, validateSceneDocument } from '../core/scenePersistence'
import { cameraProjectionForDocument } from '../runtime/cameraMath'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('V2.8 .ndscene persistence', () => {
  it('round-trips Actors, Props, Cameras, Guides, Timeline, Marks, and rational FPS', () => {
    const base = createEmptySceneDocument()
    const actor = createActorDocument('actor-01', 'Actor 01', [1, 0, -2])
    const cameraDefinition = resolveCameraDefinition('sony.fx5')!
    const camera = {
      ...createCameraDocument('camera-01', 'Camera 01', [0, 1.6, 5], [0.1, 0, 0], cameraDefinition.id, cameraDefinition.captureModes[0].id),
      focalLengthMm: 50,
      lensType: 'Anamorphic' as const,
      anamorphicSqueeze: 2 as const,
      deliveryAspectRatio: '2.39' as const,
      frameGuides: [createFrameGuide('guide-16x9', '16:9', 16 / 9, { color: '#FF4D8D' }), createFrameGuide('guide-portrait', '9:16', 9 / 16, { color: '#00C8FF', lineStyle: 'solid' })],
    }
    let timeline = { ...base.timeline, frameRate: { numerator: 24000, denominator: 1001 }, markIn: 12, markOut: 96, currentFrame: 48 }
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, actor.id, 'Actor', 'position', 48, [3, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 0, 50)
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 48, 85)
    timeline = upsertTimelineKeyframe(timeline, 'prop-01', 'Prop', 'position', 0, [0, 1, 0])
    const scene = { ...base, metadata: { ...base.metadata, name: 'Night Exterior / Alley' }, actors: [actor], props: [{ id: 'prop-01', name: 'Table', type: 'Prop' as const, position: [0, 1, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], shape: 'cube' as const, primaryColor: '#9B91DF' }], cameras: [camera], activeCameraId: camera.id, timeline }
    const prepared = prepareSceneForSave(scene, '2026-10-06T00:00:00.000Z')
    const loaded = parseSceneFile(serializeScene(scene, '2026-10-06T00:00:00.000Z'))

    expect(loaded).toEqual(prepared)
    expect(loaded.timeline.frameRate).toEqual({ numerator: 24000, denominator: 1001 })
    expect(loaded.timeline.tracks.flatMap((track) => track.keyframes.map((keyframe) => keyframe.frame))).toEqual([0, 48, 0, 48, 0])
    expect(loaded.cameras[0].frameGuides.map((guide) => guide.color)).toEqual(['#FF4D8D', '#00C8FF'])
    expect(loaded.activeCameraId).toBe(camera.id)
    expect(loaded.timeline.tracks.some((track) => track.entityType === 'Prop' && track.property === 'position')).toBe(true)
  })

  it('writes a resolved Camera physical snapshot and preserves it when the database geometry changes', () => {
    const definition = CAMERA_DATABASE.find((item) => item.id === 'sony.fx5')!
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 4], [0, 0, 0], definition.id, definition.captureModes[0].id)
    const snapshot = cameraPhysicalSnapshot(camera)!
    expect(snapshot.activeWidthMm).toBe(definition.captureModes[0].activeWidthMm)
    const changed = { ...camera, cameraSnapshot: { ...snapshot, activeWidthMm: snapshot.activeWidthMm + 2 } }
    const projection = cameraProjectionForDocument(changed)!
    expect(projection.captureMode.activeWidthMm).toBe(snapshot.activeWidthMm + 2)
    expect(projection.aspect).toBeCloseTo((snapshot.activeWidthMm + 2) / snapshot.activeHeightMm, 8)
  })

  it('migrates the supported older version and rejects future versions', () => {
    const scene = createEmptySceneDocument()
    const current = JSON.parse(serializeScene(scene, '2026-10-06T00:00:00.000Z')) as Record<string, unknown>
    const older = { ...current, version: 0, scene: { ...(current.scene as Record<string, unknown>), cameras: [] } }
    expect(migrateSceneFile(older).version).toBe(CURRENT_NDSCENE_VERSION)
    expect(() => migrateSceneFile({ ...current, version: CURRENT_NDSCENE_VERSION + 1 })).toThrowError(SceneFileError)
    try { migrateSceneFile({ ...current, version: CURRENT_NDSCENE_VERSION + 1 }) } catch (error) { expect((error as SceneFileError).code).toBe('unsupported-newer-version') }
  })

  it('rejects invalid JSON, wrong envelopes, duplicate IDs, bad references, bad guides, and bad keyframes', () => {
    const scene = createEmptySceneDocument()
    expect(() => parseSceneFile('{')).toThrowError(SceneFileError)
    expect(() => parseSceneFile(JSON.stringify({ format: 'other', version: 1, scene }))).toThrowError(SceneFileError)
    expect(validateSceneDocument({ ...scene, stage: undefined }).some((error) => error.includes('Stage metadata'))).toBe(true)
    const duplicate = { ...scene, actors: [createActorDocument('same-id', 'One', [0, 0, 0])], props: [{ id: 'same-id', name: 'Duplicate', type: 'Prop' as const, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], shape: 'cube' as const, primaryColor: '#000000' }] }
    expect(validateSceneDocument(duplicate).some((error) => error.includes('unique'))).toBe(true)
    const badReference = { ...scene, activeCameraId: 'missing-camera' }
    expect(validateSceneDocument(badReference).some((error) => error.includes('Active Camera'))).toBe(true)
    const cameraDefinition = CAMERA_DATABASE[0]
    const badGuideCamera = { ...createCameraDocument('camera-01', 'Camera 01', [0, 1, 4], [0, 0, 0], cameraDefinition.id, cameraDefinition.captureModes[0].id), frameGuides: [createFrameGuide('guide-01', 'Bad', 0)] }
    expect(validateSceneDocument({ ...scene, cameras: [badGuideCamera] }).some((error) => error.includes('Frame Guide'))).toBe(true)
    const badTimeline = { ...scene, actors: [createActorDocument('actor-01', 'Actor 01', [0, 0, 0]),], timeline: { ...scene.timeline, tracks: [{ id: 'track-01', entityId: 'actor-01', entityType: 'Actor' as const, property: 'position' as const, keyframes: [{ id: 'key-01', frame: 1.5, value: [0, 0, 0] as [number, number, number], interpolation: 'linear' as const }] }] } }
    expect(validateSceneDocument(badTimeline).some((error) => error.includes('keyframe'))).toBe(true)
  })

  it('sanitizes download names without changing the stored Scene name', () => {
    expect(sceneFilename('Night Exterior / Alley')).toBe('Night_Exterior_Alley.ndscene')
    expect(sceneFilename('')).toBe('Untitled_Scene.ndscene')
  })
})
