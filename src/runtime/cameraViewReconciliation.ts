import type { Object3D } from 'three'

/**
 * Pure bookkeeping for the production-camera render scene.
 *
 * Camera View has its own runtime objects, so it must reconcile against the
 * authoritative document every time the active scene changes. Keeping the ID
 * set calculation independent of WebGL makes stale-entity regressions easy to
 * test without creating a renderer.
 */
export type CameraViewEntityCollections = {
  actorIds: Iterable<string>
  scenicIds: Iterable<string>
}

export type CameraViewRenderableEntityIds = {
  actorIds: string[]
  scenicIds: string[]
  cameraId: string | null
}

/** Scene IDs are the runtime ownership boundary; entity IDs are scene-local. */
export function sceneScopeChanged(previousSceneId: string | null, nextSceneId: string): boolean {
  return previousSceneId !== null && previousSceneId !== nextSceneId
}

export function staleRuntimeEntityIds(runtimeIds: Iterable<string>, authoritativeIds: Iterable<string>): string[] {
  const authoritative = new Set(authoritativeIds)
  return Array.from(runtimeIds).filter((id) => !authoritative.has(id))
}

/** Detach a Camera View runtime root from whichever Three.js parent owns it. */
export function detachCameraViewRuntimeRoot(root: Object3D): boolean {
  root.parent?.remove(root)
  return root.parent === null
}

export function cameraViewEntityCollections(
  actors: readonly { id: string }[],
  scenic: readonly { id: string }[],
): CameraViewEntityCollections {
  return {
    actorIds: actors.map((actor) => actor.id),
    scenicIds: scenic.map((definition) => definition.id),
  }
}

/**
 * Defines the complete semantic-ID boundary for the isolated Camera View.
 * Cached Three.js objects must be reconciled against these current IDs.
 */
export function cameraViewRenderableEntityIds(
  actors: readonly { id: string }[],
  scenic: readonly { id: string }[],
  camera: { id: string } | null,
): CameraViewRenderableEntityIds {
  return {
    actorIds: actors.map((actor) => actor.id),
    scenicIds: scenic.map((definition) => definition.id),
    cameraId: camera?.id ?? null,
  }
}
