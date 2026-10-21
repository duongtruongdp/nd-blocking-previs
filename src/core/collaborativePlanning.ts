import { duplicateMasterClip, insertMasterClipAt, removeMasterClip, reorderMasterClip, sourceRangeWithinShot, updateMasterClipRange } from './masterSequence'
import type { ProjectDocument } from './projectDocument'
import { reorderShotDocuments } from './shotListModel'
import { createShotDocument, createShotId, nextShotName } from './shotDocument'
import type { LiveReviewPlanningCommit, LiveReviewRole, LiveReviewShotUpdatePatch } from '../liveReview/protocol'

export type CollaborativePlanningResult = { project: ProjectDocument; createdId?: string }

export function canEditCollaborativeShotCamera(role: LiveReviewRole | null, leaseBusy: boolean): boolean {
  if (role === 'viewer') return false
  if (role === 'editor') return !leaseBusy
  return true
}

/**
 * Host-side semantic application for the collaborative Shot/Master protocol.
 * The relay only checks message structure and leases; all project invariants
 * remain here beside the existing serializable document helpers.
 */
export function applyCollaborativePlanning(project: ProjectDocument, commit: LiveReviewPlanningCommit): CollaborativePlanningResult | null {
  switch (commit.operation) {
    case 'shot_create': return createShot(project, commit.sceneId, commit.cameraId)
    case 'shot_update': return updateShot(project, commit.shotId, commit.patch)
    case 'shot_reorder': return reorderShot(project, commit.shotId, commit.targetIndex)
    case 'master_clip_add': return addMasterClip(project, commit.shotId, commit.targetIndex)
    case 'master_clip_update': return updateMasterClip(project, commit.clipId, commit.sourceStartFrame, commit.sourceEndFrame)
    case 'master_clip_duplicate': return duplicateClip(project, commit.clipId)
    case 'master_clip_remove': return removeClip(project, commit.clipId)
    case 'master_reorder': return reorderClip(project, commit.clipId, commit.targetIndex)
  }
}

function withTimestamp(project: ProjectDocument, patch: Partial<ProjectDocument>): ProjectDocument {
  return { ...project, ...patch, updatedAt: new Date().toISOString() }
}

function createShot(project: ProjectDocument, sceneId: string, cameraId: string): CollaborativePlanningResult | null {
  const entry = project.scenes.find((candidate) => candidate.id === sceneId)
  const camera = entry?.scene.cameras.find((candidate) => candidate.id === cameraId)
  if (!entry || !camera) return null
  const startFrame = entry.scene.timeline.startFrame
  const endFrame = Math.max(startFrame + 1, entry.scene.timeline.endFrame)
  const id = createShotId(new Set(project.shots.map((shot) => shot.id)))
  const shot = createShotDocument({ id, name: nextShotName(project.shots), sceneId, cameraId, startFrame, endFrame, order: project.shots.length, notes: '', thumbnail: null })
  return { project: withTimestamp(project, { shots: [...project.shots, shot], activeShotId: shot.id, activeSceneId: sceneId }), createdId: id }
}

function updateShot(project: ProjectDocument, shotId: string, patch: LiveReviewShotUpdatePatch): CollaborativePlanningResult | null {
  const shot = project.shots.find((candidate) => candidate.id === shotId)
  if (!shot) return null
  const scene = project.scenes.find((entry) => entry.id === shot.sceneId)?.scene
  if (!scene) return null
  const next = { ...shot }
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'name') { if (typeof value !== 'string' || !value.trim()) return null; next.name = value.trim() }
    else if (field === 'notes' || field === 'shotSize' || field === 'angle' || field === 'movement' || field === 'equipment') {
      if (value !== null && typeof value !== 'string') return null
      next[field] = value as never
    } else if (field === 'cameraId') {
      if (typeof value !== 'string' || !scene.cameras.some((camera) => camera.id === value)) return null
      next.cameraId = value
    } else if (field === 'startFrame' || field === 'endFrame') {
      if (typeof value !== 'number' || !Number.isInteger(value)) return null
      next[field] = value
    }
  }
  const start = Math.max(scene.timeline.startFrame, next.startFrame)
  const end = Math.min(scene.timeline.endFrame, next.endFrame)
  if (start >= end) return null
  next.startFrame = start
  next.endFrame = end
  return { project: withTimestamp(project, { shots: project.shots.map((candidate) => candidate.id === shotId ? next : candidate) }) }
}

function reorderShot(project: ProjectDocument, shotId: string, targetIndex: number): CollaborativePlanningResult | null {
  if (!project.shots.some((shot) => shot.id === shotId)) return null
  return { project: withTimestamp(project, { shots: reorderShotDocuments(project.shots, shotId, targetIndex) }) }
}

function addMasterClip(project: ProjectDocument, shotId: string, targetIndex: number): CollaborativePlanningResult | null {
  const shot = project.shots.find((candidate) => candidate.id === shotId)
  const scene = shot && project.scenes.find((entry) => entry.id === shot.sceneId)
  if (!shot || !scene) return null
  const sequence = project.masterSequence
  if (sequence.clips.length > 0) {
    const existingRate = project.scenes.find((entry) => entry.id === project.shots.find((candidate) => candidate.id === sequence.clips[0].shotId)?.sceneId)?.scene.timeline.frameRate
    if (existingRate && (existingRate.numerator !== scene.scene.timeline.frameRate.numerator || existingRate.denominator !== scene.scene.timeline.frameRate.denominator)) return null
  }
  return { project: withTimestamp(project, { masterSequence: insertMasterClipAt(sequence, shot, targetIndex) }) }
}

function updateMasterClip(project: ProjectDocument, clipId: string, start: number, end: number): CollaborativePlanningResult | null {
  const clip = project.masterSequence.clips.find((candidate) => candidate.id === clipId)
  const shot = clip && project.shots.find((candidate) => candidate.id === clip.shotId)
  if (!clip || !shot || !sourceRangeWithinShot(shot, start, end)) return null
  const sequence = updateMasterClipRange(project.masterSequence, clipId, shot, start, end)
  return sequence ? { project: withTimestamp(project, { masterSequence: sequence }) } : null
}

function duplicateClip(project: ProjectDocument, clipId: string): CollaborativePlanningResult | null {
  const sequence = duplicateMasterClip(project.masterSequence, clipId)
  return sequence ? { project: withTimestamp(project, { masterSequence: sequence }) } : null
}

function removeClip(project: ProjectDocument, clipId: string): CollaborativePlanningResult | null {
  if (!project.masterSequence.clips.some((clip) => clip.id === clipId)) return null
  return { project: withTimestamp(project, { masterSequence: removeMasterClip(project.masterSequence, clipId) }) }
}

function reorderClip(project: ProjectDocument, clipId: string, targetIndex: number): CollaborativePlanningResult | null {
  const sequence = reorderMasterClip(project.masterSequence, clipId, targetIndex)
  return sequence ? { project: withTimestamp(project, { masterSequence: sequence }) } : null
}

