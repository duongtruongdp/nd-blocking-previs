export const RECENT_PROJECT_LIMIT = 16

export type RecentProjectEntry = {
  readonly id: string
  readonly path: string
  readonly displayName: string
  readonly lastOpenedAt: string
  readonly lastKnownModifiedAt: string | null
  readonly lastKnownSceneCount: number | null
  readonly missing: boolean
  readonly modifiedSinceLastOpen: boolean
}

export type RecentProjectInput = Omit<RecentProjectEntry, 'id' | 'missing' | 'modifiedSinceLastOpen'> & { id?: string; missing?: boolean; modifiedSinceLastOpen?: boolean }

export function recentProjectIdentity(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+/g, '/')
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized
}

export function createRecentProjectEntry(input: RecentProjectInput): RecentProjectEntry {
  return {
    id: input.id ?? recentProjectIdentity(input.path),
    path: input.path,
    displayName: input.displayName,
    lastOpenedAt: input.lastOpenedAt,
    lastKnownModifiedAt: input.lastKnownModifiedAt,
    lastKnownSceneCount: input.lastKnownSceneCount,
    missing: input.missing ?? false,
    modifiedSinceLastOpen: input.modifiedSinceLastOpen ?? false,
  }
}

export function sortRecentProjects(entries: readonly RecentProjectEntry[]): RecentProjectEntry[] {
  return [...entries].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
}

export function upsertRecentProject(entries: readonly RecentProjectEntry[], entry: RecentProjectEntry): RecentProjectEntry[] {
  const identity = recentProjectIdentity(entry.path)
  const withoutExisting = entries.filter((candidate) => recentProjectIdentity(candidate.path) !== identity)
  return sortRecentProjects([entry, ...withoutExisting]).slice(0, RECENT_PROJECT_LIMIT)
}

export function removeRecentProject(entries: readonly RecentProjectEntry[], path: string): RecentProjectEntry[] {
  const identity = recentProjectIdentity(path)
  return entries.filter((entry) => recentProjectIdentity(entry.path) !== identity)
}

export function updateRecentProjectPath(entries: readonly RecentProjectEntry[], oldPath: string, nextEntry: RecentProjectEntry): RecentProjectEntry[] {
  return upsertRecentProject(removeRecentProject(entries, oldPath), nextEntry)
}

export function parseRecentProjects(value: unknown): RecentProjectEntry[] {
  if (!Array.isArray(value)) return []
  const parsed = value.flatMap((candidate): RecentProjectEntry[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const record = candidate as Record<string, unknown>
    if (typeof record.path !== 'string' || !record.path.trim() || typeof record.displayName !== 'string' || typeof record.lastOpenedAt !== 'string') return []
    const sceneCount = typeof record.lastKnownSceneCount === 'number' && Number.isInteger(record.lastKnownSceneCount) && record.lastKnownSceneCount >= 0 ? record.lastKnownSceneCount : null
    return [createRecentProjectEntry({
      id: typeof record.id === 'string' ? record.id : undefined,
      path: record.path,
      displayName: record.displayName || filenameWithoutExtension(record.path),
      lastOpenedAt: record.lastOpenedAt,
      lastKnownModifiedAt: typeof record.lastKnownModifiedAt === 'string' ? record.lastKnownModifiedAt : null,
      lastKnownSceneCount: sceneCount,
      missing: record.missing === true,
      modifiedSinceLastOpen: record.modifiedSinceLastOpen === true,
    })]
  })
  const deduped = parsed.reduce<RecentProjectEntry[]>((result, entry) => upsertRecentProject(result, entry), [])
  return sortRecentProjects(deduped).slice(0, RECENT_PROJECT_LIMIT)
}

export function filenameWithoutExtension(path: string): string {
  const filename = path.split(/[\\/]/).pop() ?? path
  return filename.replace(/\.ndblock$/i, '') || 'Untitled Project'
}

export function parentFolderName(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : ''
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function projectFilenameFromInput(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..' || Array.from(trimmed).some((character) => character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character))) return null
  const withoutExtension = trimmed.replace(/\.ndblock$/i, '').trim()
  if (!withoutExtension || withoutExtension === '.' || withoutExtension === '..') return null
  return `${withoutExtension}.ndblock`
}

export function siblingPath(path: string, filename: string): string {
  const lastSeparator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return lastSeparator < 0 ? filename : `${path.slice(0, lastSeparator + 1)}${filename}`
}

export function duplicateFilename(path: string, copyIndex: number): string {
  const original = filenameWithoutExtension(path)
  return `${original} Copy${copyIndex > 1 ? ` ${copyIndex}` : ''}.ndblock`
}
