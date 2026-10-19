import type { ActorVector3, CameraDocument, SceneDocument, TimelineDocument, TimelineKeyframe, TimelineTrack } from '../core/sceneDocument'
import { evaluateTimeline } from './timelineEvaluator'
import { frameToSeconds } from './timelineMath'

export type CameraPathKeyframe = {
  cameraId: string
  trackId: string
  keyframeId: string
  frame: number
  position: ActorVector3
}

export type CameraPathSegment = {
  id: string
  from: CameraPathKeyframe
  to: CameraPathKeyframe
  samples: ActorVector3[]
  distance: number
  durationSeconds: number
  speed: number
}

export type CameraPathSegmentSelection = {
  cameraId: string
  trackId: string
  fromKeyframeId: string
  toKeyframeId: string
}

export function cameraPathSegmentId(cameraId: string, fromKeyframeId: string, toKeyframeId: string): string {
  return `${cameraId}:${fromKeyframeId}:${toKeyframeId}`
}

export type CameraPathModel = {
  cameraId: string
  keyframes: CameraPathKeyframe[]
  samples: ActorVector3[]
  segments: CameraPathSegment[]
}

function positionTrack(timeline: TimelineDocument, cameraId: string): TimelineTrack | undefined {
  return timeline.tracks.find((track) => track.entityId === cameraId && track.entityType === 'Camera' && track.property === 'position' && track.keyframes.length > 0)
}

function keyframePosition(keyframe: TimelineKeyframe): ActorVector3 | null {
  return Array.isArray(keyframe.value) && keyframe.value.length === 3 ? [...keyframe.value] as ActorVector3 : null
}

export function cameraPositionKeyframes(timeline: TimelineDocument, cameraId: string): CameraPathKeyframe[] {
  const track = positionTrack(timeline, cameraId)
  if (!track) return []
  return [...track.keyframes].sort((a, b) => a.frame - b.frame).flatMap((keyframe) => {
    const position = keyframePosition(keyframe)
    return position ? [{ cameraId, trackId: track.id, keyframeId: keyframe.id, frame: keyframe.frame, position }] : []
  })
}

export function cameraPathSegments(timeline: TimelineDocument, cameraId: string): CameraPathSegment[] {
  const keyframes = cameraPositionKeyframes(timeline, cameraId)
  return keyframes.slice(0, -1).map((from, index) => {
    const to = keyframes[index + 1]
    const distance = Math.hypot(to.position[0] - from.position[0], to.position[1] - from.position[1], to.position[2] - from.position[2])
    const durationSeconds = Math.max(0, frameToSeconds(to.frame - from.frame, timeline.frameRate))
    return { id: cameraPathSegmentId(cameraId, from.keyframeId, to.keyframeId), from, to, samples: [[...from.position], [...to.position]], distance, durationSeconds, speed: durationSeconds > 0 ? distance / durationSeconds : 0 }
  })
}

export function cameraPathSegmentForSelection(timeline: TimelineDocument, selection: CameraPathSegmentSelection | null): CameraPathSegment | null {
  if (!selection) return null
  return cameraPathSegments(timeline, selection.cameraId).find((segment) => segment.from.keyframeId === selection.fromKeyframeId && segment.to.keyframeId === selection.toKeyframeId) ?? null
}

function segmentSelection(cameraId: string, from: CameraPathKeyframe, to: CameraPathKeyframe): CameraPathSegmentSelection {
  return { cameraId, trackId: from.trackId, fromKeyframeId: from.keyframeId, toKeyframeId: to.keyframeId }
}

export function cameraPathSegmentForKeyframe(timeline: TimelineDocument, cameraId: string, keyframeId: string): CameraPathSegmentSelection | null {
  const keyframes = cameraPositionKeyframes(timeline, cameraId)
  const index = keyframes.findIndex((keyframe) => keyframe.keyframeId === keyframeId)
  if (index < 0 || keyframes.length < 2) return null
  const from = index === keyframes.length - 1 ? keyframes[index - 1] : keyframes[index]
  const to = index === keyframes.length - 1 ? keyframes[index] : keyframes[index + 1]
  if (!from || !to || from.keyframeId === to.keyframeId) return null
  return segmentSelection(cameraId, from, to)
}

export function cameraPathPlayheadPosition(scene: SceneDocument, cameraId: string, frame = scene.timeline.currentFrame): ActorVector3 | null {
  const camera = scene.cameras.find((candidate) => candidate.id === cameraId)
  if (!camera) return null
  const evaluated = evaluateTimeline(scene, frame)[cameraId]
  return evaluated ? [...evaluated.position] as ActorVector3 : [...camera.position]
}

export function cameraPathModel(scene: SceneDocument, cameraId: string): CameraPathModel {
  const keyframes = cameraPositionKeyframes(scene.timeline, cameraId)
  const samples: ActorVector3[] = []
  const segments: CameraPathSegment[] = []
  const sampleStep = (from: number, to: number) => Math.max(1, Math.ceil((to - from) / 32))
  keyframes.forEach((keyframe, index) => {
    if (index === 0) samples.push([...keyframe.position])
    const next = keyframes[index + 1]
    if (!next) return
    const points: ActorVector3[] = [[...keyframe.position]]
    for (let frame = keyframe.frame + sampleStep(keyframe.frame, next.frame); frame < next.frame; frame += sampleStep(keyframe.frame, next.frame)) {
      const evaluated = cameraPathPlayheadPosition(scene, cameraId, frame)
      if (evaluated) points.push(evaluated)
    }
    points.push([...next.position])
    points.slice(1).forEach((point) => samples.push([...point]))
    let distance = 0
    for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
      distance += Math.hypot(points[pointIndex][0] - points[pointIndex - 1][0], points[pointIndex][1] - points[pointIndex - 1][1], points[pointIndex][2] - points[pointIndex - 1][2])
    }
    const durationSeconds = Math.max(0, frameToSeconds(next.frame - keyframe.frame, scene.timeline.frameRate))
    segments.push({ id: cameraPathSegmentId(cameraId, keyframe.keyframeId, next.keyframeId), from: keyframe, to: next, samples: points, distance, durationSeconds, speed: durationSeconds > 0 ? distance / durationSeconds : 0 })
  })
  return { cameraId, keyframes, samples, segments }
}

export function cameraPathForSelectedCamera(scene: SceneDocument, selectedCamera: CameraDocument | null): CameraPathModel | null {
  return selectedCamera ? cameraPathModel(scene, selectedCamera.id) : null
}
