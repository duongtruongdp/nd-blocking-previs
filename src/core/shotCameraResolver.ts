import type { ProjectSceneEntry } from './projectDocument'
import type { ShotDocument } from './shotDocument'
import type { CameraDocument, SceneDocument } from './sceneDocument'

export type ShotCameraResolution = {
  sceneEntry: ProjectSceneEntry | null
  scene: SceneDocument | null
  cameraId: string | null
  camera: CameraDocument | null
  usedSceneActiveCameraFallback: boolean
}

/**
 * Resolves a Shot's production Camera from the Shot's Scene boundary.
 *
 * Older .ndblock projects stored a null Shot camera while still storing the
 * Scene's activeCameraId. That is a stable ID reference, not a name-based
 * guess, so it remains a valid compatibility fallback. A non-null Shot ID is
 * authoritative: if that exact ID is absent, the result is missing.
 */
export function resolveShotCamera(project: { scenes: readonly ProjectSceneEntry[] }, shot: Pick<ShotDocument, 'sceneId' | 'cameraId'>): ShotCameraResolution {
  const sceneEntry = project.scenes.find((candidate) => candidate.id === shot.sceneId) ?? null
  const scene = sceneEntry?.scene ?? null
  const usedSceneActiveCameraFallback = shot.cameraId === null
  const cameraId = shot.cameraId ?? scene?.activeCameraId ?? null
  const camera = scene && cameraId ? scene.cameras.find((candidate) => candidate.id === cameraId) ?? null : null
  return { sceneEntry, scene, cameraId, camera, usedSceneActiveCameraFallback }
}

