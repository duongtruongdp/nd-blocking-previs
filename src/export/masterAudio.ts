import type { MasterMusicOverlap, MasterRenderPlan } from './masterRenderPlan'

type AudioContextConstructor = new () => AudioContext

function audioContextConstructor(): AudioContextConstructor | null {
  const candidate = (window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext)
  return candidate ?? null
}

/** Decode only the source window needed by the Master export and place it at output time zero. */
export async function decodeMasterMusicForExport(blob: Blob, plan: MasterRenderPlan): Promise<AudioBuffer> {
  const overlap = plan.musicOverlap
  if (!overlap) throw new Error('The Master render range does not overlap Music.')
  const Context = audioContextConstructor()
  if (!Context) throw new Error('This browser cannot decode Master Music for export.')
  const context = new Context()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    return copyMusicIntoOutputBuffer(decoded, overlap, plan)
  } finally {
    await context.close().catch(() => {})
  }
}

function copyMusicIntoOutputBuffer(decoded: AudioBuffer, overlap: MasterMusicOverlap, plan: MasterRenderPlan): AudioBuffer {
  const rate = plan.frameRate.numerator / plan.frameRate.denominator
  const outputSampleRate = decoded.sampleRate
  const outputLength = Math.max(1, Math.ceil((plan.endFrameExclusive - plan.startFrame) / rate * outputSampleRate))
  const output = new AudioBuffer({ numberOfChannels: decoded.numberOfChannels, length: outputLength, sampleRate: outputSampleRate })
  const sourceStart = Math.max(0, Math.floor(overlap.sourceStartSeconds * outputSampleRate))
  const sourceEnd = Math.min(decoded.length, Math.ceil(overlap.sourceEndSeconds * outputSampleRate))
  const outputStart = Math.max(0, Math.floor(overlap.outputStartSeconds * outputSampleRate))
  const copyLength = Math.max(0, Math.min(sourceEnd - sourceStart, output.length - outputStart))
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    if (copyLength <= 0) break
    output.getChannelData(channel).set(decoded.getChannelData(channel).subarray(sourceStart, sourceStart + copyLength), outputStart)
  }
  return output
}
