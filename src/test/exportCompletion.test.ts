import { describe, expect, it } from 'vitest'
import { successMetadataForExport } from '../export/exportCompletion'

const base = {
  source: 'scene' as const,
  format: 'mp4' as const,
  resolution: { width: 1920, height: 1080 },
  frameCount: 48,
  frameRate: { numerator: 24, denominator: 1 },
}

describe('export completion feedback contract', () => {
  it('does not report success when rendering is complete but saving is not confirmed', () => {
    expect(successMetadataForExport({ ...base, saveResult: { saved: false, outputPath: null, outputBytes: null } })).toBeNull()
  })

  it('creates native success metadata only after a verified output is saved', () => {
    expect(successMetadataForExport({ ...base, saveResult: { saved: true, outputPath: '/shots/scene.mp4', outputBytes: 11368063 } })).toEqual({
      source: 'scene', format: 'mp4', resolution: { width: 1920, height: 1080 }, durationTimecode: '00:00:02:00', outputPath: '/shots/scene.mp4', outputBytes: 11368063,
    })
  })

  it('supports browser download handoff without claiming a filesystem path', () => {
    expect(successMetadataForExport({ ...base, saveResult: { saved: true, outputPath: null, outputBytes: 2048 } })).toMatchObject({ outputPath: null, outputBytes: 2048 })
  })

  it('keeps cancellation and failed saves out of the success state', () => {
    expect(successMetadataForExport({ ...base, saveResult: { saved: false, outputPath: null, outputBytes: null } })).toBeNull()
    expect(successMetadataForExport({ ...base, saveResult: { saved: false, outputPath: '/shots/failed.mp4', outputBytes: 0 } })).toBeNull()
  })

  it('resets naturally for consecutive successful exports and records Master metadata', () => {
    const first = successMetadataForExport({ ...base, saveResult: { saved: true, outputPath: '/shots/one.mp4', outputBytes: 100 } })
    const second = successMetadataForExport({ ...base, source: 'master', saveResult: { saved: true, outputPath: '/shots/two.mp4', outputBytes: 200 }, frameCount: 120 })
    expect(first?.outputPath).toBe('/shots/one.mp4')
    expect(second).toMatchObject({ source: 'master', outputPath: '/shots/two.mp4', durationTimecode: '00:00:05:00' })
  })
})
