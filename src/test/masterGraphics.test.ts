import { describe, expect, it } from 'vitest'
import { activeMasterImageClips, clampFadeFrames, clampGraphicsTrackHeight, clampMasterTrackHeight, effectiveImageOpacity, graphicsScaleFromPointerDelta, imageFadeFramesToSeconds, imageFadeSecondsToFrames, imageTransformForAsset, masterTrackHeightDefault, masterTrackPopoverPosition, orderedGraphicsTracks } from '../core/masterGraphics'
import { createMasterSequenceDocument, normalizeMasterSequence, type MasterImageAssetDocument, type MasterImageClipDocument } from '../core/masterSequence'

const asset: MasterImageAssetDocument = { id: 'asset-1', fileName: 'title.png', mimeType: 'image/png', sizeBytes: 10, lastModified: null, width: 1920, height: 1080 }
const clip: MasterImageClipDocument = { id: 'image-1', trackId: 'graphics-1', assetId: asset.id, startMasterFrame: 10, durationFrames: 20, positionX: .5, positionY: .5, scale: 1, rotation: 0, opacity: .8, fadeInFrames: 5, fadeOutFrames: 5 }
const rate24 = { numerator: 24, denominator: 1 }

describe('Master Graphics', () => {
  it('normalizes deterministic track ordering and hides inactive tracks', () => {
    const sequence = { ...createMasterSequenceDocument(), graphicsTracks: [{ id: 'graphics-2', name: 'Graphics 02', order: 1, visible: true }, { id: 'graphics-1', name: 'Graphics 01', order: 0, visible: true }], imageAssets: [asset], imageClips: [clip] }
    expect(orderedGraphicsTracks(sequence).map((track) => track.id)).toEqual(['graphics-1', 'graphics-2'])
    expect(activeMasterImageClips(sequence, 10)).toHaveLength(1)
    expect(activeMasterImageClips({ ...sequence, graphicsTracks: sequence.graphicsTracks?.map((track) => ({ ...track, visible: false })) }, 10)).toHaveLength(0)
  })

  it('evaluates linear fade opacity on inclusive/exclusive clip boundaries', () => {
    expect(effectiveImageOpacity(clip, 9)).toBe(0)
    expect(effectiveImageOpacity(clip, 10)).toBe(0)
    expect(effectiveImageOpacity(clip, 12)).toBeCloseTo(.32)
    expect(effectiveImageOpacity(clip, 15)).toBeCloseTo(.8)
    expect(effectiveImageOpacity(clip, 25)).toBeCloseTo(.8)
    expect(effectiveImageOpacity(clip, 29)).toBeCloseTo(.16)
    expect(effectiveImageOpacity(clip, 30)).toBe(0)
  })

  it('clamps fade durations without allowing overlap', () => {
    expect(clampFadeFrames(20, 18, 10)).toEqual({ fadeInFrames: 18, fadeOutFrames: 2 })
  })

  it('converts fade seconds at common Master frame rates with integer-frame storage', () => {
    expect(imageFadeFramesToSeconds(12, rate24)).toBe(.5)
    expect(imageFadeSecondsToFrames(.5, rate24)).toBe(12)
    expect(imageFadeSecondsToFrames(.25, { numerator: 25, denominator: 1 })).toBe(6)
    expect(imageFadeSecondsToFrames(.5, { numerator: 30, denominator: 1 })).toBe(15)
    expect(imageFadeSecondsToFrames(1.5, rate24)).toBe(36)
  })

  it('clamps graphics track height independently without affecting timing', () => {
    expect(clampGraphicsTrackHeight(Number.NaN)).toBe(72)
    expect(clampGraphicsTrackHeight(10)).toBe(62)
    expect(clampGraphicsTrackHeight(999)).toBe(220)
    expect(clip.startMasterFrame).toBe(10)
    expect(clip.durationFrames).toBe(20)
  })

  it('shares independent height rules across Shots, Graphics, and Music lanes', () => {
    expect(masterTrackHeightDefault('shots')).toBe(72)
    expect(clampMasterTrackHeight('shots', 10)).toBe(62)
    expect(clampMasterTrackHeight('shots', 999)).toBe(220)
    expect(masterTrackHeightDefault('graphics')).toBe(72)
    expect(clampMasterTrackHeight('graphics', 10)).toBe(62)
    expect(masterTrackHeightDefault('music')).toBe(56)
    expect(clampMasterTrackHeight('music', 10)).toBe(42)
    expect(clampMasterTrackHeight('music', 999)).toBe(220)
    const heights = { shots: clampMasterTrackHeight('shots', 140), graphics: clampMasterTrackHeight('graphics', 90), music: clampMasterTrackHeight('music', 48) }
    expect(heights).toEqual({ shots: 140, graphics: 90, music: 48 })
  })

  it('positions floating track menus below or above and clamps them to the viewport', () => {
    expect(masterTrackPopoverPosition({ left: 100, right: 124, top: 40, bottom: 60 }, { width: 800, height: 600 }, { width: 160, height: 100 })).toEqual({ left: 8, top: 64 })
    expect(masterTrackPopoverPosition({ left: 700, right: 724, top: 540, bottom: 560 }, { width: 800, height: 600 }, { width: 160, height: 100 })).toEqual({ left: 564, top: 436 })
  })

  it('uses aspect-preserving normalized output transforms', () => {
    const transform = imageTransformForAsset(clip, asset, 16 / 9)
    expect(transform.x).toBe(.5)
    expect(transform.y).toBe(.5)
    expect((transform.width / transform.height) * (16 / 9)).toBeCloseTo(16 / 9)
  })

  it.each([
    ['portrait', 1086, 1448],
    ['square', 1000, 1000],
    ['landscape', 1920, 1080],
    ['cinema', 2048, 858],
  ])('preserves the %s source aspect in a 16:9 container', (_label, width, height) => {
    const source = { ...asset, width, height }
    const transform = imageTransformForAsset(clip, source, 16 / 9)
    expect((transform.width / transform.height) * (16 / 9)).toBeCloseTo(width / height, 8)
  })

  it('keeps uniform scale proportional at every supported scale value', () => {
    for (const scale of [.25, .5, 1, 1.5]) {
      const transform = imageTransformForAsset({ ...clip, scale }, { ...asset, width: 1086, height: 1448 }, 16 / 9)
      expect((transform.width / transform.height) * (16 / 9)).toBeCloseTo(1086 / 1448, 8)
    }
  })

  it.each([0, 45, 90, 180])('keeps the underlying image rectangle rigid at %s degrees', (rotation) => {
    const transform = imageTransformForAsset({ ...clip, rotation }, { ...asset, width: 1086, height: 1448 }, 16 / 9)
    expect((transform.width / transform.height) * (16 / 9)).toBeCloseTo(1086 / 1448, 8)
    expect(transform.rotation).toBe(rotation)
  })

  it('uses non-cumulative uniform scale gesture math', () => {
    const gesture = { startScale: .5, deltaX: 120, deltaY: 60, viewportWidth: 800, viewportHeight: 400 }
    const first = graphicsScaleFromPointerDelta(gesture)
    const second = graphicsScaleFromPointerDelta(gesture)
    expect(first).toBeCloseTo(second)
    expect(first).toBeGreaterThan(.5)
    expect(graphicsScaleFromPointerDelta({ ...gesture, deltaX: -120, deltaY: -60 })).toBeLessThan(.5)
  })

  it('round-trips image metadata and fades through Master normalization', () => {
    const normalized = normalizeMasterSequence({ clips: [], graphicsTracks: [{ id: 'graphics-1', name: 'Graphics 01', order: 0, visible: true }], imageAssets: [asset], imageClips: [clip] })
    expect(normalized.imageAssets).toEqual([asset])
    expect(normalized.imageClips?.[0]).toMatchObject({ fadeInFrames: 5, fadeOutFrames: 5, trackId: 'graphics-1' })
  })

  it('keeps legacy image assets with missing dimensions safe until sidecar metadata is decoded', () => {
    const normalized = normalizeMasterSequence({ clips: [], graphicsTracks: [{ id: 'graphics-1', name: 'Graphics 01', order: 0, visible: true }], imageAssets: [{ id: asset.id, fileName: asset.fileName, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes, lastModified: null }], imageClips: [clip] })
    expect(normalized.imageAssets?.[0]).toMatchObject({ width: 1920, height: 1080, metadataPending: true })
    expect(normalized.imageClips).toHaveLength(1)
  })
})
