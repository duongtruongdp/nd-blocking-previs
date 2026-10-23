import type { CameraDocument, RationalFrameRate, SceneDocument } from '../core/sceneDocument'
import type { ProjectDocument } from '../core/projectDocument'
import { formatShotDisplayIdentity, type ShotDocument } from '../core/shotDocument'
import { resolveCameraDefinition } from '../core/cameraDatabase'
import { frameToTimecode } from '../timeline/timelineMath'
import type { EvaluatedEntityState } from '../timeline/timelineEvaluator'
import type { ShotInfoBurnInField, ShotInfoBurnInFields, ShotInfoBurnInPreset, ShotInfoBurnInSettings } from './exportTypes'

export const SHOT_INFO_BURN_IN_FIELDS: readonly ShotInfoBurnInField[] = ['projectName', 'sceneName', 'shotNameNumber', 'shotSize', 'cameraModel', 'focalLength', 'cameraMovement', 'timecode', 'shotNotes']

export const SHOT_INFO_BURN_IN_FIELD_LABELS: Readonly<Record<ShotInfoBurnInField, string>> = {
  projectName: 'Project Name',
  sceneName: 'Scene Name',
  shotNameNumber: 'Shot Name / Number',
  shotSize: 'Shot Size',
  cameraModel: 'Camera Model',
  focalLength: 'Focal Length',
  cameraMovement: 'Camera Movement',
  timecode: 'Timecode',
  shotNotes: 'Shot Notes',
}

export function shotInfoBurnInFieldsForPreset(preset: ShotInfoBurnInPreset): ShotInfoBurnInFields {
  const fields = Object.fromEntries(SHOT_INFO_BURN_IN_FIELDS.map((field) => [field, false])) as ShotInfoBurnInFields
  if (preset === 'minimal') {
    fields.shotNameNumber = true
    fields.timecode = true
    return fields
  }
  fields.projectName = true
  fields.sceneName = true
  fields.shotNameNumber = true
  fields.shotSize = true
  fields.cameraModel = true
  fields.focalLength = true
  fields.cameraMovement = true
  fields.timecode = true
  return fields
}

export function defaultShotInfoBurnInSettings(): ShotInfoBurnInSettings {
  return { enabled: false, preset: 'minimal', fields: shotInfoBurnInFieldsForPreset('minimal') }
}

const SHOT_INFO_BURN_IN_STORAGE_KEY = 'nd-blocking-previs.export.shot-info-burn-in.v1'

export function loadShotInfoBurnInSettings(): ShotInfoBurnInSettings {
  const fallback = defaultShotInfoBurnInSettings()
  try {
    const raw = globalThis.localStorage?.getItem(SHOT_INFO_BURN_IN_STORAGE_KEY)
    if (!raw) return fallback
    const value = JSON.parse(raw) as Partial<ShotInfoBurnInSettings> & { fields?: Partial<ShotInfoBurnInFields> }
    const preset = value.preset === 'detailed' ? 'detailed' : 'minimal'
    const defaults = shotInfoBurnInFieldsForPreset(preset)
    const fields = Object.fromEntries(SHOT_INFO_BURN_IN_FIELDS.map((field) => [field, value.fields?.[field] === true])) as ShotInfoBurnInFields
    return { enabled: value.enabled === true, preset, fields: { ...defaults, ...fields } }
  } catch {
    return fallback
  }
}

export function saveShotInfoBurnInSettings(settings: ShotInfoBurnInSettings): void {
  try {
    globalThis.localStorage?.setItem(SHOT_INFO_BURN_IN_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Local preference storage is optional and must never block an export.
  }
}

export type ShotInfoBurnInContext = {
  source: 'scene' | 'master'
  projectName: string
  scene: SceneDocument
  shot: ShotDocument | null
  camera: CameraDocument | null
  evaluatedCamera?: EvaluatedEntityState
  frame: number
  frameRate: RationalFrameRate
}

export type ShotInfoBurnInModel = {
  projectName: string | null
  sceneName: string | null
  shotNameNumber: string | null
  shotSize: string | null
  cameraModel: string | null
  focalLength: string | null
  cameraMovement: string | null
  timecode: string | null
  shotNotes: string | null
}

export type ShotInfoBurnInBlockLayout = {
  lines: string[]
  x: number
  y: number
  width: number
  height: number
  align: CanvasTextAlign
}

export type ShotInfoBurnInLayout = {
  topLeft: ShotInfoBurnInBlockLayout | null
  topRight: ShotInfoBurnInBlockLayout | null
  bottomLeft: ShotInfoBurnInBlockLayout | null
  bottomRight: ShotInfoBurnInBlockLayout | null
  margin: number
  lineHeight: number
}

export function resolveSceneShotForBurnIn(project: ProjectDocument, scene: SceneDocument, cameraId: string | null, frame: number): ShotDocument | null {
  if (!cameraId) return null
  const matches = project.shots.filter((shot) => shot.sceneId === scene.metadata.id && shot.cameraId === cameraId && frame >= shot.startFrame && frame < shot.endFrame)
  return matches.length === 1 ? matches[0] : null
}

export function buildShotInfoBurnInModel(context: ShotInfoBurnInContext): ShotInfoBurnInModel {
  const camera = context.camera
  const evaluatedFocalLength = context.evaluatedCamera?.focalLengthMm
  const focalLengthMm = typeof evaluatedFocalLength === 'number' && Number.isFinite(evaluatedFocalLength) ? evaluatedFocalLength : camera?.focalLengthMm
  const definition = camera ? resolveCameraDefinition(camera.cameraDefinitionId) : null
  const shotIdentity = context.shot ? formatShotDisplayIdentity(context.shot.order, context.shot.name).export : null
  return {
    projectName: clean(context.projectName),
    sceneName: clean(context.scene.metadata.name),
    shotNameNumber: shotIdentity,
    shotSize: clean(context.shot?.shotSize),
    cameraModel: clean(definition?.model ?? camera?.cameraSnapshot?.model ?? camera?.name),
    focalLength: focalLengthMm === undefined ? null : `${formatNumber(focalLengthMm)}mm`,
    cameraMovement: clean(context.shot?.movement),
    timecode: frameToTimecode(context.frame, context.frameRate),
    shotNotes: clean(context.shot?.notes),
  }
}

export function resolveSceneShotInfoBurnInModel(project: ProjectDocument, projectName: string, scene: SceneDocument, cameraId: string | null, frame: number, frameRate: RationalFrameRate, evaluatedEntities: Record<string, EvaluatedEntityState>): ShotInfoBurnInModel {
  const camera = cameraId ? scene.cameras.find((candidate) => candidate.id === cameraId) ?? null : null
  return buildShotInfoBurnInModel({ source: 'scene', projectName, scene, shot: resolveSceneShotForBurnIn(project, scene, cameraId, frame), camera, evaluatedCamera: cameraId ? evaluatedEntities[cameraId] : undefined, frame, frameRate })
}

export function modelLinesForFields(model: ShotInfoBurnInModel, fields: ShotInfoBurnInFields): { topLeft: string[]; topRight: string[]; bottomLeft: string[]; bottomRight: string[] } {
  const topLeft = [fields.projectName ? model.projectName : null, fields.sceneName ? model.sceneName : null, fields.shotNameNumber ? model.shotNameNumber : null].filter((value): value is string => Boolean(value))
  const topRight = fields.timecode && model.timecode ? [model.timecode] : []
  const bottomLeft = [
    fields.cameraModel ? model.cameraModel : null,
    fields.focalLength ? model.focalLength : null,
    fields.cameraMovement ? model.cameraMovement : null,
    fields.shotSize ? model.shotSize : null,
  ].filter((value): value is string => Boolean(value))
  const bottomRight = fields.shotNotes && model.shotNotes ? [model.shotNotes] : []
  return { topLeft, topRight, bottomLeft, bottomRight }
}

export function measureShotInfoBurnInLayout(context: CanvasRenderingContext2D, width: number, height: number, model: ShotInfoBurnInModel, settings: ShotInfoBurnInSettings): ShotInfoBurnInLayout {
  if (!settings.enabled) return { topLeft: null, topRight: null, bottomLeft: null, bottomRight: null, margin: 0, lineHeight: 0 }
  const lines = modelLinesForFields(model, settings.fields)
  const scale = Math.max(0.8, Math.min(1.8, Math.min(width / 1920, height / 1080)))
  const fontSize = Math.round(16 * scale)
  const lineHeight = Math.round(fontSize * 1.35)
  const margin = Math.max(22, Math.round(Math.min(width, height) * 0.045))
  const gap = Math.max(16, Math.round(fontSize * 0.9))
  const maxBoxWidth = Math.max(120, Math.floor((width - margin * 2 - gap) / 2))
  const maxLines = Math.min(6, Math.max(3, Math.floor((height - margin * 2) / lineHeight) - 2))
  const measure = (sourceLines: string[], align: CanvasTextAlign, vertical: 'top' | 'bottom'): ShotInfoBurnInBlockLayout | null => {
    const block = measureBlock(context, sourceLines, maxBoxWidth, lineHeight, maxLines)
    if (!block) return null
    const x = align === 'right' ? width - margin - block.width : margin
    const y = vertical === 'bottom' ? height - margin - block.height : margin
    return { ...block, x, y, align }
  }
  return {
    topLeft: measure(lines.topLeft, 'left', 'top'),
    topRight: measure(lines.topRight, 'right', 'top'),
    bottomLeft: measure(lines.bottomLeft, 'left', 'bottom'),
    bottomRight: measure(lines.bottomRight, 'right', 'bottom'),
    margin,
    lineHeight,
  }
}

export function drawShotInfoBurnIn(context: CanvasRenderingContext2D, width: number, height: number, model: ShotInfoBurnInModel, settings: ShotInfoBurnInSettings): void {
  if (!settings.enabled) return
  const scale = Math.max(0.8, Math.min(1.8, Math.min(width / 1920, height / 1080)))
  const fontSize = Math.round(16 * scale)
  context.save()
  context.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  context.textBaseline = 'top'
  context.shadowColor = 'rgba(0, 0, 0, .42)'
  context.shadowBlur = Math.max(2, Math.round(4 * scale))
  context.shadowOffsetY = Math.max(1, Math.round(scale))
  const layout = measureShotInfoBurnInLayout(context, width, height, model, settings)
  drawMeasuredBlock(context, layout.topLeft, layout.lineHeight)
  drawMeasuredBlock(context, layout.topRight, layout.lineHeight)
  drawMeasuredBlock(context, layout.bottomLeft, layout.lineHeight)
  drawMeasuredBlock(context, layout.bottomRight, layout.lineHeight)
  context.restore()
}

function measureBlock(context: CanvasRenderingContext2D, sourceLines: string[], maxWidth: number, lineHeight: number, maxLines: number): Omit<ShotInfoBurnInBlockLayout, 'x' | 'y' | 'align'> | null {
  if (sourceLines.length === 0) return null
  const wrappedLines = sourceLines.flatMap((line) => wrapLine(context, line, maxWidth - 24))
  const lines = wrappedLines.slice(0, maxLines)
  if (wrappedLines.length > maxLines && lines.length > 0) lines[lines.length - 1] = ellipsisLine(context, lines[lines.length - 1], maxWidth - 24)
  const paddingX = 12
  const paddingY = 9
  const boxWidth = Math.min(maxWidth, Math.max(120, Math.max(...lines.map((line) => context.measureText(line).width)) + paddingX * 2))
  const boxHeight = lines.length * lineHeight + paddingY * 2
  return { lines, width: boxWidth, height: boxHeight }
}

function ellipsisLine(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  let result = value.trimEnd()
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result}…`
}

function drawMeasuredBlock(context: CanvasRenderingContext2D, block: ShotInfoBurnInBlockLayout | null, lineHeight: number): void {
  if (!block) return
  context.shadowColor = 'transparent'
  context.fillStyle = 'rgba(8, 12, 18, .68)'
  roundedRect(context, block.x, block.y, block.width, block.height, 6)
  context.fill()
  context.fillStyle = '#fff'
  context.textAlign = block.align
  const paddingX = 12
  const paddingY = 9
  const textX = block.align === 'right' ? block.x + block.width - paddingX : block.x + paddingX
  block.lines.forEach((line, index) => context.fillText(line, textX, block.y + paddingY + index * lineHeight))
}

function wrapLine(context: CanvasRenderingContext2D, value: string, maxWidth: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = ''
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = word
    } else current = candidate
  })
  if (current) lines.push(current)
  return lines.map((line) => truncateLine(context, line, maxWidth))
}

function truncateLine(context: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (context.measureText(value).width <= maxWidth) return value
  let result = value
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1)
  return `${result.trimEnd()}…`
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + width, y, x + width, y + height, r)
  context.arcTo(x + width, y + height, x, y + height, r)
  context.arcTo(x, y + height, x, y, r)
  context.arcTo(x, y, x + width, y, r)
  context.closePath()
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '')
}
