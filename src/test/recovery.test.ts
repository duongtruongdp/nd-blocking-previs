import { describe, expect, it, vi } from 'vitest'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { RecoveryManager, recoveryIdForProjectPath, type RecoveryEntry, type RecoveryStorage } from '../platform/recovery'

function project(name = 'Recovery Test') {
  return createProjectDocument('project-recovery', name, createEmptySceneDocument())
}

function storage(): RecoveryStorage & { writes: string[]; snapshots: Map<string, string>; entries: RecoveryEntry[] } {
  const state = { writes: [] as string[], snapshots: new Map<string, string>(), entries: [] as RecoveryEntry[] }
  return {
    ...state,
    loadEntries: async () => state.entries,
    saveEntries: async (entries) => { state.entries = [...entries] },
    readSnapshot: async (id) => {
      const text = state.snapshots.get(id)
      if (!text) throw new Error('snapshot not found')
      return text
    },
    writeSnapshot: async (id, text) => {
      state.writes.push(id)
      state.snapshots.set(id, text)
      return { path: '/app/recovery/' + id + '.ndblock.recovery', byteLength: text.length }
    },
    deleteSnapshot: async (id) => { state.snapshots.delete(id) },
    statProject: async () => null,
  }
}

describe('desktop recovery manager', () => {
  it('debounces repeated edits into one recovery write', async () => {
    vi.useFakeTimers()
    const backend = storage()
    const manager = new RecoveryManager(backend)
    const path = '/Projects/Shot.ndblock'
    manager.schedule({ recoveryId: recoveryIdForProjectPath(path), projectPath: path, project: project('First'), dirtySince: new Date().toISOString() })
    await vi.advanceTimersByTimeAsync(10_000)
    manager.schedule({ recoveryId: recoveryIdForProjectPath(path), projectPath: path, project: project('Second'), dirtySince: new Date().toISOString() })
    await vi.advanceTimersByTimeAsync(24_999)
    expect(backend.writes).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(backend.writes).toHaveLength(1)
    manager.dispose()
    vi.useRealTimers()
  })

  it('does not rewrite an unchanged generation', async () => {
    const backend = storage()
    const manager = new RecoveryManager(backend)
    const request = { recoveryId: 'session-test', projectPath: null, project: project(), dirtySince: new Date().toISOString() }
    manager.schedule(request)
    await manager.flushNow()
    manager.schedule(request)
    await manager.flushNow()
    expect(backend.writes).toHaveLength(1)
  })

  it('cleans a recovery without touching the authoritative project path', async () => {
    const backend = storage()
    const manager = new RecoveryManager(backend)
    const request = { recoveryId: 'session-test', projectPath: '/Projects/Shot.ndblock', project: project(), dirtySince: new Date().toISOString() }
    manager.schedule(request)
    await manager.flushNow()
    await manager.cleanup(request.recoveryId)
    expect(backend.snapshots.size).toBe(0)
    expect(backend.entries).toHaveLength(0)
  })
})
