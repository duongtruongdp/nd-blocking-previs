import type { ShotListColumn } from '../core/shotListSettings'
import { SHOT_LIST_EXPORT_COLUMN_LABELS, shotListPrintColumnWidths, shotListPrintValue, type ShotListExportRow, type ShotListPrintModel } from '../core/shotListExport'

const PAGE_WIDTH = 1600
const PAGE_HEIGHT = 1131
const PAGE_MARGIN = 44
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2
const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_MARGIN * 2
const COLORS = {
  ink: '#24344d',
  body: '#364861',
  muted: '#718096',
  line: '#d8dee8',
  soft: '#eef1f5',
  white: '#ffffff',
}

export type ShotListPdfPage = {
  width: number
  height: number
  jpegBytes: Uint8Array
}

type LoadedImage = {
  image: CanvasImageSource
  width: number
  height: number
}

/**
 * Builds a compact image-backed PDF for the native desktop export path.
 *
 * The browser keeps its established print flow. Tauri's WebView does not
 * provide the same print-dialog/download contract, so desktop pages are
 * rendered with the same ShotListPrintModel into isolated canvases and then
 * written as ordinary JPEG-backed PDF pages. This keeps the implementation
 * dependency-free while preserving Unicode as rendered by the platform font.
 */
export async function buildShotListPdf(model: ShotListPrintModel): Promise<Uint8Array> {
  if (typeof document === 'undefined') throw new Error('Shot List PDF export requires a document renderer.')
  const pages = model.layout === 'storyboard' ? await renderStoryboardPages(model) : await renderListPages(model)
  if (pages.length === 0) throw new Error('The Shot List PDF contains no pages.')
  return buildPdfFromJpegs(pages)
}

export function buildPdfFromJpegs(pages: readonly ShotListPdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error('Cannot build an empty PDF.')
  const objects: Uint8Array[] = []
  const pageObjectNumbers: number[] = []
  const contentObjectNumbers: number[] = []
  const imageObjectNumbers: number[] = []
  let nextObject = 3
  for (const _page of pages) {
    pageObjectNumbers.push(nextObject++)
    contentObjectNumbers.push(nextObject++)
    imageObjectNumbers.push(nextObject++)
  }

  objects.push(pdfObject(1, ascii('<< /Type /Catalog /Pages 2 0 R >>')))
  objects.push(pdfObject(2, ascii(`<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`)))
  pages.forEach((page, index) => {
    const pageObject = pageObjectNumbers[index]
    const contentObject = contentObjectNumbers[index]
    const imageObject = imageObjectNumbers[index]
    const pageBody = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /XObject << /Im${index + 1} ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
    const content = ascii(`q\n842 0 0 595 0 0 cm\n/Im${index + 1} Do\nQ\n`)
    const imageHeader = ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpegBytes.byteLength} >>\nstream\n`)
    const imageBody = concatBytes([imageHeader, page.jpegBytes, ascii('\nendstream')])
    objects.push(pdfObject(pageObject, ascii(pageBody)))
    objects.push(pdfStreamObject(contentObject, content))
    objects.push(pdfStreamObject(imageObject, imageBody, true))
  })

  const header = ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const chunks: Uint8Array[] = [header]
  const offsets = [0]
  let offset = header.byteLength
  for (const object of objects) {
    offsets.push(offset)
    chunks.push(object)
    offset += object.byteLength
  }
  const xrefOffset = offset
  const xref = ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`)
  chunks.push(xref)
  return concatBytes(chunks)
}

async function renderStoryboardPages(model: ShotListPrintModel): Promise<ShotListPdfPage[]> {
  const pages: ShotListPdfPage[] = []
  const pageRows = 4
  for (let start = 0; start < Math.max(model.rows.length, 1); start += pageRows) {
    pages.push(await renderCanvasPage(async (ctx) => {
      drawPageHeader(ctx, model, start, model.rows.length)
      const rows = model.rows.slice(start, start + pageRows)
      const gridTop = PAGE_MARGIN + 132
      const gap = 28
      const cardWidth = (CONTENT_WIDTH - gap) / 2
      const cardHeight = (CONTENT_HEIGHT - 132 - gap) / 2
      for (const [index, row] of rows.entries()) await drawStoryboardCard(ctx, row, model.columns, PAGE_MARGIN + (index % 2) * (cardWidth + gap), gridTop + Math.floor(index / 2) * (cardHeight + gap), cardWidth, cardHeight)
    }))
  }
  return pages
}

async function renderListPages(model: ShotListPrintModel): Promise<ShotListPdfPage[]> {
  const pages: ShotListPdfPage[] = []
  const rows = model.rows.length > 0 ? model.rows : [null]
  let start = 0
  while (start < rows.length) {
    let end = start
    let usedHeight = 0
    while (end < rows.length) {
      const row = rows[end]
      const rowHeight = row ? listRowHeight(row, model.columns) : 56
      if (end > start && usedHeight + rowHeight > CONTENT_HEIGHT - 140) break
      usedHeight += rowHeight
      end += 1
    }
    const pageRows = rows.slice(start, end).filter((row): row is ShotListExportRow => row !== null)
    pages.push(await renderCanvasPage(async (ctx) => {
      drawPageHeader(ctx, model, start, model.rows.length)
      drawListHeader(ctx, model.columns, PAGE_MARGIN, PAGE_MARGIN + 132, CONTENT_WIDTH)
      let y = PAGE_MARGIN + 176
      for (const row of pageRows) {
        const height = listRowHeight(row, model.columns)
        await drawListRow(ctx, row, model.columns, PAGE_MARGIN, y, CONTENT_WIDTH, height)
        y += height
      }
    }))
    start = end
  }
  return pages
}

async function renderCanvasPage(draw: (ctx: CanvasRenderingContext2D) => Promise<void>): Promise<ShotListPdfPage> {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_WIDTH
  canvas.height = PAGE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('The PDF renderer could not create a canvas.')
  ctx.fillStyle = COLORS.white
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT)
  await draw(ctx)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('The PDF renderer could not encode a page.')
  return { width: PAGE_WIDTH, height: PAGE_HEIGHT, jpegBytes: decodeBase64(dataUrl.slice(comma + 1)) }
}

function drawPageHeader(ctx: CanvasRenderingContext2D, model: ShotListPrintModel, start: number, rowCount: number): void {
  ctx.fillStyle = COLORS.ink
  ctx.font = '700 44px Arial, sans-serif'
  ctx.fillText(model.projectName, PAGE_MARGIN, PAGE_MARGIN + 40)
  ctx.fillStyle = '#5c6c84'
  ctx.font = '500 29px Arial, sans-serif'
  ctx.fillText(model.title, PAGE_MARGIN, PAGE_MARGIN + 84)
  ctx.fillStyle = COLORS.muted
  ctx.font = '400 20px Arial, sans-serif'
  const pageLabel = rowCount === 0 ? '0 Shots' : `${rowCount} ${rowCount === 1 ? 'Shot' : 'Shots'} · ${start + 1}–${Math.min(start + (model.layout === 'storyboard' ? 4 : rowCount), rowCount)}`
  ctx.fillText(pageLabel, PAGE_MARGIN, PAGE_MARGIN + 112)
}

async function drawStoryboardCard(ctx: CanvasRenderingContext2D, row: ShotListExportRow, columns: readonly ShotListColumn[], x: number, y: number, width: number, height: number): Promise<void> {
  ctx.strokeStyle = COLORS.line
  ctx.lineWidth = 2
  ctx.fillStyle = COLORS.white
  roundRect(ctx, x, y, width, height, 16)
  ctx.fill()
  ctx.stroke()
  let cursor = y
  if (columns.includes('thumbnail')) {
    const thumbnailHeight = Math.min(width * 9 / 16, height * 0.46)
    ctx.fillStyle = COLORS.soft
    ctx.fillRect(x + 1, cursor + 1, width - 2, thumbnailHeight)
    if (row.thumbnailDataUrl) await drawImageContain(ctx, row.thumbnailDataUrl, x + 1, cursor + 1, width - 2, thumbnailHeight)
    else {
      ctx.fillStyle = COLORS.muted
      ctx.font = '400 18px Arial, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('No thumbnail', x + width / 2, cursor + thumbnailHeight / 2 + 6)
      ctx.textAlign = 'left'
    }
    cursor += thumbnailHeight
  }
  const padding = 22
  const identity = row.shot
  ctx.fillStyle = COLORS.ink
  ctx.font = '700 24px Arial, sans-serif'
  drawWrappedText(ctx, identity, x + padding, cursor + padding + 24, width - padding * 2, 28, 2)
  cursor += padding + 42
  const metadataColumns = columns.filter((column) => column !== 'thumbnail' && column !== 'shot' && column !== 'notes')
  metadataColumns.forEach((column) => {
    const value = shotListPrintValue(row, column)
    if (!value) return
    ctx.fillStyle = COLORS.muted
    ctx.font = '700 15px Arial, sans-serif'
    ctx.fillText(SHOT_LIST_EXPORT_COLUMN_LABELS[column], x + padding, cursor + 16)
    ctx.fillStyle = COLORS.body
    ctx.font = '400 17px Arial, sans-serif'
    const lines = drawWrappedText(ctx, value, x + padding + 132, cursor + 16, width - padding * 2 - 132, 22, 2)
    cursor += Math.max(24, lines * 22 + 5)
  })
  if (columns.includes('notes') && row.notes) {
    ctx.strokeStyle = '#e6eaf0'
    ctx.beginPath()
    ctx.moveTo(x + padding, cursor + 4)
    ctx.lineTo(x + width - padding, cursor + 4)
    ctx.stroke()
    ctx.fillStyle = COLORS.muted
    ctx.font = '700 14px Arial, sans-serif'
    ctx.fillText('NOTES', x + padding, cursor + 26)
    ctx.fillStyle = COLORS.body
    ctx.font = '400 16px Arial, sans-serif'
    drawWrappedText(ctx, row.notes, x + padding, cursor + 50, width - padding * 2, 21, 4)
  }
}

function drawListHeader(ctx: CanvasRenderingContext2D, columns: readonly ShotListColumn[], x: number, y: number, width: number): void {
  const widths = numericColumnWidths(columns, width)
  ctx.fillStyle = COLORS.ink
  ctx.font = '700 17px Arial, sans-serif'
  let cursor = x
  for (const [index, column] of columns.entries()) {
    ctx.fillText(SHOT_LIST_EXPORT_COLUMN_LABELS[column], cursor + 8, y + 26)
    cursor += widths[index]
  }
  ctx.strokeStyle = COLORS.muted
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x, y + 42)
  ctx.lineTo(x + width, y + 42)
  ctx.stroke()
}

async function drawListRow(ctx: CanvasRenderingContext2D, row: ShotListExportRow, columns: readonly ShotListColumn[], x: number, y: number, width: number, height: number): Promise<void> {
  const widths = numericColumnWidths(columns, width)
  const padding = 8
  let cursor = x
  for (const [index, column] of columns.entries()) {
    const cellWidth = widths[index]
    if (column === 'thumbnail') {
      if (row.thumbnailDataUrl) await drawImageContain(ctx, row.thumbnailDataUrl, cursor + padding, y + 10, cellWidth - padding * 2, height - 20)
      else {
        ctx.fillStyle = COLORS.muted
        ctx.font = '400 14px Arial, sans-serif'
        ctx.fillText('No thumbnail', cursor + padding, y + height / 2 + 5)
      }
    } else {
      const value = shotListPrintValue(row, column) || '—'
      ctx.fillStyle = COLORS.body
      ctx.font = column === 'shot' ? '700 17px Arial, sans-serif' : '400 16px Arial, sans-serif'
      drawWrappedText(ctx, value, cursor + padding, y + 24, cellWidth - padding * 2, 21, Math.max(1, Math.floor((height - 20) / 21)))
    }
    cursor += cellWidth
  }
  ctx.strokeStyle = COLORS.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y + height)
  ctx.lineTo(x + width, y + height)
  ctx.stroke()
}

function listRowHeight(row: ShotListExportRow, columns: readonly ShotListColumn[]): number {
  const widths = numericColumnWidths(columns, CONTENT_WIDTH)
  return Math.max(78, ...columns.map((column, index) => column === 'thumbnail' ? 94 : Math.min(150, Math.max(1, Math.ceil(shotListPrintValue(row, column).length / Math.max(8, widths[index] / 10))) * 21 + 28)))
}

function numericColumnWidths(columns: readonly ShotListColumn[], width: number): number[] {
  const percentages = shotListPrintColumnWidths(columns)
  return columns.map((column) => width * Number.parseFloat(percentages[column] ?? '0') / 100)
}

function drawWrappedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number): number {
  const lines: string[] = []
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let line = ''
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (line && ctx.measureText(candidate).width > width) {
        lines.push(line)
        line = word
      } else line = candidate
    }
    if (line || paragraph === '') lines.push(line)
  }
  const visible = lines.slice(0, maxLines)
  if (lines.length > maxLines && visible.length > 0) {
    let last = visible[visible.length - 1]
    while (last.length > 0 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
    visible[visible.length - 1] = `${last}…`
  }
  visible.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight))
  return visible.length
}

async function drawImageContain(ctx: CanvasRenderingContext2D, dataUrl: string, x: number, y: number, width: number, height: number): Promise<void> {
  const loaded = await loadImage(dataUrl)
  if (!loaded) return
  const scale = Math.min(width / loaded.width, height / loaded.height)
  const drawWidth = loaded.width * scale
  const drawHeight = loaded.height * scale
  ctx.drawImage(loaded.image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight)
}

function loadImage(dataUrl: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ image, width: image.naturalWidth || image.width, height: image.naturalHeight || image.height })
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function pdfObject(number: number, body: Uint8Array): Uint8Array {
  return concatBytes([ascii(`${number} 0 obj\n`), body, ascii('\nendobj\n')])
}

function pdfStreamObject(number: number, stream: Uint8Array, streamIsImage = false): Uint8Array {
  const body = streamIsImage ? stream : concatBytes([ascii(`<< /Length ${stream.byteLength} >>\nstream\n`), stream, ascii('endstream')])
  return pdfObject(number, body)
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0))
  let offset = 0
  chunks.forEach((chunk) => { result.set(chunk, offset); offset += chunk.byteLength })
  return result
}
