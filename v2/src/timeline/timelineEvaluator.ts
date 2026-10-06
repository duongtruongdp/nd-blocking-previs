import * as THREE from 'three'
import type { ActorVector3, CameraDocument, PropDocument, SceneDocument, TimelineProperty, TimelineTrack, TimelineValue } from '../core/sceneDocument'
import { interpolateAngleRadians, interpolateScalar, interpolateVector } from './timelineMath'

export type EvaluatedEntityState = {
  position: ActorVector3
  rotation: ActorVector3
  focalLengthMm?: number
}

function valueAtFrame(track: TimelineTrack | undefined, frame: number): TimelineValue | undefined {
  if (!track || track.keyframes.length === 0) return undefined
  const ordered = [...track.keyframes].sort((a, b) => a.frame - b.frame)
  if (frame <= ordered[0].frame) return ordered[0].value
  if (frame >= ordered[ordered.length - 1].frame) return ordered[ordered.length - 1].value
  const nextIndex = ordered.findIndex((keyframe) => keyframe.frame >= frame)
  const previous = ordered[nextIndex - 1]
  const next = ordered[nextIndex]
  if (previous.interpolation === 'hold') return previous.value
  const amount = (frame - previous.frame) / (next.frame - previous.frame)
  if (Array.isArray(previous.value) && Array.isArray(next.value)) return interpolateVector(previous.value, next.value, amount)
  return interpolateScalar(Number(previous.value), Number(next.value), amount)
}

function trackFor(tracks: readonly TimelineTrack[], entityId: string, property: TimelineProperty): TimelineTrack | undefined {
  return tracks.find((track) => track.entityId === entityId && track.property === property)
}

function evaluateRotation(base: ActorVector3, track: TimelineTrack | undefined, frame: number): ActorVector3 {
  if (!track) return [...base]
  const value = valueAtFrame(track, frame)
  if (!value || !Array.isArray(value)) return [...base]
  const previous = [...track.keyframes].sort((a, b) => a.frame - b.frame).find((keyframe) => keyframe.frame >= frame)
  const before = [...track.keyframes].sort((a, b) => b.frame - a.frame).find((keyframe) => keyframe.frame <= frame)
  if (!previous || !before || previous.frame === before.frame || previous.interpolation === 'hold') return [...value]
  const start = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(before.value as ActorVector3), 'XYZ'))
  const end = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(previous.value as ActorVector3), 'XYZ'))
  const amount = (frame - before.frame) / (previous.frame - before.frame)
  const result = start.slerp(end, amount).toArray()
  const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(result), 'XYZ')
  return [euler.x, euler.y, euler.z]
}

function evaluateEntity(base: { id: string; position: ActorVector3; rotation: ActorVector3 }, tracks: readonly TimelineTrack[], frame: number, focalLengthMm?: number): EvaluatedEntityState {
  const positionValue = valueAtFrame(trackFor(tracks, base.id, 'position'), frame)
  const headingTrack = trackFor(tracks, base.id, 'heading')
  const rotationTrack = trackFor(tracks, base.id, 'rotation')
  const position: ActorVector3 = positionValue && Array.isArray(positionValue) ? [...positionValue] as ActorVector3 : [...base.position] as ActorVector3
  const rotation = evaluateRotation(base.rotation, rotationTrack, frame)
  const headingValue = headingTrack ? valueAtFrame(headingTrack, frame) : undefined
  if (headingValue !== undefined && !Array.isArray(headingValue)) {
    const headingKeyframes = [...headingTrack!.keyframes].sort((a, b) => a.frame - b.frame)
    const before = [...headingKeyframes].reverse().find((keyframe) => keyframe.frame <= frame)
    const after = headingKeyframes.find((keyframe) => keyframe.frame >= frame)
    rotation[1] = before && after && before.frame !== after.frame && before.interpolation !== 'hold'
      ? interpolateAngleRadians(Number(before.value), Number(after.value), (frame - before.frame) / (after.frame - before.frame))
      : Number(headingValue)
  }
  const focalTrack = trackFor(tracks, base.id, 'focalLengthMm')
  const focalValue = focalTrack ? valueAtFrame(focalTrack, frame) : undefined
  const result: EvaluatedEntityState = { position, rotation }
  if (focalValue !== undefined && !Array.isArray(focalValue)) result.focalLengthMm = Number(focalValue)
  else if (focalLengthMm !== undefined) result.focalLengthMm = focalLengthMm
  return result
}

export function evaluateTimeline(document: SceneDocument, frame: number): Record<string, EvaluatedEntityState> {
  const evaluated: Record<string, EvaluatedEntityState> = {}
  document.actors.forEach((actor) => { evaluated[actor.id] = evaluateEntity(actor, document.timeline.tracks, frame) })
  document.props.forEach((prop: PropDocument) => { evaluated[prop.id] = evaluateEntity(prop, document.timeline.tracks, frame) })
  document.cameras.forEach((camera: CameraDocument) => { evaluated[camera.id] = evaluateEntity(camera, document.timeline.tracks, frame, camera.focalLengthMm) })
  return evaluated
}
