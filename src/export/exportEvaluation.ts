import type { SceneDocument } from '../core/sceneDocument'
import { evaluateTimeline, type EvaluatedEntityState } from '../timeline/timelineEvaluator'

export function evaluateExportFrame(document: SceneDocument, frame: number): Record<string, EvaluatedEntityState> {
  return evaluateTimeline(document, frame)
}

