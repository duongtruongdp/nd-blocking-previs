import { describe, expect, it } from 'vitest'
import { ProjectHistory } from '../core/projectHistory'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'

function project(value: number) {
  const scene = createEmptySceneDocument()
  scene.timeline.currentFrame = value
  return createProjectDocument('project-01', `Project ${value}`, scene)
}

describe('Project history transaction invariants', () => {
  it('supports deterministic A/B/C/D undo and redo, then clears redo on a branch edit', () => {
    const history = new ProjectHistory()
    history.record({ label: 'Edit 1', before: project(0), after: project(1) })
    history.record({ label: 'Edit 2', before: project(1), after: project(2) })
    history.record({ label: 'Edit 3', before: project(2), after: project(3) })
    expect(history.undoCount).toBe(3)
    expect(history.undo()?.before.scenes[0].scene.timeline.currentFrame).toBe(2)
    expect(history.undoCount).toBe(2)
    expect(history.undo()?.before.scenes[0].scene.timeline.currentFrame).toBe(1)
    expect(history.undoCount).toBe(1)
    expect(history.redo()?.after.scenes[0].scene.timeline.currentFrame).toBe(2)
    expect(history.redo()?.after.scenes[0].scene.timeline.currentFrame).toBe(3)
    expect(history.undoCount).toBe(3)
    expect(history.redoCount).toBe(0)
    history.undo()
    history.record({ label: 'Branch', before: project(2), after: project(4) })
    expect(history.canRedo()).toBe(false)
    expect(history.undo()?.after.scenes[0].scene.timeline.currentFrame).toBe(4)
  })
})
