declare const __NDBP_BUILD_ID__: string
declare const __NDBP_BUILD_TIMESTAMP__: string
declare const __NDBP_BUILD_VERSION__: string
declare const __NDBP_BUILD_COMMIT__: string

export const SELECTION_DIAGNOSTICS_TOGGLE_EVENT = 'ndbp:toggle-selection-diagnostics'
export const MASTER_TIMELINE_DIAGNOSTICS_TOGGLE_EVENT = 'ndbp:toggle-master-timeline-diagnostics'
export const MASTER_TIMELINE_DIAGNOSTICS_REFRESH_EVENT = 'ndbp:refresh-master-timeline-diagnostics'

export const buildIdentity = {
  id: typeof __NDBP_BUILD_ID__ === 'undefined' ? 'unbundled-dev' : __NDBP_BUILD_ID__,
  timestamp: typeof __NDBP_BUILD_TIMESTAMP__ === 'undefined' ? 'unbundled-dev' : __NDBP_BUILD_TIMESTAMP__,
  version: typeof __NDBP_BUILD_VERSION__ === 'undefined' ? 'unbundled-dev' : __NDBP_BUILD_VERSION__,
  commit: typeof __NDBP_BUILD_COMMIT__ === 'undefined' ? 'unbundled-dev' : __NDBP_BUILD_COMMIT__,
} as const

export function desktopRuntimeAvailable(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

/** Explicit diagnostics are never enabled by default in a packaged app. */
export function interactionDiagnosticsCanBeActivated(): boolean {
  return import.meta.env.DEV || desktopRuntimeAvailable()
}

export function interactionDiagnosticsFromLocation(): boolean {
  if (typeof window === 'undefined') return false
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('interactionDebug') === '1'
}
