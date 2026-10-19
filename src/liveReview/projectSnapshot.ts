import { parseProjectFile, serializeProject } from '../core/projectPersistence'
import type { ProjectDocument } from '../core/projectDocument'
import { LIVE_REVIEW_MAX_MESSAGE_BYTES, type LiveReviewProject, type LiveReviewProjectSnapshot } from './protocol'

export function createLiveReviewSnapshot(project: ProjectDocument): LiveReviewProjectSnapshot {
  const serialized = serializeProject(project)
  return { project: parseProjectFile(serialized) as LiveReviewProject, bytes: new TextEncoder().encode(serialized).byteLength }
}

export function snapshotWithinLiveReviewLimit(project: ProjectDocument): boolean {
  return createLiveReviewSnapshot(project).bytes <= LIVE_REVIEW_MAX_MESSAGE_BYTES
}

/** Live snapshots deliberately use the existing .ndblock serializer; runtime refs and local paths are not part of ProjectDocument. */
export function projectFromLiveSnapshot(value: unknown): ProjectDocument | null {
  try {
    if (typeof value === 'string') return parseProjectFile(value)
    return parseProjectFile(JSON.stringify({ format: 'ndblock', version: 1, project: value }))
  } catch {
    return null
  }
}
