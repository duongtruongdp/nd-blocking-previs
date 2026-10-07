import type { RationalFrameRate } from '../core/sceneDocument'
import type { ExportQuality } from './exportTypes'

export type NativeH264Encoder = 'h264_videotoolbox' | 'libx264'

export type NativeFfmpegArgsRequest = {
  inputPattern: string
  outputPath: string
  width: number
  height: number
  frameRate: RationalFrameRate
  quality: ExportQuality
  encoder: NativeH264Encoder
}

export function rationalRateArgument(rate: RationalFrameRate): string {
  return `${rate.numerator}/${rate.denominator}`
}

export function qualityArguments(quality: ExportQuality, encoder: NativeH264Encoder): string[] {
  if (encoder === 'h264_videotoolbox') {
    if (quality === 'high') return ['-b:v', '12M', '-maxrate', '18M', '-bufsize', '24M']
    if (quality === 'small') return ['-b:v', '4M', '-maxrate', '6M', '-bufsize', '8M']
    return ['-b:v', '8M', '-maxrate', '12M', '-bufsize', '16M']
  }
  if (quality === 'high') return ['-preset', 'slow', '-crf', '18']
  if (quality === 'small') return ['-preset', 'fast', '-crf', '28']
  return ['-preset', 'medium', '-crf', '23']
}

/**
 * Build an argument array for the bundled FFmpeg sidecar. No shell command
 * string is ever assembled, so paths with spaces or Unicode remain arguments.
 */
export function buildNativeFfmpegArgs(request: NativeFfmpegArgsRequest): string[] {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', rationalRateArgument(request.frameRate),
    '-start_number', '0',
    '-i', request.inputPattern,
    '-s:v', `${request.width}x${request.height}`,
    '-an',
    '-c:v', request.encoder,
    ...qualityArguments(request.quality, request.encoder),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    '-nostats',
    request.outputPath,
  ]
}

export function encodedFrameFromProgress(progressLine: string, frameRate: RationalFrameRate, totalFrames: number): number | null {
  if (progressLine.trim() === 'progress=end') return totalFrames
  const outTime = /^out_time_ms=(\d+)$/.exec(progressLine.trim())
  if (!outTime) return null
  const seconds = Number(outTime[1]) / 1_000_000
  const frame = Math.ceil(seconds * frameRate.numerator / frameRate.denominator)
  return Math.min(totalFrames, Math.max(0, frame))
}
