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

export function staleRuntimeEntityIds(runtimeIds: Iterable<string>, authoritativeIds: Iterable<string>): string[] {
  const authoritative = new Set(authoritativeIds)
  return Array.from(runtimeIds).filter((id) => !authoritative.has(id))
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
