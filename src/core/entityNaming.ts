export function normalizeEntityName(value: string): string {
  return value.trim()
}

export function committedEntityName(current: string, draft: string): string | null {
  const normalized = normalizeEntityName(draft)
  if (normalized.length === 0 || normalized === current) return null
  return normalized
}
