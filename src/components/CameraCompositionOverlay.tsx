import type { ActorDocument, CameraDocument } from '../core/sceneDocument'
import { compositionOverlayModel } from '../runtime/compositionMath'
import { deliveryAspectValue, fitAspectInsideSource } from '../runtime/frameGuideMath'

type CameraCompositionOverlayProps = {
  camera: CameraDocument
  sourceAspect: number
  /** The aspect of the parent display surface. Defaults to the source image. */
  displayAspect?: number
  actor?: ActorDocument | null
}
function mapX(value: number, imageRect: { x: number; width: number }): number {
  return imageRect.x + value * imageRect.width
}

function mapY(value: number, imageRect: { y: number; height: number }): number {
  return imageRect.y + value * imageRect.height
}

export function CameraCompositionOverlay({ camera, sourceAspect, displayAspect = sourceAspect, actor = null }: CameraCompositionOverlayProps) {
  const model = compositionOverlayModel(camera, sourceAspect, deliveryAspectValue(camera.deliveryAspectRatio, sourceAspect), actor)
  const imageRect = fitAspectInsideSource(displayAspect, sourceAspect)
  const frame = {
    x: mapX(model.frame.x, imageRect),
    y: mapY(model.frame.y, imageRect),
    width: model.frame.width * imageRect.width,
    height: model.frame.height * imageRect.height,
  }
  return <div className="v2-camera-composition-overlay" aria-hidden="true">
    {camera.compositionFrameGuideEnabled ? <div className="v2-camera-composition-frame" style={rectStyle(frame)} /> : null}
    {model.safeAction ? <div className="v2-camera-composition-safe action" style={rectStyle({ x: mapX(model.safeAction.x, imageRect), y: mapY(model.safeAction.y, imageRect), width: model.safeAction.width * imageRect.width, height: model.safeAction.height * imageRect.height })} /> : null}
    {model.safeTitle ? <div className="v2-camera-composition-safe title" style={rectStyle({ x: mapX(model.safeTitle.x, imageRect), y: mapY(model.safeTitle.y, imageRect), width: model.safeTitle.width * imageRect.width, height: model.safeTitle.height * imageRect.height })} /> : null}
    {model.thirds ? <div className="v2-camera-composition-thirds">
      {model.thirds.vertical.map((x) => <span className="vertical" key={`v-${x}`} style={{ left: `${mapX(x, imageRect) * 100}%`, top: `${imageRect.y * 100}%`, height: `${imageRect.height * 100}%` }} />)}
      {model.thirds.horizontal.map((y) => <span className="horizontal" key={`h-${y}`} style={{ left: `${imageRect.x * 100}%`, top: `${mapY(y, imageRect) * 100}%`, width: `${imageRect.width * 100}%` }} />)}
    </div> : null}
    {model.center ? <div className="v2-camera-composition-center" style={{ left: `${mapX(model.center.x, imageRect) * 100}%`, top: `${mapY(model.center.y, imageRect) * 100}%` }}><span /></div> : null}
    {model.headroom ? <div className="v2-camera-composition-headroom" style={{ left: `${imageRect.x * 100}%`, top: `${mapY(model.headroom.y, imageRect) * 100}%`, width: `${imageRect.width * 100}%` }}><span>{model.headroom.percentage.toFixed(0)}% headroom</span></div> : null}
    {camera.compositionFrameGuideEnabled ? <div className="v2-camera-composition-label" style={{ left: `${mapX(model.frame.x, imageRect) * 100}%`, top: `${mapY(model.frame.y, imageRect) * 100}%` }}>{(camera.compositionFrameGuideAspect ?? 2.39).toFixed(2)}:1</div> : null}
  </div>
}

function rectStyle(rect: { x: number; y: number; width: number; height: number }) {
  return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }
}
