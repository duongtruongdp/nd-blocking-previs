import { describe, expect, it } from 'vitest'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { createShotDocument, SHOT_THUMBNAIL_RENDER_WIDTH, SHOT_THUMBNAIL_TARGET_WIDTH } from '../core/shotDocument'
import { parseProjectFile, serializeProject } from '../core/projectPersistence'
import { addShotListOption, DEFAULT_ANGLE_OPTIONS, DEFAULT_EQUIPMENT_OPTIONS, DEFAULT_MOVEMENT_OPTIONS, DEFAULT_SHOT_SIZE_OPTIONS, normalizeShotListSettings, removeShotListOption, SHOT_LIST_COLUMNS, updateShotListOption } from '../core/shotListSettings'

describe('M4D.1 Shot List settings and metadata', () => {
  it('uses high-resolution thumbnail targets while preserving aspect metadata', () => {
    expect(SHOT_THUMBNAIL_RENDER_WIDTH).toBeGreaterThan(320)
    expect(SHOT_THUMBNAIL_TARGET_WIDTH).toBeGreaterThan(320)
    expect(SHOT_THUMBNAIL_TARGET_WIDTH).toBeLessThanOrEqual(SHOT_THUMBNAIL_RENDER_WIDTH)
  })

  it('defaults new and legacy Shots to nullable descriptive metadata', () => {
    const shot = createShotDocument({ id: 'shot-01', name: 'Shot 01', sceneId: 'scene-01', cameraId: null, startFrame: 0, endFrame: 24, order: 0, notes: '', thumbnail: null })
    expect(shot).toMatchObject({ shotSize: null, angle: null, movement: null, equipment: null })
    const project = createProjectDocument('project-01', 'Project', createEmptySceneDocument())
    const parsed = parseProjectFile(serializeProject({ ...project, settings: {}, shots: [shot] }))
    expect(parsed.shots[0]).toMatchObject({ shotSize: null, angle: null, movement: null, equipment: null })
    expect(parsed.settings.shotList?.visibleColumns).toEqual([...SHOT_LIST_COLUMNS])
  })

  it('seeds the four cinematography vocabularies and keeps Shot required', () => {
    const settings = normalizeShotListSettings(undefined)
    expect(settings.shotSizeOptions).toEqual([...DEFAULT_SHOT_SIZE_OPTIONS])
    expect(settings.angleOptions).toEqual([...DEFAULT_ANGLE_OPTIONS])
    expect(settings.movementOptions).toEqual([...DEFAULT_MOVEMENT_OPTIONS])
    expect(settings.equipmentOptions).toEqual([...DEFAULT_EQUIPMENT_OPTIONS])
    expect(normalizeShotListSettings({ visibleColumns: [] }).visibleColumns).toEqual(['shot'])
  })

  it('trims and rejects blank or case-insensitive duplicate custom options', () => {
    const settings = normalizeShotListSettings(undefined)
    const added = addShotListOption(settings, 'movementOptions', '  360 Orbit  ')
    expect(added?.movementOptions.at(-1)).toBe('360 Orbit')
    expect(addShotListOption(added!, 'movementOptions', '360 orbit')).toBeNull()
    expect(addShotListOption(added!, 'movementOptions', '   ')).toBeNull()
  })

  it('renames and removes vocabulary entries without changing an existing Shot value', () => {
    const settings = normalizeShotListSettings(undefined)
    const renamed = updateShotListOption(settings, 'equipmentOptions', settings.equipmentOptions.indexOf('Tripod'), 'Slider')
    expect(renamed?.equipmentOptions).toContain('Slider')
    const removed = removeShotListOption(renamed!, 'equipmentOptions', renamed!.equipmentOptions.indexOf('Slider'))
    expect(removed?.equipmentOptions).not.toContain('Slider')
    const shot = createShotDocument({ id: 'shot-01', name: 'Shot 01', sceneId: 'scene-01', cameraId: null, startFrame: 0, endFrame: 24, order: 0, notes: '', equipment: 'Slider', thumbnail: null })
    expect(shot.equipment).toBe('Slider')
  })
})
