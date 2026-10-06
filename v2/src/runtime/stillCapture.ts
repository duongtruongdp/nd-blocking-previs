import type { CameraDocument, SceneDocument } from '../core/sceneDocument'
import { cameraDisplayAspect } from './cameraMath'
import { deliveryAspectValue } from './frameGuideMath'
import { dimensionsForDeliveryAspect, sanitizeExportFilename } from '../export/exportMath'

export const STILL_CAPTURE_WIDTHS = [1280, 1920, 2560] as const
export type StillCaptureWidth = typeof STILL_CAPTURE_WIDTHS[number]

export type StillCaptureOptions = {
  width: StillCaptureWidth | number
  includeGuides: boolean
}

export function activeCameraForStill(document: SceneDocument): CameraDocument | null {
  return document.cameras.find((camera) => camera.id === document.activeCameraId) ?? null
}

export function stillDimensionsForCamera(camera: CameraDocument, width: StillCaptureWidth | number): { width: number; height: number } {
  return dimensionsForDeliveryAspect(width, deliveryAspectValue(camera.deliveryAspectRatio, cameraDisplayAspect(camera)))
}

export function cameraStillFilename(projectName: string, sceneName: string, cameraName: string, frame: number): string {
  const frameLabel = `F${Math.max(0, Math.round(frame)).toString().padStart(4, '0')}`
  return `${sanitizeExportFilename(projectName)}_${sanitizeExportFilename(sceneName)}_${sanitizeExportFilename(cameraName)}_${frameLabel}.png`
}
