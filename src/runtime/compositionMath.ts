import * as THREE from 'three'
import type { ActorDocument, CameraDocument } from '../core/sceneDocument'
import { cameraProjectionForDocument } from './cameraMath'
import { fitAspectInsideSource, type NormalizedFrameGuideRect } from './frameGuideMath'

export type TargetAimPoint = 'center' | 'chest' | 'head' | 'eyes'
export type FramingPreset = 'full' | 'medium-full' | 'medium' | 'mcu' | 'cu'

export type CompositionOverlayModel = {
  frame: NormalizedFrameGuideRect
  safeAction: NormalizedFrameGuideRect | null
  safeTitle: NormalizedFrameGuideRect | null
  thirds: { vertical: number[]; horizontal: number[] } | null
  center: { x: number; y: number } | null
  headroom: { y: number; percentage: number } | null
}

export function actorAimPoint(actor: ActorDocument, aimPoint: TargetAimPoint = 'center'): [number, number, number] {
  // The procedural actor has no eye bones. These canonical landmarks are
  // derived from the stable actor root/proportion model and are deterministic
  // across pose presets; eyes intentionally fall back to the head landmark.
  const y = aimPoint === 'chest' ? 1.22 : aimPoint === 'head' || aimPoint === 'eyes' ? 1.66 : 0.88
  return [actor.position[0], actor.position[1] + y, actor.position[2]]
}

export function compositionFrameRect(sourceAspect: number, guideAspect: number | null, deliveryAspect: number): NormalizedFrameGuideRect {
  return fitAspectInsideSource(sourceAspect, guideAspect && guideAspect > 0 ? guideAspect : deliveryAspect)
}

export function safeAreaRect(frameRect: NormalizedFrameGuideRect, safePercent: number): NormalizedFrameGuideRect {
  const margin = THREE.MathUtils.clamp(safePercent, 0, 49) / 100
  return {
    x: frameRect.x + frameRect.width * margin,
    y: frameRect.y + frameRect.height * margin,
    width: frameRect.width * (1 - margin * 2),
    height: frameRect.height * (1 - margin * 2),
  }
}

export function thirdsCoordinates(frameRect: NormalizedFrameGuideRect): { vertical: number[]; horizontal: number[] } {
  return {
    vertical: [frameRect.x + frameRect.width / 3, frameRect.x + frameRect.width * 2 / 3],
    horizontal: [frameRect.y + frameRect.height / 3, frameRect.y + frameRect.height * 2 / 3],
  }
}

export function headroomPercentage(frameRect: NormalizedFrameGuideRect, headY: number): number {
  if (frameRect.height <= 0) return 0
  return THREE.MathUtils.clamp((headY - frameRect.y) / frameRect.height * 100, 0, 100)
}

/**
 * The single normalized composition description consumed by live overlays and
 * still-guide capture. Coordinates are always relative to the active source
 * image (0..1), never to a surrounding UI panel or letterbox.
 */
export function compositionOverlayModel(camera: CameraDocument, sourceAspect: number, deliveryAspect: number, actor: ActorDocument | null = null): CompositionOverlayModel {
  const frame = compositionFrameRect(sourceAspect, camera.compositionFrameGuideEnabled ? camera.compositionFrameGuideAspect ?? 2.39 : null, deliveryAspect)
  const headY = actor ? actorHeadProjectionY(camera, actor, frame, sourceAspect) : null
  return {
    frame,
    safeAction: camera.compositionSafeAreas ? safeAreaRect(frame, 10) : null,
    safeTitle: camera.compositionSafeAreas ? safeAreaRect(frame, 20) : null,
    thirds: camera.compositionThirds ? thirdsCoordinates(frame) : null,
    center: camera.compositionCenter ? { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 } : null,
    headroom: camera.compositionHeadroom && headY !== null ? { y: headY, percentage: headroomPercentage(frame, headY) } : null,
  }
}

/** Export policy for still capture: live display is always independent of this flag. */
export function compositionOverlayForCapture(camera: CameraDocument, sourceAspect: number, deliveryAspect: number, actor: ActorDocument | null, includeGuides: boolean): CompositionOverlayModel | null {
  return includeGuides ? compositionOverlayModel(camera, sourceAspect, deliveryAspect, actor) : null
}

function framingRegion(preset: FramingPreset): { bottom: number; top: number } {
  if (preset === 'medium-full') return { bottom: 0.38, top: 1.66 }
  if (preset === 'medium') return { bottom: 0.78, top: 1.66 }
  if (preset === 'mcu') return { bottom: 1.08, top: 1.66 }
  if (preset === 'cu') return { bottom: 1.36, top: 1.82 }
  return { bottom: 0, top: 1.82 }
}

/** Solve a spatial reframing while preserving focal length and target point. */
export function cameraPositionForActorFraming(camera: CameraDocument, actor: ActorDocument, preset: FramingPreset, aimPoint: TargetAimPoint = 'center', margin = 0.08): [number, number, number] {
  const projection = cameraProjectionForDocument(camera)
  if (!projection) return [...camera.position]
  const region = framingRegion(preset)
  const target = new THREE.Vector3(...actorAimPoint(actor, aimPoint))
  const position = new THREE.Vector3(...camera.position)
  const direction = target.clone().sub(position)
  if (direction.lengthSq() < 1e-10) return [...camera.position]
  const distance = (region.top - region.bottom) / (2 * Math.tan(THREE.MathUtils.degToRad(projection.fov) / 2) * Math.max(0.5, 1 - margin))
  const next = target.clone().sub(direction.normalize().multiplyScalar(distance))
  return [next.x, next.y, next.z]
}

export function actorHeadProjectionY(camera: CameraDocument, actor: ActorDocument, frameRect: NormalizedFrameGuideRect, sourceAspect: number): number {
  const projection = cameraProjectionForDocument(camera)
  if (!projection) return frameRect.y
  const viewCamera = new THREE.PerspectiveCamera(projection.fov, sourceAspect, 0.01, 10000)
  viewCamera.position.set(...camera.position)
  viewCamera.rotation.set(...camera.rotation)
  viewCamera.updateMatrixWorld(true)
  const head = new THREE.Vector3(actor.position[0], actor.position[1] + 1.8, actor.position[2]).project(viewCamera)
  const sourceY = THREE.MathUtils.clamp((1 - head.y) / 2, 0, 1)
  return frameRect.y + sourceY * frameRect.height
}
