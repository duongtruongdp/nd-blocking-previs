import { describe, expect, it } from 'vitest'
import { buildRelinkMatches, imageAssetReferences, isSupportedImageFile, resolveImageAssetHealth } from '../core/mediaHealth'
import { buildMissingMediaReport, missingMediaReportCsv } from '../core/missingMediaReport'
import { createMasterSequenceDocument, type MasterImageAssetDocument } from '../core/masterSequence'

const asset: MasterImageAssetDocument = { id: 'asset-1', fileName: 'title.png', mimeType: 'image/png', sizeBytes: 12, lastModified: null, width: 1920, height: 1080 }

describe('media health and recovery', () => {
  it('does not treat metadata alone as available', async () => {
    const result = await resolveImageAssetHealth('project-1', asset, async () => null)
    expect(result.status).toBe('missing')
  })

  it('rejects unsupported asset formats before sidecar lookup', async () => {
    expect(isSupportedImageFile({ name: 'title.webp', type: 'image/webp' })).toBe(false)
    const result = await resolveImageAssetHealth('project-1', { ...asset, fileName: 'title.webp', mimeType: 'image/webp' }, async () => { throw new Error('must not load') })
    expect(result.status).toBe('unsupported')
  })

  it('reports corrupt sidecar data after a supported-format decode attempt', async () => {
    const result = await resolveImageAssetHealth('project-1', asset, async () => new Blob(['not an image'], { type: 'image/png' }))
    expect(result.status).toBe('corrupt')
  })

  it('matches exact filenames and leaves ambiguous matches for review', () => {
    const files = [{ name: 'title.png', type: 'image/png', size: 10 }, { name: 'title.png', type: 'image/png', size: 11 }, { name: 'other.jpg', type: 'image/jpeg', size: 9 }] as File[]
    const matches = buildRelinkMatches([asset, { ...asset, id: 'asset-2', fileName: 'other.jpg', mimeType: 'image/jpeg' }], files)
    expect(matches[0].reason).toBe('ambiguous')
    expect(matches[0].selectedIndex).toBeNull()
    expect(matches[1].reason).toBe('exact-filename')
    const duplicateNames = buildRelinkMatches([asset, { ...asset, id: 'asset-3' }], [files[0]])
    expect(duplicateNames[0].reason).toBe('ambiguous')
    expect(duplicateNames[0].selectedIndex).toBeNull()
  })

  it('reports shared clip references and escapes CSV values', () => {
    const sequence = { ...createMasterSequenceDocument(), graphicsTracks: [{ id: 'track-1', name: 'Titles, Main', order: 0, visible: true }], imageAssets: [asset], imageClips: [{ id: 'clip-1', trackId: 'track-1', assetId: asset.id, startMasterFrame: 0, durationFrames: 20, positionX: .5, positionY: .5, scale: 1, rotation: 0, opacity: 1, fadeInFrames: 0, fadeOutFrames: 0 }] }
    const health = [{ assetId: asset.id, status: 'missing' as const, message: 'No sidecar', width: null, height: null, actualMimeType: null }]
    const rows = buildMissingMediaReport(sequence, health)
    expect(rows[0]).toMatchObject({ references: 1, tracks: 'Titles, Main', status: 'missing' })
    expect(missingMediaReportCsv(rows)).toContain('"Titles, Main"')
  })

  it('keeps a missing asset reference report scoped to its own asset', () => {
    const sequence = { ...createMasterSequenceDocument(), graphicsTracks: [{ id: 'track-1', name: 'Titles', order: 0, visible: true }], imageAssets: [asset], imageClips: [] }
    expect(imageAssetReferences(sequence, asset.id)).toEqual([])
  })
})
