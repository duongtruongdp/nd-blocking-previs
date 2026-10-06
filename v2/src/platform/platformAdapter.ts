import { parseRecentProjects, type RecentProjectEntry } from './projectLibrary'

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

export type PlatformSaveResult = {
  readonly cancelled: boolean
  readonly path: string | null
}

export type CloseDecision = 'close' | 'cancel'
export type UnsavedCloseChoice = 'save' | 'discard' | 'cancel'

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
  loadRecentProjects: () => Promise<RecentProjectEntry[]>
  saveRecentProjects: (entries: readonly RecentProjectEntry[]) => Promise<void>
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
  loadRecentProjects: async () => [],
  saveRecentProjects: async () => {},
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
    loadRecentProjects: nativeLoadRecentProjects,
    saveRecentProjects: nativeSaveRecentProjects,
    promptUnsavedClose: nativePromptUnsavedClose,
    registerCloseGuard: nativeRegisterCloseGuard,
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
