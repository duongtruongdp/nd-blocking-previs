import type { ProjectDocument } from './projectDocument'
import { creativeSceneFingerprint } from './sceneDirty'

export function creativeProjectFingerprint(project: ProjectDocument): string {
  return JSON.stringify({
    id: project.id,
    name: project.name,
    scenes: project.scenes.map((entry) => ({
      id: entry.id,
      name: entry.name,
      scene: JSON.parse(creativeSceneFingerprint(entry.scene)) as unknown,
    })),
  })
}
