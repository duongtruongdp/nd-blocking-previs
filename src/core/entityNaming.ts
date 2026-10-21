export function normalizeEntityName(value: string): string {
  return value.trim()
}

export function committedEntityName(current: string, draft: string): string | null {
  const normalized = normalizeEntityName(draft)
  if (normalized.length === 0 || normalized === current) return null
  return normalized
}

/**
 * Returns the next human-readable name in a scoped collection. Existing names
 * are treated as opaque labels except for a trailing numeric suffix, so names
 * such as "Actor 09" continue as "Actor 10" without creating Copy chains.
 */
export function nextNumberedEntityName(existingNames: readonly string[], sourceName: string): string {
  const used = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()))
  const match = /^(.*?)(?:\s+(\d+))?$/.exec(sourceName.trim())
  const base = (match?.[1] || sourceName.trim() || 'Object').trim()
  const parsed = match?.[2] ? Number(match[2]) : null
  const width = Math.max(2, match?.[2]?.length ?? 0)
  const start = parsed === null ? 1 : parsed + 1
  for (let index = start; index < 10000; index += 1) {
    const candidate = `${base} ${String(index).padStart(width, '0')}`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
  return `${base} ${Date.now()}`
}
