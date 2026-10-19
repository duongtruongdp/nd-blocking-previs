import { MannequinActorRuntime } from './mannequinActor'
import { ProceduralActorRuntime } from './proceduralActor'
import type { ActorDocument } from '../../core/sceneDocument'

export type ActorRuntime = MannequinActorRuntime | ProceduralActorRuntime

/** Legacy files without visualStyle deliberately resolve to Character. */
export function actorVisualStyle(document: Pick<ActorDocument, 'visualStyle'>): 'mannequin' | 'character' {
  return document.visualStyle === 'mannequin' ? 'mannequin' : 'character'
}

export function createActorRuntime(document: ActorDocument): ActorRuntime {
  return actorVisualStyle(document) === 'mannequin' ? new MannequinActorRuntime(document) : new ProceduralActorRuntime(document)
}
