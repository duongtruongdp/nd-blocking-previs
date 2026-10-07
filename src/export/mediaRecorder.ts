import { supportedWebmMimeTypes as detectSupportedWebmMimeTypes, WEBM_MIME_TYPES } from '../platform/browserCapabilities'

export { WEBM_MIME_TYPES }

export function supportedWebmMimeTypes(): string[] {
  return detectSupportedWebmMimeTypes()
}

export function selectWebmMimeType(): string | null {
  return supportedWebmMimeTypes()[0] ?? null
}

export function mediaRecorderErrorMessage(): string {
  return 'This browser cannot export WebM video. Try a current Chromium-based browser.'
}
