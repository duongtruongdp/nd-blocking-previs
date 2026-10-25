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
  /** Absolute Master placement. Legacy callers may omit this until normalized. */
  startMasterFrame?: number
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

export type MasterGraphicsTrackDocument = {
  id: string
  name: string
  order: number
  visible: boolean
  locked?: boolean
}

export type MasterImageAssetDocument = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  lastModified: number | null
  width: number
  height: number
  /** Legacy files may be normalized before their sidecar image metadata is decoded. */
  metadataPending?: boolean
}

export type MasterImageClipDocument = {
  id: string
  trackId: string
  assetId: string
  startMasterFrame: number
  durationFrames: number
  positionX: number
  positionY: number
  scale: number
  rotation: number
  opacity: number
  fadeInFrames: number
  fadeOutFrames: number
}

export type MasterSequenceDocument = {
  clips: MasterClipDocument[]
  /** Optional for source compatibility with pre-M4B serialized callers; normalized documents always carry null. */
  musicClip?: MasterMusicClipDocument | null
  /** Project-level presence of the optional Music lane. Legacy documents omit this and migrate to true. */
  musicTrackPresent?: boolean
  /** Master-frame render/review marks. Older callers may omit them; normalized documents carry null. */
  markInFrame?: number | null
  markOutFrame?: number | null
  /** Graphics are project-level Master overlays; older documents omit these arrays. */
  graphicsTracks?: MasterGraphicsTrackDocument[]
  imageAssets?: MasterImageAssetDocument[]
  imageClips?: MasterImageClipDocument[]
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
  return { clips: [], musicClip: null, musicTrackPresent: true, markInFrame: null, markOutFrame: null }
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
  let legacyCursor = 0
  const clips = value.clips.flatMap((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.shotId !== 'string' || !candidate.shotId.trim()) return []
    const sourceStartFrame = finiteFrame(candidate.sourceStartFrame)
    const sourceEndFrame = finiteFrame(candidate.sourceEndFrame)
    if (sourceStartFrame === null || sourceEndFrame === null || sourceEndFrame <= sourceStartFrame) return []
    let id = typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `master-clip-${index + 1}`
    while (ids.has(id)) id = createMasterClipId(ids)
    ids.add(id)
    const duration = sourceEndFrame - sourceStartFrame
    const explicitStart = finiteFrame(candidate.startMasterFrame)
    const startMasterFrame = explicitStart === null ? legacyCursor : Math.max(0, explicitStart)
    legacyCursor = Math.max(legacyCursor, startMasterFrame + duration)
    return [{ id, shotId: candidate.shotId, sourceStartFrame, sourceEndFrame, ...(explicitStart === null ? {} : { startMasterFrame }), order: index }]
  })
  const ordered = clips.map((clip, index) => ({ ...clip, order: index }))
  const marks = normalizeMasterMarks(value.markInFrame, value.markOutFrame, masterSequenceDurationFrames({ clips: ordered }))
  const normalizedGraphics = normalizeGraphics(value)
  const musicClip = normalizeMusicClip(value.musicClip)
  return { clips: ordered, musicClip, musicTrackPresent: musicClip ? true : typeof value.musicTrackPresent === 'boolean' ? value.musicTrackPresent : true, ...marks, ...normalizedGraphics }
}

export function masterMusicTrackPresent(sequence: MasterSequenceDocument): boolean {
  return sequence.musicTrackPresent !== false
}

export function orderedMasterClips(sequence: MasterSequenceDocument): MasterClipDocument[] {
  return [...sequence.clips].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function masterClipDurationFrames(clip: MasterClipDocument): number {
  return Math.max(0, Math.round(clip.sourceEndFrame) - Math.round(clip.sourceStartFrame))
}

export function masterSequenceDurationFrames(sequence: MasterSequenceDocument): number {
  const starts = masterClipPlacementStarts(sequence)
  return orderedMasterClips(sequence).reduce((total, clip) => Math.max(total, (starts.get(clip.id) ?? 0) + masterClipDurationFrames(clip)), 0)
}

export function masterClipEndFrame(clip: MasterClipDocument): number {
  return masterClipStartFrameForClip(clip) + masterClipDurationFrames(clip)
}

/**
 * Master Timeline has N rendered samples but N + 1 valid edit/cursor boundaries.
 * Keep boundary clamping separate from render-sample clamping at call sites.
 */
export function clampMasterTimelineBoundary(frame: number, durationFrames: number): number {
  const duration = Math.max(0, Math.round(Number.isFinite(durationFrames) ? durationFrames : 0))
  return Math.max(0, Math.min(duration, Math.round(Number.isFinite(frame) ? frame : 0)))
}

/**
 * The Master render/review range ends at the supplied content boundary. The
 * default preserves legacy Shot-only callers; playback/export pass the full
 * Shot/Graphics/Music content end explicitly.
 */
export function effectiveMasterRenderRange(sequence: MasterSequenceDocument, contentEndFrame = masterSequenceDurationFrames(sequence)): MasterRenderRange {
  const videoEnd = Math.max(masterSequenceDurationFrames(sequence), Math.round(Number.isFinite(contentEndFrame) ? contentEndFrame : 0))
  if (videoEnd <= 0) return { startFrame: 0, endFrame: 0 }
  const marks = normalizeMasterMarks(sequence.markInFrame, sequence.markOutFrame, videoEnd)
  return {
    startFrame: marks.markInFrame ?? 0,
    endFrame: marks.markOutFrame ?? videoEnd,
  }
}

export function masterPlaybackFrameAt(rawFrame: number, range: MasterRenderRange, looping: boolean): number {
  if (range.endFrame <= range.startFrame) return range.startFrame
  if (looping) {
    const span = range.endFrame - range.startFrame
    const elapsed = Math.round(Number.isFinite(rawFrame) ? rawFrame : range.startFrame) - range.startFrame
    return range.startFrame + ((elapsed % span) + span) % span
  }
  return clampMasterTimelineBoundary(rawFrame, range.endFrame)
}

/** Applies Scene-consistent mark adjustment while guaranteeing a non-empty Master range. */
export function setMasterSequenceMark(sequence: MasterSequenceDocument, kind: 'in' | 'out', frame: number, contentEndFrame = masterSequenceDurationFrames(sequence)): MasterSequenceDocument {
  const videoEnd = Math.max(masterSequenceDurationFrames(sequence), Math.round(Number.isFinite(contentEndFrame) ? contentEndFrame : 0))
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
  return masterClipPlacementStarts(sequence).get(clipId) ?? null
}

/**
 * Resolves legacy implicit placements once, without changing their editorial
 * order or source ranges. This is intentionally an edit-time operation; merely
 * opening an older project must not rewrite its serialized shape.
 */
export function materializeMasterClipPlacements(sequence: MasterSequenceDocument): MasterSequenceDocument {
  const starts = masterClipPlacementStarts(sequence)
  let changed = false
  const clips = sequence.clips.map((clip) => {
    if (clip.startMasterFrame !== undefined) return clip
    changed = true
    return { ...clip, startMasterFrame: starts.get(clip.id) ?? 0 }
  })
  return changed ? { ...sequence, clips } : sequence
}

export function resolveMasterFrame(sequence: MasterSequenceDocument, shots: readonly ShotDocument[], masterFrame: number): ResolvedMasterFrame | null {
  const clips = orderedMasterClips(sequence)
  const total = masterSequenceDurationFrames(sequence)
  if (clips.length === 0 || total <= 0) return null
  const frame = Math.round(Number.isFinite(masterFrame) ? masterFrame : 0)
  if (frame >= total) return null
  const sampleFrame = Math.max(0, frame)
  const starts = masterClipPlacementStarts(sequence)
  for (const clip of clips) {
    const duration = masterClipDurationFrames(clip)
    const start = starts.get(clip.id) ?? 0
    if (sampleFrame >= start && sampleFrame < start + duration) {
      const shot = shots.find((candidate) => candidate.id === clip.shotId)
      const localClipFrame = sampleFrame - start
      return {
        clipId: clip.id,
        shotId: clip.shotId,
        sceneId: shot?.sceneId ?? null,
        cameraId: shot?.cameraId ?? null,
        sourceFrame: clip.sourceStartFrame + localClipFrame,
        localClipFrame,
      }
    }
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
  return { ...sequence, clips: sequence.clips.map((clip) => clip.id === clipId ? { ...clip, sourceStartFrame: start, sourceEndFrame: end } : clip) }
}

/** Updates source trim and, for a left trim, its absolute Master placement atomically. */
export function trimMasterClipToRange(sequence: MasterSequenceDocument, clipId: string, shot: ShotDocument, sourceStartFrame: number, sourceEndFrame: number, startMasterFrame?: number): MasterSequenceDocument | null {
  const updated = updateMasterClipRange(materializeMasterClipPlacements(sequence), clipId, shot, sourceStartFrame, sourceEndFrame)
  if (!updated) return null
  const clip = updated.clips.find((candidate) => candidate.id === clipId)
  if (!clip) return null
  const start = Math.max(0, Math.round(startMasterFrame ?? masterClipStartFrame(updated, clipId) ?? 0))
  const end = start + masterClipDurationFrames(clip)
  const overlaps = updated.clips.some((candidate) => {
    if (candidate.id === clipId) return false
    const candidateStart = masterClipStartFrame(updated, candidate.id) ?? 0
    const candidateEnd = candidateStart + masterClipDurationFrames(candidate)
    return start < candidateEnd && end > candidateStart
  })
  if (overlaps) return null
  return { ...updated, clips: updated.clips.map((candidate) => candidate.id === clipId ? { ...candidate, startMasterFrame: start } : candidate) }
}

export function removeMasterClip(sequence: MasterSequenceDocument, clipId: string): MasterSequenceDocument {
  return { ...sequence, clips: orderedMasterClips(sequence).filter((clip) => clip.id !== clipId).map((clip, order) => ({ ...clip, order })) }
}

export function moveMasterClip(sequence: MasterSequenceDocument, clipId: string, direction: -1 | 1): MasterSequenceDocument {
  const clips = orderedMasterClips(sequence)
  const index = clips.findIndex((clip) => clip.id === clipId)
  const target = index + direction
  if (index < 0 || target < 0 || target >= clips.length) return sequence
  const [moved] = clips.splice(index, 1)
  clips.splice(target, 0, moved)
  return { ...sequence, clips: clips.map((clip, order) => ({ ...clip, order })) }
}

export function duplicateMasterClip(sequence: MasterSequenceDocument, clipId: string, existingIds: ReadonlySet<string> = new Set(sequence.clips.map((clip) => clip.id))): MasterSequenceDocument | null {
  const clips = orderedMasterClips(sequence)
  const index = clips.findIndex((clip) => clip.id === clipId)
  if (index < 0) return null
  const source = clips[index]
  const copy: MasterClipDocument = { ...source, id: createMasterClipId(existingIds), startMasterFrame: masterSequenceDurationFrames(sequence), order: index + 1 }
  clips.splice(index + 1, 0, copy)
  return { ...sequence, clips: clips.map((clip, order) => ({ ...clip, order })) }
}

/** Moves one Shot without changing any other placement. Overlaps are rejected. */
export function moveMasterClipToFrame(sequence: MasterSequenceDocument, clipId: string, startMasterFrame: number): MasterSequenceDocument | null {
  const start = Math.max(0, Math.round(Number.isFinite(startMasterFrame) ? startMasterFrame : 0))
  const materialized = materializeMasterClipPlacements(sequence)
  const clip = materialized.clips.find((candidate) => candidate.id === clipId)
  if (!clip) return null
  const duration = masterClipDurationFrames(clip)
  const proposedEnd = start + duration
  const starts = masterClipPlacementStarts(materialized)
  const overlaps = materialized.clips.some((candidate) => {
    if (candidate.id === clipId) return false
    const candidateStart = starts.get(candidate.id) ?? 0
    const candidateEnd = candidateStart + masterClipDurationFrames(candidate)
    return start < candidateEnd && proposedEnd > candidateStart
  })
  if (overlaps) return null
  return { ...materialized, clips: materialized.clips.map((candidate) => candidate.id === clipId ? { ...candidate, startMasterFrame: start } : candidate) }
}

/** Adds a Shot at an absolute Master frame without shifting existing clips. */
export function insertMasterClipAtFrame(sequence: MasterSequenceDocument, shot: ShotDocument, startMasterFrame: number, existingIds: ReadonlySet<string> = new Set(sequence.clips.map((clip) => clip.id))): MasterSequenceDocument | null {
  const clip = { ...createMasterClip(shot, existingIds), startMasterFrame: Math.max(0, Math.round(Number.isFinite(startMasterFrame) ? startMasterFrame : 0)), order: sequence.clips.length }
  const start = clip.startMasterFrame ?? 0
  const end = start + masterClipDurationFrames(clip)
  const starts = masterClipPlacementStarts(sequence)
  if (sequence.clips.some((candidate) => { const candidateStart = starts.get(candidate.id) ?? 0; return start < candidateStart + masterClipDurationFrames(candidate) && end > candidateStart })) return null
  return { ...sequence, clips: [...sequence.clips, clip].map((candidate, order) => ({ ...candidate, order })) }
}

export function insertMasterClipAt(sequence: MasterSequenceDocument, shot: ShotDocument, index: number, existingIds: ReadonlySet<string> = new Set(sequence.clips.map((clip) => clip.id))): MasterSequenceDocument {
  const inserted = insertMasterClipAtFrame(sequence, shot, masterSequenceDurationFrames(sequence), existingIds)
  if (inserted) return inserted
  return sequence
}

export function reorderMasterClip(sequence: MasterSequenceDocument, clipId: string, targetIndex: number): MasterSequenceDocument | null {
  const clips = orderedMasterClips(sequence)
  const sourceIndex = clips.findIndex((clip) => clip.id === clipId)
  if (sourceIndex < 0) return null
  const [moved] = clips.splice(sourceIndex, 1)
  const safeIndex = Math.max(0, Math.min(clips.length, Math.round(targetIndex)))
  clips.splice(safeIndex, 0, moved)
  return { ...sequence, clips: clips.map((clip, order) => ({ ...clip, order })) }
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
  const graphicsEnd = (sequence.imageClips ?? []).reduce((end, clip) => Math.max(end, Math.round(clip.startMasterFrame) + Math.max(0, Math.round(clip.durationFrames))), 0)
  return Math.max(shotDuration, musicEnd, graphicsEnd)
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

function masterClipStartFrameForClip(clip: MasterClipDocument): number {
  return Math.max(0, Math.round(Number.isFinite(clip.startMasterFrame) ? clip.startMasterFrame! : 0))
}

function masterClipPlacementStarts(sequence: MasterSequenceDocument): Map<string, number> {
  const starts = new Map<string, number>()
  let cursor = 0
  for (const clip of orderedMasterClips(sequence)) {
    const start = clip.startMasterFrame === undefined ? cursor : masterClipStartFrameForClip(clip)
    starts.set(clip.id, start)
    cursor = Math.max(cursor, start + masterClipDurationFrames(clip))
  }
  return starts
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

function normalizeGraphics(value: Record<string, unknown>): Pick<MasterSequenceDocument, 'graphicsTracks' | 'imageAssets' | 'imageClips'> {
  const tracks = Array.isArray(value.graphicsTracks) ? value.graphicsTracks.flatMap((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim()) return []
    return [{ id: candidate.id, name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : `Graphics ${String(index + 1).padStart(2, '0')}`, order: index, visible: candidate.visible !== false, locked: candidate.locked === true }]
  }) : []
  const trackIds = new Set(tracks.map((track) => track.id))
  const assets = Array.isArray(value.imageAssets) ? value.imageAssets.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim() || typeof candidate.fileName !== 'string' || typeof candidate.mimeType !== 'string' || !finiteNonNegative(candidate.sizeBytes)) return []
    const hasDimensions = finitePositive(candidate.width) && finitePositive(candidate.height)
    return [{ id: candidate.id, fileName: candidate.fileName, mimeType: candidate.mimeType, sizeBytes: Math.round(Number(candidate.sizeBytes)), lastModified: typeof candidate.lastModified === 'number' && Number.isFinite(candidate.lastModified) ? candidate.lastModified : null, width: hasDimensions ? Math.round(Number(candidate.width)) : 1920, height: hasDimensions ? Math.round(Number(candidate.height)) : 1080, ...(hasDimensions ? {} : { metadataPending: true }) }]
  }) : []
  const assetIds = new Set(assets.map((asset) => asset.id))
  const clips = Array.isArray(value.imageClips) ? value.imageClips.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim() || typeof candidate.trackId !== 'string' || !trackIds.has(candidate.trackId) || typeof candidate.assetId !== 'string' || !assetIds.has(candidate.assetId)) return []
    const durationFrames = finitePositive(candidate.durationFrames) ? Math.max(1, Math.round(Number(candidate.durationFrames))) : 1
    return [{ id: candidate.id, trackId: candidate.trackId, assetId: candidate.assetId, startMasterFrame: finiteNonNegative(candidate.startMasterFrame) ? Math.round(Number(candidate.startMasterFrame)) : 0, durationFrames, positionX: finiteNumber(candidate.positionX) ? clampNumber(Number(candidate.positionX), 0, 1) : 0.5, positionY: finiteNumber(candidate.positionY) ? clampNumber(Number(candidate.positionY), 0, 1) : 0.5, scale: finitePositive(candidate.scale) ? clampNumber(Number(candidate.scale), 0.01, 10) : 1, rotation: finiteNumber(candidate.rotation) ? Number(candidate.rotation) : 0, opacity: finiteNumber(candidate.opacity) ? clampNumber(Number(candidate.opacity), 0, 1) : 1, fadeInFrames: finiteNonNegative(candidate.fadeInFrames) ? Math.min(durationFrames, Math.round(Number(candidate.fadeInFrames))) : 0, fadeOutFrames: finiteNonNegative(candidate.fadeOutFrames) ? Math.min(durationFrames, Math.round(Number(candidate.fadeOutFrames))) : 0 }]
  }).map((clip) => ({ ...clip, fadeOutFrames: Math.min(clip.fadeOutFrames, Math.max(0, clip.durationFrames - clip.fadeInFrames)) })) : []
  if (!Array.isArray(value.graphicsTracks) && !Array.isArray(value.imageAssets) && !Array.isArray(value.imageClips)) return {}
  return { graphicsTracks: tracks, imageAssets: assets, imageClips: clips }
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
