export type CaptureGeometry = {
  activeWidthMm: number
  activeHeightMm: number
}

export type DeliveryAperture = CaptureGeometry & {
  captureAspectRatio: number
  deliveryAspectRatio: number
  cropAxis: 'none' | 'horizontal' | 'vertical'
  cropHorizontalFraction: number
  cropVerticalFraction: number
}

export type FrameCoverage = {
  widthM: number
  heightM: number
}

export function captureAspectRatio(geometry: CaptureGeometry): number {
  assertGeometry(geometry)
  return geometry.activeWidthMm / geometry.activeHeightMm
}

export function sensorDiagonalMm(geometry: CaptureGeometry): number {
  assertGeometry(geometry)
  return Math.hypot(geometry.activeWidthMm, geometry.activeHeightMm)
}

export function horizontalFovRadians(geometry: CaptureGeometry, focalLengthMm: number): number {
  assertGeometry(geometry)
  return fieldOfViewRadians(geometry.activeWidthMm, focalLengthMm)
}

export function verticalFovRadians(geometry: CaptureGeometry, focalLengthMm: number): number {
  assertGeometry(geometry)
  return fieldOfViewRadians(geometry.activeHeightMm, focalLengthMm)
}

export function diagonalFovRadians(geometry: CaptureGeometry, focalLengthMm: number): number {
  return fieldOfViewRadians(sensorDiagonalMm(geometry), focalLengthMm)
}

export function fieldOfViewRadians(sensorDimensionMm: number, focalLengthMm: number): number {
  assertPositiveFinite(sensorDimensionMm, 'Sensor dimension')
  assertPositiveFinite(focalLengthMm, 'Focal length')
  return 2 * Math.atan(sensorDimensionMm / (2 * focalLengthMm))
}

export function frameCoverageAtDistance(
  geometry: CaptureGeometry,
  focalLengthMm: number,
  subjectDistanceM: number,
): FrameCoverage {
  assertGeometry(geometry)
  assertPositiveFinite(focalLengthMm, 'Focal length')
  assertPositiveFinite(subjectDistanceM, 'Subject distance')
  return {
    widthM: subjectDistanceM * geometry.activeWidthMm / focalLengthMm,
    heightM: subjectDistanceM * geometry.activeHeightMm / focalLengthMm,
  }
}

export function centeredDeliveryAperture(
  geometry: CaptureGeometry,
  deliveryAspectRatio: number,
): DeliveryAperture {
  assertGeometry(geometry)
  assertPositiveFinite(deliveryAspectRatio, 'Delivery aspect ratio')
  const captureRatio = captureAspectRatio(geometry)
  if (deliveryAspectRatio < captureRatio) {
    const width = geometry.activeHeightMm * deliveryAspectRatio
    return {
      activeWidthMm: width,
      activeHeightMm: geometry.activeHeightMm,
      captureAspectRatio: captureRatio,
      deliveryAspectRatio,
      cropAxis: 'horizontal',
      cropHorizontalFraction: 1 - width / geometry.activeWidthMm,
      cropVerticalFraction: 0,
    }
  }
  if (deliveryAspectRatio > captureRatio) {
    const height = geometry.activeWidthMm / deliveryAspectRatio
    return {
      activeWidthMm: geometry.activeWidthMm,
      activeHeightMm: height,
      captureAspectRatio: captureRatio,
      deliveryAspectRatio,
      cropAxis: 'vertical',
      cropHorizontalFraction: 0,
      cropVerticalFraction: 1 - height / geometry.activeHeightMm,
    }
  }
  return {
    ...geometry,
    captureAspectRatio: captureRatio,
    deliveryAspectRatio,
    cropAxis: 'none',
    cropHorizontalFraction: 0,
    cropVerticalFraction: 0,
  }
}

export function deliveryFrameFovRadians(
  geometry: CaptureGeometry,
  focalLengthMm: number,
  deliveryAspectRatio: number,
): { horizontal: number; vertical: number; aperture: DeliveryAperture } {
  const aperture = centeredDeliveryAperture(geometry, deliveryAspectRatio)
  return {
    horizontal: fieldOfViewRadians(aperture.activeWidthMm, focalLengthMm),
    vertical: fieldOfViewRadians(aperture.activeHeightMm, focalLengthMm),
    aperture,
  }
}

export type AnamorphicGeometry = {
  squeezeFactor: number
  captureAspectRatio: number
  desqueezedAspectRatio: number
  displayedSqueezedAspectRatio: number
  physicalCaptureHorizontalFovRadians: number
  physicalCaptureVerticalFovRadians: number
  desqueezedDisplayHorizontalFovRadians: number
}

export function computeAnamorphicGeometry(
  geometry: CaptureGeometry,
  focalLengthMm: number,
  squeezeFactor: number,
): AnamorphicGeometry {
  assertPositiveFinite(squeezeFactor, 'Anamorphic squeeze factor')
  const physicalHorizontal = horizontalFovRadians(geometry, focalLengthMm)
  return {
    squeezeFactor,
    captureAspectRatio: captureAspectRatio(geometry),
    desqueezedAspectRatio: captureAspectRatio(geometry) * squeezeFactor,
    displayedSqueezedAspectRatio: captureAspectRatio(geometry),
    physicalCaptureHorizontalFovRadians: physicalHorizontal,
    physicalCaptureVerticalFovRadians: verticalFovRadians(geometry, focalLengthMm),
    desqueezedDisplayHorizontalFovRadians: 2 * Math.atan(Math.tan(physicalHorizontal / 2) * squeezeFactor),
  }
}

export function explicitReferenceCropFactor(
  capture: CaptureGeometry,
  reference: CaptureGeometry,
): number {
  return sensorDiagonalMm(reference) / sensorDiagonalMm(capture)
}

function assertGeometry(geometry: CaptureGeometry): void {
  assertPositiveFinite(geometry.activeWidthMm, 'Active capture width')
  assertPositiveFinite(geometry.activeHeightMm, 'Active capture height')
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be a finite number greater than zero.`)
}
