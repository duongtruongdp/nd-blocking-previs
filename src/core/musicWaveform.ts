export type MusicWaveform = {
  durationSeconds: number
  peaks: number[]
}

export function downsampleAudioPeaks(channels: readonly Float32Array[], bucketCount: number): number[] {
  const length = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0)
  const buckets = Math.max(0, Math.floor(bucketCount))
  if (length === 0 || buckets === 0) return []
  return Array.from({ length: buckets }, (_, bucket) => {
    const start = Math.floor(bucket * length / buckets)
    const end = Math.max(start + 1, Math.ceil((bucket + 1) * length / buckets))
    let peak = 0
    for (const channel of channels) {
      const limit = Math.min(end, channel.length)
      for (let index = start; index < limit; index += 1) peak = Math.max(peak, Math.abs(channel[index]))
    }
    return peak
  })
}

export async function decodeMusicFile(file: Blob, bucketCount = 2400): Promise<MusicWaveform> {
  if (typeof window === 'undefined') throw new Error('Audio decoding is only available in a browser runtime.')
  type AudioContextConstructor = new () => AudioContext
  const audioWindow = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor }
  const contextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext
  if (!contextConstructor) throw new Error('This browser does not provide Web Audio decoding.')
  const context = new contextConstructor()
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer())
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
    return { durationSeconds: buffer.duration, peaks: downsampleAudioPeaks(channels, bucketCount) }
  } finally {
    await context.close()
  }
}
