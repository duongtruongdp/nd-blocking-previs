export type ShotThumbnail = {
  dataUrl: string
  frame: number
  width: number
  height: number
}

export const SHOT_THUMBNAIL_RENDER_WIDTH = 1280
export const SHOT_THUMBNAIL_TARGET_WIDTH = 960
export const SHOT_THUMBNAIL_JPEG_QUALITY = 0.9

export type ShotDocument = {
  id: string
  name: string
  sceneId: string
  cameraId: string | null
  startFrame: number
  endFrame: number
  order: number
  notes: string
  shotSize: string | null
  angle: string | null
  movement: string | null
  equipment: string | null
  thumbnail: ShotThumbnail | null
  thumbnailFrame: number | null
  metadata: {
    status: 'planned'
  }
}

export function createShotDocument(input: Omit<ShotDocument, 'metadata' | 'thumbnailFrame' | 'shotSize' | 'angle' | 'movement' | 'equipment'> & Partial<Pick<ShotDocument, 'shotSize' | 'angle' | 'movement' | 'equipment'>> & { thumbnailFrame?: number | null; metadata?: Partial<ShotDocument['metadata']> }): ShotDocument {
  return { ...input, shotSize: input.shotSize ?? null, angle: input.angle ?? null, movement: input.movement ?? null, equipment: input.equipment ?? null, thumbnailFrame: input.thumbnailFrame ?? input.thumbnail?.frame ?? null, metadata: { status: 'planned', ...input.metadata } }
}

export function normalizeShotDocuments(value: unknown): ShotDocument[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate, index) => {
    if (!isRecord(candidate) || !stringField(candidate.id) || !stringField(candidate.name) || !stringField(candidate.sceneId)) return []
    const startFrame = finiteInteger(candidate.startFrame, 0)
    const endFrame = Math.max(startFrame + 1, finiteInteger(candidate.endFrame, startFrame + 1))
    const thumbnail = normalizeThumbnail(candidate.thumbnail)
    return [createShotDocument({
      id: candidate.id,
      name: candidate.name,
      sceneId: candidate.sceneId,
      cameraId: candidate.cameraId === null || candidate.cameraId === undefined || typeof candidate.cameraId === 'string' ? candidate.cameraId ?? null : null,
      startFrame,
      endFrame,
      order: finiteInteger(candidate.order, index),
      notes: typeof candidate.notes === 'string' ? candidate.notes : '',
      shotSize: nullableString(candidate.shotSize),
      angle: nullableString(candidate.angle),
      movement: nullableString(candidate.movement),
      equipment: nullableString(candidate.equipment),
      thumbnail,
      thumbnailFrame: candidate.thumbnailFrame === null || (candidate.thumbnailFrame === undefined && !thumbnail) ? null : finiteInteger(candidate.thumbnailFrame, thumbnail?.frame ?? 0),
      metadata: { status: 'planned' },
    })]
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)).map((shot, index) => ({ ...shot, order: index }))
}

export function createShotId(existingIds: ReadonlySet<string> = new Set()): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const candidate = `shot-${uuid}`
  return existingIds.has(candidate) ? createShotId(existingIds) : candidate
}

export function nextShotName(shots: readonly ShotDocument[]): string {
  const used = new Set(shots.map((shot) => shot.name.trim().toLowerCase()))
  let number = 1
  while (used.has(`shot ${String(number).padStart(2, '0')}`.toLowerCase())) number += 1
  return `Shot ${String(number).padStart(2, '0')}`
}

export type ShotDisplayIdentity = {
  numberLabel: string
  isDefaultName: boolean
  heading: string
  table: string
  export: string
}

/** Formats a shot's ordinal and name without repeating generated names. */
export function formatShotDisplayIdentity(order: number, name: string): ShotDisplayIdentity {
  const numberLabel = String(Math.max(0, Math.round(order)) + 1).padStart(2, '0')
  const trimmedName = name.trim() || `Shot ${numberLabel}`
  const isDefaultName = trimmedName.toLocaleLowerCase() === `shot ${numberLabel}`.toLocaleLowerCase()
  return {
    numberLabel,
    isDefaultName,
    heading: isDefaultName ? `SHOT ${numberLabel}` : `SHOT ${numberLabel} — ${trimmedName}`,
    table: isDefaultName ? `Shot ${numberLabel}` : `${numberLabel}  ${trimmedName}`,
    export: isDefaultName ? `Shot ${numberLabel}` : `SHOT ${numberLabel} — ${trimmedName}`,
  }
}

/** Returns the compact Workspace label without changing the persisted Shot name. */
export function workspaceShotLabel(name: string): string {
  const trimmedName = name.trim()
  const defaultName = /^shot\s+(\d+)$/i.exec(trimmedName)
  return defaultName?.[1] ?? trimmedName
}

export function shotDurationFrames(shot: Pick<ShotDocument, 'startFrame' | 'endFrame'>): number {
  return Math.max(1, Math.round(shot.endFrame - shot.startFrame))
}

export function duplicateShotName(name: string): string {
  return name.trim() ? `${name.trim()} Copy` : 'Shot Copy'
}

function normalizeThumbnail(value: unknown): ShotThumbnail | null {
  if (!isRecord(value) || typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith('data:image/')) return null
  return { dataUrl: value.dataUrl, frame: finiteInteger(value.frame, 0), width: Math.max(1, finiteInteger(value.width, 320)), height: Math.max(1, finiteInteger(value.height, 180)) }
}

export type ShotThumbnailCaptureContext = {
  activeSceneId: string
  activeCameraId: string | null
  currentFrame: number
}

/** Returns the canonical current frame only when the production Shot context is active and in range. */
export function resolveShotThumbnailFrame(shot: Pick<ShotDocument, 'sceneId' | 'cameraId' | 'startFrame' | 'endFrame'>, context: ShotThumbnailCaptureContext): number | null {
  if (shot.sceneId !== context.activeSceneId || !shot.cameraId || shot.cameraId !== context.activeCameraId) return null
  const frame = Math.round(context.currentFrame)
  return frame >= shot.startFrame && frame <= shot.endFrame ? frame : null
}

function finiteInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringField(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}
