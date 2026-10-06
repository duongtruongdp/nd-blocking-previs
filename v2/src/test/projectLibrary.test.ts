import { describe, expect, it } from 'vitest'
import { RECENT_PROJECT_LIMIT, basename, createRecentProjectEntry, duplicateFilename, filenameWithoutExtension, firstSupportedProjectPath, isProjectFilePath, parseRecentProjects, projectFilenameFromInput, recentProjectIdentity, recentProjectThumbnailKey, removeRecentProject, siblingPath, sortRecentProjects, updateRecentProjectPath, upsertRecentProject } from '../platform/projectLibrary'

function entry(path: string, lastOpenedAt: string, missing = false) {
  return createRecentProjectEntry({ path, displayName: filenameWithoutExtension(path), lastOpenedAt, lastKnownModifiedAt: null, lastKnownSceneCount: 3, missing })
}

describe('recent Project library rules', () => {
  it('deduplicates by native path and moves reopened projects to the top', () => {
    const original = entry('/Projects/Scene.ndblock', '2026-01-01T00:00:00.000Z')
    const reopened = entry('/Projects/Scene.ndblock', '2026-01-03T00:00:00.000Z')
    const result = upsertRecentProject([original, entry('/Projects/Other.ndblock', '2026-01-02T00:00:00.000Z')], reopened)
    expect(result.map((item) => item.path)).toEqual(['/Projects/Scene.ndblock', '/Projects/Other.ndblock'])
    expect(result[0].lastOpenedAt).toBe(reopened.lastOpenedAt)
  })

  it('treats Windows path case as the same identity', () => {
    expect(recentProjectIdentity('C:\\Projects\\Shot.ndblock')).toBe(recentProjectIdentity('c:/projects/shot.ndblock'))
  })

  it('sorts by last opened time and enforces the recent limit', () => {
    const entries = Array.from({ length: RECENT_PROJECT_LIMIT + 3 }, (_, index) => entry(`/Projects/${index}.ndblock`, `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`))
    const result = sortRecentProjects(entries).slice(0, RECENT_PROJECT_LIMIT)
    expect(result).toHaveLength(RECENT_PROJECT_LIMIT)
    expect(result[0].path).toContain('18.ndblock')
  })

  it('parses malformed store values safely and preserves valid metadata', () => {
    const result = parseRecentProjects([{ path: '/Projects/Valid.ndblock', displayName: 'Valid', lastOpenedAt: '2026-01-01T00:00:00.000Z', lastKnownSceneCount: 2 }, null, { path: 42 }])
    expect(result).toHaveLength(1)
    expect(result[0].displayName).toBe('Valid')
    expect(result[0].modifiedSinceLastOpen).toBe(false)
    expect(parseRecentProjects({ recentProjects: [] })).toEqual([])
  })

  it('represents missing paths without deleting metadata', () => {
    const missing = entry('/Projects/Moved.ndblock', '2026-01-01T00:00:00.000Z', true)
    expect(missing.missing).toBe(true)
    expect(removeRecentProject([missing], '/Projects/Other.ndblock')).toEqual([missing])
  })

  it('updates a renamed path without leaving the old entry', () => {
    const oldEntry = entry('/Projects/Old.ndblock', '2026-01-01T00:00:00.000Z')
    const nextEntry = entry('/Projects/New.ndblock', '2026-01-02T00:00:00.000Z')
    const result = updateRecentProjectPath([oldEntry], oldEntry.path, nextEntry)
    expect(result.map((item) => item.path)).toEqual(['/Projects/New.ndblock'])
  })

  it('removes only metadata for Remove from Recent', () => {
    const first = entry('/Projects/First.ndblock', '2026-01-01T00:00:00.000Z')
    const second = entry('/Projects/Second.ndblock', '2026-01-02T00:00:00.000Z')
    expect(removeRecentProject([first, second], first.path)).toEqual([second])
  })

  it('validates filenames while preserving the ndblock extension', () => {
    expect(projectFilenameFromInput('Test')).toBe('Test.ndblock')
    expect(projectFilenameFromInput('Test.ndblock')).toBe('Test.ndblock')
    expect(projectFilenameFromInput('Quảng cáo Tết 2027')).toBe('Quảng cáo Tết 2027.ndblock')
    expect(projectFilenameFromInput('')).toBeNull()
    expect(projectFilenameFromInput('../unsafe')).toBeNull()
  })

  it('builds platform-safe sibling and duplicate filenames', () => {
    expect(siblingPath('C:\\Projects\\Shot.ndblock', duplicateFilename('C:\\Projects\\Shot.ndblock', 1))).toBe('C:\\Projects\\Shot Copy.ndblock')
    expect(siblingPath('/Projects/Shot.ndblock', duplicateFilename('/Projects/Shot.ndblock', 3))).toBe('/Projects/Shot Copy 3.ndblock')
    expect(basename('/Projects/Shot.ndblock')).toBe('Shot.ndblock')
  })

  it('creates stable thumbnail metadata without changing the project file', () => {
    expect(recentProjectThumbnailKey('/Projects/Shot.ndblock')).toBe(recentProjectThumbnailKey('/Projects/Shot.ndblock'))
    expect(recentProjectThumbnailKey('/Projects/Shot.ndblock')).not.toBe(recentProjectThumbnailKey('/Projects/Other.ndblock'))
    expect(parseRecentProjects([{ path: '/Projects/Shot.ndblock', displayName: 'Shot', lastOpenedAt: '2026-01-01T00:00:00.000Z' }])[0].thumbnailKey).toBe(recentProjectThumbnailKey('/Projects/Shot.ndblock'))
  })

  it('routes only the first supported dropped project file', () => {
    expect(isProjectFilePath('/shots/TAKE.NDBLOCK')).toBe(true)
    expect(isProjectFilePath('/shots/TAKE.ndscene')).toBe(false)
    expect(firstSupportedProjectPath(['/shots/notes.txt', '/shots/TAKE.ndblock', '/shots/SECOND.ndblock'])).toBe('/shots/TAKE.ndblock')
    expect(firstSupportedProjectPath(['/shots/notes.txt'])).toBeNull()
  })
})
