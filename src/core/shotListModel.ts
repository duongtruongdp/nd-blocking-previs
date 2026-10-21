import type { ProjectDocument, ProjectSceneEntry } from './projectDocument'
import type { CameraDocument, RationalFrameRate, SceneDocument } from './sceneDocument'
import type { ShotDocument } from './shotDocument'
import { shotDurationFrames } from './shotDocument'
import { evaluateTimeline } from '../timeline/timelineEvaluator'
import { frameToTimecode } from '../timeline/timelineMath'
import { normalizeShotListSettings, type ShotListSettings } from './shotListSettings'
import { resolveShotCamera } from './shotCameraResolver'

export type ShotListCardModel = {
  shot: ShotDocument
  orderIndex: number
  numberLabel: string
  scene: ProjectSceneEntry | null
  sceneName: string
  camera: CameraDocument | null
  cameraName: string
  lensLabel: string
  lensMillimeters: number | null
  lensIsAnimated: boolean
  durationLabel: string
  durationFrames: number
  representativeFrame: number
  masterUseCount: number
}

export function buildShotListCards(project: ProjectDocument): ShotListCardModel[] {
  const clips = project.masterSequence.clips
  return project.shots.map((shot, orderIndex) => {
    const scene = project.scenes.find((entry) => entry.id === shot.sceneId) ?? null
    const camera = resolveShotCamera(project, shot).camera
    const representativeFrame = shot.thumbnailFrame ?? shot.startFrame
    const evaluatedCamera = scene && camera ? evaluateTimeline(scene.scene, representativeFrame)[camera.id] : undefined
    const lensMillimeters = camera ? Math.max(0, evaluatedCamera?.focalLengthMm ?? camera.focalLengthMm) : null
    const lensIsAnimated = Boolean(scene && camera && scene.scene.timeline.tracks.some((track) => track.entityId === camera.id && track.property === 'focalLengthMm' && track.keyframes.length > 0))
    const rate = scene?.scene.timeline.frameRate ?? { numerator: 24, denominator: 1 }
    const durationFrames = shotDurationFrames(shot)
    return {
      shot,
      orderIndex,
      numberLabel: String(orderIndex + 1).padStart(2, '0'),
      scene,
      sceneName: scene?.name ?? 'Missing Scene',
      camera,
      cameraName: camera?.name ?? 'Missing Camera',
      lensLabel: lensMillimeters === null ? '—' : `${Math.round(lensMillimeters)}mm${lensIsAnimated ? ' · animated' : ''}`,
      lensMillimeters,
      lensIsAnimated,
      durationLabel: frameToTimecode(durationFrames, rate),
      durationFrames,
      representativeFrame,
      masterUseCount: clips.filter((clip) => clip.shotId === shot.id).length,
    }
  })
}

export function shotListSettingsForProject(project: ProjectDocument): ShotListSettings {
  return normalizeShotListSettings(project.settings.shotList)
}

export function filterShotListCards(cards: readonly ShotListCardModel[], sceneId: string | null): ShotListCardModel[] {
  return sceneId ? cards.filter((card) => card.shot.sceneId === sceneId) : [...cards]
}

export function reorderShotDocuments(shots: readonly ShotDocument[], shotId: string, targetIndex: number): ShotDocument[] {
  const sourceIndex = shots.findIndex((shot) => shot.id === shotId)
  if (sourceIndex < 0) return [...shots]
  const next = [...shots]
  const [moved] = next.splice(sourceIndex, 1)
  const safeIndex = Math.max(0, Math.min(next.length, Math.round(targetIndex)))
  next.splice(safeIndex, 0, moved)
  return next.map((shot, order) => ({ ...shot, order }))
}

export function frameRateForShot(card: Pick<ShotListCardModel, 'scene'>): RationalFrameRate {
  return card.scene?.scene.timeline.frameRate ?? { numerator: 24, denominator: 1 }
}

export function shotSceneForCard(card: Pick<ShotListCardModel, 'scene'>): SceneDocument | null {
  return card.scene?.scene ?? null
}
