import type { SceneDocument } from '../core/sceneDocument'
import { evaluateSceneFrame, type EvaluatedSceneFrame } from '../core/sceneFrameEvaluation'
import { evaluateTimeline, type EvaluatedEntityState } from '../timeline/timelineEvaluator'

export function evaluateExportFrame(document: SceneDocument, frame: number): Record<string, EvaluatedEntityState> {
  return evaluateTimeline(document, frame)
}

export type ExportSceneFrame = EvaluatedSceneFrame

export function evaluateExportSceneFrame(document: SceneDocument, frame: number, evaluatedOverride?: Record<string, EvaluatedEntityState>): ExportSceneFrame {
  return evaluateSceneFrame(document, frame, evaluatedOverride)
}

