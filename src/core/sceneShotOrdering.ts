import type { ProjectSceneEntry } from './projectDocument'
import type { ShotDocument } from './shotDocument'

export type RelativeInsertPosition = 'before' | 'after'

/** Reorders the existing Scene entries without changing their identities. */
export function reorderSceneEntries(scenes: readonly ProjectSceneEntry[], sceneId: string, targetIndex: number): ProjectSceneEntry[] {
  const sourceIndex = scenes.findIndex((scene) => scene.id === sceneId)
  if (sourceIndex < 0) return [...scenes]
  const next = [...scenes]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(Math.max(0, Math.min(next.length, Math.round(targetIndex))), 0, moved)
  return next
}

/** Reorders only the Shots belonging to the same Scene, preserving other Scene slots. */
export function reorderShotsWithinScene(shots: readonly ShotDocument[], shotId: string, targetIndex: number): ShotDocument[] {
  const source = shots.find((shot) => shot.id === shotId)
  if (!source) return [...shots]
  const sceneSlots = shots.flatMap((shot, index) => shot.sceneId === source.sceneId ? [index] : [])
  const sourceLocalIndex = sceneSlots.findIndex((index) => shots[index]?.id === shotId)
  if (sourceLocalIndex < 0) return [...shots]
  const ordered = sceneSlots.map((index) => shots[index])
  const [moved] = ordered.splice(sourceLocalIndex, 1)
  ordered.splice(Math.max(0, Math.min(ordered.length, Math.round(targetIndex))), 0, moved)
  const next = [...shots]
  sceneSlots.forEach((slot, index) => { next[slot] = ordered[index] })
  return next.map((shot, order) => ({ ...shot, order }))
}

export function insertSceneEntryAt(scenes: readonly ProjectSceneEntry[], entry: ProjectSceneEntry, targetIndex: number): ProjectSceneEntry[] {
  const next = [...scenes]
  next.splice(Math.max(0, Math.min(next.length, Math.round(targetIndex))), 0, entry)
  return next
}

/** Inserts a Shot next to its reference Shot without touching Master clips. */
export function insertShotRelative(shots: readonly ShotDocument[], shot: ShotDocument, referenceShotId: string, position: RelativeInsertPosition): ShotDocument[] {
  const referenceIndex = shots.findIndex((candidate) => candidate.id === referenceShotId)
  if (referenceIndex < 0) return [...shots]
  const reference = shots[referenceIndex]
  if (reference.sceneId !== shot.sceneId) return [...shots]
  const next = [...shots]
  next.splice(referenceIndex + (position === 'after' ? 1 : 0), 0, shot)
  return next.map((candidate, order) => ({ ...candidate, order }))
}

export function sceneShotOrdinal(shots: readonly ShotDocument[], shotId: string): number {
  const shot = shots.find((candidate) => candidate.id === shotId)
  if (!shot) return 0
  return shots.filter((candidate) => candidate.sceneId === shot.sceneId).findIndex((candidate) => candidate.id === shotId)
}
