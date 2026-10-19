import type { PhoneCameraPairingData } from './protocol'

export const DEFAULT_PHONE_CAMERA_RELAY_URL = 'wss://nd-blocking-phone-relay.nd-blocking-previs.workers.dev/session'
export const DEFAULT_PHONE_CAMERA_COMPANION_URL = 'https://blocking.duongtruongdp.net/phone-camera/'

function envValue(name: 'VITE_PHONE_CAMERA_RELAY_URL' | 'VITE_PHONE_CAMERA_COMPANION_URL'): string | undefined {
  const value = import.meta.env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function phoneCameraRelayUrl(): string {
  return canonicalPhoneCameraRelayUrl(envValue('VITE_PHONE_CAMERA_RELAY_URL') ?? DEFAULT_PHONE_CAMERA_RELAY_URL)
}

export function canonicalPhoneCameraRelayUrl(relay: string): string {
  try {
    const url = new URL(relay)
    if (url.pathname === '/' || url.pathname === '') url.pathname = '/session'
    return url.toString()
  } catch {
    return relay
  }
}

export function phoneCameraRelaySocketUrl(relay = phoneCameraRelayUrl()): string {
  return canonicalPhoneCameraRelayUrl(relay)
}

export function phoneCameraCompanionUrl(): string {
  return envValue('VITE_PHONE_CAMERA_COMPANION_URL') ?? DEFAULT_PHONE_CAMERA_COMPANION_URL
}

export function buildPhoneCameraPairingUrl(data: PhoneCameraPairingData): string {
  const url = new URL(data.companion)
  url.searchParams.set('session', data.session)
  url.searchParams.set('token', data.token)
  url.searchParams.set('relay', canonicalPhoneCameraRelayUrl(data.relay))
  return url.toString()
}
