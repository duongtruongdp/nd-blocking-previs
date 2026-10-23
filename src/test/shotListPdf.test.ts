import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildPdfFromJpegs, buildShotListPdf } from '../export/shotListPdf'
import type { ShotListPrintModel } from '../core/shotListExport'

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Shot List PDF export', () => {
  it('writes a valid multi-page PDF container with landscape pages and embedded images', () => {
    const pdf = buildPdfFromJpegs([
      { width: 1600, height: 1131, jpegBytes },
      { width: 1600, height: 1131, jpegBytes },
    ])
    const text = new TextDecoder().decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Type /Pages')
    expect(text).toContain('/Count 2')
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2)
    expect(text).toContain('/MediaBox [0 0 842 595]')
    expect(text).toContain('xref')
    expect(text.endsWith('%%EOF\n')).toBe(true)
  })

  it('renders the existing Shot List print model into a non-empty PDF without changing the model', async () => {
    const context = {
      fillStyle: '',
      font: '',
      textAlign: 'left',
      lineWidth: 1,
      strokeStyle: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: (value: string) => ({ width: value.length * 8 }),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      roundRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AYf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AYf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aov/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z'),
    }
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
    const model: ShotListPrintModel = {
      projectName: 'Dự án Tiếng Việt',
      title: 'Shot List',
      layout: 'list',
      columns: ['shot', 'notes'],
      rows: [{ shotId: 'shot-01', order: 0, number: '01', shotName: 'Cảnh mở đầu', thumbnailDataUrl: null, scene: 'Cảnh 01', shot: '01  Cảnh mở đầu', camera: '', lens: '', shotSize: '', angle: '', movement: '', equipment: '', duration: '00:00:01:00', notes: 'Góc máy rộng — Tiếng Việt' }],
    }
    const pdf = await buildShotListPdf(model)
    expect(pdf.byteLength).toBeGreaterThan(100)
    expect(new TextDecoder().decode(pdf)).toContain('/Count 1')
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.9)
    expect(model.rows[0].notes).toContain('Tiếng Việt')
  })
})
