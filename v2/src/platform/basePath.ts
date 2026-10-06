export function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim() || '/'
  if (trimmed === './') return trimmed
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}
