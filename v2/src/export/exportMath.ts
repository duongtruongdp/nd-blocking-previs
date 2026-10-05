import type { CameraDeliveryFrame, RationalFrameRate, SceneDocument } from '../core/sceneDocument'
import { cameraDisplayAspect, cameraProjectionForDocument } from '../runtime/cameraMath'
import { frameRateValue } from '../timeline/timelineMath'
import type { ExportWidth } from './exportTypes'

export type ExportDimensions = {
  width: number
  height: number
}

export type CropRect = {
  x: number
  y: number
  width: number
  height: number
}

export function exportFrameRange(markIn: number, markOut: number): number[] {
  if (!Number.isInteger(markIn) || !Number.isInteger(markOut) || markOut < markIn) return []
  return Array.from({ length: markOut - markIn + 1 }, (_, index) => markIn + index)
}

export function exportFrameCount(markIn: number, markOut: number): number {
  return exportFrameRange(markIn, markOut).length
}

export function rationalFrameDuration(rate: RationalFrameRate): number {
  return rate.denominator / rate.numerator
}

export function frameTimestampMicroseconds(frameIndex: number, rate: RationalFrameRate): number {
  return Math.round(frameIndex * rate.denominator * 1_000_000 / rate.numerator)
}

export function frameTimestampSeconds(frameIndex: number, rate: RationalFrameRate): number {
  return frameTimestampMicroseconds(frameIndex, rate) / 1_000_000
}

export function exportDurationSeconds(markIn: number, markOut: number, rate: RationalFrameRate): number {
  return exportFrameCount(markIn, markOut) * rationalFrameDuration(rate)
}

export function deliveryAspectValue(delivery: CameraDeliveryFrame, cameraAspect: number): number {
  if (delivery === 'sensor') return cameraAspect
  const value = Number(delivery)
  return Number.isFinite(value) && value > 0 ? value : cameraAspect
}

export function deliveryAspectForCamera(delivery: CameraDeliveryFrame, cameraId: string | null, document: SceneDocument): number {
  const camera = cameraId ? document.cameras.find((item) => item.id === cameraId) : undefined
  if (!camera) return 16 / 9
  return deliveryAspectValue(delivery, cameraDisplayAspect(camera))
}

export function dimensionsForDeliveryAspect(width: ExportWidth | number, aspect: number): ExportDimensions {
  const safeWidth = Math.max(2, Math.round(width))
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  const height = Math.max(2, Math.round((safeWidth / safeAspect) / 2) * 2)
  return { width: safeWidth, height }
}

export function centeredCrop(sourceWidth: number, sourceHeight: number, targetAspect: number): CropRect {
  const width = Math.max(1, sourceWidth)
  const height = Math.max(1, sourceHeight)
  const safeAspect = Number.isFinite(targetAspect) && targetAspect > 0 ? targetAspect : width / height
  const sourceAspect = width / height
  if (sourceAspect > safeAspect) {
    const cropWidth = height * safeAspect
    return { x: (width - cropWidth) / 2, y: 0, width: cropWidth, height }
  }
  const cropHeight = width / safeAspect
  return { x: 0, y: (height - cropHeight) / 2, width, height: cropHeight }
}

export function physicalCaptureAspect(document: SceneDocument, cameraId: string | null): number | null {
  const camera = cameraId ? document.cameras.find((item) => item.id === cameraId) : undefined
  return camera ? cameraProjectionForDocument(camera)?.aspect ?? null : null
}

export function formatExportDuration(markIn: number, markOut: number, rate: RationalFrameRate): string {
  const seconds = Math.max(0, exportDurationSeconds(markIn, markOut, rate))
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  const frames = Math.max(0, Math.round((seconds - wholeSeconds) * frameRateValue(rate)))
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

export function sanitizeExportFilename(value: string): string {
  const sanitized = value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^\.+|\.+$/g, '')
  return sanitized || 'Scene'
}

export function exportFilename(sceneName: string, cameraName: string, markIn: number, markOut: number, format: 'mp4' | 'webm' = 'webm'): string {
  return `${sanitizeExportFilename(sceneName)}_${sanitizeExportFilename(cameraName)}_${markIn}-${markOut}.${format}`
}

export function validateExportRequest(document: SceneDocument, cameraId: string | null, markIn: number, markOut: number): string | null {
  if (!cameraId || !document.cameras.some((camera) => camera.id === cameraId)) return 'Add or activate a Camera before exporting video.'
  if (!Number.isInteger(markIn) || !Number.isInteger(markOut) || markOut < markIn) return 'Mark Out must be at or after Mark In.'
  return null
}
