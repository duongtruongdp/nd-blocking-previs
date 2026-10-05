import type { SceneDocument } from './sceneDocument'

export type EditorHistorySnapshot = {
  document: SceneDocument
  selectedEntityId: string | null
}

export type EditorHistoryEntry = {
  label: string
  before: EditorHistorySnapshot
  after: EditorHistorySnapshot
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export class EditorHistory {
  private readonly limit: number
  private readonly undoStack: EditorHistoryEntry[] = []
  private readonly redoStack: EditorHistoryEntry[] = []

  constructor(limit = 100) {
    this.limit = Math.max(1, limit)
  }

  record(entry: EditorHistoryEntry): void {
    this.undoStack.push(clone(entry))
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack.length = 0
  }

  undo(): EditorHistoryEntry | null {
    const entry = this.undoStack.pop() ?? null
    if (entry) this.redoStack.push(entry)
    return entry ? clone(entry) : null
  }

  redo(): EditorHistoryEntry | null {
    const entry = this.redoStack.pop() ?? null
    if (entry) this.undoStack.push(entry)
    return entry ? clone(entry) : null
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoCount(): number {
    return this.undoStack.length
  }

  get redoCount(): number {
    return this.redoStack.length
  }
}
