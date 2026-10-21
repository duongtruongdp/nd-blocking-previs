export type LiveReviewRelayConfig = {
  url: string | null
  configured: boolean
  error: string | null
}

type RelayConfigInput = {
  mode: 'development' | 'production'
  configuredUrl?: string | null
  pageProtocol?: string | null
}

const LOCAL_DEVELOPMENT_RELAY = 'ws://localhost:8787/live'
export const OFFICIAL_PRODUCTION_RELAY = 'wss://live.duongtruongdp.net/live'
export const PUBLIC_LIVE_REVIEW_INVITE_BASE = 'https://blocking.duongtruongdp.net'
let developmentIdentityLogged = false

type InviteBaseConfigInput = {
  mode: 'development' | 'production'
  configuredUrl?: string | null
  pageOrigin?: string | null
}

/**
 * Resolve the relay in one place for Web and Tauri builds. An explicit build
 * override wins; otherwise production uses the official ND relay and local
 * development stays on the localhost relay.
 */
export function resolveLiveReviewRelayConfig({ mode, configuredUrl, pageProtocol }: RelayConfigInput): LiveReviewRelayConfig {
  const value = configuredUrl?.trim() ?? ''
  if (!value) return mode === 'development'
    ? { url: LOCAL_DEVELOPMENT_RELAY, configured: false, error: null }
    : { url: OFFICIAL_PRODUCTION_RELAY, configured: false, error: null }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { url: null, configured: true, error: 'Live Review server configuration is invalid.' }
  }
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    return { url: null, configured: true, error: 'Live Review server must use ws:// or wss://.' }
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { url: null, configured: true, error: 'Live Review server URL must not contain credentials or query data.' }
  }
  if (parsed.pathname !== '/live') {
    return { url: null, configured: true, error: 'Live Review server URL must use the /live path.' }
  }
  if (mode === 'production' && parsed.protocol !== 'wss:') {
    return { url: null, configured: true, error: 'Production Live Review requires a wss:// relay.' }
  }
  if (pageProtocol === 'https:' && parsed.protocol !== 'wss:') {
    return { url: null, configured: true, error: 'HTTPS Live Review pages require a wss:// relay.' }
  }
  return { url: parsed.toString(), configured: true, error: null }
}

export function liveReviewRelayConfig(): LiveReviewRelayConfig {
  const config = resolveLiveReviewRelayConfig({
    mode: import.meta.env.PROD ? 'production' : 'development',
    configuredUrl: import.meta.env.VITE_LIVE_RELAY_URL,
    pageProtocol: typeof window === 'undefined' ? null : window.location.protocol,
  })
  if (import.meta.env.DEV && !developmentIdentityLogged) {
    developmentIdentityLogged = true
    console.warn('[live-review] runtime identity', { href: typeof window === 'undefined' ? null : window.location.href, origin: typeof window === 'undefined' ? null : window.location.origin, relayUrl: config.url })
  }
  return config
}

export function liveReviewRelayUrl(): string | null {
  return liveReviewRelayConfig().url
}

function validInviteBase(value: string, mode: InviteBaseConfigInput['mode']): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (mode === 'production' && parsed.protocol !== 'https:') return null
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return null
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * Resolve the browser destination for a shareable invite independently from
 * the WebSocket relay. Tauri's app origin is never a public invite target.
 */
export function resolveLiveReviewInviteBaseUrl({ mode, configuredUrl, pageOrigin }: InviteBaseConfigInput): string {
  const configured = configuredUrl?.trim() ?? ''
  if (configured) return validInviteBase(configured, mode) ?? PUBLIC_LIVE_REVIEW_INVITE_BASE
  if (mode === 'production') return PUBLIC_LIVE_REVIEW_INVITE_BASE
  const browserOrigin = pageOrigin?.trim() ?? ''
  return validInviteBase(browserOrigin, mode) ?? PUBLIC_LIVE_REVIEW_INVITE_BASE
}

export function liveReviewInviteBaseUrl(): string {
  return resolveLiveReviewInviteBaseUrl({
    mode: import.meta.env.PROD ? 'production' : 'development',
    configuredUrl: import.meta.env.VITE_LIVE_INVITE_BASE_URL,
    pageOrigin: typeof window === 'undefined' ? null : window.location.origin,
  })
}

export function buildLiveReviewInviteUrl(session: string, baseUrl = liveReviewInviteBaseUrl()): string {
  const url = new URL(baseUrl)
  url.searchParams.set('live', session)
  return url.toString()
}

export function parseLiveReviewInviteSession(appUrl: string): string | null {
  try {
    return new URL(appUrl).searchParams.get('live') || null
  } catch {
    return null
  }
}
