import type { ProjectDocument } from './projectDocument'
import type { SceneDocument } from './sceneDocument'
import { masterSequenceDurationFrames, resolveMasterFrame, type ResolvedMasterFrame } from './masterSequence'
import { evaluateTimeline, type EvaluatedEntityState } from '../timeline/timelineEvaluator'
import { resolveShotCamera } from './shotCameraResolver'
import { activeMasterImageClips, effectiveImageOpacity, imageAssetForClip } from './masterGraphics'
import type { MasterImageAssetDocument, MasterImageClipDocument } from './masterSequence'

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
  graphics: Array<{ clip: MasterImageClipDocument; asset: MasterImageAssetDocument; opacity: number }>
  status: MasterPreviewStatus
}

function emptyPreview(masterFrame: number, project?: ProjectDocument): MasterPreviewContext {
  const graphics = project ? activeMasterImageClips(project.masterSequence, masterFrame).flatMap((clip) => {
    const asset = imageAssetForClip(project.masterSequence, clip)
    return asset ? [{ clip, asset, opacity: effectiveImageOpacity(clip, masterFrame) }] : []
  }) : []
  return { masterFrame, clipId: null, shotId: null, sceneId: null, sceneScopeId: null, cameraId: null, sourceFrame: null, scene: null, evaluatedEntities: null, graphics, status: 'empty' }
}

export function resolveMasterPreviewContext(project: ProjectDocument, masterFrame: number): MasterPreviewContext {
  const resolved = resolveMasterFrame(project.masterSequence, project.shots, masterFrame) ?? resolveMasterPreviewSample(project, masterFrame)
  if (!resolved) return emptyPreview(masterFrame, project)
  const shot = project.shots.find((candidate) => candidate.id === resolved.shotId)
  if (!shot) return fromResolution(project, masterFrame, resolved, null, 'missing-shot')
  const cameraResolution = resolveShotCamera(project, shot)
  const sceneEntry = cameraResolution.sceneEntry
  if (!sceneEntry) return fromResolution(project, masterFrame, resolved, null, 'missing-scene')
  if (!cameraResolution.camera || !cameraResolution.cameraId) return fromResolution(project, masterFrame, resolved, sceneEntry.scene, 'missing-camera')
  return fromResolution(project, masterFrame, { ...resolved, cameraId: cameraResolution.cameraId }, sceneEntry.scene, 'resolved')
}

function resolveMasterPreviewSample(project: ProjectDocument, masterFrame: number): ResolvedMasterFrame | null {
  const duration = masterSequenceDurationFrames(project.masterSequence)
  if (duration <= 0) return null
  const boundary = Math.max(0, Math.round(Number.isFinite(masterFrame) ? masterFrame : 0))
  return resolveMasterFrame(project.masterSequence, project.shots, Math.min(duration - 1, boundary))
}

function fromResolution(project: ProjectDocument, masterFrame: number, resolved: ResolvedMasterFrame, scene: SceneDocument | null, status: MasterPreviewStatus): MasterPreviewContext {
  const sourceFrame = resolved.sourceFrame
  return {
    masterFrame: Math.max(0, Math.round(masterFrame)),
    clipId: resolved.clipId,
    shotId: resolved.shotId,
    sceneId: resolved.sceneId,
    sceneScopeId: resolved.sceneId ? `${project.id}:${resolved.sceneId}` : null,
    cameraId: resolved.cameraId,
    sourceFrame,
    scene,
    evaluatedEntities: scene ? evaluateTimeline(scene, sourceFrame) : null,
    graphics: activeMasterImageClips(project.masterSequence, masterFrame).flatMap((clip) => {
      const asset = imageAssetForClip(project.masterSequence, clip)
      return asset ? [{ clip, asset, opacity: effectiveImageOpacity(clip, masterFrame) }] : []
    }),
    status,
  }
}
