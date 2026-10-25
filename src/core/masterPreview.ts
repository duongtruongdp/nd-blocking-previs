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

export function resolveMasterPreviewContext(project: ProjectDocument, masterFrame: number, allowEndBoundarySample = true): MasterPreviewContext {
  const requestedFrame = Math.round(Number.isFinite(masterFrame) ? masterFrame : 0)
  const duration = masterSequenceDurationFrames(project.masterSequence)
  const hasIndependentContent = Boolean(project.masterSequence.musicClip || project.masterSequence.imageClips?.length)
  // Keep the timeline's exact end boundary visually useful without making an
  // interior gap borrow a neighboring Shot. Export never requests this
  // boundary because its range is half-open. Once the Master contains
  // independent Music/Graphics content, the same boundary can be a real
  // content tail and must remain a neutral gap instead of sampling the last
  // Shot.
  const resolved = resolveMasterFrame(project.masterSequence, project.shots, requestedFrame)
    ?? (allowEndBoundarySample && !hasIndependentContent && requestedFrame === duration && duration > 0 ? resolveMasterFrame(project.masterSequence, project.shots, duration - 1) : null)
  if (!resolved) return emptyPreview(masterFrame, project)
  const shot = project.shots.find((candidate) => candidate.id === resolved.shotId)
  if (!shot) return fromResolution(project, masterFrame, resolved, null, 'missing-shot')
  const cameraResolution = resolveShotCamera(project, shot)
  const sceneEntry = cameraResolution.sceneEntry
  if (!sceneEntry) return fromResolution(project, masterFrame, resolved, null, 'missing-scene')
  if (!cameraResolution.camera || !cameraResolution.cameraId) return fromResolution(project, masterFrame, resolved, sceneEntry.scene, 'missing-camera')
  return fromResolution(project, masterFrame, { ...resolved, cameraId: cameraResolution.cameraId }, sceneEntry.scene, 'resolved')
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
