import type { NativeOutputVerification } from '../platform/platformAdapter'

export const MIN_NATIVE_OUTPUT_BYTES = 16

export function assertNativeOutput(verification: NativeOutputVerification, label = 'FFmpeg'): void {
  if (!verification.exists || verification.byteLength < MIN_NATIVE_OUTPUT_BYTES) {
    throw new Error(`${label} produced an empty or invalid output file.`)
  }
}

export async function withNativeExportCleanup<T>(work: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  try {
    return await work()
  } finally {
    await cleanup()
  }
}
