import * as THREE from 'three'
import type { CameraDocument } from '../core/sceneDocument'
import { resolveCameraDefinition, resolveCaptureMode, type CameraDefinition, type CaptureModeDefinition } from '../core/cameraDatabase'

export function activeCaptureAspect(captureMode: CaptureModeDefinition): number {
  return captureMode.activeWidthMm / captureMode.activeHeightMm
}

export function lensSqueezeForDocument(document: CameraDocument): number {
  return document.lensType === 'Anamorphic' ? Math.max(1, document.anamorphicSqueeze) : 1
}

export function horizontalFovDegrees(focalLengthMm: number, captureMode: CaptureModeDefinition, squeeze = 1): number {
  const effectiveFocalLength = Math.max(0.1, focalLengthMm) / Math.max(1, squeeze)
  return THREE.MathUtils.radToDeg(2 * Math.atan(captureMode.activeWidthMm / (2 * effectiveFocalLength)))
}

export function verticalFovDegrees(focalLengthMm: number, captureMode: CaptureModeDefinition): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(captureMode.activeHeightMm / (2 * Math.max(0.1, focalLengthMm))))
}

export function cameraProjectionForDocument(document: CameraDocument): { definition: CameraDefinition; captureMode: CaptureModeDefinition; aspect: number; displayAspect: number; squeeze: number; fov: number; horizontalFov: number } | null {
  const definition = resolveCameraDefinition(document.cameraDefinitionId)
  if (!definition) return null
  const resolvedMode = resolveCaptureMode(definition, document.captureModeId)
  const snapshot = document.cameraSnapshot
  const snapshotDiffers = snapshot && (
    Math.abs(snapshot.activeWidthMm - resolvedMode.activeWidthMm) > 1e-9
    || Math.abs(snapshot.activeHeightMm - resolvedMode.activeHeightMm) > 1e-9
    || snapshot.recordingWidthPx !== resolvedMode.recordingWidthPx
    || snapshot.recordingHeightPx !== resolvedMode.recordingHeightPx
  )
  const captureMode = snapshotDiffers ? { ...resolvedMode, name: snapshot.captureModeName, activeWidthMm: snapshot.activeWidthMm, activeHeightMm: snapshot.activeHeightMm, recordingWidthPx: snapshot.recordingWidthPx, recordingHeightPx: snapshot.recordingHeightPx } : resolvedMode
  const aspect = activeCaptureAspect(captureMode)
  const squeeze = lensSqueezeForDocument(document)
  return { definition, captureMode, aspect, displayAspect: aspect * squeeze, squeeze, fov: verticalFovDegrees(document.focalLengthMm, captureMode), horizontalFov: horizontalFovDegrees(document.focalLengthMm, captureMode, squeeze) }
}

export function cameraDisplayAspect(document: CameraDocument): number {
  const projection = cameraProjectionForDocument(document)
  if (!projection) return 16 / 9
  return projection.displayAspect
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
