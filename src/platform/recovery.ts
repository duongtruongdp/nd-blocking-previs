import { parseProjectFile, serializeProject } from '../core/projectPersistence'
import { creativeProjectFingerprint } from '../core/projectDirty'
import type { ProjectDocument } from '../core/projectDocument'

export const RECOVERY_DEBOUNCE_MS = 25_000
export const RECOVERY_MAX_INTERVAL_MS = 120_000

export type RecoverySettings = {
  readonly enabled: boolean
}

export type RecoveryEntry = {
  readonly recoveryId: string
  readonly projectPath: string | null
  readonly projectName: string
  readonly snapshotPath: string
  readonly savedProjectModifiedAt: string | null
  readonly recoveryWrittenAt: string
  readonly projectDirtySince: string
}

export type RecoveryInspectionStatus = 'ready' | 'missing' | 'corrupt' | 'stale' | 'changed'

export type RecoveryInspection = RecoveryEntry & {
  readonly status: RecoveryInspectionStatus
  readonly project?: ProjectDocument
  readonly error?: string
  readonly originalModifiedAt?: string | null
}

export type RecoveryWriteResult = {
  readonly path: string
  readonly byteLength: number
}

export type RecoveryStorage = {
  loadEntries: () => Promise<RecoveryEntry[]>
  saveEntries: (entries: readonly RecoveryEntry[]) => Promise<void>
  readSnapshot: (recoveryId: string) => Promise<string>
  writeSnapshot: (recoveryId: string, text: string) => Promise<RecoveryWriteResult>
  deleteSnapshot: (recoveryId: string) => Promise<void>
  statProject: (path: string) => Promise<string | null>
}

export type RecoveryScheduleRequest = {
  readonly recoveryId: string
  readonly projectPath: string | null
  readonly project: ProjectDocument
  readonly dirtySince: string
}

export type RecoveryLog = (message: string, details?: unknown) => void

export function recoveryIdForProjectPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^[A-Z]:/, (drive) => drive.toLowerCase())
  return `path-${stableHash(`path:${normalized}`)}`
}

export function createUnsavedRecoveryId(): string {
  const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `session-${random}`
}

export function recoverySnapshotFilename(recoveryId: string): string {
  return `${recoveryId}.ndblock.recovery`
}

export function parseRecoveryEntries(value: unknown): RecoveryEntry[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate): RecoveryEntry[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const record = candidate as Record<string, unknown>
    if (typeof record.recoveryId !== 'string' || !record.recoveryId || typeof record.projectName !== 'string' || typeof record.snapshotPath !== 'string' || typeof record.recoveryWrittenAt !== 'string' || typeof record.projectDirtySince !== 'string') return []
    return [{
      recoveryId: record.recoveryId,
      projectPath: typeof record.projectPath === 'string' ? record.projectPath : null,
      projectName: record.projectName || 'Untitled Project',
      snapshotPath: record.snapshotPath,
      savedProjectModifiedAt: typeof record.savedProjectModifiedAt === 'string' ? record.savedProjectModifiedAt : null,
      recoveryWrittenAt: record.recoveryWrittenAt,
      projectDirtySince: record.projectDirtySince,
    }]
  }).sort((a, b) => b.recoveryWrittenAt.localeCompare(a.recoveryWrittenAt))
}

export class RecoveryManager {
  private readonly storage: RecoveryStorage
  private readonly log?: RecoveryLog
  private enabled = true
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private maxTimer: ReturnType<typeof setTimeout> | null = null
  private pending: (RecoveryScheduleRequest & { fingerprint: string }) | null = null
  private readonly inFlight = new Map<string, Promise<void>>()
  private readonly invalidated = new Set<string>()
  private readonly lastWrittenGeneration = new Map<string, string>()

  constructor(storage: RecoveryStorage, log?: RecoveryLog) {
    this.storage = storage
    this.log = log
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  schedule(request: RecoveryScheduleRequest): void {
    if (!this.enabled) return
    const fingerprint = creativeProjectFingerprint(request.project)
    const generation = `${request.recoveryId}:${fingerprint}`
    if (this.lastWrittenGeneration.get(request.recoveryId) === generation) return
    this.invalidated.delete(request.recoveryId)
    this.pending = { ...request, fingerprint }
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => { void this.flush() }, RECOVERY_DEBOUNCE_MS)
    if (!this.maxTimer) this.maxTimer = setTimeout(() => { void this.flush() }, RECOVERY_MAX_INTERVAL_MS)
    this.log?.('scheduled', { recoveryId: request.recoveryId, projectName: request.project.name })
  }

  async flushNow(): Promise<void> {
    await this.flush()
  }

  async cleanup(recoveryId: string): Promise<void> {
    this.invalidated.add(recoveryId)
    if (this.pending?.recoveryId === recoveryId) this.pending = null
    const inFlight = this.inFlight.get(recoveryId)
    if (inFlight) await inFlight
    try {
      await this.storage.deleteSnapshot(recoveryId)
    } catch (error: unknown) {
      this.log?.('cleanup snapshot failed', { recoveryId, error })
    }
    try {
      const entries = await this.storage.loadEntries()
      await this.storage.saveEntries(entries.filter((entry) => entry.recoveryId !== recoveryId))
    } catch (error: unknown) {
      this.log?.('cleanup metadata failed', { recoveryId, error })
    }
    this.lastWrittenGeneration.delete(recoveryId)
    this.invalidated.delete(recoveryId)
    this.log?.('cleaned', { recoveryId })
  }

  async inspect(): Promise<RecoveryInspection[]> {
    const entries = await this.storage.loadEntries()
    const inspections = await Promise.all(entries.map(async (entry): Promise<RecoveryInspection> => {
      try {
        const text = await this.storage.readSnapshot(entry.recoveryId)
        const project = parseProjectFile(text)
        if (!entry.projectPath) return { ...entry, status: 'ready', project }
        const originalModifiedAt = await this.storage.statProject(entry.projectPath)
        if (originalModifiedAt && entry.savedProjectModifiedAt && originalModifiedAt !== entry.savedProjectModifiedAt) {
          return {
            ...entry,
            status: originalModifiedAt > entry.recoveryWrittenAt ? 'stale' : 'changed',
            project,
            originalModifiedAt,
          }
        }
        return { ...entry, status: 'ready', project, originalModifiedAt }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'This recovery snapshot could not be opened.'
        const status = /not found|no such|does not exist|cannot find/i.test(message) ? 'missing' : 'corrupt'
        return { ...entry, status, error: message }
      }
    }))
    const sorted = inspections.sort((a, b) => b.recoveryWrittenAt.localeCompare(a.recoveryWrittenAt))
    if (sorted.length > 0) this.log?.('found on startup', sorted.map((entry) => ({ recoveryId: entry.recoveryId, status: entry.status })))
    return sorted
  }

  async recover(recoveryId: string): Promise<{ project: ProjectDocument; entry: RecoveryEntry } | null> {
    const entry = (await this.storage.loadEntries()).find((candidate) => candidate.recoveryId === recoveryId)
    if (!entry) return null
    const project = parseProjectFile(await this.storage.readSnapshot(recoveryId))
    return { project, entry }
  }

  async reassociate(oldRecoveryId: string, nextRecoveryId: string, nextProjectPath: string): Promise<void> {
    if (oldRecoveryId === nextRecoveryId) {
      const entries = await this.storage.loadEntries()
      const current = entries.find((entry) => entry.recoveryId === oldRecoveryId)
      if (!current) return
      await this.storage.saveEntries(entries.map((entry) => entry.recoveryId === oldRecoveryId ? { ...entry, projectPath: nextProjectPath } : entry))
      return
    }
    const entries = await this.storage.loadEntries()
    const current = entries.find((entry) => entry.recoveryId === oldRecoveryId)
    if (!current) return
    const text = await this.storage.readSnapshot(oldRecoveryId)
    const write = await this.storage.writeSnapshot(nextRecoveryId, text)
    await this.storage.deleteSnapshot(oldRecoveryId)
    const nextEntry: RecoveryEntry = { ...current, recoveryId: nextRecoveryId, projectPath: nextProjectPath, snapshotPath: write.path }
    await this.storage.saveEntries([nextEntry, ...entries.filter((entry) => entry.recoveryId !== oldRecoveryId && entry.recoveryId !== nextRecoveryId)])
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.maxTimer) clearTimeout(this.maxTimer)
    this.debounceTimer = null
    this.maxTimer = null
    this.pending = null
  }

  private async flush(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    if (this.maxTimer) clearTimeout(this.maxTimer)
    this.debounceTimer = null
    this.maxTimer = null
    if (!this.pending || !this.enabled) return
    if (this.inFlight.size > 0) {
      this.debounceTimer = setTimeout(() => { void this.flush() }, RECOVERY_DEBOUNCE_MS)
      return
    }
    const request = this.pending
    this.pending = null
    const write = this.write(request)
    this.inFlight.set(request.recoveryId, write)
    try {
      await write
    } catch (error: unknown) {
      this.log?.('write failed', { recoveryId: request.recoveryId, error })
    } finally {
      this.inFlight.delete(request.recoveryId)
      if (this.pending) this.debounceTimer = setTimeout(() => { void this.flush() }, RECOVERY_DEBOUNCE_MS)
    }
  }

  private async write(request: RecoveryScheduleRequest & { fingerprint: string }): Promise<void> {
    const generation = `${request.recoveryId}:${request.fingerprint}`
    const text = serializeProject(request.project)
    parseProjectFile(text)
    this.log?.('writing...', { recoveryId: request.recoveryId, projectName: request.project.name })
    const write = await this.storage.writeSnapshot(request.recoveryId, text)
    if (this.invalidated.has(request.recoveryId)) {
      await this.storage.deleteSnapshot(request.recoveryId)
      return
    }
    const entry: RecoveryEntry = {
      recoveryId: request.recoveryId,
      projectPath: request.projectPath,
      projectName: request.project.name,
      snapshotPath: write.path,
      savedProjectModifiedAt: request.projectPath ? await this.storage.statProject(request.projectPath) : null,
      recoveryWrittenAt: new Date().toISOString(),
      projectDirtySince: request.dirtySince,
    }
    const entries = await this.storage.loadEntries()
    await this.storage.saveEntries([entry, ...entries.filter((candidate) => candidate.recoveryId !== request.recoveryId)])
    this.lastWrittenGeneration.set(request.recoveryId, generation)
    this.log?.('write complete', { recoveryId: request.recoveryId, path: write.path, byteLength: write.byteLength })
  }
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
