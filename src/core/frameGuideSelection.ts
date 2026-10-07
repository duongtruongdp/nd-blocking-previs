import type { FrameGuide } from './sceneDocument'

/** Preserve a valid guide ID; use the first guide only for initial/fallback selection. */
export function resolveFrameGuideSelection(guides: readonly FrameGuide[], selectedGuideId: string | null): string | null {
  if (guides.length === 0) return null
  return selectedGuideId && guides.some((guide) => guide.id === selectedGuideId) ? selectedGuideId : guides[0].id
}

/** Select the next adjacent guide after deletion, then the previous one. */
export function frameGuideSelectionAfterDelete(guides: readonly FrameGuide[], deletedGuideId: string): string | null {
  const deletedIndex = guides.findIndex((guide) => guide.id === deletedGuideId)
  if (deletedIndex < 0) return resolveFrameGuideSelection(guides, null)
  const remaining = guides.filter((guide) => guide.id !== deletedGuideId)
  return remaining[deletedIndex]?.id ?? remaining[deletedIndex - 1]?.id ?? null
}
