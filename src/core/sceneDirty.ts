import type { SceneDocument } from './sceneDocument'

/** Session-only playback position is excluded from dirty state. */
export function creativeSceneFingerprint(scene: SceneDocument): string {
  return JSON.stringify({
    ...scene,
    metadata: { ...scene.metadata, updatedAt: '' },
    timeline: { ...scene.timeline, currentFrame: 0 },
  })
}

export function creativeSceneChanged(before: SceneDocument, after: SceneDocument): boolean {
  return creativeSceneFingerprint(before) !== creativeSceneFingerprint(after)
}
