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
