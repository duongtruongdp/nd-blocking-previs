import type { MasterSequenceDocument } from './masterSequence'
import { imageAssetReferences, type ImageAssetHealth } from './mediaHealth'

export type MissingMediaReportRow = {
  assetId: string
  fileName: string
  mimeType: string
  expectedDimensions: string
  status: string
  references: number
  tracks: string
  clips: string
  source: string
  message: string
}

export function buildMissingMediaReport(sequence: MasterSequenceDocument, health: readonly ImageAssetHealth[]): MissingMediaReportRow[] {
  const healthById = new Map(health.map((item) => [item.assetId, item]))
  return (sequence.imageAssets ?? []).map((asset) => {
    const item = healthById.get(asset.id)
    const refs = imageAssetReferences(sequence, asset.id)
    return {
      assetId: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      expectedDimensions: `${asset.width} × ${asset.height}`,
      status: item?.status ?? 'loading',
      references: refs.length,
      tracks: [...new Set(refs.map((ref) => ref.trackName))].join('; '),
      clips: refs.map((ref) => ref.clipId).join('; '),
      source: 'IndexedDB image sidecar',
      message: item?.message ?? 'Scan pending',
    }
  })
}

export function csvEscape(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function missingMediaReportCsv(rows: readonly MissingMediaReportRow[]): string {
  const headings = ['Asset ID', 'Original filename', 'Media type', 'Expected dimensions', 'Status', 'Clip references', 'Graphics tracks', 'Clip IDs', 'Source', 'Message']
  return [headings, ...rows.map((row) => [row.assetId, row.fileName, row.mimeType, row.expectedDimensions, row.status, row.references, row.tracks, row.clips, row.source, row.message])].map((row) => row.map(csvEscape).join(',')).join('\n')
}
