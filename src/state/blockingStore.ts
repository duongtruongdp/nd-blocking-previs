import { useSyncExternalStore } from 'react'
import {
  addActor,
  addProp,
  deleteEntity,
  renameEntity,
  setActorCharacter,
  setActorColor,
  setActorHeight,
  setActorPose,
  setEntityPlacement,
  setPropDimensions,
  type PropType,
} from '../domain/blockingCommands'
import { createMinimumValidProject, findEntity } from '../domain/project'
import type { Placement, ProjectDocument, Vec3 } from '../domain/types'

export type BlockingTool = 'select' | 'move' | 'rotate'
export type BlockingEntityKind = 'actor' | 'prop'

export type BlockingSelection = {
  entityId: string | null
  kind: BlockingEntityKind | null
}

export type BlockingState = {
  project: ProjectDocument
  selection: BlockingSelection
  tool: BlockingTool
}

type Listener = () => void

class BlockingStore {
  private state: BlockingState = {
    project: createMinimumValidProject(),
    selection: { entityId: null, kind: null },
    tool: 'select',
  }

  private readonly listeners = new Set<Listener>()
  private actorNameSequence = 0
  private readonly propNameSequences = new Map<PropType, number>()

  getSnapshot = (): BlockingState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setTool(tool: BlockingTool): void {
    if (this.state.tool === tool) return
    this.update({ tool })
  }

  selectEntity(entityId: string | null): void {
    if (entityId === null) {
      this.update({ selection: { entityId: null, kind: null } })
      return
    }

    const shot = this.getActiveShot()
    const entity = shot ? findEntity(shot, entityId) : undefined
    const kind = entity && 'appearance' in entity && 'heightM' in entity.appearance
      ? 'actor'
      : entity && 'appearance' in entity && 'dimensionsM' in entity.appearance
        ? 'prop'
        : null

    if (!kind) return
    this.update({ selection: { entityId, kind } })
  }

  addActor(): void {
    this.actorNameSequence += 1
    const result = addActor(this.state.project, undefined, `Actor ${String(this.actorNameSequence).padStart(2, '0')}`)
    this.update({
      project: result.project,
      selection: { entityId: result.entityId, kind: 'actor' },
    })
  }

  addProp(propType: PropType): void {
    const nextSequence = (this.propNameSequences.get(propType) ?? 0) + 1
    this.propNameSequences.set(propType, nextSequence)
    const label = propType.charAt(0).toUpperCase() + propType.slice(1)
    const result = addProp(this.state.project, propType, undefined, `${label} ${String(nextSequence).padStart(2, '0')}`)
    this.update({
      project: result.project,
      selection: { entityId: result.entityId, kind: 'prop' },
    })
  }

  renameSelected(name: string): void {
    const entityId = this.state.selection.entityId
    if (!entityId) return
    this.update({ project: renameEntity(this.state.project, entityId, name) })
  }

  setSelectedPlacement(placement: Placement): void {
    const entityId = this.state.selection.entityId
    if (!entityId) return
    this.update({ project: setEntityPlacement(this.state.project, entityId, placement) })
  }

  setEntityPlacement(entityId: string, placement: Placement): void {
    this.update({ project: setEntityPlacement(this.state.project, entityId, placement) })
  }

  setSelectedActorHeight(heightM: number): void {
    const entityId = this.state.selection.entityId
    if (!entityId || this.state.selection.kind !== 'actor') return
    this.update({ project: setActorHeight(this.state.project, entityId, heightM) })
  }

  setSelectedActorCharacter(characterId: string): void {
    const entityId = this.state.selection.entityId
    if (!entityId || this.state.selection.kind !== 'actor') return
    this.update({ project: setActorCharacter(this.state.project, entityId, characterId) })
  }

  setSelectedActorColor(color: string): void {
    const entityId = this.state.selection.entityId
    if (!entityId || this.state.selection.kind !== 'actor') return
    this.update({ project: setActorColor(this.state.project, entityId, color) })
  }

  setSelectedActorPose(poseId: string): void {
    const entityId = this.state.selection.entityId
    if (!entityId || this.state.selection.kind !== 'actor') return
    this.update({ project: setActorPose(this.state.project, entityId, poseId) })
  }

  setSelectedPropDimensions(dimensionsM: Vec3): void {
    const entityId = this.state.selection.entityId
    if (!entityId || this.state.selection.kind !== 'prop') return
    this.update({ project: setPropDimensions(this.state.project, entityId, dimensionsM) })
  }

  deleteSelected(): void {
    const entityId = this.state.selection.entityId
    if (!entityId) return
    this.update({
      project: deleteEntity(this.state.project, entityId),
      selection: { entityId: null, kind: null },
    })
  }

  private getActiveShot() {
    return this.state.project.shots.find((shot) => shot.id === this.state.project.activeShotId)
  }

  private update(patch: Partial<BlockingState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
}

export const blockingStore = new BlockingStore()

export function useBlockingSelector<T>(selector: (state: BlockingState) => T): T {
  return useSyncExternalStore(
    blockingStore.subscribe,
    () => selector(blockingStore.getSnapshot()),
    () => selector(blockingStore.getSnapshot()),
  )
}
