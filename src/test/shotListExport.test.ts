import { describe, expect, it } from 'vitest'
import { CAMERA_DATABASE } from '../core/cameraDatabase'
import { createProjectDocument } from '../core/projectDocument'
import { createEmptySceneDocument, createCameraDocument } from '../core/sceneDocument'
import { createShotDocument, formatShotDisplayIdentity } from '../core/shotDocument'
import { buildShotListCsv, buildShotListExportRows, buildShotListPrintModel, csvEscape, defaultShotListPrintLayout, shotListExportColumns, shotListExportFilename, shotListPrintColumnWidths, shotListPrintValue } from '../core/shotListExport'
import { normalizeShotListSettings } from '../core/shotListSettings'
import { buildShotListWorkbookModel, buildShotListXlsx } from '../export/shotListXlsx'

function projectWithShots() {
  const firstScene = createEmptySceneDocument()
  firstScene.metadata = { ...firstScene.metadata, id: 'scene-01', name: 'Scene 01' }
  firstScene.cameras = [createCameraDocument('camera-01', 'Camera A', [0, 1, 3], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)]
  const secondScene = createEmptySceneDocument()
  secondScene.metadata = { ...secondScene.metadata, id: 'scene-02', name: 'Scene 02' }
  secondScene.cameras = [createCameraDocument('camera-02', 'Camera B', [0, 1, 3], [0, 0, 0], CAMERA_DATABASE[0].id, CAMERA_DATABASE[0].captureModes[0].id)]
  const project = createProjectDocument('project-01', 'My Short / Draft', firstScene)
  const secondEntry = { id: secondScene.metadata.id, name: secondScene.metadata.name, scene: secondScene }
  const shots = [
    createShotDocument({ id: 'shot-a', name: 'Wide, Master', sceneId: 'scene-01', cameraId: 'camera-01', startFrame: 0, endFrame: 48, order: 0, notes: 'Push, then say "action"\nTiếng Việt', shotSize: 'WS', angle: 'Eyelevel', movement: 'Dolly', equipment: 'Tripod', thumbnail: null }),
    createShotDocument({ id: 'shot-b', name: 'Insert', sceneId: 'scene-01', cameraId: 'camera-01', startFrame: 48, endFrame: 72, order: 1, notes: 'Details', thumbnail: null }),
    createShotDocument({ id: 'shot-c', name: 'Reverse', sceneId: 'scene-02', cameraId: 'camera-02', startFrame: 0, endFrame: 24, order: 2, notes: 'Reverse angle', thumbnail: null }),
  ]
  return { ...project, scenes: [project.scenes[0], secondEntry], shots }
}

describe('M4D.2 Shot List export model', () => {
  it('defaults PDF layout from the current Grid/List view and allows an explicit print model layout', () => {
    expect(defaultShotListPrintLayout('grid')).toBe('storyboard')
    expect(defaultShotListPrintLayout('list')).toBe('list')
    const project = projectWithShots()
    const settings = normalizeShotListSettings(undefined)
    const storyboard = buildShotListPrintModel(project, settings, { kind: 'currentView', sceneId: 'scene-01' }, 'storyboard')
    const list = buildShotListPrintModel(project, settings, { kind: 'currentView', sceneId: 'scene-01' }, 'list')
    expect(storyboard.layout).toBe('storyboard')
    expect(list.layout).toBe('list')
    expect(storyboard.projectName).toBe('My Short / Draft')
    expect(storyboard.title).toBe('Shot List')
    expect(storyboard.rows.map((row) => row.shotId)).toEqual(list.rows.map((row) => row.shotId))
    expect(list.columns).toEqual(storyboard.columns)
    expect(list.rows[0]).not.toHaveProperty('actions')
    expect(list.rows[0]).not.toHaveProperty('masterUseCount')
  })

  it('resolves human-readable rows in project Shot order without editor-only fields', () => {
    const rows = buildShotListExportRows(projectWithShots(), normalizeShotListSettings(undefined))
    expect(rows.map((row) => row.shotId)).toEqual(['shot-a', 'shot-b', 'shot-c'])
    expect(rows[0]).toMatchObject({ scene: 'Scene 01', shot: 'SHOT 01 — Wide, Master', camera: 'Camera A', lens: expect.stringMatching(/mm/), shotSize: 'WS', angle: 'Eyelevel', movement: 'Dolly', equipment: 'Tripod', duration: '00:00:02:00', notes: 'Push, then say "action"\nTiếng Việt' })
    expect(rows[0]).not.toHaveProperty('actions')
    expect(rows[0]).not.toHaveProperty('masterUseCount')
  })

  it('formats default and custom Shot identities without repeating generated names', () => {
    expect(formatShotDisplayIdentity(0, 'Shot 01')).toMatchObject({ isDefaultName: true, heading: 'SHOT 01', table: 'Shot 01' })
    expect(formatShotDisplayIdentity(1, 'Shot 02')).toMatchObject({ isDefaultName: true, heading: 'SHOT 02', table: 'Shot 02' })
    expect(formatShotDisplayIdentity(0, 'Wide Master')).toMatchObject({ isDefaultName: false, heading: 'SHOT 01 — Wide Master', table: '01  Wide Master' })
    expect(formatShotDisplayIdentity(0, '  Wide Master  ').table).toBe('01  Wide Master')
    expect(formatShotDisplayIdentity(0, 'shot-01').heading).toBe('SHOT 01 — shot-01')
  })

  it('normalizes print column widths only across visible columns', () => {
    const all = [...normalizeShotListSettings(undefined).visibleColumns]
    const widths = shotListPrintColumnWidths(all)
    expect(Object.keys(widths)).toEqual(all)
    expect(Object.values(widths).reduce((sum, value) => sum + Number.parseFloat(value ?? '0'), 0)).toBeCloseTo(100, 3)
    const reduced = all.filter((column) => column !== 'scene' && column !== 'equipment')
    const reducedWidths = shotListPrintColumnWidths(reduced)
    expect(Object.keys(reducedWidths)).toEqual(reduced)
    expect(reducedWidths.scene).toBeUndefined()
    expect(reducedWidths.duration).not.toBeUndefined()
  })

  it('keeps print table policies explicit for Duration, Notes, and Thumbnail', () => {
    const rows = buildShotListExportRows(projectWithShots(), normalizeShotListSettings(undefined))
    expect(shotListPrintValue(rows[0], 'duration')).toBe('00:00:02:00')
    expect(shotListPrintValue(rows[0], 'notes')).toContain('action')
    expect(shotListPrintValue(rows[0], 'thumbnail')).toBe('No Thumbnail')
    expect(rows[0].shotName).toBe('Wide, Master')
    expect(shotListPrintValue(rows[0], 'shot')).toBe('01  Wide, Master')
  })

  it('respects enabled columns and Current View without mutating settings or project order', () => {
    const project = projectWithShots()
    const settings = normalizeShotListSettings(undefined)
    const changed = { ...settings, visibleColumns: settings.visibleColumns.filter((column) => column !== 'scene' && column !== 'equipment') }
    expect(shotListExportColumns(changed, 'xlsx')).toEqual(['thumbnail', 'shot', 'camera', 'lens', 'shotSize', 'angle', 'movement', 'equipment', 'duration', 'notes'].filter((column) => changed.visibleColumns.includes(column as typeof changed.visibleColumns[number])))
    const filtered = buildShotListExportRows(project, changed, { kind: 'currentView', sceneId: 'scene-01' })
    expect(filtered.map((row) => row.shotId)).toEqual(['shot-a', 'shot-b'])
    expect(project.shots.map((shot) => shot.id)).toEqual(['shot-a', 'shot-b', 'shot-c'])
    expect(settings.visibleColumns).toContain('scene')
  })

  it('omits Thumbnail from CSV and preserves human-readable values and escaping', () => {
    const settings = normalizeShotListSettings(undefined)
    const csv = buildShotListCsv(projectWithShots(), settings)
    expect(csv).toContain('Scene,Shot,Camera,Lens,Shot Size,Angle,Movement,Equipment,Duration,Notes')
    expect(csv).not.toContain('Thumbnail')
    expect(csv).toContain('"SHOT 01 — Wide, Master"')
    expect(csv).toContain('"Push, then say ""action""\nTiếng Việt"')
    expect(csv).not.toContain('Actions')
    expect(csv).not.toContain('Master ×')
    expect(csvEscape('Dòng, "A"\nB')).toBe('"Dòng, ""A""\nB"')
  })

  it('builds a compact workbook model with title, canonical columns, and wrapped notes', () => {
    const settings = normalizeShotListSettings(undefined)
    const model = buildShotListWorkbookModel(projectWithShots(), settings, { kind: 'currentView', sceneId: 'scene-01' })
    expect(model.projectName).toBe('My Short / Draft')
    expect(model.title).toBe('Shot List')
    expect(model.headerRowNumber).toBe(4)
    expect(model.columns).toEqual([...settings.visibleColumns])
    expect(model.rows).toHaveLength(2)
    expect(model.notesWrapText).toBe(true)
    expect(model.columnWidths[model.columns.indexOf('notes')]).toBe(42)
    expect(model.thumbnailEmbedding).toBe('text-fallback')
  })

  it('generates a browser-downloadable XLSX blob without recapturing thumbnails', async () => {
    const blob = await buildShotListXlsx(projectWithShots(), normalizeShotListSettings(undefined), { kind: 'currentView', sceneId: 'scene-01' })
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(blob.size).toBeGreaterThan(1000)
  })

  it('sanitizes project-based filenames', () => {
    expect(shotListExportFilename('Project: Café / Day 01', 'csv')).toBe('Project_Café_Day_01_Shot_List.csv')
    expect(shotListExportFilename('', 'xlsx')).toBe('Untitled_Project_Shot_List.xlsx')
  })
})
