import type { CameraDocument } from '../domain/types'
import {
  centeredDeliveryAperture,
  computeAnamorphicGeometry,
  type CaptureGeometry,
} from './cinematography'

export type CameraViewProjection = {
  captureAspectRatio: number
  displayAspectRatio: number
  squeezeFactor: number
  verticalFovRadians: number
  horizontalFovRadians: number
  frameGuideAspectRatio: number | null
  delivery: {
    widthFraction: number
    heightFraction: number
    cropAxis: 'none' | 'horizontal' | 'vertical'
  }
}

export type CameraViewViewport = {
  left: number
  top: number
  width: number
  height: number
}

const FRAME_GUIDE_ASPECTS: Record<Exclude<CameraDocument['frameGuide']['preset'], 'capture' | 'custom'>, number> = {
  '16:9': 16 / 9,
  '1.85:1': 1.85,
  '2.00:1': 2,
  '2.39:1': 2.39,
}

export function computeCameraViewProjection(camera: Pick<CameraDocument, 'resolvedCapture' | 'lens' | 'frameGuide'>): CameraViewProjection {
  const capture: CaptureGeometry = {
    activeWidthMm: camera.resolvedCapture.activeWidthMm,
    activeHeightMm: camera.resolvedCapture.activeHeightMm,
  }
  const squeezeFactor = camera.lens.profile.type === 'anamorphic' ? camera.lens.profile.squeezeFactor : 1
  const anamorphic = computeAnamorphicGeometry(capture, camera.lens.focalLengthMm, squeezeFactor)
  const displayCapture: CaptureGeometry = {
    activeWidthMm: capture.activeWidthMm * squeezeFactor,
    activeHeightMm: capture.activeHeightMm,
  }
  const frameGuideAspectRatio = resolveFrameGuideAspectRatio(camera.frameGuide)
  const delivery = frameGuideAspectRatio === null
    ? { widthFraction: 1, heightFraction: 1, cropAxis: 'none' as const }
    : (() => {
        const aperture = centeredDeliveryAperture(displayCapture, frameGuideAspectRatio)
        return {
          widthFraction: aperture.activeWidthMm / displayCapture.activeWidthMm,
          heightFraction: aperture.activeHeightMm / displayCapture.activeHeightMm,
          cropAxis: aperture.cropAxis,
        }
      })()

  return {
    captureAspectRatio: anamorphic.captureAspectRatio,
    displayAspectRatio: anamorphic.desqueezedAspectRatio,
    squeezeFactor,
    verticalFovRadians: anamorphic.physicalCaptureVerticalFovRadians,
    horizontalFovRadians: anamorphic.desqueezedDisplayHorizontalFovRadians,
    frameGuideAspectRatio,
    delivery,
  }
}

export function resolveFrameGuideAspectRatio(frameGuide: CameraDocument['frameGuide']): number | null {
  if (frameGuide.preset === 'capture') return null
  if (frameGuide.preset === 'custom') {
    if (typeof frameGuide.width !== 'number' || typeof frameGuide.height !== 'number') return null
    if (!Number.isFinite(frameGuide.width) || !Number.isFinite(frameGuide.height) || frameGuide.width <= 0 || frameGuide.height <= 0) return null
    return frameGuide.width / frameGuide.height
  }
  return FRAME_GUIDE_ASPECTS[frameGuide.preset]
}

export function computeCameraViewViewport(width: number, height: number, displayAspectRatio: number): CameraViewViewport {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return { left: 0, top: 0, width: 1, height: 1 }
  if (!Number.isFinite(displayAspectRatio) || displayAspectRatio <= 0) throw new RangeError('Camera View aspect ratio must be greater than zero.')

  const viewportAspectRatio = width / height
  if (viewportAspectRatio > displayAspectRatio) {
    const viewportWidth = height * displayAspectRatio
    return { left: (width - viewportWidth) / 2, top: 0, width: viewportWidth, height }
  }

  const viewportHeight = width / displayAspectRatio
  return { left: 0, top: (height - viewportHeight) / 2, width, height: viewportHeight }
}
