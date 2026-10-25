export type SelectionState = {
  ids: string[]
  primaryId: string | null
}

export function normalizeSelection(ids: readonly string[], primaryId: string | null, validIds: ReadonlySet<string>): SelectionState {
  const normalizedIds = ids.filter((id, index) => validIds.has(id) && ids.indexOf(id) === index)
  return {
    ids: [...normalizedIds],
    primaryId: primaryId && normalizedIds.includes(primaryId) ? primaryId : normalizedIds[normalizedIds.length - 1] ?? null,
  }
}

export function toggleSelection(selection: SelectionState, entityId: string, validIds: ReadonlySet<string>): SelectionState {
  if (!validIds.has(entityId)) return selection
  const ids = selection.ids.includes(entityId) ? selection.ids.filter((id) => id !== entityId) : [...selection.ids, entityId]
  return normalizeSelection(ids, ids.includes(entityId) ? entityId : null, validIds)
}

/** Expand canonical selection IDs to the entity IDs that should receive visual feedback. */
export function expandSelectionVisualIds(ids: readonly string[], resolveVisualIds?: (id: string) => readonly string[]): string[] {
  const expanded: string[] = []
  ids.forEach((id) => (resolveVisualIds?.(id) ?? [id]).forEach((visualId) => {
    if (!expanded.includes(visualId)) expanded.push(visualId)
  }))
  return expanded
}
