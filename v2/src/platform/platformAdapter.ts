export type PlatformKind = 'web' | 'desktop'

/**
 * Shared editor code depends only on this platform identity seam. File and
 * export capabilities will be added when the .ndscene workflow is introduced.
 */
export type PlatformAdapter = {
  readonly kind: PlatformKind
}

export const webPlatformAdapter: PlatformAdapter = { kind: 'web' }
