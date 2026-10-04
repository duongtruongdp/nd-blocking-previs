import type { SensorFormat } from '../domain/types'
import {
  centeredDeliveryAperture,
  captureAspectRatio,
  fieldOfViewRadians as calculateFieldOfViewRadians,
} from './cinematography'

export type SensorDefinition = {
  id: Exclude<SensorFormat, { kind: 'custom' }>['preset']
  label: string
  widthMm: number
  heightMm: number
}

export const SENSOR_PRESETS: readonly SensorDefinition[] = [
  { id: 'full-frame', label: 'Full Frame', widthMm: 36, heightMm: 24 },
  { id: 'super-35', label: 'Super 35', widthMm: 24.89, heightMm: 18.66 },
  {
    id: 'micro-four-thirds',
    label: 'Micro Four Thirds',
    widthMm: 17.3,
    heightMm: 13,
  },
  { id: 'academy', label: 'Academy / 35mm', widthMm: 21.95, heightMm: 16.1 },
] as const

export type ResolvedSensor = {
  widthMm: number
  heightMm: number
  aspectRatio: number
}

export type DeliveryFrame = {
  width: number
  height: number
}

export type DeliveryFrameCrop = {
  sensorAspectRatio: number
  deliveryAspectRatio: number
  visibleSensorWidthMm: number
  visibleSensorHeightMm: number
  cropHorizontalFraction: number
  cropVerticalFraction: number
  mode: 'none' | 'crop-horizontal' | 'crop-vertical'
}

export type CameraProjection = {
  sensorGate: {
    horizontalFovRadians: number
    verticalFovRadians: number
  }
  deliveryFrame: DeliveryFrameCrop & {
    horizontalFovRadians: number
    verticalFovRadians: number
  }
}

export function resolveSensorFormat(format: SensorFormat): ResolvedSensor {
  if (format.kind === 'custom') {
    assertPositiveFinite(format.widthMm, 'Custom sensor width')
    assertPositiveFinite(format.heightMm, 'Custom sensor height')
    return {
      widthMm: format.widthMm,
      heightMm: format.heightMm,
      aspectRatio: captureAspectRatio({ activeWidthMm: format.widthMm, activeHeightMm: format.heightMm }),
    }
  }

  const preset = SENSOR_PRESETS.find((candidate) => candidate.id === format.preset)
  if (!preset) throw new RangeError(`Unknown sensor preset: ${format.preset}`)

  return {
    widthMm: preset.widthMm,
    heightMm: preset.heightMm,
    aspectRatio: captureAspectRatio({ activeWidthMm: preset.widthMm, activeHeightMm: preset.heightMm }),
  }
}

export function fieldOfViewRadians(sensorDimensionMm: number, focalLengthMm: number): number {
  return calculateFieldOfViewRadians(sensorDimensionMm, focalLengthMm)
}

export function computeDeliveryFrameCrop(
  sensor: ResolvedSensor,
  deliveryFrame: DeliveryFrame,
): DeliveryFrameCrop {
  assertPositiveFinite(deliveryFrame.width, 'Delivery frame width')
  assertPositiveFinite(deliveryFrame.height, 'Delivery frame height')

  const aperture = centeredDeliveryAperture(
    { activeWidthMm: sensor.widthMm, activeHeightMm: sensor.heightMm },
    deliveryFrame.width / deliveryFrame.height,
  )
  return {
    sensorAspectRatio: aperture.captureAspectRatio,
    deliveryAspectRatio: aperture.deliveryAspectRatio,
    visibleSensorWidthMm: aperture.activeWidthMm,
    visibleSensorHeightMm: aperture.activeHeightMm,
    cropHorizontalFraction: aperture.cropHorizontalFraction,
    cropVerticalFraction: aperture.cropVerticalFraction,
    mode: aperture.cropAxis === 'horizontal' ? 'crop-horizontal' : aperture.cropAxis === 'vertical' ? 'crop-vertical' : 'none',
  }
}

export function computeCameraProjection(
  sensorFormat: SensorFormat,
  focalLengthMm: number,
  deliveryFrame: DeliveryFrame,
): CameraProjection {
  const sensor = resolveSensorFormat(sensorFormat)
  const crop = computeDeliveryFrameCrop(sensor, deliveryFrame)

  return {
    sensorGate: {
      horizontalFovRadians: fieldOfViewRadians(sensor.widthMm, focalLengthMm),
      verticalFovRadians: fieldOfViewRadians(sensor.heightMm, focalLengthMm),
    },
    deliveryFrame: {
      ...crop,
      horizontalFovRadians: fieldOfViewRadians(
        crop.visibleSensorWidthMm,
        focalLengthMm,
      ),
      verticalFovRadians: fieldOfViewRadians(
        crop.visibleSensorHeightMm,
        focalLengthMm,
      ),
    },
  }
}

export type AnamorphicDisplayMode = 'desqueezed' | 'squeezed'

export type AnamorphicDisplay = {
  deliveryAspectRatio: number
  squeezedAspectRatio: number
  desqueezedAspectRatio: number
  horizontalScale: number
  mode: AnamorphicDisplayMode
}

export function computeAnamorphicDisplay(
  deliveryFrame: DeliveryFrame,
  squeezeFactor: number,
  mode: AnamorphicDisplayMode,
): AnamorphicDisplay {
  assertPositiveFinite(deliveryFrame.width, 'Delivery frame width')
  assertPositiveFinite(deliveryFrame.height, 'Delivery frame height')
  assertPositiveFinite(squeezeFactor, 'Anamorphic squeeze factor')

  const deliveryAspectRatio = deliveryFrame.width / deliveryFrame.height
  const squeezedAspectRatio = deliveryAspectRatio / squeezeFactor

  return {
    deliveryAspectRatio,
    squeezedAspectRatio,
    desqueezedAspectRatio: squeezedAspectRatio * squeezeFactor,
    horizontalScale: mode === 'desqueezed' ? squeezeFactor : 1,
    mode,
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a finite number greater than zero.`)
  }
}
