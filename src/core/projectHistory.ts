import type { ProjectDocument } from './projectDocument'

export type ProjectHistoryEntry = { label: string; before: ProjectDocument; after: ProjectDocument }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Small Host-owned history lane for project-level planning edits. */
export class ProjectHistory {
  private readonly limit: number
  private readonly undoStack: ProjectHistoryEntry[] = []
  private readonly redoStack: ProjectHistoryEntry[] = []

  constructor(limit = 100) { this.limit = Math.max(1, limit) }

  record(entry: ProjectHistoryEntry): void {
    this.undoStack.push(clone(entry))
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
  }

  undo(): ProjectHistoryEntry | null {
    const entry = this.undoStack.pop() ?? null
    if (entry) this.redoStack.push(entry)
    return entry ? clone(entry) : null
  }

  redo(): ProjectHistoryEntry | null {
    const entry = this.redoStack.pop() ?? null
    if (entry) this.undoStack.push(entry)
    return entry ? clone(entry) : null
  }
}
