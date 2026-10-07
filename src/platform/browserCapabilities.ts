export const WEBM_MIME_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

export type BrowserCapabilities = {
  webgl: boolean
  webgl2: boolean
  mediaRecorder: boolean
  webm: boolean
  webCodecs: boolean
  canvasCapture: boolean
  fileInput: boolean
  blobDownload: boolean
  offscreenCanvas: boolean
}

export function detectWebGLSupport(canvas?: HTMLCanvasElement): { webgl: boolean; webgl2: boolean } {
  const probe = canvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null)
  if (!probe) return { webgl: false, webgl2: false }
  try {
    const webgl2 = Boolean(probe.getContext('webgl2'))
    const webgl = webgl2 || Boolean(probe.getContext('webgl') || probe.getContext('experimental-webgl'))
    return { webgl, webgl2 }
  } catch {
    return { webgl: false, webgl2: false }
  }
}

export function supportedWebmMimeTypes(): string[] {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return []
  return WEBM_MIME_TYPES.filter((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

export function detectBrowserCapabilities(): BrowserCapabilities {
  const { webgl, webgl2 } = detectWebGLSupport()
  return {
    webgl,
    webgl2,
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    webm: supportedWebmMimeTypes().length > 0,
    webCodecs: typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined',
    canvasCapture: typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function',
    fileInput: typeof File !== 'undefined' && typeof FileReader !== 'undefined',
    blobDownload: typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
  }
}

export function webglErrorMessage(): string {
  return 'Your browser or device does not support the graphics features required by ND Blocking & Previs. Try the latest Chrome, Edge, or Safari on a desktop computer.'
}
