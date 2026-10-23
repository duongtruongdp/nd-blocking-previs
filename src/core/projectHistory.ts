import type { ProjectDocument } from './projectDocument'

export type ProjectHistoryEntry = {
  label: string
  before: ProjectDocument
  after: ProjectDocument
  beforeSelection?: string | null
  afterSelection?: string | null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Canonical application history lane for production project edits. */
export class ProjectHistory {
  private readonly limit: number
  private readonly undoStack: ProjectHistoryEntry[] = []
  private readonly redoStack: ProjectHistoryEntry[] = []

  constructor(limit = 100) { this.limit = Math.max(1, limit) }

  record(entry: ProjectHistoryEntry): void {
    this.undoStack.push(clone(entry))
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
    this.debug('push', entry.label)
  }

  undo(): ProjectHistoryEntry | null {
    const entry = this.undoStack.pop() ?? null
    if (entry) this.redoStack.push(entry)
    if (entry) this.debug('undo', entry.label)
    return entry ? clone(entry) : null
  }

  redo(): ProjectHistoryEntry | null {
    const entry = this.redoStack.pop() ?? null
    if (entry) this.undoStack.push(entry)
    if (entry) this.debug('redo', entry.label)
    return entry ? clone(entry) : null
  }

  canUndo(): boolean { return this.undoStack.length > 0 }

  canRedo(): boolean { return this.redoStack.length > 0 }

  get undoCount(): number { return this.undoStack.length }

  get redoCount(): number { return this.redoStack.length }

  private debug(operation: 'push' | 'undo' | 'redo', reason: string): void {
    if (!import.meta.env.DEV) return
    console.debug(`[history] ${operation} reason=${reason} undoDepth=${this.undoStack.length} redoDepth=${this.redoStack.length}`)
  }
}
