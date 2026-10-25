import type { CameraDeliveryFrame } from '../core/sceneDocument'
import type { SceneDocument } from '../core/sceneDocument'
import type { ProjectDocument } from '../core/projectDocument'
import { effectiveMasterRenderRange, masterClipDurationFrames, masterClipStartFrame, masterSequenceDurationFrames, masterSequenceFrameRate, masterSequenceVisualDurationFrames, musicClipDurationSeconds, orderedMasterClips, sameFrameRate, sourceRangeWithinShot, type MasterRenderRange } from '../core/masterSequence'
import { resolveMasterPreviewContext, type MasterPreviewContext } from '../core/masterPreview'
import { cameraDisplayAspect } from '../runtime/cameraMath'
import type { RationalFrameRate } from '../core/sceneDocument'
import { deliveryAspectValue, dimensionsForDeliveryAspect, type ExportDimensions } from './exportMath'
import type { ExportWidth } from './exportTypes'

export type MasterRenderPlanOptions = {
  width: ExportWidth | number
  deliveryAspectRatio: CameraDeliveryFrame
  includeMusic: boolean
}

export type MasterRenderClip = {
  clipId: string
  shotId: string
  sceneId: string
  cameraId: string
  startFrame: number
  endFrame: number
}

export type MasterMusicOverlap = {
  clipId: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  outputStartSeconds: number
  durationSeconds: number
}

export type MasterRenderPlan = {
  range: MasterRenderRange
  startFrame: number
  endFrameExclusive: number
  frameCount: number
  frameRate: RationalFrameRate
  dimensions: ExportDimensions
  deliveryAspect: number
  clipsUsed: MasterRenderClip[]
  musicOverlap: MasterMusicOverlap | null
}

export type MasterRenderFrame = MasterPreviewContext & {
  clipId: string
  shotId: string
  sceneId: string
  cameraId: string
  sourceFrame: number
  scene: SceneDocument
  evaluatedEntities: NonNullable<MasterPreviewContext['evaluatedEntities']>
}

export function resolveMasterRenderFrame(project: ProjectDocument, masterFrame: number): MasterRenderFrame {
  const duration = masterSequenceDurationFrames(project.masterSequence)
  if (!Number.isFinite(masterFrame) || Math.round(masterFrame) < 0 || Math.round(masterFrame) >= duration) {
    throw new Error('Master render frames must address renderable samples before the end boundary.')
  }
  const context = resolveMasterPreviewContext(project, masterFrame, false)
  if (context.status !== 'resolved' || !context.scene || !context.evaluatedEntities || !context.sceneId || !context.cameraId || context.sourceFrame === null) {
    throw new Error(masterRenderContextError(context))
  }
  return context as MasterRenderFrame
}

export function buildMasterRenderPlan(project: ProjectDocument, options: MasterRenderPlanOptions): MasterRenderPlan {
  const frameRateSource = masterSequenceFrameRate(project.masterSequence, project.shots, project.scenes, { numerator: 24, denominator: 1 })
  const frameRate = frameRateSource.rate
  const range = effectiveMasterRenderRange(project.masterSequence, masterSequenceVisualDurationFrames(project.masterSequence, frameRate))
  if (project.masterSequence.clips.length === 0 || range.endFrame <= range.startFrame) throw new Error('No shots in the Master Sequence.')
  validateMasterClipSources(project, frameRate)
  const firstFrame = firstRenderableMasterFrame(project, range)
  const deliveryAspect = firstFrame ? resolveMasterDeliveryAspect(firstFrame, options.deliveryAspectRatio) : 16 / 9
  const dimensions = dimensionsForDeliveryAspect(options.width, deliveryAspect)
  const contexts = new Map<string, MasterRenderFrame>()
  for (let masterFrame = range.startFrame; masterFrame < range.endFrame; masterFrame += 1) {
    const context = resolveMasterPreviewContext(project, masterFrame, false)
    if (context.status === 'resolved') contexts.set(context.clipId!, context as MasterRenderFrame)
  }
  const clipsUsed = clipsInRenderRange(project, range, contexts)
  const musicOverlap = options.includeMusic ? musicOverlapForRange(project, range, frameRate) : null
  return {
    range,
    startFrame: range.startFrame,
    endFrameExclusive: range.endFrame,
    frameCount: range.endFrame - range.startFrame,
    frameRate,
    dimensions,
    deliveryAspect,
    clipsUsed,
    musicOverlap,
  }
}

function firstRenderableMasterFrame(project: ProjectDocument, range: MasterRenderRange): MasterRenderFrame | null {
  for (let frame = range.startFrame; frame < range.endFrame; frame += 1) {
    const context = resolveMasterPreviewContext(project, frame, false)
    if (context.status === 'resolved') return context as MasterRenderFrame
  }
  return null
}

function validateMasterClipSources(project: ProjectDocument, frameRate: RationalFrameRate): void {
  for (const clip of orderedMasterClips(project.masterSequence)) {
    const shot = project.shots.find((candidate) => candidate.id === clip.shotId)
    if (!shot) throw new Error(`Master clip ${clip.id} references a missing Shot.`)
    if (!sourceRangeWithinShot(shot, clip.sourceStartFrame, clip.sourceEndFrame)) {
      throw new Error(`Master clip ${clip.id} has an invalid source range for Shot ${shot.name}.`)
    }
    const scene = project.scenes.find((candidate) => candidate.id === shot.sceneId)
    if (!scene) throw new Error(`Shot ${shot.name} references a missing Scene.`)
    if (!sameFrameRate(scene.scene.timeline.frameRate, frameRate)) {
      throw new Error('Master export requires all Shots to use the same frame rate.')
    }
  }
}

function resolveMasterDeliveryAspect(frame: MasterRenderFrame, delivery: CameraDeliveryFrame): number {
  const camera = frame.scene.cameras.find((candidate) => candidate.id === frame.cameraId)
  const cameraAspect = camera ? cameraDisplayAspect(camera) : 16 / 9
  return delivery === 'sensor' ? cameraAspect : deliveryAspectValue(delivery, cameraAspect)
}

function clipsInRenderRange(project: ProjectDocument, range: MasterRenderRange, contexts: ReadonlyMap<string, MasterRenderFrame>): MasterRenderClip[] {
  const result: MasterRenderClip[] = []
  for (const clip of orderedMasterClips(project.masterSequence)) {
    const duration = masterClipDurationFrames(clip)
    const clipStart = masterClipStartFrame(project.masterSequence, clip.id) ?? 0
    const clipEnd = clipStart + duration
    const startFrame = Math.max(range.startFrame, clipStart)
    const endFrame = Math.min(range.endFrame, clipEnd)
    if (startFrame >= endFrame) continue
    const context = contexts.get(clip.id)
    if (context) result.push({ clipId: clip.id, shotId: context.shotId!, sceneId: context.sceneId!, cameraId: context.cameraId!, startFrame, endFrame })
  }
  return result
}

function musicOverlapForRange(project: ProjectDocument, range: MasterRenderRange, rate: RationalFrameRate): MasterMusicOverlap | null {
  const clip = project.masterSequence.musicClip
  if (!clip) return null
  const rateValue = rate.numerator / rate.denominator
  const musicStart = clip.startMasterFrame / rateValue
  const musicEnd = musicStart + musicClipDurationSeconds(clip)
  const renderStart = range.startFrame / rateValue
  const renderEnd = range.endFrame / rateValue
  const overlapStart = Math.max(musicStart, renderStart)
  const overlapEnd = Math.min(musicEnd, renderEnd)
  if (overlapStart >= overlapEnd) return null
  return {
    clipId: clip.id,
    sourceStartSeconds: clip.sourceStartSeconds + Math.max(0, overlapStart - musicStart),
    sourceEndSeconds: clip.sourceStartSeconds + Math.max(0, overlapEnd - musicStart),
    outputStartSeconds: Math.max(0, overlapStart - renderStart),
    durationSeconds: Math.max(0, overlapEnd - overlapStart),
  }
}

function masterRenderContextError(context: MasterPreviewContext): string {
  if (context.status === 'missing-shot') return 'A Shot used by the Master render range is missing.'
  if (context.status === 'missing-scene') return 'A Scene used by the Master render range is missing.'
  if (context.status === 'missing-camera') return 'A Camera used by the Master render range is missing.'
  return 'The Master render range contains no valid video frames.'
}
