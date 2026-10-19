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

/**
 * Resolve the relay without ever guessing a production hostname. The relay is
 * deliberately an explicit deployment setting in production so a static Web
 * or desktop build cannot silently connect to a LAN machine.
 */
export function resolveLiveReviewRelayConfig({ mode, configuredUrl, pageProtocol }: RelayConfigInput): LiveReviewRelayConfig {
  const value = configuredUrl?.trim() ?? ''
  if (!value) {
    if (mode === 'development') return { url: LOCAL_DEVELOPMENT_RELAY, configured: false, error: null }
    return { url: null, configured: false, error: 'Live Review server is not configured.' }
  }

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
  if (mode === 'production' && parsed.protocol !== 'wss:') {
    return { url: null, configured: true, error: 'Production Live Review requires a wss:// relay.' }
  }
  if (pageProtocol === 'https:' && parsed.protocol !== 'wss:') {
    return { url: null, configured: true, error: 'HTTPS Live Review pages require a wss:// relay.' }
  }
  return { url: parsed.toString(), configured: true, error: null }
}

export function liveReviewRelayConfig(): LiveReviewRelayConfig {
  return resolveLiveReviewRelayConfig({
    mode: import.meta.env.PROD ? 'production' : 'development',
    configuredUrl: import.meta.env.VITE_LIVE_RELAY_URL,
    pageProtocol: typeof window === 'undefined' ? null : window.location.protocol,
  })
}

export function liveReviewRelayUrl(): string {
  return liveReviewRelayConfig().url ?? LOCAL_DEVELOPMENT_RELAY
}

export function buildLiveReviewInviteUrl(appUrl: string, session: string): string {
  const url = new URL(appUrl)
  url.searchParams.set('live', session)
  return url.toString()
}
