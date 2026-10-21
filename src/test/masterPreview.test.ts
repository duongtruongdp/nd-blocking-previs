import { describe, expect, it } from 'vitest'
import { createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { createShotDocument } from '../core/shotDocument'
import { createMasterClip, createMasterSequenceDocument } from '../core/masterSequence'
import { resolveMasterPreviewContext } from '../core/masterPreview'
import { cameraDocumentWithTimelineEvaluation, evaluateTimeline } from '../timeline/timelineEvaluator'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

function projectWithScenes() {
  const sceneA = { ...createEmptySceneDocument(), metadata: { ...createEmptySceneDocument().metadata, id: 'scene-a', name: 'Scene A' }, cameras: [createCameraDocument('camera-a', 'Camera A', [0, 1, 4], [0, 0, 0], 'arri-alexa-mini-lf', 'open-gate-4-5k')] }
  const sceneB = { ...createEmptySceneDocument(), metadata: { ...createEmptySceneDocument().metadata, id: 'scene-b', name: 'Scene B' }, cameras: [createCameraDocument('camera-b', 'Camera B', [0, 1, 4], [0, 0, 0], 'arri-alexa-mini-lf', 'open-gate-4-5k')] }
  const project = createProjectDocument('project', 'Project', sceneA)
  const shotA = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: 'scene-a', cameraId: 'camera-a', startFrame: 10, endFrame: 13, order: 0, notes: '', thumbnail: null })
  const shotB = createShotDocument({ id: 'shot-b', name: 'Shot B', sceneId: 'scene-b', cameraId: 'camera-b', startFrame: 40, endFrame: 43, order: 1, notes: '', thumbnail: null })
  return {
    ...project,
    scenes: [{ id: 'scene-a', name: 'Scene A', scene: sceneA }, { id: 'scene-b', name: 'Scene B', scene: sceneB }],
    shots: [shotA, shotB],
    masterSequence: { clips: [{ id: 'clip-a', shotId: shotA.id, sourceStartFrame: 10, sourceEndFrame: 13, order: 0 }, { id: 'clip-b', shotId: shotB.id, sourceStartFrame: 40, sourceEndFrame: 43, order: 1 }], musicClip: null },
  }
}

describe('Master preview context', () => {
  it('keeps each Shot camera authoritative when Shots share one Scene', () => {
    const empty = createEmptySceneDocument()
    const cameraA = createCameraDocument('camera-a', 'Camera A', [0, 1, 4], [0, 0, 0], 'arri-alexa-mini-lf', 'open-gate-4-5k')
    const cameraB = createCameraDocument('camera-b', 'Camera B', [0, 1, 4], [0, 0, 0], 'arri-alexa-mini-lf', 'open-gate-4-5k')
    const sharedScene = { ...empty, metadata: { ...empty.metadata, id: 'scene-shared', name: 'Scene Shared' }, cameras: [cameraA, cameraB], activeCameraId: cameraB.id }
    const shotA = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: sharedScene.metadata.id, cameraId: cameraA.id, startFrame: 0, endFrame: 10, order: 0, notes: '', thumbnail: null })
    const shotB = createShotDocument({ id: 'shot-b', name: 'Shot B', sceneId: sharedScene.metadata.id, cameraId: cameraB.id, startFrame: 0, endFrame: 10, order: 1, notes: '', thumbnail: null })
    const base = createProjectDocument('project-shared', 'Shared Camera Project', sharedScene)
    const project = { ...base, scenes: [{ id: sharedScene.metadata.id, name: sharedScene.metadata.name, scene: sharedScene }], shots: [shotA, shotB], masterSequence: { ...createMasterSequenceDocument(), clips: [{ id: 'clip-a', shotId: shotA.id, sourceStartFrame: 0, sourceEndFrame: 10, order: 0 }, { id: 'clip-b', shotId: shotB.id, sourceStartFrame: 0, sourceEndFrame: 10, order: 1 }] } }

    expect(resolveMasterPreviewContext(project, 0)).toMatchObject({ status: 'resolved', shotId: shotA.id, cameraId: cameraA.id })
    expect(resolveMasterPreviewContext(project, 10)).toMatchObject({ status: 'resolved', shotId: shotB.id, cameraId: cameraB.id })

    const changedActiveCamera = { ...project, scenes: [{ ...project.scenes[0], scene: { ...sharedScene, activeCameraId: cameraA.id } }] }
    expect(resolveMasterPreviewContext(changedActiveCamera, 0)).toMatchObject({ shotId: shotA.id, cameraId: cameraA.id })
    expect(resolveMasterPreviewContext(changedActiveCamera, 10)).toMatchObject({ shotId: shotB.id, cameraId: cameraB.id })
  })

  it('resolves a TECCO-shaped legacy Shot with a null camera from its Scene active camera', () => {
    const scene = { ...createEmptySceneDocument(), metadata: { ...createEmptySceneDocument().metadata, id: 'scene-tecco', name: 'Scene 01' }, cameras: [createCameraDocument('camera-02', '50mm', [0, 1, 4], [0, 0, 0], 'arri-alexa-mini-lf', 'open-gate-4-5k')], activeCameraId: 'camera-02' }
    const projectBase = createProjectDocument('tecco-fixture', 'TECCO Fixture', scene)
    const legacyShot = createShotDocument({ id: 'shot-tecco', name: 'Shot 02', sceneId: scene.metadata.id, cameraId: null, startFrame: 0, endFrame: 48, order: 0, notes: '', thumbnail: null })
    const project = { ...projectBase, scenes: [{ id: scene.metadata.id, name: scene.metadata.name, scene }], shots: [legacyShot], masterSequence: { ...createMasterSequenceDocument(), clips: [{ id: 'master-tecco', shotId: legacyShot.id, sourceStartFrame: 0, sourceEndFrame: 48, order: 0 }] } }

    expect(resolveMasterPreviewContext(project, 12)).toMatchObject({ status: 'resolved', sceneId: 'scene-tecco', cameraId: 'camera-02', sourceFrame: 12 })
  })

  it('resolves source Scene and Camera across an exact clip boundary', () => {
    const project = projectWithScenes()
    expect(resolveMasterPreviewContext(project, 2)).toMatchObject({ masterFrame: 2, clipId: 'clip-a', sceneId: 'scene-a', cameraId: 'camera-a', sourceFrame: 12, status: 'resolved' })
    expect(resolveMasterPreviewContext(project, 3)).toMatchObject({ masterFrame: 3, clipId: 'clip-b', sceneId: 'scene-b', cameraId: 'camera-b', sourceFrame: 40, status: 'resolved' })
  })

  it('reports invalid source state without mutating the project context', () => {
    const project = projectWithScenes()
    const missingCameraProject = { ...project, shots: project.shots.map((shot) => shot.id === 'shot-b' ? { ...shot, cameraId: 'missing-camera' } : shot) }
    const context = resolveMasterPreviewContext(missingCameraProject, 3)
    expect(context.status).toBe('missing-camera')
    expect(context.sceneId).toBe('scene-b')
    expect(context.scene?.metadata.id).toBe('scene-b')
    expect(missingCameraProject.activeSceneId).toBe('scene-a')
  })

  it('uses the same evaluated Camera pose for Master source frames', () => {
    const camera = createCameraDocument('camera-a', 'Camera A', [0, 1, 5], [0, 0, 0], 'arri-alexa-mini-lf', 'open-gate-4-5k')
    const emptyScene = createEmptySceneDocument()
    const baseScene = { ...emptyScene, metadata: { ...emptyScene.metadata, id: 'scene-a', name: 'Scene A' }, cameras: [camera] }
    let timeline = baseScene.timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 0, [0, 1, 5])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'position', 48, [2, 2, 3])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 0, [0, 0, 0])
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'rotation', 48, [0, Math.PI / 2, 0])
    const scene = { ...baseScene, timeline }
    const shot = createShotDocument({ id: 'shot-a', name: 'Shot A', sceneId: scene.metadata.id, cameraId: camera.id, startFrame: 0, endFrame: 49, order: 0, notes: '', thumbnail: null })
    const clip = { ...createMasterClip(shot, new Set()), id: 'clip-a', order: 0 }
    const projectBase = createProjectDocument('project-a', 'Project A', scene)
    const project = { ...projectBase, scenes: [{ id: scene.metadata.id, name: scene.metadata.name, scene }], shots: [shot], masterSequence: { ...createMasterSequenceDocument(), clips: [clip] } }
    const cameraAt = (masterFrame: number) => {
      const context = resolveMasterPreviewContext(project, masterFrame)
      expect(context.scene).not.toBeNull()
      expect(context.sourceFrame).toBe(masterFrame)
      const evaluated = evaluateTimeline(context.scene!, context.sourceFrame!)
      return cameraDocumentWithTimelineEvaluation(camera, evaluated[camera.id])
    }
    expect(cameraAt(0).position).toEqual([0, 1, 5])
    expect(cameraAt(0).rotation).toEqual([0, 0, 0])
    expect(cameraAt(24).position).toEqual([1, 1.5, 4])
    expect(cameraAt(24).rotation[1]).toBeCloseTo(Math.PI / 4, 5)
    expect(cameraAt(48).position).toEqual([2, 2, 3])
    expect(cameraAt(48).rotation[1]).toBeCloseTo(Math.PI / 2, 5)
    expect(camera.position).toEqual([0, 1, 5])
    expect(camera.rotation).toEqual([0, 0, 0])
  })
})
