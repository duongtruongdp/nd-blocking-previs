import * as THREE from 'three'
import type { CameraDocument } from '../core/sceneDocument'
import { resolveCameraDefinition, resolveCaptureMode, type CameraDefinition, type CaptureModeDefinition } from '../core/cameraDatabase'

export function activeCaptureAspect(captureMode: CaptureModeDefinition): number {
  return captureMode.activeWidthMm / captureMode.activeHeightMm
}

export function horizontalFovDegrees(focalLengthMm: number, captureMode: CaptureModeDefinition): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(captureMode.activeWidthMm / (2 * Math.max(0.1, focalLengthMm))))
}

export function verticalFovDegrees(focalLengthMm: number, captureMode: CaptureModeDefinition): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(captureMode.activeHeightMm / (2 * Math.max(0.1, focalLengthMm))))
}

export function cameraProjectionForDocument(document: CameraDocument): { definition: CameraDefinition; captureMode: CaptureModeDefinition; aspect: number; fov: number } | null {
  const definition = resolveCameraDefinition(document.cameraDefinitionId)
  if (!definition) return null
  const captureMode = resolveCaptureMode(definition, document.captureModeId)
  return { definition, captureMode, aspect: activeCaptureAspect(captureMode), fov: verticalFovDegrees(document.focalLengthMm, captureMode) }
}

export function cameraDisplayAspect(document: CameraDocument): number {
  const projection = cameraProjectionForDocument(document)
  if (!projection) return 16 / 9
  const squeeze = document.lensType === 'Anamorphic' ? Math.max(1, document.anamorphicSqueeze) : 1
  return projection.aspect * squeeze
}

export function cameraRotationLookingAt(position: [number, number, number], target: [number, number, number]): [number, number, number] {
  const camera = new THREE.PerspectiveCamera()
  camera.position.set(...position)
  camera.lookAt(new THREE.Vector3(...target))
  return [camera.rotation.x, camera.rotation.y, camera.rotation.z]
}

export function letterboxRect(width: number, height: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const containerAspect = width / Math.max(1, height)
  if (containerAspect > aspect) {
    const nextWidth = height * aspect
    return { x: (width - nextWidth) / 2, y: 0, width: nextWidth, height }
  }
  const nextHeight = width / aspect
  return { x: 0, y: (height - nextHeight) / 2, width, height: nextHeight }
}
