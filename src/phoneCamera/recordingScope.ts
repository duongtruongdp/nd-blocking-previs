import type { ActorVector3, CameraDocument } from '../core/sceneDocument'
import { cameraDocumentWithTimelineEvaluation, type EvaluatedEntityState } from '../timeline/timelineEvaluator'

export type CameraRecordingScope = Readonly<{
  position: boolean
  rotation: boolean
}>

/**
 * Resolve the camera input presented to the phone controller while recording.
 * Non-recorded properties come from the current evaluated Timeline. Recorded
 * properties come from the recording-start baseline so newly written keys
 * cannot become the next live input sample.
 */
export function cameraDocumentForRecording(
  currentCamera: CameraDocument,
  currentEvaluated: EvaluatedEntityState | undefined,
  recordingBaseCamera: CameraDocument | null,
  recordingBaseEvaluated: EvaluatedEntityState | undefined,
  scope: CameraRecordingScope,
): CameraDocument {
  const current = cameraDocumentWithTimelineEvaluation(currentCamera, currentEvaluated)
  if (!recordingBaseCamera) return current
  const baseline = cameraDocumentWithTimelineEvaluation(recordingBaseCamera, recordingBaseEvaluated)
  return {
    ...current,
    ...(scope.position ? { position: [...baseline.position] as ActorVector3 } : {}),
    ...(scope.rotation ? { rotation: [...baseline.rotation] as ActorVector3 } : {}),
  }
}
