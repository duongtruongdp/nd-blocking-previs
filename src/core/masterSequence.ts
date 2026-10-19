import type { ProjectSceneEntry } from './projectDocument'
import type { ShotDocument } from './shotDocument'
import type { RationalFrameRate } from './sceneDocument'

/**
 * Master clips use the same boundary convention as the existing Scene/Shot
 * timeline: sourceStartFrame is inclusive and sourceEndFrame is exclusive.
 * Therefore a range [10, 12) contains frames 10 and 11 and has duration 2.
 */
export type MasterClipDocument = {
  id: string
  shotId: string
  sourceStartFrame: number
  sourceEndFrame: number
  order: number
}

export type MasterMusicAssetReference = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  lastModified: number | null
}

export type MasterMusicClipDocument = {
  id: string
  asset: MasterMusicAssetReference
  durationSeconds: number
  startMasterFrame: number
  sourceStartSeconds: number
  sourceEndSeconds: number
}

export type MasterSequenceDocument = {
  clips: MasterClipDocument[]
  /** Optional for source compatibility with pre-M4B serialized callers; normalized documents always carry null. */
  musicClip?: MasterMusicClipDocument | null
  /** Master-frame render/review marks. Older callers may omit them; normalized documents carry null. */
  markInFrame?: number | null
  markOutFrame?: number | null
}

/** Master ranges are frame-domain, start-inclusive and end-exclusive. */
export type MasterRenderRange = { startFrame: number; endFrame: number }

export type ResolvedMasterFrame = {
  clipId: string
  shotId: string
  sceneId: string | null
  cameraId: string | null
  sourceFrame: number
  localClipFrame: number
}

export type MasterFrameRateSource = {
  rate: RationalFrameRate
  sceneId: string | null
}

export const MASTER_SHOT_DRAG_TYPE = 'application/x-nd-blocking-shot-id'
export const MASTER_CLIP_DRAG_TYPE = 'application/x-nd-blocking-master-clip-id'

export function createMasterSequenceDocument(): MasterSequenceDocument {
  return { clips: [], musicClip: null, markInFrame: null, markOutFrame: null }
}

export function createMasterClipId(existingIds: ReadonlySet<string> = new Set()): string {
  let id = `master-clip-${Math.random().toString(36).slice(2, 10)}`
  while (existingIds.has(id)) id = `master-clip-${Math.random().toString(36).slice(2, 10)}`
  return id
}

export function createMasterClip(shot: ShotDocument, existingIds: ReadonlySet<string> = new Set()): MasterClipDocument {
  return {
    id: createMasterClipId(existingIds),
    shotId: shot.id,
    sourceStartFrame: shot.startFrame,
    sourceEndFrame: shot.endFrame,
    order: 0,
  }
}

export function normalizeMasterSequence(value: unknown): MasterSequenceDocument {
  if (!isRecord(value) || !Array.isArray(value.clips)) return createMasterSequenceDocument()
  const ids = new Set<string>()
  const clips = value.clips.flatMap((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.shotId !== 'string' || !candidate.shotId.trim()) return []
    const sourceStartFrame = finiteFrame(candidate.sourceStartFrame)
    const sourceEndFrame = finiteFrame(candidate.sourceEndFrame)
    if (sourceStartFrame === null || sourceEndFrame === null || sourceEndFrame <= sourceStartFrame) return []
    let id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `master-clip-${index + 1}`
    while (ids.has(id)) id = createMasterClipId(ids)
    ids.add(id)
    return [{ id, shotId: candidate.shotId, sourceStartFrame, sourceEndFrame, order: index }]
  })
  const ordered = clips.map((clip, index) => ({ ...clip, order: index }))
  const marks = normalizeMasterMarks(value.markInFrame, value.markOutFrame, masterSequenceDurationFrames({ clips: ordered }))
  return { clips: ordered, musicClip: normalizeMusicClip(value.musicClip), ...marks }
}

export function orderedMasterClips(sequence: MasterSequenceDocument): MasterClipDocument[] {
  return [...sequence.clips].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function masterClipDurationFrames(clip: MasterClipDocument): number {
  return Math.max(0, Math.round(clip.sourceEndFrame) - Math.round(clip.sourceStartFrame))
}

export function masterSequenceDurationFrames(sequence: MasterSequenceDocument): number {
  return orderedMasterClips(sequence).reduce((total, clip) => total + masterClipDurationFrames(clip), 0)
}

/**
 * The Master render/review range intentionally ends at Shot content, not at a
 * possible music-only tail. This is the future M4C source-frame contract.
 */
export function effectiveMasterRenderRange(sequence: MasterSequenceDocument): MasterRenderRange {
  const videoEnd = masterSequenceDurationFrames(sequence)
  if (videoEnd <= 0) return { startFrame: 0, endFrame: 0 }
  const marks = normalizeMasterMarks(sequence.markInFrame, sequence.markOutFrame, videoEnd)
  return {
    startFrame: marks.markInFrame ?? 0,
    endFrame: marks.markOutFrame ?? videoEnd,
  }
}

/** Applies Scene-consistent mark adjustment while guaranteeing a non-empty Master range. */
export function setMasterSequenceMark(sequence: MasterSequenceDocument, kind: 'in' | 'out', frame: number): MasterSequenceDocument {
  const videoEnd = masterSequenceDurationFrames(sequence)
  if (videoEnd <= 0) return { ...sequence, markInFrame: null, markOutFrame: null }
  const marks = normalizeMasterMarks(sequence.markInFrame, sequence.markOutFrame, videoEnd)
  if (kind === 'in') {
    const maximum = Math.max(0, (marks.markOutFrame ?? videoEnd) - 1)
    return { ...sequence, markInFrame: clampMasterFrame(frame, 0, maximum), markOutFrame: marks.markOutFrame }
  }
  const minimum = (marks.markInFrame ?? 0) + 1
  return { ...sequence, markInFrame: marks.markInFrame, markOutFrame: clampMasterFrame(frame, minimum, videoEnd) }
}

export function masterClipStartFrame(sequence: MasterSequenceDocument, clipId: string): number | null {
  let cursor = 0
  for (const clip of orderedMasterClips(sequence)) {
    if (clip.id === clipId) return cursor
    cursor += masterClipDurationFrames(clip)
  }
  return null
}

export function resolveMasterFrame(sequence: MasterSequenceDocument, shots: readonly ShotDocument[], masterFrame: number): ResolvedMasterFrame | null {
  const clips = orderedMasterClips(sequence)
  const total = masterSequenceDurationFrames(sequence)
  if (clips.length === 0 || total <= 0) return null
  const frame = Math.max(0, Math.min(total - 1, Math.round(masterFrame)))
  let cursor = 0
  for (const clip of clips) {
    const duration = masterClipDurationFrames(clip)
    if (frame < cursor + duration) {
      const shot = shots.find((candidate) => candidate.id === clip.shotId)
      const localClipFrame = frame - cursor
      return {
        clipId: clip.id,
        shotId: clip.shotId,
        sceneId: shot?.sceneId ?? null,
        cameraId: shot?.cameraId ?? null,
        sourceFrame: clip.sourceStartFrame + localClipFrame,
        localClipFrame,
      }
    }
    cursor += duration
  }
  return null
}

export function sourceRangeWithinShot(shot: ShotDocument, sourceStartFrame: number, sourceEndFrame: number): boolean {
  return Number.isFinite(sourceStartFrame) && Number.isFinite(sourceEndFrame) && Math.round(sourceStartFrame) >= shot.startFrame && Math.round(sourceEndFrame) <= shot.endFrame && Math.round(sourceEndFrame) > Math.round(sourceStartFrame)
}

export function updateMasterClipRange(sequence: MasterSequenceDocument, clipId: string, shot: ShotDocument, sourceStartFrame: number, sourceEndFrame: number): MasterSequenceDocument | null {
  const start = Math.round(sourceStartFrame)
  const end = Math.round(sourceEndFrame)
  if (!sourceRangeWithinShot(shot, start, end)) return null
  if (!sequence.clips.some((clip) => clip.id === clipId)) return null
  return withNormalizedMasterMarks({ ...sequence, clips: sequence.clips.map((clip) => clip.id === clipId ? { ...clip, sourceStartFrame: start, sourceEndFrame: end } : clip) })
}

export function removeMasterClip(sequence: MasterSequenceDocument, clipId: string): MasterSequenceDocument {
  return withNormalizedMasterMarks({ ...sequence, clips: orderedMasterClips(sequence).filter((clip) => clip.id !== clipId).map((clip, order) => ({ ...clip, order })) })
}

export function moveMasterClip(sequence: MasterSequenceDocument, clipId: string, direction: -1 | 1): MasterSequenceDocument {
  const clips = orderedMasterClips(sequence)
  const index = clips.findIndex((clip) => clip.id === clipId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= clips.length) return sequence
  const [moved] = clips.splice(index, 1)
  clips.splice(target, 0, moved)
  return withNormalizedMasterMarks({ ...sequence, clips: clips.map((clip, order) => ({ ...clip, order })) })
}

export function duplicateMasterClip(sequence: MasterSequenceDocument, clipId: string, existingIds: ReadonlySet<string> = new Set(sequence.clips.map((clip) => clip.id))): MasterSequenceDocument | null {
  const clips = orderedMasterClips(sequence)
  const index = clips.findIndex((clip) => clip.id === clipId)
  if (index < 0) return null
  const source = clips[index]
  const copy: MasterClipDocument = { ...source, id: createMasterClipId(existingIds), order: index + 1 }
  clips.splice(index + 1, 0, copy)
  return withNormalizedMasterMarks({ ...sequence, clips: clips.map((clip, order) => ({ ...clip, order })) })
}

export function insertMasterClipAt(sequence: MasterSequenceDocument, shot: ShotDocument, index: number, existingIds: ReadonlySet<string> = new Set(sequence.clips.map((clip) => clip.id))): MasterSequenceDocument {
  const clips = orderedMasterClips(sequence)
  const clip = createMasterClip(shot, existingIds)
  const safeIndex = Math.max(0, Math.min(clips.length, Math.round(index)))
  clips.splice(safeIndex, 0, { ...clip, order: safeIndex })
  return withNormalizedMasterMarks({ ...sequence, clips: clips.map((item, order) => ({ ...item, order })) })
}

export function reorderMasterClip(sequence: MasterSequenceDocument, clipId: string, targetIndex: number): MasterSequenceDocument | null {
  const clips = orderedMasterClips(sequence)
  const sourceIndex = clips.findIndex((clip) => clip.id === clipId)
  if (sourceIndex < 0) return null
  const [moved] = clips.splice(sourceIndex, 1)
  const safeIndex = Math.max(0, Math.min(clips.length, Math.round(targetIndex)))
  clips.splice(safeIndex, 0, moved)
  return withNormalizedMasterMarks({ ...sequence, clips: clips.map((clip, order) => ({ ...clip, order })) })
}

export function createMusicClip(file: { name: string; type: string; size: number; lastModified?: number }, durationSeconds: number, existingId = 'master-music-1'): MasterMusicClipDocument {
  const duration = Math.max(0, Number(durationSeconds))
  return {
    id: existingId,
    asset: { id: existingId, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: Math.max(0, Math.round(file.size)), lastModified: typeof file.lastModified === 'number' ? file.lastModified : null },
    durationSeconds: duration,
    startMasterFrame: 0,
    sourceStartSeconds: 0,
    sourceEndSeconds: duration,
  }
}

export function musicClipDurationSeconds(clip: MasterMusicClipDocument): number {
  return Math.max(0, clip.sourceEndSeconds - clip.sourceStartSeconds)
}

export function musicClipDurationFrames(clip: MasterMusicClipDocument, rate: RationalFrameRate): number {
  return Math.max(0, Math.round(musicClipDurationSeconds(clip) * rate.numerator / rate.denominator))
}

export function masterSequenceVisualDurationFrames(sequence: MasterSequenceDocument, rate: RationalFrameRate): number {
  const shotDuration = masterSequenceDurationFrames(sequence)
  const musicEnd = sequence.musicClip ? Math.round(sequence.musicClip.startMasterFrame + musicClipDurationFrames(sequence.musicClip, rate)) : 0
  return Math.max(shotDuration, musicEnd)
}

export function resolveMasterMusicTime(sequence: MasterSequenceDocument, masterFrame: number, rate: RationalFrameRate): { musicClipId: string; sourceSeconds: number } | null {
  const clip = sequence.musicClip
  if (!clip) return null
  const localFrame = Math.round(masterFrame) - Math.round(clip.startMasterFrame)
  const durationFrames = musicClipDurationFrames(clip, rate)
  if (localFrame < 0 || localFrame >= durationFrames) return null
  return { musicClipId: clip.id, sourceSeconds: clip.sourceStartSeconds + localFrame * rate.denominator / rate.numerator }
}

export function masterSequenceFrameRate(sequence: MasterSequenceDocument, shots: readonly ShotDocument[], scenes: readonly ProjectSceneEntry[], fallback: RationalFrameRate): MasterFrameRateSource {
  for (const clip of orderedMasterClips(sequence)) {
    const shot = shots.find((candidate) => candidate.id === clip.shotId)
    const scene = shot ? scenes.find((candidate) => candidate.id === shot.sceneId) : undefined
    if (scene) return { rate: scene.scene.timeline.frameRate, sceneId: scene.id }
  }
  return { rate: fallback, sceneId: null }
}

export function sameFrameRate(left: RationalFrameRate, right: RationalFrameRate): boolean {
  return left.numerator * right.denominator === right.numerator * left.denominator
}

function finiteFrame(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

function normalizeMasterMarks(markInValue: unknown, markOutValue: unknown, videoEnd: number): Pick<MasterSequenceDocument, 'markInFrame' | 'markOutFrame'> {
  if (videoEnd <= 0) return { markInFrame: null, markOutFrame: null }
  const inCandidate = finiteFrame(markInValue)
  const outCandidate = finiteFrame(markOutValue)
  const markInFrame = inCandidate !== null && inCandidate >= 0 && inCandidate < videoEnd ? inCandidate : null
  const markOutFrame = outCandidate !== null && outCandidate > 0 && outCandidate <= videoEnd ? outCandidate : null
  if (markInFrame !== null && markOutFrame !== null && markInFrame >= markOutFrame) return { markInFrame: null, markOutFrame: null }
  return { markInFrame, markOutFrame }
}

function withNormalizedMasterMarks(sequence: MasterSequenceDocument): MasterSequenceDocument {
  return { ...sequence, ...normalizeMasterMarks(sequence.markInFrame, sequence.markOutFrame, masterSequenceDurationFrames(sequence)) }
}

function clampMasterFrame(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(Number.isFinite(value) ? value : minimum)))
}

function normalizeMusicClip(value: unknown): MasterMusicClipDocument | null {
  if (!isRecord(value) || !isRecord(value.asset) || typeof value.id !== 'string' || !value.id.trim() || typeof value.asset.id !== 'string' || typeof value.asset.fileName !== 'string' || typeof value.asset.mimeType !== 'string' || !finiteNonNegative(value.asset.sizeBytes) || !finiteNonNegative(value.durationSeconds) || !finiteNonNegative(value.startMasterFrame) || !finiteNonNegative(value.sourceStartSeconds) || !finiteNonNegative(value.sourceEndSeconds) || Number(value.sourceEndSeconds) <= Number(value.sourceStartSeconds) || Number(value.sourceEndSeconds) > Number(value.durationSeconds) + 1e-6) return null
  return {
    id: value.id,
    asset: { id: value.asset.id, fileName: value.asset.fileName, mimeType: value.asset.mimeType, sizeBytes: Math.round(Number(value.asset.sizeBytes)), lastModified: typeof value.asset.lastModified === 'number' && Number.isFinite(value.asset.lastModified) ? value.asset.lastModified : null },
    durationSeconds: Number(value.durationSeconds),
    startMasterFrame: Math.round(Number(value.startMasterFrame)),
    sourceStartSeconds: Number(value.sourceStartSeconds),
    sourceEndSeconds: Number(value.sourceEndSeconds),
  }
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
