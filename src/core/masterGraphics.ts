import type { MasterGraphicsTrackDocument, MasterImageAssetDocument, MasterImageClipDocument, MasterSequenceDocument } from './masterSequence'
import type { RationalFrameRate } from './sceneDocument'
import { frameRateValue } from '../timeline/timelineMath'

export const DEFAULT_IMAGE_CLIP_DURATION_FRAMES = 120
export const DEFAULT_GRAPHICS_TRACK_HEIGHT = 72
export const MIN_GRAPHICS_TRACK_HEIGHT = 62
export const MAX_GRAPHICS_TRACK_HEIGHT = 220
export const DEFAULT_SHOTS_TRACK_HEIGHT = 72
export const MIN_SHOTS_TRACK_HEIGHT = 62
export const DEFAULT_MUSIC_TRACK_HEIGHT = 56
export const MIN_MUSIC_TRACK_HEIGHT = 42
export const MAX_MASTER_TRACK_HEIGHT = 220

export type MasterTrackKind = 'shots' | 'graphics' | 'music'

export function masterTrackHeightDefault(kind: MasterTrackKind): number {
  if (kind === 'shots') return DEFAULT_SHOTS_TRACK_HEIGHT
  if (kind === 'music') return DEFAULT_MUSIC_TRACK_HEIGHT
  return DEFAULT_GRAPHICS_TRACK_HEIGHT
}
export function clampMasterTrackHeight(kind: MasterTrackKind, height: number): number {
  if (!Number.isFinite(height)) return masterTrackHeightDefault(kind)
  const minimum = kind === 'shots' ? MIN_SHOTS_TRACK_HEIGHT : kind === 'music' ? MIN_MUSIC_TRACK_HEIGHT : MIN_GRAPHICS_TRACK_HEIGHT
  return Math.max(minimum, Math.min(MAX_MASTER_TRACK_HEIGHT, Math.round(height)))
}

export function imageFadeFramesToSeconds(frames: number, rate: RationalFrameRate): number {
  return Math.max(0, frames) / Math.max(1, frameRateValue(rate))
}

/** Seconds are UI-only; integer Master frames remain canonical. */
export function imageFadeSecondsToFrames(seconds: number, rate: RationalFrameRate): number {
  if (!Number.isFinite(seconds)) return 0
  return Math.max(0, Math.round(seconds * Math.max(1, frameRateValue(rate))))
}

export function formatImageFadeSeconds(frames: number, rate: RationalFrameRate): string {
  const seconds = imageFadeFramesToSeconds(frames, rate)
  return `${Number(seconds.toFixed(2))} s`
}

export function clampGraphicsTrackHeight(height: number): number {
  return clampMasterTrackHeight('graphics', height)
}

export type MasterTrackPopoverAnchor = { left: number; right: number; top: number; bottom: number }

export function masterTrackPopoverPosition(anchor: MasterTrackPopoverAnchor, viewport: { width: number; height: number }, size = { width: 164, height: 112 }, gap = 4): { left: number; top: number } {
  const left = Math.max(8, Math.min(anchor.right - size.width, viewport.width - size.width - 8))
  const below = anchor.bottom + gap
  const top = below + size.height <= viewport.height - 8 ? below : Math.max(8, anchor.top - size.height - gap)
  return { left, top }
}

export type MasterImageTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export type GraphicsScaleGesture = {
  startScale: number
  deltaX: number
  deltaY: number
  viewportWidth: number
  viewportHeight: number
}

export function graphicsScaleFromPointerDelta({ startScale, deltaX, deltaY, viewportWidth, viewportHeight }: GraphicsScaleGesture): number {
  const viewport = Math.max(1, viewportWidth + viewportHeight)
  return Math.max(0.01, Math.min(10, startScale * (1 + (deltaX + deltaY) / viewport)))
}

export function orderedGraphicsTracks(sequence: MasterSequenceDocument): MasterGraphicsTrackDocument[] {
  return [...(sequence.graphicsTracks ?? [])].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function imageAssetForClip(sequence: MasterSequenceDocument, clip: MasterImageClipDocument): MasterImageAssetDocument | null {
  return (sequence.imageAssets ?? []).find((asset) => asset.id === clip.assetId) ?? null
}

export function activeMasterImageClips(sequence: MasterSequenceDocument, masterFrame: number): MasterImageClipDocument[] {
  const visibleTracks = new Set(orderedGraphicsTracks(sequence).filter((track) => track.visible).map((track) => track.id))
  return [...(sequence.imageClips ?? [])]
    .filter((clip) => visibleTracks.has(clip.trackId) && masterFrame >= clip.startMasterFrame && masterFrame < clip.startMasterFrame + clip.durationFrames)
    .sort((left, right) => trackOrder(sequence, left.trackId) - trackOrder(sequence, right.trackId) || left.id.localeCompare(right.id))
}

export function effectiveImageOpacity(clip: MasterImageClipDocument, masterFrame: number): number {
  if (masterFrame < clip.startMasterFrame || masterFrame >= clip.startMasterFrame + clip.durationFrames) return 0
  const localFrame = masterFrame - clip.startMasterFrame
  let fade = 1
  if (clip.fadeInFrames > 0 && localFrame < clip.fadeInFrames) fade = Math.min(fade, localFrame / clip.fadeInFrames)
  if (clip.fadeOutFrames > 0) {
    const remainingFrames = clip.startMasterFrame + clip.durationFrames - masterFrame
    fade = Math.min(fade, Math.min(1, remainingFrames / clip.fadeOutFrames))
  }
  return Math.max(0, Math.min(1, clip.opacity * fade))
}

export function imageTransformForAsset(clip: MasterImageClipDocument, asset: MasterImageAssetDocument, containerAspect: number): MasterImageTransform {
  const imageWidth = Number.isFinite(asset.width) && asset.width > 0 ? asset.width : 1
  const imageHeight = Number.isFinite(asset.height) && asset.height > 0 ? asset.height : 1
  const imageAspect = imageWidth / imageHeight
  const safeContainerAspect = Number.isFinite(containerAspect) && containerAspect > 0 ? containerAspect : 16 / 9
  // Width and height are normalized independently because the containing
  // element is not square. This is the contain rectangle expressed in the
  // container's coordinate system; its CSS/canvas pixel ratio is imageAspect.
  const fitWidth = imageAspect >= safeContainerAspect ? 1 : imageAspect / safeContainerAspect
  const fitHeight = imageAspect >= safeContainerAspect ? safeContainerAspect / imageAspect : 1
  const scale = Number.isFinite(clip.scale) && clip.scale > 0 ? clip.scale : 1
  return { x: clip.positionX, y: clip.positionY, width: fitWidth * scale, height: fitHeight * scale, rotation: Number.isFinite(clip.rotation) ? clip.rotation : 0 }
}

export function clampFadeFrames(durationFrames: number, fadeInFrames: number, fadeOutFrames: number): Pick<MasterImageClipDocument, 'fadeInFrames' | 'fadeOutFrames'> {
  const duration = Math.max(1, Math.round(durationFrames))
  const fadeIn = Math.max(0, Math.min(duration, Number.isFinite(fadeInFrames) ? Math.round(fadeInFrames) : 0))
  const fadeOut = Math.max(0, Math.min(duration - fadeIn, Number.isFinite(fadeOutFrames) ? Math.round(fadeOutFrames) : 0))
  return { fadeInFrames: fadeIn, fadeOutFrames: fadeOut }
}

function trackOrder(sequence: MasterSequenceDocument, trackId: string): number {
  return orderedGraphicsTracks(sequence).find((track) => track.id === trackId)?.order ?? Number.MAX_SAFE_INTEGER
}
