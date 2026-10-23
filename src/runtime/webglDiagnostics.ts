import type * as THREE from 'three'

type RendererRecord = {
  id: number
  owner: string
  renderer: THREE.WebGLRenderer
  canvas: HTMLCanvasElement
  contextLost: boolean
  createdAt: number
}

export type WebGLDiagnosticEventType =
  | 'renderer-created'
  | 'context-lost'
  | 'context-restored'
  | 'renderer-disposed'
  | 'export-renderer-created'
  | 'export-scene-transition'
  | 'export-resource-disposal'
  | 'export-started'
  | 'export-rendering'
  | 'export-encoding'
  | 'export-completed'
  | 'export-cleanup'
  | 'interactive-render-resumed'
  | 'export-failed'
  | 'export-cancelled'

export type WebGLDiagnosticEvent = {
  timestamp: string
  type: WebGLDiagnosticEventType
  renderer?: string
  canvas?: { width: number; height: number }
  activeContextCount: number
  exportStage?: string
  memory?: { geometries?: number; textures?: number; programs?: number }
  preventDefaultHandled?: boolean
  canRenderAfterRestoration?: boolean
  exportRendererInstanceCount?: number
  exportRendererCreations?: number
  exportRendererDisposals?: number
  exportSceneTransitions?: number
  exportResourceDisposals?: number
  message?: string
}

let nextRendererId = 1
const renderers = new Map<number, RendererRecord>()
const diagnosticLog: WebGLDiagnosticEvent[] = []
const MAX_DIAGNOSTIC_EVENTS = 240

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

function diagnosticsEnabled(): boolean {
  return import.meta.env.DEV || isTauriRuntime()
}

export function webGLDiagnosticsAvailable(): boolean {
  return diagnosticsEnabled()
}

function memorySnapshot(renderer: THREE.WebGLRenderer): { geometries?: number; textures?: number; programs?: number } {
  try {
    return {
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length,
    }
  } catch {
    return {}
  }
}

export type WebGLDiagnosticsSnapshot = {
  activeRendererCount: number
  renderers: Array<{
    id: number
    owner: string
    createdAt: string
    contextLost: boolean
    canvas: { width: number; height: number }
    memory: { geometries?: number; textures?: number; programs?: number }
  }>
}

export function webglDiagnosticsSnapshot(): WebGLDiagnosticsSnapshot {
  return {
    activeRendererCount: renderers.size,
    renderers: Array.from(renderers.values()).map((record) => ({
      id: record.id,
      owner: record.owner,
      createdAt: new Date(record.createdAt).toISOString(),
      contextLost: record.contextLost,
      canvas: { width: record.canvas.width, height: record.canvas.height },
      memory: memorySnapshot(record.renderer),
    })),
  }
}

function appendDiagnosticEvent(event: Omit<WebGLDiagnosticEvent, 'timestamp' | 'activeContextCount'>): void {
  diagnosticLog.push({
    timestamp: new Date().toISOString(),
    activeContextCount: renderers.size,
    ...event,
  })
  if (diagnosticLog.length > MAX_DIAGNOSTIC_EVENTS) diagnosticLog.splice(0, diagnosticLog.length - MAX_DIAGNOSTIC_EVENTS)
}

export function recordWebGLDiagnosticEvent(event: Omit<WebGLDiagnosticEvent, 'timestamp' | 'activeContextCount'>): void {
  if (!diagnosticsEnabled()) return
  appendDiagnosticEvent(event)
}

export function getWebGLDiagnosticsLog(): readonly WebGLDiagnosticEvent[] {
  return diagnosticLog.map((event) => ({ ...event, canvas: event.canvas ? { ...event.canvas } : undefined, memory: event.memory ? { ...event.memory } : undefined }))
}

export function formatWebGLDiagnostics(): string {
  return JSON.stringify({
    capturedAt: new Date().toISOString(),
    snapshot: webglDiagnosticsSnapshot(),
    events: getWebGLDiagnosticsLog(),
  }, null, 2)
}

export function logWebGLDiagnostics(label: string): void {
  if (!import.meta.env.DEV) return
  console.debug('[webgl diagnostics]', label, webglDiagnosticsSnapshot())
}

/** Register one renderer without changing production behavior. */
export function registerWebGLRenderer(renderer: THREE.WebGLRenderer, owner: string): () => void {
  if (!diagnosticsEnabled()) return () => {}
  const canvas = renderer.domElement
  const id = nextRendererId++
  const record: RendererRecord = { id, owner, renderer, canvas, contextLost: false, createdAt: Date.now() }
  const handleLost = (event: Event): void => {
    event.preventDefault()
    record.contextLost = true
    const canvasSize = { width: canvas.width, height: canvas.height }
    appendDiagnosticEvent({ type: 'context-lost', renderer: owner, canvas: canvasSize, memory: memorySnapshot(renderer), preventDefaultHandled: event.defaultPrevented, canRenderAfterRestoration: false, message: `renderer=${id}` })
    if (import.meta.env.DEV) console.error('[webgl diagnostics] context lost', { owner, id, activeRendererCount: renderers.size, snapshot: webglDiagnosticsSnapshot() })
  }
  const handleRestored = (): void => {
    record.contextLost = false
    appendDiagnosticEvent({ type: 'context-restored', renderer: owner, canvas: { width: canvas.width, height: canvas.height }, memory: memorySnapshot(renderer), canRenderAfterRestoration: false, message: `renderer=${id}` })
    if (import.meta.env.DEV) console.info('[webgl diagnostics] context restored', { owner, id, snapshot: webglDiagnosticsSnapshot() })
  }
  canvas.addEventListener('webglcontextlost', handleLost, false)
  canvas.addEventListener('webglcontextrestored', handleRestored, false)
  renderers.set(id, record)
  appendDiagnosticEvent({ type: 'renderer-created', renderer: owner, canvas: { width: canvas.width, height: canvas.height }, memory: memorySnapshot(renderer), message: `renderer=${id}` })
  if (import.meta.env.DEV) console.info('[webgl diagnostics] renderer created', { owner, id, activeRendererCount: renderers.size, snapshot: webglDiagnosticsSnapshot() })
  return () => {
    if (!renderers.has(id)) return
    canvas.removeEventListener('webglcontextlost', handleLost, false)
    canvas.removeEventListener('webglcontextrestored', handleRestored, false)
    renderers.delete(id)
    appendDiagnosticEvent({ type: 'renderer-disposed', renderer: owner, canvas: { width: canvas.width, height: canvas.height }, memory: memorySnapshot(renderer), message: `renderer=${id}` })
    if (import.meta.env.DEV) console.info('[webgl diagnostics] renderer disposed', { owner, id, activeRendererCount: renderers.size, snapshot: webglDiagnosticsSnapshot() })
  }
}
