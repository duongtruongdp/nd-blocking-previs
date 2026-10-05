import type { ActorDocument, PropDocument, SceneDocument } from './sceneDocument'

export type ClipboardEntity = ActorDocument | PropDocument
export type ClipboardEntityType = 'Actor' | 'Prop'

export type EditorClipboard = {
  entityType: ClipboardEntityType
  entity: ClipboardEntity
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createEditorClipboard(entity: ClipboardEntity): EditorClipboard {
  return {
    entityType: 'type' in entity ? 'Prop' : 'Actor',
    entity: clone(entity),
  }
}

function nextEntityId(document: SceneDocument, entityType: ClipboardEntityType): string {
  const prefix = entityType === 'Actor' ? 'actor' : 'prop'
  const used = new Set([...document.actors, ...document.props].map((entity) => entity.id))
  let index = 1
  let id = `${prefix}-${String(index).padStart(2, '0')}`
  while (used.has(id)) {
    index += 1
    id = `${prefix}-${String(index).padStart(2, '0')}`
  }
  return id
}

function nextEntityName(document: SceneDocument, entity: ClipboardEntity): string {
  const names = new Set([...document.actors, ...document.props].map((item) => item.name))
  const match = /^(.*?)(?:\s+(\d+))?$/.exec(entity.name)
  const base = match?.[1]?.trim() || entity.name
  const sourceNumber = match?.[2] ? Number(match[2]) : 1
  let number = Math.max(2, sourceNumber + 1)
  let candidate = `${base} ${String(number).padStart(2, '0')}`
  while (names.has(candidate)) {
    number += 1
    candidate = `${base} ${String(number).padStart(2, '0')}`
  }
  return candidate
}

export function pasteEditorClipboard(document: SceneDocument, clipboard: EditorClipboard): { document: SceneDocument; entity: ClipboardEntity } {
  const source = clone(clipboard.entity)
  const entity = {
    ...source,
    id: nextEntityId(document, clipboard.entityType),
    name: nextEntityName(document, clipboard.entity),
    position: [source.position[0] + 0.5, clipboard.entityType === 'Actor' ? 0 : source.position[1], source.position[2] + 0.5] as [number, number, number],
  } as ClipboardEntity
  const nextDocument: SceneDocument = {
    ...document,
    metadata: { ...document.metadata, updatedAt: new Date().toISOString() },
    actors: clipboard.entityType === 'Actor' ? [...document.actors, entity as ActorDocument] : document.actors,
    props: clipboard.entityType === 'Prop' ? [...document.props, entity as PropDocument] : document.props,
  }
  return { document: nextDocument, entity }
}
