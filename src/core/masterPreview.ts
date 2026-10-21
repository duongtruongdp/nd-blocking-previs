import type { ProjectDocument } from './projectDocument'
import type { SceneDocument } from './sceneDocument'
import { resolveMasterFrame, type ResolvedMasterFrame } from './masterSequence'
import { evaluateTimeline, type EvaluatedEntityState } from '../timeline/timelineEvaluator'
import { resolveShotCamera } from './shotCameraResolver'

export type MasterPreviewStatus = 'empty' | 'resolved' | 'missing-shot' | 'missing-scene' | 'missing-camera'

export type MasterPreviewContext = {
  masterFrame: number
  clipId: string | null
  shotId: string | null
  sceneId: string | null
  sceneScopeId: string | null
  cameraId: string | null
  sourceFrame: number | null
  scene: SceneDocument | null
  evaluatedEntities: Record<string, EvaluatedEntityState> | null
  status: MasterPreviewStatus
}

function emptyPreview(masterFrame: number): MasterPreviewContext {
  return { masterFrame, clipId: null, shotId: null, sceneId: null, sceneScopeId: null, cameraId: null, sourceFrame: null, scene: null, evaluatedEntities: null, status: 'empty' }
}

export function resolveMasterPreviewContext(project: ProjectDocument, masterFrame: number): MasterPreviewContext {
  const resolved = resolveMasterFrame(project.masterSequence, project.shots, masterFrame)
  if (!resolved) return emptyPreview(masterFrame)
  const shot = project.shots.find((candidate) => candidate.id === resolved.shotId)
  if (!shot) return fromResolution(project.id, masterFrame, resolved, null, 'missing-shot')
  const cameraResolution = resolveShotCamera(project, shot)
  const sceneEntry = cameraResolution.sceneEntry
  if (!sceneEntry) return fromResolution(project.id, masterFrame, resolved, null, 'missing-scene')
  if (!cameraResolution.camera || !cameraResolution.cameraId) return fromResolution(project.id, masterFrame, resolved, sceneEntry.scene, 'missing-camera')
  return fromResolution(project.id, masterFrame, { ...resolved, cameraId: cameraResolution.cameraId }, sceneEntry.scene, 'resolved')
}

function fromResolution(projectId: string, masterFrame: number, resolved: ResolvedMasterFrame, scene: SceneDocument | null, status: MasterPreviewStatus): MasterPreviewContext {
  const sourceFrame = resolved.sourceFrame
  return {
    masterFrame: Math.max(0, Math.round(masterFrame)),
    clipId: resolved.clipId,
    shotId: resolved.shotId,
    sceneId: resolved.sceneId,
    sceneScopeId: resolved.sceneId ? `${projectId}:${resolved.sceneId}` : null,
    cameraId: resolved.cameraId,
    sourceFrame,
    scene,
    evaluatedEntities: scene ? evaluateTimeline(scene, sourceFrame) : null,
    status,
  }
}
