import ExcelJS from 'exceljs'
import type { ProjectDocument } from '../core/projectDocument'
import { buildShotListExportRows, shotListExportColumns, shotListExportValue, SHOT_LIST_EXPORT_COLUMN_LABELS, type ShotListExportScope } from '../core/shotListExport'
import type { ShotListSettings } from '../core/shotListSettings'

export type ShotListWorkbookModel = {
  projectName: string
  title: 'Shot List'
  columns: readonly ReturnType<typeof shotListExportColumns>[number][]
  rows: ReturnType<typeof buildShotListExportRows>
  headerRowNumber: 4
  columnWidths: readonly number[]
  notesWrapText: true
  thumbnailEmbedding: 'embedded' | 'text-fallback'
}

export function buildShotListWorkbookModel(project: ProjectDocument, settings: ShotListSettings | undefined, scope: ShotListExportScope = { kind: 'all' }): ShotListWorkbookModel {
  const columns = shotListExportColumns(settings, 'xlsx')
  const rows = buildShotListExportRows(project, settings, scope)
  return {
    projectName: project.name.trim() || 'Untitled Project',
    title: 'Shot List',
    columns,
    rows,
    headerRowNumber: 4,
    columnWidths: columns.map((column) => column === 'thumbnail' ? 24 : column === 'notes' ? 42 : column === 'shot' ? 28 : column === 'scene' ? 20 : 16),
    notesWrapText: true,
    thumbnailEmbedding: rows.some((row) => row.thumbnailDataUrl) ? 'embedded' : 'text-fallback',
  }
}

export async function buildShotListXlsx(project: ProjectDocument, settings: ShotListSettings | undefined, scope: ShotListExportScope = { kind: 'all' }): Promise<Blob> {
  const model = buildShotListWorkbookModel(project, settings, scope)
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ND Blocking & Previs'
  workbook.created = new Date()
  const worksheet = workbook.addWorksheet('Shot List')
  const endColumn = columnLetter(model.columns.length)
  worksheet.mergeCells(`A1:${endColumn}1`)
  worksheet.mergeCells(`A2:${endColumn}2`)
  worksheet.getCell('A1').value = model.projectName
  worksheet.getCell('A2').value = model.title
  worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: '24344D' } }
  worksheet.getCell('A2').font = { bold: true, size: 12, color: { argb: '5C6C84' } }
  worksheet.getRow(1).height = 24
  worksheet.getRow(2).height = 20
  worksheet.addRow([])
  const headerRow = worksheet.addRow(model.columns.map((column) => SHOT_LIST_EXPORT_COLUMN_LABELS[column]))
  headerRow.height = 22
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '365B87' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' }
  worksheet.views = [{ state: 'frozen', ySplit: model.headerRowNumber }]
  worksheet.autoFilter = { from: { row: model.headerRowNumber, column: 1 }, to: { row: model.headerRowNumber, column: model.columns.length } }
  model.columns.forEach((column, index) => { worksheet.getColumn(index + 1).width = model.columnWidths[index] })

  const thumbnailImages: Array<{ imageId: number; rowNumber: number; columnIndex: number }> = []
  model.rows.forEach((row) => {
    const rowNumber = worksheet.rowCount + 1
    const values = model.columns.map((column) => shotListExportValue(row, column))
    const worksheetRow = worksheet.addRow(values)
    worksheetRow.height = model.columns.includes('thumbnail') ? 82 : 24
    worksheetRow.alignment = { vertical: 'top', wrapText: true }
    worksheetRow.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: { argb: 'D8DEE8' } } } })
    const thumbnailColumnIndex = model.columns.indexOf('thumbnail')
    if (thumbnailColumnIndex >= 0 && row.thumbnailDataUrl) {
      const imageId = workbook.addImage({ base64: row.thumbnailDataUrl, extension: imageExtension(row.thumbnailDataUrl) })
      thumbnailImages.push({ imageId, rowNumber, columnIndex: thumbnailColumnIndex })
    }
  })
  thumbnailImages.forEach(({ imageId, rowNumber, columnIndex }) => worksheet.addImage(imageId, { tl: { col: columnIndex + 0.08, row: rowNumber - 1 + 0.08 }, ext: { width: 176, height: 99 } }))
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

function imageExtension(dataUrl: string): 'jpeg' | 'png' | 'gif' {
  const match = /^data:image\/(jpeg|jpg|png|gif);/i.exec(dataUrl)
  return match?.[1].toLowerCase() === 'png' ? 'png' : match?.[1].toLowerCase() === 'gif' ? 'gif' : 'jpeg'
}

function columnLetter(column: number): string {
  let value = Math.max(1, column)
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}
