export type PlatformKind = 'web' | 'desktop'

/**
 * Shared editor code depends only on this platform identity seam. The
 * serialization core remains platform-neutral; the current Web shell owns
 * browser file download/picker behavior and a future desktop adapter can
 * provide native filesystem I/O without changing SceneDocument.
 */
export type PlatformAdapter = {
  readonly kind: PlatformKind
}

export const webPlatformAdapter: PlatformAdapter = { kind: 'web' }
