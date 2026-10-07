import { parseRecentProjects, type RecentProjectEntry } from './projectLibrary'
import type { ShortcutPreferences } from '../core/shortcutRegistry'
import { parseRecoveryEntries, recoverySnapshotFilename, type RecoveryEntry, type RecoverySettings, type RecoveryWriteResult } from './recovery'

export type PlatformKind = 'web' | 'desktop'

export type PlatformFileKind = 'project' | 'scene'

export type PlatformFile = {
  readonly path: string | null
  readonly name: string
  readonly text: string
}

export type PlatformFileStat = {
  readonly modifiedAt: string | null
}

export type DesktopDropEvent =
  | { readonly type: 'enter'; readonly paths: readonly string[] }
  | { readonly type: 'over' }
  | { readonly type: 'drop'; readonly paths: readonly string[] }
  | { readonly type: 'leave' }

export type PlatformSaveResult = {
  readonly cancelled: boolean
  readonly path: string | null
}

export type ProjectThumbnailWrite = {
  readonly path: string | null
  readonly byteLength: number
}

export type CloseDecision = 'close' | 'cancel'
export type UnsavedCloseChoice = 'save' | 'discard' | 'cancel'

export type UpdatePreferences = {
  readonly autoCheck: boolean
}

export type NativeExportRuntime = {
  prepareWorkspace: (jobId: string) => Promise<{ workspace: string; workspaceAbsolute: string; inputPattern: string; partialRelativePath: string; partialAbsolutePath: string }>
  writeFrame: (workspace: string, fileName: string, data: Uint8Array) => Promise<void>
  verifyPartial: (path: string) => Promise<number>
  finalizePartial: (path: string, destinationPath: string) => Promise<void>
  runFfmpeg: (args: readonly string[], signal: AbortSignal | undefined, onStdoutLine: (line: string) => void) => Promise<void>
  cleanupWorkspace: (workspace: string) => Promise<void>
}

export function closeDecisionForUnsavedChoice(choice: UnsavedCloseChoice, saveSucceeded = true): CloseDecision {
  if (choice === 'discard') return 'close'
  if (choice === 'save' && saveSucceeded) return 'close'
  return 'cancel'
}

export class PlatformFileError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'PlatformFileError'
  }
}

export type PlatformAdapter = {
  readonly kind: PlatformKind
  openProjectFile: () => Promise<PlatformFile | null>
  openProjectFileAt: (path: string) => Promise<PlatformFile | null>
  locateProjectFile: () => Promise<PlatformFile | null>
  saveProjectFile: (text: string, fileName: string, currentPath?: string | null) => Promise<PlatformSaveResult>
  saveProjectFileAs: (text: string, fileName: string) => Promise<PlatformSaveResult>
  openSceneFile: () => Promise<PlatformFile | null>
  saveSceneFile: (text: string, fileName: string) => Promise<PlatformSaveResult>
  chooseExportLocation: (fileName: string, extension: string) => Promise<string | null>
  writeExportFile: (path: string, data: Uint8Array) => Promise<void>
  fileExists: (path: string) => Promise<boolean>
  statFile: (path: string) => Promise<PlatformFileStat | null>
  renameProjectFile: (path: string, nextPath: string) => Promise<void>
  copyProjectFile: (path: string, nextPath: string) => Promise<void>
  deleteProjectFile: (path: string) => Promise<void>
  revealProjectFile: (path: string) => Promise<void>
  readonly revealProjectLabel: string
  initialProjectPath: () => Promise<string | null>
  subscribeProjectOpen: (handler: (path: string) => void) => Promise<() => void>
  subscribeProjectDrop: (handler: (event: DesktopDropEvent) => void) => Promise<() => void>
  loadRecentProjects: () => Promise<RecentProjectEntry[]>
  saveRecentProjects: (entries: readonly RecentProjectEntry[]) => Promise<void>
  saveProjectThumbnail: (key: string, blob: Blob) => Promise<ProjectThumbnailWrite>
  loadProjectThumbnail: (key: string) => Promise<string | null>
  copyProjectThumbnail: (sourceKey: string, targetKey: string) => Promise<void>
  deleteProjectThumbnail: (key: string) => Promise<void>
  cleanupProjectThumbnails: (activeKeys: readonly string[]) => Promise<void>
  loadRecoveryEntries: () => Promise<RecoveryEntry[]>
  saveRecoveryEntries: (entries: readonly RecoveryEntry[]) => Promise<void>
  readRecoverySnapshot: (recoveryId: string) => Promise<string>
  writeRecoverySnapshot: (recoveryId: string, text: string) => Promise<RecoveryWriteResult>
  deleteRecoverySnapshot: (recoveryId: string) => Promise<void>
  statRecoveryProject: (path: string) => Promise<string | null>
  loadRecoverySettings: () => Promise<RecoverySettings>
  saveRecoverySettings: (settings: RecoverySettings) => Promise<void>
  loadShortcutPreferences: () => Promise<ShortcutPreferences>
  saveShortcutPreferences: (preferences: ShortcutPreferences) => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  loadUpdatePreferences: () => Promise<UpdatePreferences>
  saveUpdatePreferences: (preferences: UpdatePreferences) => Promise<void>
  nativeExportRuntime?: NativeExportRuntime
  promptUnsavedClose?: () => Promise<UnsavedCloseChoice>
  registerCloseGuard?: (handler: () => Promise<CloseDecision>) => Promise<() => void>
}

function browserFilePicker(kind: PlatformFileKind): Promise<PlatformFile | null> {
  return new Promise((resolve) => {
    const input = window.document.createElement('input')
    input.type = 'file'
    input.accept = kind === 'project' ? '.ndblock,application/json' : '.ndscene,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      void file.text().then((text) => resolve({ path: null, name: file.name, text })).catch(() => resolve(null))
    }
    input.click()
  })
}

function browserDownload(text: string, fileName: string): void {
  const url = window.URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
}

function browserDownloadBytes(data: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  const url = window.URL.createObjectURL(new Blob([copy.buffer], { type: 'application/octet-stream' }))
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
}

export const webPlatformAdapter: PlatformAdapter = {
  kind: 'web',
  openProjectFile: () => browserFilePicker('project'),
  openProjectFileAt: async () => null,
  locateProjectFile: () => browserFilePicker('project'),
  saveProjectFile: async (text, fileName) => {
    browserDownload(text, fileName)
    return { cancelled: false, path: null }
  },
  saveProjectFileAs: async (text, fileName) => {
    browserDownload(text, fileName)
    return { cancelled: false, path: null }
  },
  openSceneFile: () => browserFilePicker('scene'),
  saveSceneFile: async (text, fileName) => {
    browserDownload(text, fileName)
    return { cancelled: false, path: null }
  },
  chooseExportLocation: async () => null,
  writeExportFile: async (_path, data) => {
    browserDownloadBytes(data, 'export.bin')
  },
  fileExists: async () => false,
  statFile: async () => null,
  renameProjectFile: async () => { throw new PlatformFileError('Project file operations are available in the desktop app.') },
  copyProjectFile: async () => { throw new PlatformFileError('Project file operations are available in the desktop app.') },
  deleteProjectFile: async () => { throw new PlatformFileError('Project file operations are available in the desktop app.') },
  revealProjectFile: async () => { throw new PlatformFileError('Project file operations are available in the desktop app.') },
  revealProjectLabel: 'Show in Finder',
  initialProjectPath: async () => null,
  subscribeProjectOpen: async () => () => {},
  subscribeProjectDrop: async () => () => {},
  loadRecentProjects: async () => [],
  saveRecentProjects: async () => {},
  saveProjectThumbnail: async () => ({ path: null, byteLength: 0 }),
  loadProjectThumbnail: async () => null,
  copyProjectThumbnail: async () => {},
  deleteProjectThumbnail: async () => {},
  cleanupProjectThumbnails: async () => {},
  loadRecoveryEntries: async () => [],
  saveRecoveryEntries: async () => {},
  readRecoverySnapshot: async () => { throw new PlatformFileError('Recovery snapshots are available in the desktop app.') },
  writeRecoverySnapshot: async () => { throw new PlatformFileError('Recovery snapshots are available in the desktop app.') },
  deleteRecoverySnapshot: async () => {},
  statRecoveryProject: async () => null,
  loadRecoverySettings: async () => ({ enabled: true }),
  saveRecoverySettings: async () => {},
  loadShortcutPreferences: async () => {
    try { return JSON.parse(window.localStorage.getItem('nd-blocking-shortcuts') ?? '{}') as ShortcutPreferences } catch { return {} }
  },
  saveShortcutPreferences: async (preferences) => { window.localStorage.setItem('nd-blocking-shortcuts', JSON.stringify(preferences)) },
  openExternalUrl: async (url) => {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) throw new Error('The browser blocked the external URL.')
  },
  loadUpdatePreferences: async () => ({ autoCheck: true }),
  saveUpdatePreferences: async () => {},
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
}

export const platformAdapter: PlatformAdapter = isTauriRuntime() ? createTauriPlatformAdapter() : webPlatformAdapter

function createTauriPlatformAdapter(): PlatformAdapter {
  return {
    kind: 'desktop',
    openProjectFile: () => nativeOpenFile('project'),
    openProjectFileAt: nativeOpenProjectFileAt,
    locateProjectFile: () => nativeOpenFile('project'),
    saveProjectFile: (text, fileName, currentPath) => currentPath ? nativeWriteText(currentPath, text, 'Project') : nativeSaveAs(text, fileName, 'project'),
    saveProjectFileAs: (text, fileName) => nativeSaveAs(text, fileName, 'project'),
    openSceneFile: () => nativeOpenFile('scene'),
    saveSceneFile: (text, fileName) => nativeSaveAs(text, fileName, 'scene'),
    chooseExportLocation: nativeChooseExportLocation,
    writeExportFile: nativeWriteBytes,
    fileExists: nativeFileExists,
    statFile: nativeStatFile,
    renameProjectFile: nativeRenameProjectFile,
    copyProjectFile: nativeCopyProjectFile,
    deleteProjectFile: nativeDeleteProjectFile,
    revealProjectFile: nativeRevealProjectFile,
    revealProjectLabel: typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent) ? 'Show in Explorer' : 'Show in Finder',
    initialProjectPath: nativeInitialProjectPath,
    subscribeProjectOpen: nativeSubscribeProjectOpen,
    subscribeProjectDrop: nativeSubscribeProjectDrop,
    loadRecentProjects: nativeLoadRecentProjects,
    saveRecentProjects: nativeSaveRecentProjects,
    saveProjectThumbnail: nativeSaveProjectThumbnail,
    loadProjectThumbnail: nativeLoadProjectThumbnail,
    copyProjectThumbnail: nativeCopyProjectThumbnail,
    deleteProjectThumbnail: nativeDeleteProjectThumbnail,
    cleanupProjectThumbnails: nativeCleanupProjectThumbnails,
    loadRecoveryEntries: nativeLoadRecoveryEntries,
    saveRecoveryEntries: nativeSaveRecoveryEntries,
    readRecoverySnapshot: nativeReadRecoverySnapshot,
    writeRecoverySnapshot: nativeWriteRecoverySnapshot,
    deleteRecoverySnapshot: nativeDeleteRecoverySnapshot,
    statRecoveryProject: async (path) => (await nativeStatFile(path))?.modifiedAt ?? null,
    loadRecoverySettings: nativeLoadRecoverySettings,
    saveRecoverySettings: nativeSaveRecoverySettings,
    loadShortcutPreferences: nativeLoadShortcutPreferences,
    saveShortcutPreferences: nativeSaveShortcutPreferences,
    openExternalUrl: nativeOpenExternalUrl,
    loadUpdatePreferences: nativeLoadUpdatePreferences,
    saveUpdatePreferences: nativeSaveUpdatePreferences,
    nativeExportRuntime: nativeExportRuntime(),
    promptUnsavedClose: nativePromptUnsavedClose,
    registerCloseGuard: nativeRegisterCloseGuard,
  }
}

function nativeExportRuntime(): NativeExportRuntime {
  return {
    prepareWorkspace: async (jobId) => {
      const [{ BaseDirectory, mkdir }, { appCacheDir, join }] = await Promise.all([
        import('@tauri-apps/plugin-fs'),
        import('@tauri-apps/api/path'),
      ])
      const workspace = `native-exports/${jobId}`
      const cacheRoot = await appCacheDir()
      const workspaceAbsolute = await join(cacheRoot, workspace)
      await mkdir(workspace, { baseDir: BaseDirectory.AppCache, recursive: true })
      return {
        workspace,
        workspaceAbsolute,
        inputPattern: await join(workspaceAbsolute, 'frame_%06d.png'),
        partialRelativePath: `${workspace}/output.partial.mp4`,
        partialAbsolutePath: await join(cacheRoot, `${workspace}/output.partial.mp4`),
      }
    },
    writeFrame: async (workspace, fileName, data) => {
      const { BaseDirectory, writeFile } = await import('@tauri-apps/plugin-fs')
      await writeFile(`${workspace}/${fileName}`, data, { baseDir: BaseDirectory.AppCache })
    },
    verifyPartial: async (path) => {
      const { BaseDirectory, stat } = await import('@tauri-apps/plugin-fs')
      const info = await stat(path, { baseDir: BaseDirectory.AppCache })
      if (!info.isFile || info.size < 16) throw new Error('FFmpeg produced an empty or invalid output file.')
      return info.size
    },
    finalizePartial: async (path, destinationPath) => {
      const { BaseDirectory, rename } = await import('@tauri-apps/plugin-fs')
      await rename(path, destinationPath, { oldPathBaseDir: BaseDirectory.AppCache })
    },
    runFfmpeg: async (args, signal, onStdoutLine) => {
      const { Command } = await import('@tauri-apps/plugin-shell')
      const command = Command.sidecar('binaries/ffmpeg', [...args])
      let stderr = ''
      let child: Awaited<ReturnType<typeof command.spawn>> | null = null
      let resolveClose: ((code: number | null) => void) | null = null
      let rejectClose: ((error: Error) => void) | null = null
      const closed = new Promise<number | null>((resolve, reject) => { resolveClose = resolve; rejectClose = reject })
      command.stdout.on('data', (line) => onStdoutLine(line))
      command.stderr.on('data', (line) => { stderr += line })
      command.on('close', ({ code }) => resolveClose?.(code))
      command.on('error', (error) => rejectClose?.(new Error(error)))
      const abortHandler = () => { void child?.kill().catch(() => {}) }
      signal?.addEventListener('abort', abortHandler, { once: true })
      try {
        if (signal?.aborted) {
          const error = new Error('Export cancelled.')
          error.name = 'ExportCancelledError'
          throw error
        }
        child = await command.spawn()
        const code = await closed
        if (signal?.aborted) {
          const error = new Error('Export cancelled.')
          error.name = 'ExportCancelledError'
          throw error
        }
        if (code !== 0) throw new Error(stderr.trim() || `FFmpeg exited with code ${code ?? 'unknown'}.`)
      } finally {
        signal?.removeEventListener('abort', abortHandler)
      }
    },
    cleanupWorkspace: async (workspace) => {
      const { BaseDirectory, remove } = await import('@tauri-apps/plugin-fs')
      await remove(workspace, { baseDir: BaseDirectory.AppCache, recursive: true }).catch(() => {})
    },
  }
}

async function nativeOpenFile(kind: PlatformFileKind): Promise<PlatformFile | null> {
  try {
    const [{ open }, { readTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const selected = await open({
      multiple: false,
      directory: false,
      title: kind === 'project' ? 'Open Project' : 'Import Scene',
      filters: [{ name: kind === 'project' ? 'ND Blocking Project' : 'ND Scene', extensions: [kind === 'project' ? 'ndblock' : 'ndscene'] }],
    })
    if (!selected || Array.isArray(selected)) return null
    return { path: selected, name: selected.split(/[\\/]/).pop() ?? selected, text: await readTextFile(selected) }
  } catch (error: unknown) {
    throw nativeFileError(kind === 'project' ? 'Project could not be opened.' : 'Scene could not be imported.', error)
  }
}

async function nativeOpenProjectFileAt(path: string): Promise<PlatformFile | null> {
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    return { path, name: path.split(/[\\/]/).pop() ?? path, text: await readTextFile(path) }
  } catch (error: unknown) {
    throw nativeFileError('This Project file could not be opened.', error)
  }
}

async function nativeWriteText(path: string, text: string, label: string): Promise<PlatformSaveResult> {
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    await writeTextFile(path, text)
    return { cancelled: false, path }
  } catch (error: unknown) {
    throw nativeFileError('This location could not be written.', error, label)
  }
}

async function nativeSaveAs(text: string, fileName: string, kind: PlatformFileKind): Promise<PlatformSaveResult> {
  try {
    const [{ save }, { writeTextFile }] = await Promise.all([
      import('@tauri-apps/plugin-dialog'),
      import('@tauri-apps/plugin-fs'),
    ])
    const extension = kind === 'project' ? 'ndblock' : 'ndscene'
    const selected = await save({
      title: kind === 'project' ? 'Save Project As' : 'Export Scene',
      defaultPath: fileName,
      filters: [{ name: kind === 'project' ? 'ND Blocking Project' : 'ND Scene', extensions: [extension] }],
    })
    if (!selected) return { cancelled: true, path: null }
    const path = ensureExtension(selected, extension)
    await writeTextFile(path, text)
    return { cancelled: false, path }
  } catch (error: unknown) {
    throw nativeFileError(kind === 'project' ? 'This Project could not be saved.' : 'This Scene could not be exported.', error)
  }
}

async function nativeChooseExportLocation(fileName: string, extension: string): Promise<string | null> {
  try {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const selected = await save({ title: 'Choose Export Location', defaultPath: fileName, filters: [{ name: extension.toUpperCase(), extensions: [extension.replace(/^\./, '')] }] })
    return selected ? ensureExtension(selected, extension.replace(/^\./, '')) : null
  } catch (error: unknown) {
    throw nativeFileError('The export location could not be selected.', error)
  }
}

async function nativeWriteBytes(path: string, data: Uint8Array): Promise<void> {
  try {
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(path, data)
  } catch (error: unknown) {
    throw nativeFileError('The generated file could not be written.', error)
  }
}

async function nativeFileExists(path: string): Promise<boolean> {
  try {
    const { exists } = await import('@tauri-apps/plugin-fs')
    return await exists(path)
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] File existence check failed', error)
    return false
  }
}

async function nativeStatFile(path: string): Promise<PlatformFileStat | null> {
  try {
    const { stat } = await import('@tauri-apps/plugin-fs')
    const info = await stat(path)
    return { modifiedAt: info.mtime?.toISOString() ?? null }
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] File stat failed', error)
    return null
  }
}

async function nativeRenameProjectFile(path: string, nextPath: string): Promise<void> {
  try {
    const { rename } = await import('@tauri-apps/plugin-fs')
    await rename(path, nextPath)
  } catch (error: unknown) {
    throw nativeFileError('This Project file could not be renamed.', error)
  }
}

async function nativeCopyProjectFile(path: string, nextPath: string): Promise<void> {
  try {
    const { copyFile } = await import('@tauri-apps/plugin-fs')
    await copyFile(path, nextPath)
  } catch (error: unknown) {
    throw nativeFileError('This Project file could not be duplicated.', error)
  }
}

async function nativeDeleteProjectFile(path: string): Promise<void> {
  try {
    const { remove } = await import('@tauri-apps/plugin-fs')
    await remove(path)
  } catch (error: unknown) {
    throw nativeFileError('This Project file could not be deleted.', error)
  }
}

async function nativeRevealProjectFile(path: string): Promise<void> {
  try {
    const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
    await revealItemInDir(path)
  } catch (error: unknown) {
    throw nativeFileError('The Project could not be revealed in Finder or Explorer.', error)
  }
}

async function nativeOpenExternalUrl(url: string): Promise<void> {
  const { openUrl } = await import('@tauri-apps/plugin-opener')
  await openUrl(url)
}

async function nativeInitialProjectPath(): Promise<string | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string | null>('startup_project_path')
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Startup Project path could not be read', error)
    return null
  }
}

async function nativeSubscribeProjectOpen(handler: (path: string) => void): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  return listen<string>('nd://open-project', (event) => handler(event.payload))
}

async function nativeSubscribeProjectDrop(handler: (event: DesktopDropEvent) => void): Promise<() => void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type === 'enter') handler({ type: 'enter', paths: event.payload.paths })
    else if (event.payload.type === 'over') handler({ type: 'over' })
    else if (event.payload.type === 'drop') handler({ type: 'drop', paths: event.payload.paths })
    else handler({ type: 'leave' })
  })
}

const THUMBNAIL_DIRECTORY = 'project-thumbnails'

function thumbnailPath(key: string): string {
  return `${THUMBNAIL_DIRECTORY}/${key}.png`
}

function bytesToDataUrl(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return `data:image/png;base64,${btoa(binary)}`
}

async function nativeSaveProjectThumbnail(key: string, blob: Blob): Promise<ProjectThumbnailWrite> {
  const [{ BaseDirectory, exists, mkdir, stat, writeFile }, { appLocalDataDir, join }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error('Camera thumbnail PNG was empty.')
  const root = await appLocalDataDir()
  const relativePath = thumbnailPath(key)
  const absolutePath = await join(root, relativePath)
  if (import.meta.env.DEV) console.info('[thumbnail] appLocalData =', root, 'directory =', await join(root, THUMBNAIL_DIRECTORY))
  await mkdir(THUMBNAIL_DIRECTORY, { baseDir: BaseDirectory.AppLocalData, recursive: true })
  await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppLocalData })
  if (!await exists(relativePath, { baseDir: BaseDirectory.AppLocalData })) throw new Error('Camera thumbnail PNG was not found after writing.')
  const info = await stat(relativePath, { baseDir: BaseDirectory.AppLocalData })
  if (!info.isFile || info.size <= 0) throw new Error('Camera thumbnail PNG failed post-write verification.')
  if (import.meta.env.DEV) console.info('[thumbnail] write complete', { path: absolutePath, byteLength: info.size })
  return { path: absolutePath, byteLength: info.size }
}

async function nativeLoadProjectThumbnail(key: string): Promise<string | null> {
  try {
    const { BaseDirectory, readFile } = await import('@tauri-apps/plugin-fs')
    return bytesToDataUrl(await readFile(thumbnailPath(key), { baseDir: BaseDirectory.AppLocalData }))
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Project thumbnail could not be loaded', error)
    return null
  }
}

async function nativeCopyProjectThumbnail(sourceKey: string, targetKey: string): Promise<void> {
  try {
    const { BaseDirectory, copyFile } = await import('@tauri-apps/plugin-fs')
    await copyFile(thumbnailPath(sourceKey), thumbnailPath(targetKey), { fromPathBaseDir: BaseDirectory.AppLocalData, toPathBaseDir: BaseDirectory.AppLocalData })
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Project thumbnail could not be copied', error)
  }
}

async function nativeDeleteProjectThumbnail(key: string): Promise<void> {
  try {
    const { BaseDirectory, remove } = await import('@tauri-apps/plugin-fs')
    await remove(thumbnailPath(key), { baseDir: BaseDirectory.AppLocalData })
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Project thumbnail could not be removed', error)
  }
}

async function nativeCleanupProjectThumbnails(activeKeys: readonly string[]): Promise<void> {
  try {
    const { BaseDirectory, readDir } = await import('@tauri-apps/plugin-fs')
    const active = new Set(activeKeys.map((key) => `${key}.png`))
    for (const entry of await readDir(THUMBNAIL_DIRECTORY, { baseDir: BaseDirectory.AppLocalData })) {
      if (entry.isFile && !active.has(entry.name)) await nativeDeleteProjectThumbnail(entry.name.replace(/\.png$/i, ''))
    }
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Project thumbnail cleanup failed', error)
  }
}

const RECOVERY_DIRECTORY = 'recovery'
const RECOVERY_METADATA_KEY = 'recoveryEntries'
const RECOVERY_STORE = 'recovery.json'

function recoverySnapshotPath(recoveryId: string): string {
  return `${RECOVERY_DIRECTORY}/${recoverySnapshotFilename(recoveryId)}`
}

async function nativeLoadRecoveryEntries(): Promise<RecoveryEntry[]> {
  try {
    const { BaseDirectory, readDir, remove } = await import('@tauri-apps/plugin-fs')
    for (const entry of await readDir(RECOVERY_DIRECTORY, { baseDir: BaseDirectory.AppLocalData }).catch(() => [])) {
      if (entry.isFile && entry.name.endsWith('.tmp')) await remove(`${RECOVERY_DIRECTORY}/${entry.name}`, { baseDir: BaseDirectory.AppLocalData })
    }
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load(RECOVERY_STORE, { autoSave: false })
    return parseRecoveryEntries(await store.get<unknown>(RECOVERY_METADATA_KEY))
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[recovery] metadata could not be loaded', error)
    return []
  }
}

async function nativeSaveRecoveryEntries(entries: readonly RecoveryEntry[]): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load(RECOVERY_STORE, { autoSave: false })
    await store.set(RECOVERY_METADATA_KEY, entries)
    await store.save()
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[recovery] metadata could not be saved', error)
    throw new PlatformFileError('Recovery metadata could not be saved.', { cause: error })
  }
}

async function nativeReadRecoverySnapshot(recoveryId: string): Promise<string> {
  const { BaseDirectory, readTextFile } = await import('@tauri-apps/plugin-fs')
  return readTextFile(recoverySnapshotPath(recoveryId), { baseDir: BaseDirectory.AppLocalData })
}

async function nativeWriteRecoverySnapshot(recoveryId: string, text: string): Promise<RecoveryWriteResult> {
  const [{ BaseDirectory, exists, mkdir, readDir, remove, rename, stat, writeTextFile }, { appLocalDataDir, join }] = await Promise.all([
    import('@tauri-apps/plugin-fs'),
    import('@tauri-apps/api/path'),
  ])
  const finalPath = recoverySnapshotPath(recoveryId)
  const temporaryPath = `${finalPath}.tmp`
  await mkdir(RECOVERY_DIRECTORY, { baseDir: BaseDirectory.AppLocalData, recursive: true })
  for (const entry of await readDir(RECOVERY_DIRECTORY, { baseDir: BaseDirectory.AppLocalData })) {
    if (entry.isFile && entry.name.endsWith('.tmp') && entry.name !== temporaryPath.slice(`${RECOVERY_DIRECTORY}/`.length)) {
      await remove(`${RECOVERY_DIRECTORY}/${entry.name}`, { baseDir: BaseDirectory.AppLocalData })
    }
  }
  await writeTextFile(temporaryPath, text, { baseDir: BaseDirectory.AppLocalData })
  const temporaryInfo = await stat(temporaryPath, { baseDir: BaseDirectory.AppLocalData })
  if (!temporaryInfo.isFile || temporaryInfo.size <= 0) throw new Error('Recovery snapshot temp file failed verification.')
  await rename(temporaryPath, finalPath, { oldPathBaseDir: BaseDirectory.AppLocalData, newPathBaseDir: BaseDirectory.AppLocalData })
  if (!await exists(finalPath, { baseDir: BaseDirectory.AppLocalData })) throw new Error('Recovery snapshot was not found after atomic rename.')
  const finalInfo = await stat(finalPath, { baseDir: BaseDirectory.AppLocalData })
  if (!finalInfo.isFile || finalInfo.size <= 0) throw new Error('Recovery snapshot failed post-write verification.')
  const absolutePath = await join(await appLocalDataDir(), finalPath)
  return { path: absolutePath, byteLength: finalInfo.size }
}

async function nativeDeleteRecoverySnapshot(recoveryId: string): Promise<void> {
  try {
    const { BaseDirectory, remove } = await import('@tauri-apps/plugin-fs')
    await remove(recoverySnapshotPath(recoveryId), { baseDir: BaseDirectory.AppLocalData })
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.warn('[recovery] snapshot cleanup skipped', { recoveryId, error })
  }
}

async function nativeLoadRecoverySettings(): Promise<RecoverySettings> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('app-preferences.json', { autoSave: false })
    return { enabled: (await store.get<boolean>('recoveryEnabled')) !== false }
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[recovery] settings could not be loaded', error)
    return { enabled: true }
  }
}

async function nativeSaveRecoverySettings(settings: RecoverySettings): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('app-preferences.json', { autoSave: false })
    await store.set('recoveryEnabled', settings.enabled)
    await store.save()
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[recovery] settings could not be saved', error)
  }
}

async function nativeLoadRecentProjects(): Promise<RecentProjectEntry[]> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('recent-projects.json', { autoSave: false })
    return parseRecentProjects(await store.get<unknown>('recentProjects'))
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Recent Project metadata could not be loaded', error)
    return []
  }
}

async function nativeSaveRecentProjects(entries: readonly RecentProjectEntry[]): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('recent-projects.json', { autoSave: false })
    await store.set('recentProjects', entries)
    await store.save()
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Recent Project metadata could not be saved', error)
  }
}

async function nativeLoadShortcutPreferences(): Promise<ShortcutPreferences> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('app-preferences.json', { autoSave: false })
    return (await store.get<ShortcutPreferences>('shortcuts')) ?? {}
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Shortcut preferences could not be loaded', error)
    return {}
  }
}

async function nativeSaveShortcutPreferences(preferences: ShortcutPreferences): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('app-preferences.json', { autoSave: false })
    await store.set('shortcuts', preferences)
    await store.save()
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Shortcut preferences could not be saved', error)
  }
}

async function nativeLoadUpdatePreferences(): Promise<UpdatePreferences> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('app-preferences.json', { autoSave: false })
    return { autoCheck: (await store.get<boolean>('checkForUpdatesAutomatically')) !== false }
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Update preferences could not be loaded', error)
    return { autoCheck: true }
  }
}

async function nativeSaveUpdatePreferences(preferences: UpdatePreferences): Promise<void> {
  try {
    const { load } = await import('@tauri-apps/plugin-store')
    const store = await load('app-preferences.json', { autoSave: false })
    await store.set('checkForUpdatesAutomatically', preferences.autoCheck)
    await store.save()
  } catch (error: unknown) {
    if (import.meta.env.DEV) console.error('[ND Blocking & Previs] Update preferences could not be saved', error)
  }
}

async function nativePromptUnsavedClose(): Promise<UnsavedCloseChoice> {
  try {
    const { message } = await import('@tauri-apps/plugin-dialog')
    const result = await message('This Project has unsaved changes.', {
      title: 'ND Blocking & Previs',
      kind: 'warning',
      buttons: { yes: 'Save', no: "Don't Save", cancel: 'Cancel' },
    })
    if (result === 'Save') return 'save'
    if (result === "Don't Save") return 'discard'
    return 'cancel'
  } catch (error: unknown) {
    throw nativeFileError('The close confirmation could not be shown.', error)
  }
}

async function nativeRegisterCloseGuard(handler: () => Promise<CloseDecision>): Promise<() => void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const currentWindow = getCurrentWindow()
  let approvingClose = false
  const unlisten = await currentWindow.onCloseRequested(async (event) => {
    if (approvingClose) return
    event.preventDefault()
    if (await handler() === 'close') {
      approvingClose = true
      await currentWindow.close()
    }
  })
  return unlisten
}

export function ensureExtension(path: string, extension: string): string {
  const normalizedExtension = extension.replace(/^\.+/, '').toLowerCase()
  const suffix = `.${normalizedExtension}`
  return path.toLowerCase().endsWith(suffix) ? path : `${path}${suffix}`
}

function nativeFileError(message: string, cause: unknown, label?: string): PlatformFileError {
  if (import.meta.env.DEV) console.error(`[ND Blocking & Previs] ${label ?? 'Desktop file operation'} failed`, cause)
  return new PlatformFileError(message, { cause })
}
