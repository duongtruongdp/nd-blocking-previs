import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NATIVE_FFMPEG_COMMAND_ID, NativeEncoderError, type NativeEncoderResult } from '../platform/platformAdapter'
import { assertNativeOutput, MIN_NATIVE_OUTPUT_BYTES, withNativeExportCleanup } from '../export/nativeExportLifecycle'

const repoFile = (path: string): string => fileURLToPath(new URL(`../../${path}`, import.meta.url))

describe('native export runtime contract', () => {
  it('keeps the sidecar command, capability, and bundle registration consistent', () => {
    const capability = JSON.parse(readFileSync(repoFile('src-tauri/capabilities/default.json'), 'utf8')) as { permissions: Array<string | { identifier?: string; allow?: Array<{ name?: string; sidecar?: boolean; args?: boolean }> }> }
    const config = JSON.parse(readFileSync(repoFile('src-tauri/tauri.conf.json'), 'utf8')) as { bundle: { externalBin: string[] } }
    const spawn = capability.permissions.find((permission) => typeof permission !== 'string' && permission.identifier === 'shell:allow-spawn') as { identifier: string; allow: Array<{ name?: string; sidecar?: boolean; args?: boolean }> } | undefined
    expect(spawn?.identifier).toBe('shell:allow-spawn')
    expect(spawn?.allow).toContainEqual({ name: NATIVE_FFMPEG_COMMAND_ID, sidecar: true, args: true })
    expect(capability.permissions).not.toContain('shell:allow-execute')
    expect(config.bundle.externalBin).toContain(NATIVE_FFMPEG_COMMAND_ID)
  })

  it('packages an executable Apple Silicon sidecar in the repository', () => {
    const path = repoFile('src-tauri/binaries/ffmpeg-aarch64-apple-darwin')
    const mode = statSync(path).mode
    expect(mode & 0o111).toBeGreaterThan(0)
  })

  it('preserves encoder startup and exit details for spawn and nonzero failures', () => {
    const startResult: NativeEncoderResult = { commandId: NATIVE_FFMPEG_COMMAND_ID, started: false, exitCode: null }
    const startFailure = new NativeEncoderError('failed to start', startResult)
    expect(startFailure.name).toBe('NativeEncoderStartError')
    expect(startFailure.result).toEqual(startResult)

    const exitResult: NativeEncoderResult = { commandId: NATIVE_FFMPEG_COMMAND_ID, started: true, exitCode: 3 }
    const exitFailure = new NativeEncoderError('encoder failed', exitResult)
    expect(exitFailure.name).toBe('NativeEncoderError')
    expect(exitFailure.result.exitCode).toBe(3)
  })

  it('rejects missing and empty output while accepting a non-empty file', () => {
    expect(() => assertNativeOutput({ exists: false, byteLength: 0 })).toThrow(/empty or invalid/i)
    expect(() => assertNativeOutput({ exists: true, byteLength: MIN_NATIVE_OUTPUT_BYTES - 1 })).toThrow(/empty or invalid/i)
    expect(() => assertNativeOutput({ exists: true, byteLength: MIN_NATIVE_OUTPUT_BYTES })).not.toThrow()
  })

  it('runs cleanup after success, encoder failure, cancellation, and allows retry', async () => {
    const events: string[] = []
    await withNativeExportCleanup(async () => { events.push('success') }, async () => { events.push('cleanup-success') })
    await expect(withNativeExportCleanup(async () => { events.push('failure'); throw new Error('encoder failed') }, async () => { events.push('cleanup-failure') })).rejects.toThrow('encoder failed')
    await expect(withNativeExportCleanup(async () => { events.push('cancel'); throw new Error('Export cancelled.') }, async () => { events.push('cleanup-cancel') })).rejects.toThrow('Export cancelled.')
    let attempts = 0
    await expect(withNativeExportCleanup(async () => { attempts += 1; throw new Error('first attempt failed') }, async () => { events.push('cleanup-retry') })).rejects.toThrow('first attempt failed')
    await withNativeExportCleanup(async () => { attempts += 1 }, async () => { events.push('cleanup-retry-success') })
    expect(attempts).toBe(2)
    expect(events).toEqual(['success', 'cleanup-success', 'failure', 'cleanup-failure', 'cancel', 'cleanup-cancel', 'cleanup-retry', 'cleanup-retry-success'])
  })
})
