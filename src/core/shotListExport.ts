import type { ProjectDocument } from './projectDocument'
import { normalizeShotListSettings, SHOT_LIST_COLUMNS, type ShotListColumn, type ShotListSettings } from './shotListSettings'
import { buildShotListCards, filterShotListCards, type ShotListCardModel } from './shotListModel'
import { formatShotDisplayIdentity } from './shotDocument'
import { sanitizeExportFilename } from '../export/exportMath'

export type ShotListExportScope =
  | { kind: 'all' }
  | { kind: 'currentView'; sceneId: string | null }

export type ShotListPrintLayout = 'storyboard' | 'list'

export type ShotListExportRow = {
  shotId: string
  order: number
  number: string
  shotName: string
  thumbnailDataUrl: string | null
  scene: string
  shot: string
  camera: string
  lens: string
  shotSize: string
  angle: string
  movement: string
  equipment: string
  duration: string
  notes: string
}

export type ShotListPrintModel = {
  projectName: string
  title: 'Shot List'
  layout: ShotListPrintLayout
  columns: ShotListColumn[]
  rows: ShotListExportRow[]
}

export const SHOT_LIST_EXPORT_COLUMN_LABELS: Record<ShotListColumn, string> = {
  thumbnail: 'Thumbnail',
  scene: 'Scene',
  shot: 'Shot',
  camera: 'Camera',
  lens: 'Lens',
  shotSize: 'Shot Size',
  angle: 'Angle',
  movement: 'Movement',
  equipment: 'Equipment',
  duration: 'Duration',
  notes: 'Notes',
}

export const SHOT_LIST_PRINT_COLUMN_WEIGHTS: Record<ShotListColumn, number> = {
  thumbnail: 9,
  scene: 8,
  shot: 13,
  camera: 10,
  lens: 6,
  shotSize: 8,
  angle: 9,
  movement: 10,
  equipment: 10,
  duration: 8,
  notes: 9,
}

export function buildShotListExportRows(project: ProjectDocument, settings: ShotListSettings | undefined, scope: ShotListExportScope = { kind: 'all' }): ShotListExportRow[] {
  const cards = buildShotListCards(project)
  const scopedCards = scope.kind === 'currentView' ? filterShotListCards(cards, scope.sceneId) : cards
  return scopedCards.map(rowFromCard)
}

export function buildShotListPrintModel(project: ProjectDocument, settings: ShotListSettings | undefined, scope: ShotListExportScope, layout: ShotListPrintLayout): ShotListPrintModel {
  return {
    projectName: project.name.trim() || 'Untitled Project',
    title: 'Shot List',
    layout,
    columns: shotListExportColumns(settings, 'print'),
    rows: buildShotListExportRows(project, settings, scope),
  }
}

export function defaultShotListPrintLayout(view: 'grid' | 'list'): ShotListPrintLayout {
  return view === 'list' ? 'list' : 'storyboard'
}

export function shotListExportColumns(settings: ShotListSettings | undefined, format: 'xlsx' | 'csv' | 'print' = 'xlsx'): ShotListColumn[] {
  const normalized = normalizeShotListSettings(settings)
  const visible = SHOT_LIST_COLUMNS.filter((column) => normalized.visibleColumns.includes(column))
  return format === 'csv' ? visible.filter((column) => column !== 'thumbnail') : visible
}

export function shotListExportValue(row: ShotListExportRow, column: ShotListColumn): string {
  if (column === 'thumbnail') return row.thumbnailDataUrl ? 'Embedded' : 'No Thumbnail'
  return row[column]
}

export function shotListPrintColumnWidths(columns: readonly ShotListColumn[]): Partial<Record<ShotListColumn, string>> {
  const total = columns.reduce((sum, column) => sum + SHOT_LIST_PRINT_COLUMN_WEIGHTS[column], 0)
  if (total <= 0) return {}
  return Object.fromEntries(columns.map((column) => [column, `${(SHOT_LIST_PRINT_COLUMN_WEIGHTS[column] / total * 100).toFixed(4)}%`])) as Partial<Record<ShotListColumn, string>>
}

export function shotListPrintValue(row: ShotListExportRow, column: ShotListColumn): string {
  if (column === 'shot') return formatShotDisplayIdentity(row.order, row.shotName).table
  return shotListExportValue(row, column)
}

export function buildShotListCsv(project: ProjectDocument, settings: ShotListSettings | undefined, scope: ShotListExportScope = { kind: 'all' }): string {
  const columns = shotListExportColumns(settings, 'csv')
  const rows = buildShotListExportRows(project, settings, scope)
  const header = columns.map((column) => csvEscape(SHOT_LIST_EXPORT_COLUMN_LABELS[column])).join(',')
  const body = rows.map((row) => columns.map((column) => csvEscape(shotListExportValue(row, column))).join(',')).join('\r\n')
  return `\uFEFF${header}${body ? `\r\n${body}` : ''}\r\n`
}

export function shotListExportFilename(projectName: string, extension: 'csv' | 'xlsx' | 'pdf'): string {
  return `${sanitizeExportFilename(projectName.trim() || 'Untitled Project')}_Shot_List.${extension}`
}

export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

function rowFromCard(card: ShotListCardModel): ShotListExportRow {
  return {
    shotId: card.shot.id,
    order: card.orderIndex,
    number: card.numberLabel,
    shotName: card.shot.name,
    thumbnailDataUrl: card.shot.thumbnail?.dataUrl ?? null,
    scene: card.sceneName,
    shot: formatShotDisplayIdentity(card.orderIndex, card.shot.name).export,
    camera: card.cameraName,
    lens: card.lensLabel,
    shotSize: card.shot.shotSize ?? '',
    angle: card.shot.angle ?? '',
    movement: card.shot.movement ?? '',
    equipment: card.shot.equipment ?? '',
    duration: card.durationLabel,
    notes: card.shot.notes,
  }
}
