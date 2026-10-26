import type { LiveReviewRole } from '../liveReview/protocol'
import type { ProjectDocument } from './projectDocument'

export function defaultLiveReviewFollowHost(role: LiveReviewRole): boolean {
  return role !== 'editor'
}

export function shouldApplyLivePresentation(role: LiveReviewRole | null, followHost: boolean): boolean {
  return role === 'host' || followHost
}

/** Preserve local active Scene/Shot while accepting the shared project data. */
export function mergeLiveProjectWorkspace(next: ProjectDocument, current: ProjectDocument, preserveWorkspace: boolean): ProjectDocument {
  if (!preserveWorkspace || next.id !== current.id) return next
  const activeSceneId = next.scenes.some((scene) => scene.id === current.activeSceneId) ? current.activeSceneId : next.activeSceneId
  const activeShotId = current.activeShotId !== null && next.shots.some((shot) => shot.id === current.activeShotId)
    ? current.activeShotId
    : next.activeShotId
  const currentScene = current.scenes.find((scene) => scene.id === activeSceneId)
  const scenes = next.scenes.map((scene) => {
    if (scene.id !== activeSceneId || !currentScene) return scene
    const activeCameraId = currentScene.scene.cameras.some((camera) => camera.id === currentScene.scene.activeCameraId) ? currentScene.scene.activeCameraId : scene.scene.activeCameraId
    return {
      ...scene,
      scene: {
        ...scene.scene,
        activeCameraId,
        timeline: { ...scene.scene.timeline, currentFrame: currentScene.scene.timeline.currentFrame },
      },
    }
  })
  return { ...next, activeSceneId, activeShotId, scenes }
}

/** Keep private Editor presentation fields out of the shared project snapshot. */
export function sharedProjectSnapshot(project: ProjectDocument, authoritative: ProjectDocument | null): ProjectDocument {
  if (!authoritative || authoritative.id !== project.id) return project
  return {
    ...project,
    activeSceneId: authoritative.activeSceneId,
    activeShotId: authoritative.activeShotId,
    scenes: project.scenes.map((entry) => {
      const source = authoritative.scenes.find((candidate) => candidate.id === entry.id)
      if (!source) return entry
      return {
        ...entry,
        scene: {
          ...entry.scene,
          activeCameraId: source.scene.activeCameraId,
          timeline: { ...entry.scene.timeline, currentFrame: source.scene.timeline.currentFrame },
        },
      }
    }),
  }
}
