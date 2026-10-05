export const WEBM_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export function supportedWebmMimeTypes(): string[] {
  if (typeof MediaRecorder === 'undefined') return []
  return WEBM_MIME_TYPES.filter((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

export function selectWebmMimeType(): string | null {
  return supportedWebmMimeTypes()[0] ?? null
}

export function mediaRecorderErrorMessage(): string {
  return 'This browser cannot export WebM video. Try a current Chromium-based browser.'
}

