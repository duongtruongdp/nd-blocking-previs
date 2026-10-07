import { describe, expect, it } from 'vitest'
import { buildNativeFfmpegArgs, encodedFrameFromProgress, qualityArguments, rationalRateArgument } from '../export/nativeExportMath'

describe('native FFmpeg export arguments', () => {
  it('keeps rational timebases and paths as separate arguments', () => {
    const args = buildNativeFfmpegArgs({
      inputPattern: '/tmp/Scene with unicode/фрейм_%06d.png',
      outputPath: '/Users/test/Shot 01/output.partial.mp4',
      width: 1920,
      height: 1080,
      frameRate: { numerator: 24000, denominator: 1001 },
      quality: 'standard',
      encoder: 'h264_videotoolbox',
    })
    expect(rationalRateArgument({ numerator: 24000, denominator: 1001 })).toBe('24000/1001')
    expect(args).toContain('24000/1001')
    expect(args).toContain('/tmp/Scene with unicode/фрейм_%06d.png')
    expect(args).toContain('/Users/test/Shot 01/output.partial.mp4')
    expect(args).toContain('1920x1080')
    expect(args.join(' ')).not.toContain('sh -c')
  })

  it('maps quality presets without changing capture dimensions', () => {
    expect(qualityArguments('high', 'libx264')).toEqual(['-preset', 'slow', '-crf', '18'])
    expect(qualityArguments('standard', 'h264_videotoolbox')).toContain('8M')
    expect(qualityArguments('small', 'h264_videotoolbox')).toContain('4M')
  })

  it('converts FFmpeg progress to bounded encoded frames', () => {
    const rate = { numerator: 24000, denominator: 1001 }
    expect(encodedFrameFromProgress('out_time_ms=1001000', rate, 24)).toBe(24)
    expect(encodedFrameFromProgress('out_time_ms=1001000', rate, 10)).toBe(10)
    expect(encodedFrameFromProgress('progress=end', rate, 10)).toBe(10)
  })
})
