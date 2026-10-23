import { describe, expect, it, vi } from 'vitest'
import { createEmptySceneDocument, createCameraDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { createShotDocument } from '../core/shotDocument'
import { evaluateTimeline } from '../timeline/timelineEvaluator'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'
import { buildShotInfoBurnInModel, defaultShotInfoBurnInSettings, drawShotInfoBurnIn, measureShotInfoBurnInLayout, modelLinesForFields, resolveSceneShotForBurnIn, shotInfoBurnInFieldsForPreset } from '../export/shotInfoBurnIn'

function fixture() {
  const base = createEmptySceneDocument()
  const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1, 4], [0, 0, 0], 'arri-alexa-mini-lf', 'arri-mini-lf-open-gate')
  const scene = { ...base, metadata: { ...base.metadata, id: 'scene-01', name: 'Cảnh Nội' }, cameras: [camera] }
  const projectBase = createProjectDocument('project-01', 'Dự án Previs', scene)
  const shot = createShotDocument({ id: 'shot-01', name: 'Wide Master', sceneId: scene.metadata.id, cameraId: camera.id, startFrame: 10, endFrame: 20, order: 0, notes: 'Góc máy phòng khách', shotSize: 'Wide', movement: 'Dolly in', thumbnail: null })
  return { scene, camera, project: { ...projectBase, scenes: [{ id: scene.metadata.id, name: scene.metadata.name, scene }], shots: [shot] }, shot }
}

function canvasContext(): CanvasRenderingContext2D {
  return {
    font: '', textBaseline: 'top', textAlign: 'left', fillStyle: '', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0,
    measureText: (value: string) => ({ width: value.length * 8 }) as TextMetrics,
    fillText: vi.fn(), fill: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(),
    moveTo: vi.fn(), arcTo: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

describe('shot information burn-in', () => {
  it('keeps burn-in off by default and gives Minimal only Shot and Timecode', () => {
    expect(defaultShotInfoBurnInSettings()).toMatchObject({ enabled: false, preset: 'minimal' })
    expect(shotInfoBurnInFieldsForPreset('minimal')).toMatchObject({ shotNameNumber: true, timecode: true, projectName: false, cameraModel: false })
    expect(shotInfoBurnInFieldsForPreset('detailed')).toMatchObject({ projectName: true, sceneName: true, cameraModel: true, focalLength: true, timecode: true })
  })

  it('resolves only an unambiguous Scene Shot using the canonical half-open frame range', () => {
    const { project, scene, camera, shot } = fixture()
    expect(resolveSceneShotForBurnIn(project, scene, camera.id, 10)?.id).toBe(shot.id)
    expect(resolveSceneShotForBurnIn(project, scene, camera.id, 19)?.id).toBe(shot.id)
    expect(resolveSceneShotForBurnIn(project, scene, camera.id, 20)).toBeNull()
    expect(resolveSceneShotForBurnIn(project, scene, 'missing-camera', 12)).toBeNull()
  })

  it('switches to no Shot-specific metadata when Scene context is ambiguous', () => {
    const { project, scene, camera } = fixture()
    const overlapping = createShotDocument({ id: 'shot-02', name: 'Overlap', sceneId: scene.metadata.id, cameraId: camera.id, startFrame: 12, endFrame: 18, order: 1, notes: 'Do not choose', thumbnail: null })
    const ambiguousProject = { ...project, shots: [...project.shots, overlapping] }
    const model = buildShotInfoBurnInModel({ source: 'scene', projectName: ambiguousProject.name, scene, shot: resolveSceneShotForBurnIn(ambiguousProject, scene, camera.id, 14), camera, frame: 14, frameRate: { numerator: 24, denominator: 1 } })
    expect(model.shotNameNumber).toBeNull()
    expect(model.shotNotes).toBeNull()
    expect(model.timecode).toBe('00:00:00:14')
  })

  it('uses evaluated focal length and Master frame rate rather than selected UI state', () => {
    const { project, scene, camera, shot } = fixture()
    let timeline = scene.timeline
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 0, 35)
    timeline = upsertTimelineKeyframe(timeline, camera.id, 'Camera', 'focalLengthMm', 48, 85)
    const evaluated = evaluateTimeline({ ...scene, timeline }, 24)
    const model = buildShotInfoBurnInModel({ source: 'master', projectName: project.name, scene: { ...scene, timeline }, shot, camera, evaluatedCamera: evaluated[camera.id], frame: 48, frameRate: { numerator: 25, denominator: 1 } })
    expect(model.focalLength).toBe('60mm')
    expect(model.timecode).toBe('00:00:01:23')
  })

  it('preserves Unicode metadata and exposes only selected fields to the layout', () => {
    const { project, scene, camera, shot } = fixture()
    const model = buildShotInfoBurnInModel({ source: 'master', projectName: project.name, scene, shot, camera, frame: 12, frameRate: { numerator: 24, denominator: 1 } })
    const fields = { ...shotInfoBurnInFieldsForPreset('minimal'), shotNotes: true }
    const lines = modelLinesForFields(model, fields)
    expect(lines.topLeft).toContain('SHOT 01 — Wide Master')
    expect(lines.topRight).toEqual(['00:00:00:12'])
    expect(lines.bottomRight).toEqual(['Góc máy phòng khách'])
    expect(model.projectName).toBe('Dự án Previs')
    expect(model.sceneName).toBe('Cảnh Nội')
  })

  it('removes the fixed label and keeps long Vietnamese notes inside safe, non-overlapping corners at 720p and 1080p', () => {
    const { project, scene, camera, shot } = fixture()
    const longNotes = 'Góc máy phòng khách với nhiều lời thoại tiếng Việt cần được xuống dòng tự nhiên để không che dữ liệu máy quay. '.repeat(8)
    const model = { ...buildShotInfoBurnInModel({ source: 'master', projectName: project.name, scene, shot: { ...shot, notes: longNotes }, camera, frame: 12, frameRate: { numerator: 24, denominator: 1 } }), shotNotes: longNotes }
    const settings = { ...defaultShotInfoBurnInSettings(), enabled: true, preset: 'detailed' as const, fields: { ...shotInfoBurnInFieldsForPreset('detailed'), shotNotes: true } }
    for (const [width, height] of [[1280, 720], [1920, 1080]] as const) {
      const context = canvasContext()
      const layout = measureShotInfoBurnInLayout(context, width, height, model, settings)
      expect(layout.bottomRight).not.toBeNull()
      expect(layout.bottomLeft).not.toBeNull()
      expect(layout.bottomLeft!.x + layout.bottomLeft!.width).toBeLessThanOrEqual(layout.bottomRight!.x)
      expect(layout.topLeft!.x + layout.topLeft!.width).toBeLessThanOrEqual(layout.topRight!.x)
      expect(layout.bottomRight!.y).toBeGreaterThanOrEqual(layout.margin)
      expect(layout.bottomRight!.y + layout.bottomRight!.height).toBeLessThanOrEqual(height - layout.margin)
      expect(layout.bottomRight!.lines.at(-1)).toContain('…')
      drawShotInfoBurnIn(context, width, height, model, settings)
      const renderedText = (context.fillText as ReturnType<typeof vi.fn>).mock.calls.map(([value]) => String(value)).join(' ')
      expect(renderedText).not.toContain('PREVIS / REVIEW')
      expect(layout.bottomRight!.lines.length).toBeLessThanOrEqual(6)
    }
  })

  it('does not draw boxes when burn-in is off or metadata is missing, including Minimal and Detailed presets', () => {
    const context = canvasContext()
    const emptyModel = { projectName: null, sceneName: null, shotNameNumber: null, shotSize: null, cameraModel: null, focalLength: null, cameraMovement: null, timecode: null, shotNotes: null }
    const off = defaultShotInfoBurnInSettings()
    expect(measureShotInfoBurnInLayout(context, 1280, 720, emptyModel, off).bottomRight).toBeNull()
    drawShotInfoBurnIn(context, 1280, 720, emptyModel, off)
    expect(context.fill).not.toHaveBeenCalled()
    for (const preset of ['minimal', 'detailed'] as const) {
      const settings = { ...off, enabled: true, preset, fields: shotInfoBurnInFieldsForPreset(preset) }
      const layout = measureShotInfoBurnInLayout(context, 1280, 720, emptyModel, settings)
      expect(layout.topLeft).toBeNull()
      expect(layout.topRight).toBeNull()
      expect(layout.bottomLeft).toBeNull()
      expect(layout.bottomRight).toBeNull()
    }
  })
})
