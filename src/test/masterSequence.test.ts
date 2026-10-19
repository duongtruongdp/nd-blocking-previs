import { describe, expect, it } from 'vitest'
import { createEmptySceneDocument } from '../core/sceneDocument'
import { createProjectDocument } from '../core/projectDocument'
import { createShotDocument } from '../core/shotDocument'
import { parseProjectFile, serializeProject } from '../core/projectPersistence'
import { creativeProjectFingerprint } from '../core/projectDirty'
import { createMasterClip, createMasterSequenceDocument, createMusicClip, duplicateMasterClip, effectiveMasterRenderRange, insertMasterClipAt, masterClipDurationFrames, masterClipStartFrame, masterSequenceDurationFrames, masterSequenceFrameRate, masterSequenceVisualDurationFrames, moveMasterClip, normalizeMasterSequence, removeMasterClip, reorderMasterClip, resolveMasterFrame, resolveMasterMusicTime, sameFrameRate, setMasterSequenceMark, sourceRangeWithinShot, updateMasterClipRange } from '../core/masterSequence'

function shot(id: string, sceneId: string, startFrame = 10, endFrame = 20) {
  return createShotDocument({ id, name: id, sceneId, cameraId: `camera-${id}`, startFrame, endFrame, order: 0, notes: '', thumbnail: null })
}

function scene(id: string, fps = 24) {
  const document = createEmptySceneDocument()
  return { id, name: id, scene: { ...document, metadata: { ...document.metadata, id, name: id }, timeline: { ...document.timeline, frameRate: { numerator: fps, denominator: 1 } } } }
}

describe('master sequence foundation', () => {
  it('defaults empty and derives duration from source ranges', () => {
    const sequence = createMasterSequenceDocument()
    expect(sequence.clips).toEqual([])
    expect(sequence.musicClip).toBeNull()
    expect(sequence.markInFrame).toBeNull()
    expect(sequence.markOutFrame).toBeNull()
    const first = shot('shot-a', 'scene-a', 10, 20)
    const second = shot('shot-b', 'scene-a', 40, 44)
    const clips = [createMasterClip(first, new Set()), { ...createMasterClip(second, new Set(['clip-a'])), id: 'clip-b', order: 1 }]
    const populated = { clips: [{ ...clips[0], id: 'clip-a', order: 0 }, clips[1]] }
    expect(masterClipDurationFrames(populated.clips[0])).toBe(10)
    expect(masterSequenceDurationFrames(populated)).toBe(14)
  })

  it('allows the same Shot to be referenced more than once with independent IDs', () => {
    const source = shot('shot-a', 'scene-a')
    const first = { ...createMasterClip(source, new Set()), id: 'clip-a', order: 0 }
    const second = { ...createMasterClip(source, new Set(['clip-a'])), id: 'clip-b', order: 1, sourceStartFrame: 12, sourceEndFrame: 16 }
    expect(first.shotId).toBe(second.shotId)
    expect(first.id).not.toBe(second.id)
    expect(second.sourceStartFrame).toBe(12)
  })

  it('maps master frames across clips to the referenced Shot source frame', () => {
    const first = shot('shot-a', 'scene-a', 10, 13)
    const second = shot('shot-b', 'scene-b', 50, 54)
    const sequence = { clips: [{ id: 'clip-a', shotId: first.id, sourceStartFrame: 10, sourceEndFrame: 13, order: 0 }, { id: 'clip-b', shotId: second.id, sourceStartFrame: 51, sourceEndFrame: 54, order: 1 }] }
    expect(resolveMasterFrame(sequence, [first, second], 0)).toMatchObject({ clipId: 'clip-a', sourceFrame: 10, localClipFrame: 0, sceneId: 'scene-a' })
    expect(resolveMasterFrame(sequence, [first, second], 2)).toMatchObject({ clipId: 'clip-a', sourceFrame: 12 })
    expect(resolveMasterFrame(sequence, [first, second], 3)).toMatchObject({ clipId: 'clip-b', sourceFrame: 51, localClipFrame: 0, cameraId: 'camera-shot-b' })
    expect(resolveMasterFrame(sequence, [first, second], 99)).toMatchObject({ clipId: 'clip-b', sourceFrame: 53, localClipFrame: 2 })
  })

  it('enforces trim bounds without changing the Shot range', () => {
    const source = shot('shot-a', 'scene-a', 10, 20)
    const sequence = { clips: [{ id: 'clip-a', shotId: source.id, sourceStartFrame: 10, sourceEndFrame: 20, order: 0 }] }
    expect(sourceRangeWithinShot(source, 12, 18)).toBe(true)
    expect(sourceRangeWithinShot(source, 9, 18)).toBe(false)
    expect(sourceRangeWithinShot(source, 12, 21)).toBe(false)
    const trimmed = updateMasterClipRange(sequence, 'clip-a', source, 12, 18)
    expect(trimmed?.clips[0]).toMatchObject({ sourceStartFrame: 12, sourceEndFrame: 18 })
    expect(source.startFrame).toBe(10)
    expect(source.endFrame).toBe(20)
    expect(updateMasterClipRange(sequence, 'clip-a', source, 18, 18)).toBeNull()
  })

  it('duplicates, reorders, and removes clips without changing source Shots', () => {
    const source = shot('shot-a', 'scene-a')
    const sequence = { clips: [{ id: 'clip-a', shotId: source.id, sourceStartFrame: 10, sourceEndFrame: 20, order: 0 }, { id: 'clip-b', shotId: source.id, sourceStartFrame: 10, sourceEndFrame: 20, order: 1 }] }
    const duplicate = duplicateMasterClip(sequence, 'clip-a')
    expect(duplicate?.clips).toHaveLength(3)
    expect(duplicate?.clips[0].id).toBe('clip-a')
    expect(duplicate?.clips[1].id).not.toBe('clip-a')
    expect(duplicate?.clips[1].id).not.toBe('clip-b')
    const moved = moveMasterClip(duplicate!, 'clip-b', -1)
    expect(moved.clips.map((clip) => clip.id)).toEqual(['clip-a', 'clip-b', duplicate!.clips[1].id])
    const removed = removeMasterClip(moved, 'clip-b')
    expect(removed.clips.map((clip) => clip.id)).toEqual(['clip-a', duplicate!.clips[1].id])
    expect(source.startFrame).toBe(10)
  })

  it('normalizes older or malformed sequence data safely', () => {
    expect(normalizeMasterSequence(undefined)).toEqual({ clips: [], musicClip: null, markInFrame: null, markOutFrame: null })
    expect(normalizeMasterSequence({ clips: [{ id: 'clip-a', shotId: 'shot-a', sourceStartFrame: 2, sourceEndFrame: 1, order: 0 }, { id: 'clip-a', shotId: 'shot-b', sourceStartFrame: 4, sourceEndFrame: 6, order: 1 }] })).toEqual({ clips: [{ id: 'clip-a', shotId: 'shot-b', sourceStartFrame: 4, sourceEndFrame: 6, order: 0 }], musicClip: null, markInFrame: null, markOutFrame: null })
  })

  it('stores Master marks in Master coordinates and constrains them to video content', () => {
    const source = shot('shot-a', 'scene-a', 10, 20)
    const sequence = { ...createMasterSequenceDocument(), clips: [{ id: 'clip-a', shotId: source.id, sourceStartFrame: 10, sourceEndFrame: 20, order: 0 }] }
    const withIn = setMasterSequenceMark(sequence, 'in', 3)
    const withRange = setMasterSequenceMark(withIn, 'out', 8)
    expect(withRange).toMatchObject({ markInFrame: 3, markOutFrame: 8 })
    expect(effectiveMasterRenderRange(withRange)).toEqual({ startFrame: 3, endFrame: 8 })
    expect(setMasterSequenceMark(withRange, 'out', 99).markOutFrame).toBe(10)
    expect(setMasterSequenceMark(withRange, 'in', 99).markInFrame).toBe(7)
  })

  it('uses the first referenced Scene FPS and exposes mixed-FPS comparison', () => {
    const project = createProjectDocument('project', 'Project', scene('scene-a', 24).scene)
    const entries = [scene('scene-a', 24), scene('scene-b', 25)]
    const first = shot('shot-a', 'scene-a')
    const second = shot('shot-b', 'scene-b')
    const sequence = { clips: [{ id: 'clip-a', shotId: first.id, sourceStartFrame: 10, sourceEndFrame: 20, order: 0 }] }
    expect(masterSequenceFrameRate(sequence, [first, second], entries, { numerator: 30, denominator: 1 }).rate).toEqual({ numerator: 24, denominator: 1 })
    expect(sameFrameRate({ numerator: 24, denominator: 1 }, { numerator: 48, denominator: 2 })).toBe(true)
    expect(sameFrameRate({ numerator: 24, denominator: 1 }, { numerator: 25, denominator: 1 })).toBe(false)
    expect(masterClipStartFrame(sequence, 'clip-a')).toBe(0)
    expect(masterClipStartFrame(sequence, 'missing')).toBeNull()
    expect(project.masterSequence.clips).toHaveLength(0)
  })

  it('persists the sequence and migrates older projects to an empty sequence', () => {
    const sourceScene = scene('scene-a')
    const project = createProjectDocument('project', 'Project', sourceScene.scene)
    const source = shot('shot-a', 'scene-a')
    const clip = { ...createMasterClip(source, new Set()), id: 'clip-a', order: 0 }
    const music = createMusicClip({ name: 'score.wav', type: 'audio/wav', size: 512 }, 4)
    const saved = parseProjectFile(serializeProject({ ...project, shots: [source], masterSequence: { clips: [clip], musicClip: music, markInFrame: 2, markOutFrame: 6 } }))
    expect(saved.masterSequence.clips).toEqual([clip])
    expect(saved.masterSequence.musicClip?.asset.fileName).toBe('score.wav')
    expect(saved.masterSequence).toMatchObject({ markInFrame: 2, markOutFrame: 6 })
    const oldFile = JSON.parse(serializeProject(project)) as { project: Record<string, unknown> }
    delete oldFile.project.masterSequence
    const migrated = parseProjectFile(JSON.stringify(oldFile))
    expect(migrated.masterSequence.clips).toEqual([])
    expect(migrated.masterSequence).toMatchObject({ markInFrame: null, markOutFrame: null })
  })

  it('includes sequence edits in the project dirty fingerprint', () => {
    const project = createProjectDocument('project', 'Project', scene('scene-a').scene)
    const source = shot('shot-a', 'scene-a')
    const clip = { ...createMasterClip(source, new Set()), id: 'clip-a', order: 0 }
    const changed = { ...project, shots: [source], masterSequence: { clips: [clip] } }
    expect(creativeProjectFingerprint(changed)).not.toBe(creativeProjectFingerprint(project))
  })

  it('inserts and reorders master clips without changing Shot documents', () => {
    const first = shot('shot-a', 'scene-a')
    const second = shot('shot-b', 'scene-a')
    const inserted = insertMasterClipAt(createMasterSequenceDocument(), first, 0)
    const withSecond = insertMasterClipAt(inserted, second, 1)
    const secondId = withSecond.clips.find((clip) => clip.shotId === second.id)?.id
    expect(secondId).toBeTruthy()
    const reordered = reorderMasterClip(withSecond, secondId!, 0)
    expect(reordered?.clips.map((clip) => clip.shotId)).toEqual([second.id, first.id])
    expect(first.startFrame).toBe(10)
    expect(second.endFrame).toBe(20)
  })

  it('keeps music metadata serializable and independent from shot duration mapping', () => {
    const music = createMusicClip({ name: 'score.mp3', type: 'audio/mpeg', size: 2048, lastModified: 123 }, 12.5)
    const sequence = { ...createMasterSequenceDocument(), musicClip: music }
    expect(sequence.musicClip?.asset).toEqual({ id: 'master-music-1', fileName: 'score.mp3', mimeType: 'audio/mpeg', sizeBytes: 2048, lastModified: 123 })
    expect(masterSequenceDurationFrames(sequence)).toBe(0)
    expect(masterSequenceVisualDurationFrames(sequence, { numerator: 24, denominator: 1 })).toBe(300)
    expect(resolveMasterMusicTime(sequence, 24, { numerator: 24, denominator: 1 })).toMatchObject({ musicClipId: music.id, sourceSeconds: 1 })
    expect(JSON.parse(JSON.stringify(sequence)).musicClip.asset.fileName).toBe('score.mp3')
  })

  it('extends visible Master duration through Music offset and trim', () => {
    const music = createMusicClip({ name: 'score.wav', type: 'audio/wav', size: 512 }, 12.5)
    const sequence = { ...createMasterSequenceDocument(), musicClip: { ...music, startMasterFrame: 48, sourceStartSeconds: 2, sourceEndSeconds: 10 } }
    expect(masterSequenceVisualDurationFrames(sequence, { numerator: 24, denominator: 1 })).toBe(48 + 8 * 24)
  })

  it('keeps Fit extent separate from the default Master render range', () => {
    const source = shot('shot-a', 'scene-a', 0, 120)
    const music = createMusicClip({ name: 'long-score.wav', type: 'audio/wav', size: 512 }, 190)
    const sequence = { ...createMasterSequenceDocument(), clips: [{ id: 'clip-a', shotId: source.id, sourceStartFrame: 0, sourceEndFrame: 120, order: 0 }], musicClip: music }
    expect(masterSequenceDurationFrames(sequence)).toBe(120)
    expect(masterSequenceVisualDurationFrames(sequence, { numerator: 24, denominator: 1 })).toBe(190 * 24)
    expect(effectiveMasterRenderRange(sequence)).toEqual({ startFrame: 0, endFrame: 120 })
    expect(setMasterSequenceMark(sequence, 'out', 190 * 24).markOutFrame).toBe(120)
  })
})
