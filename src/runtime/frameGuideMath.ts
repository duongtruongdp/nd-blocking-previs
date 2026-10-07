import type { CameraDeliveryFrame } from '../core/sceneDocument'

export type NormalizedFrameGuideRect = {
  x: number
  y: number
  width: number
  height: number
}

export function fitAspectInsideSource(sourceAspect: number, targetAspect: number): NormalizedFrameGuideRect {
  const safeSourceAspect = Number.isFinite(sourceAspect) && sourceAspect > 0 ? sourceAspect : 16 / 9
  const safeTargetAspect = Number.isFinite(targetAspect) && targetAspect > 0 ? targetAspect : safeSourceAspect
  if (safeTargetAspect > safeSourceAspect) {
    const height = safeSourceAspect / safeTargetAspect
    return { x: 0, y: (1 - height) / 2, width: 1, height }
  }
  const width = safeTargetAspect / safeSourceAspect
  return { x: (1 - width) / 2, y: 0, width, height: 1 }
}

export function deliveryAspectValue(deliveryFrame: CameraDeliveryFrame, displayAspect: number): number {
  if (deliveryFrame === 'sensor') return displayAspect
  if (deliveryFrame.includes(':')) {
    const [width, height] = deliveryFrame.split(':').map(Number)
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) return width / height
  }
  const decimal = Number(deliveryFrame)
  return Number.isFinite(decimal) && decimal > 0 ? decimal : displayAspect
}

export function insetFrameGuideRect(rect: NormalizedFrameGuideRect, safeMarginPercent: number): NormalizedFrameGuideRect {
  const margin = Math.min(0.49, Math.max(0, safeMarginPercent) / 100)
  return { x: rect.x + rect.width * margin, y: rect.y + rect.height * margin, width: rect.width * (1 - margin * 2), height: rect.height * (1 - margin * 2) }
}
