export type V2WheelInput = 'mouse-wheel-zoom' | 'trackpad-pan' | 'trackpad-pinch-zoom'

export type V2WheelEventLike = {
  ctrlKey: boolean
  deltaMode: number
  deltaX: number
  deltaY: number
}

export const V2WheelDeltaModePixel = 0

/**
 * Browser wheel events are the shared delivery path for mouse wheels,
 * two-finger trackpad scroll, and Chromium pinch. Keep those heuristics here.
 */
export function classifyWheelInput(event: V2WheelEventLike): V2WheelInput {
  if (event.ctrlKey) return 'trackpad-pinch-zoom'

  const pixelDelta = event.deltaMode === V2WheelDeltaModePixel
  const magnitude = Math.max(Math.abs(event.deltaX), Math.abs(event.deltaY))
  const trackpadLike = pixelDelta && magnitude > 0 && (Math.abs(event.deltaX) > 0 || magnitude < 50)
  return trackpadLike ? 'trackpad-pan' : 'mouse-wheel-zoom'
}
