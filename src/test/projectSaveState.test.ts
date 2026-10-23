import { describe, expect, it } from 'vitest'
import { checkpointForSuccessfulSave, currentDocumentMatchesSave, isProjectDirty, saveResultAllowsClose } from '../core/projectSaveState'

describe('project save checkpoints', () => {
  it('keeps a later edit dirty when an older async save completes', () => {
    const checkpoint = checkpointForSuccessfulSave(10, 'state-b')
    expect(checkpoint.revision).toBe(10)
    expect(isProjectDirty('state-c', checkpoint)).toBe(true)
    expect(currentDocumentMatchesSave('state-c', checkpoint.fingerprint)).toBe(false)
  })

  it('allows undo back to the saved document to become clean', () => {
    const checkpoint = checkpointForSuccessfulSave(10, 'state-a')
    expect(isProjectDirty('state-b', checkpoint)).toBe(true)
    expect(isProjectDirty('state-a', checkpoint)).toBe(false)
  })

  it('only a completed save allows close', () => {
    expect(saveResultAllowsClose({ status: 'success', path: '/tmp/project.ndblock', revision: 4 })).toBe(true)
    expect(saveResultAllowsClose({ status: 'cancelled' })).toBe(false)
    expect(saveResultAllowsClose({ status: 'failed', error: new Error('disk full') })).toBe(false)
  })
})
