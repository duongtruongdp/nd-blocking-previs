import { describe, expect, it } from 'vitest'
import { createActorDocument, createCameraDocument, createEmptySceneDocument } from '../core/sceneDocument'
import { currentEditableCameraPose } from '../runtime/cameraBlocking'
import { actorAimPoint, actorHeadProjectionY, cameraPositionForActorFraming, compositionFrameRect, compositionOverlayForCapture, compositionOverlayModel, headroomPercentage, safeAreaRect, thirdsCoordinates } from '../runtime/compositionMath'
import { fitAspectInsideSource } from '../runtime/frameGuideMath'
import { upsertTimelineKeyframe } from '../timeline/timelineMath'

describe('camera composition math', () => {
  it('maps landscape and portrait frame guides inside the preview without stretching', () => {
    expect(compositionFrameRect(16 / 9, 2.39, 16 / 9)).toEqual({ x: 0, y: expect.closeTo((1 - (16 / 9) / 2.39) / 2), width: 1, height: expect.closeTo((16 / 9) / 2.39) })
    expect(compositionFrameRect(16 / 9, 1, 16 / 9)).toEqual({ x: expect.closeTo((1 - 1 / (16 / 9)) / 2), y: 0, width: expect.closeTo(1 / (16 / 9)), height: 1 })
    expect(compositionFrameRect(9 / 16, 16 / 9, 9 / 16).width).toBeCloseTo(1)
    expect(compositionFrameRect(9 / 16, 16 / 9, 9 / 16).height).toBeCloseTo((9 / 16) / (16 / 9))
  })

  it('keeps safe areas and thirds relative to the active guide', () => {
    const frame = compositionFrameRect(16 / 9, 2.39, 16 / 9)
    const action = safeAreaRect(frame, 10)
    const title = safeAreaRect(frame, 20)
    expect(action.x).toBeGreaterThan(frame.x)
    expect(title.width).toBeLessThan(action.width)
    const thirds = thirdsCoordinates(frame)
    expect(thirds.vertical[0]).toBeCloseTo(frame.x + frame.width / 3)
    expect(thirds.horizontal[1]).toBeCloseTo(frame.y + frame.height * 2 / 3)
  })

  it('uses deterministic Actor aim landmarks and spatial framing without changing focal length', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1.4, 5], [0, 0, 0], 'arri-alexa-mini-lf', 'lf-open-gate-4-5k')
    expect(actorAimPoint(actor, 'center')).toEqual([0, 0.88, 0])
    expect(actorAimPoint(actor, 'chest')[1]).toBeGreaterThan(actorAimPoint(actor, 'center')[1])
    expect(actorAimPoint(actor, 'eyes')).toEqual(actorAimPoint(actor, 'head'))
    const position = cameraPositionForActorFraming(camera, actor, 'mcu', 'chest')
    expect(position).not.toEqual(camera.position)
    expect(camera.focalLengthMm).toBe(35)
  })

  it('reports headroom in the active frame coordinate system', () => {
    const frame = compositionFrameRect(16 / 9, 2.39, 16 / 9)
    expect(headroomPercentage(frame, frame.y)).toBe(0)
    expect(headroomPercentage(frame, frame.y + frame.height * 0.1)).toBeCloseTo(10)
  })

  it('projects the actor head against the active camera frame', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const camera = createCameraDocument('camera-01', 'Camera 01', [0, 1.4, 5], [0, 0, 0], 'arri-alexa-mini-lf', 'lf-open-gate-4-5k')
    const frame = compositionFrameRect(16 / 9, 2.39, 16 / 9)
    const y = actorHeadProjectionY(camera, actor, frame, 16 / 9)
    expect(y).toBeGreaterThanOrEqual(frame.y)
    expect(y).toBeLessThanOrEqual(frame.y + frame.height)
  })

  it('uses one normalized overlay model for live composition settings', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const camera = { ...createCameraDocument('camera-01', 'Camera 01', [0, 1.4, 5], [0, 0, 0], 'arri-alexa-mini-lf', 'lf-open-gate-4-5k'), compositionFrameGuideEnabled: true, compositionFrameGuideAspect: 2.39, compositionCenter: true, compositionThirds: true, compositionSafeAreas: true, compositionHeadroom: true }
    const model = compositionOverlayModel(camera, 16 / 9, 16 / 9, actor)
    expect(model.frame.height).toBeLessThan(1)
    expect(model.safeAction).not.toBeNull()
    expect(model.safeTitle?.width).toBeLessThan(model.safeAction?.width ?? 1)
    expect(model.thirds?.vertical).toHaveLength(2)
    expect(model.center).toEqual({ x: 0.5, y: 0.5 })
    expect(model.headroom).not.toBeNull()
  })

  it('keeps live overlays independent from the capture Include Guides policy', () => {
    const camera = { ...createCameraDocument('camera-01', 'Camera 01', [0, 1.4, 5], [0, 0, 0], 'arri-alexa-mini-lf', 'lf-open-gate-4-5k'), compositionCenter: true }
    expect(compositionOverlayForCapture(camera, 16 / 9, 16 / 9, null, false)).toBeNull()
    expect(compositionOverlayForCapture(camera, 16 / 9, 16 / 9, null, true)?.center).toEqual({ x: 0.5, y: 0.5 })
  })

  it('maps normalized source geometry into letterboxed and pillarboxed display rects', () => {
    const letterbox = fitAspectInsideSource(16 / 9, 9 / 16)
    expect(letterbox.x).toBeGreaterThan(0)
    expect(letterbox.width).toBeLessThan(1)
    const pillarbox = fitAspectInsideSource(9 / 16, 16 / 9)
    expect(pillarbox.y).toBeGreaterThan(0)
    expect(pillarbox.height).toBeLessThan(1)
  })

  it('starts timeline framing from the resolved A pose rather than future B', () => {
    const actor = createActorDocument('actor-01', 'Actor 01', [0, 0, 0])
    const camera = createCameraDocument('camera-01', 'Camera 01', [5, 1.4, 5], [0, 0, 0], 'arri-alexa-mini-lf', 'lf-open-gate-4-5k')
    const base = { ...createEmptySceneDocument(), actors: [actor], cameras: [{ ...camera, targetEntityId: actor.id }] }
    const timeline = upsertTimelineKeyframe(upsertTimelineKeyframe(base.timeline, camera.id, 'Camera', 'position', 0, [0, 1.4, 5]), camera.id, 'Camera', 'position', 24, [5, 1.4, 5])
    const resolved = currentEditableCameraPose({ ...base, timeline: { ...timeline, currentFrame: 0 } }, camera.id)
    expect(resolved?.position).toEqual([0, 1.4, 5])
    expect(cameraPositionForActorFraming(resolved!, actor, 'medium')).not.toEqual([5, 1.4, 5])
    expect(timeline.tracks.find((track) => track.property === 'position')?.keyframes.find((keyframe) => keyframe.frame === 24)?.value).toEqual([5, 1.4, 5])
  })
})
