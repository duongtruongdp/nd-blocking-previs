import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actualThree = await vi.importActual<typeof import('three')>('three')

class TestCanvas extends EventTarget {
  width = 640
  height = 480
  className = ''
  tabIndex = 0
  dataset: Record<string, string> = {}
  private capturedPointer: number | null = null

  setAttribute(): void {}
  focus(): void {}
  setPointerCapture(pointerId: number): void { this.capturedPointer = pointerId }
  releasePointerCapture(pointerId: number): void { if (this.capturedPointer === pointerId) this.capturedPointer = null }
  hasPointerCapture(pointerId: number): boolean { return this.capturedPointer === pointerId }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480, x: 0, y: 0, toJSON: () => ({}) } as DOMRect }
  remove(): void {}
}

class TestContainer {
  readonly children: TestCanvas[] = []
  appendChild(canvas: TestCanvas): TestCanvas { this.children.push(canvas); return canvas }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480, x: 0, y: 0, toJSON: () => ({}) } as DOMRect }
}

class TestRenderer {
  readonly domElement: TestCanvas
  readonly info = { memory: { geometries: 0, textures: 0 }, programs: [] }
  outputColorSpace = actualThree.SRGBColorSpace

  constructor(parameters: { canvas: TestCanvas }) { this.domElement = parameters.canvas }
  setPixelRatio(): void {}
  setClearColor(): void {}
  setSize(): void {}
  render(): void {}
  dispose(): void {}
  getContext(): { isContextLost: () => boolean } { return { isContextLost: () => false } }
}

vi.mock('three', () => ({ ...actualThree, WebGLRenderer: TestRenderer }))

const { StageEngine } = await import('../stage-engine/stageEngine')
import type { StageEngineDebugSnapshot } from '../stage-engine/stageEngine'

function installDom(): void {
  const windowTarget = new EventTarget() as EventTarget & Record<string, unknown>
  windowTarget.devicePixelRatio = 1
  windowTarget.requestAnimationFrame = () => 1
  windowTarget.cancelAnimationFrame = () => {}
  windowTarget.ResizeObserver = undefined
  windowTarget.addEventListener = EventTarget.prototype.addEventListener.bind(windowTarget)
  windowTarget.removeEventListener = EventTarget.prototype.removeEventListener.bind(windowTarget)
  const documentValue = { createElement: () => new TestCanvas() }
  Object.assign(globalThis, { window: windowTarget, document: documentValue, HTMLElement: class {}, HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLSelectElement: class {} })
}

function pointerEvent(type: string, values: Record<string, unknown>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, values)
  return event
}

function entity(id: string, position: [number, number, number]): InstanceType<typeof actualThree.Group> {
  const root = new actualThree.Group()
  root.position.set(...position)
  const mesh = new actualThree.Mesh(new actualThree.BoxGeometry(1, 1, 1), new actualThree.MeshBasicMaterial())
  root.add(mesh)
  return root
}

function projectedBounds(engine: InstanceType<typeof StageEngine>, roots: readonly (InstanceType<typeof actualThree.Object3D>)[]): { left: number; top: number; right: number; bottom: number } {
  const camera = (engine as unknown as { editorCamera: InstanceType<typeof actualThree.PerspectiveCamera> }).editorCamera
  const points: InstanceType<typeof actualThree.Vector3>[] = []
  roots.forEach((root) => {
    root.updateMatrixWorld(true)
    const bounds = new actualThree.Box3().setFromObject(root)
    const corners = [
      [bounds.min.x, bounds.min.y, bounds.min.z], [bounds.min.x, bounds.min.y, bounds.max.z],
      [bounds.min.x, bounds.max.y, bounds.min.z], [bounds.min.x, bounds.max.y, bounds.max.z],
      [bounds.max.x, bounds.min.y, bounds.min.z], [bounds.max.x, bounds.min.y, bounds.max.z],
      [bounds.max.x, bounds.max.y, bounds.min.z], [bounds.max.x, bounds.max.y, bounds.max.z],
    ]
    corners.forEach((corner) => points.push(new actualThree.Vector3(...corner).project(camera)))
  })
  const clientPoints = points.map((point) => ({ x: (point.x + 1) * 320, y: (1 - point.y) * 240 }))
  return {
    left: Math.min(...clientPoints.map((point) => point.x)),
    top: Math.min(...clientPoints.map((point) => point.y)),
    right: Math.max(...clientPoints.map((point) => point.x)),
    bottom: Math.max(...clientPoints.map((point) => point.y)),
  }
}

function marqueePointerEvent(type: string, pointerId: number, clientX: number, clientY: number, modifiers: Record<string, boolean> = {}): Event {
  return pointerEvent(type, { pointerId, button: 0, clientX, clientY, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...modifiers })
}

describe('StageEngine selection synchronization integration', () => {
  let engine: InstanceType<typeof StageEngine> | null = null

  beforeEach(() => installDom())
  afterEach(() => { engine?.dispose(); engine = null })

  it('preserves committed selection and outline targets across entity replacement and navigation', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    let reactCommittedIds: string[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    engine.onSelectionChanged((selection) => { reactCommittedIds = selection.ids })
    ;['a', 'b', 'c', 'd', 'e'].forEach((id, index) => engine?.addEntity({ id, type: 'Actor', root: entity(id, [index - 2, 0, 0]) }))
    engine.setSelection(['a', 'b', 'c', 'd', 'e'], 'e')
    const before = snapshots.at(-1)
    engine.reconcileEntities(() => {
      engine?.removeEntity('c')
      engine?.addEntity({ id: 'c', type: 'Actor', root: entity('c', [0, 0, 0]) })
    })
    engine.orbitFromViewCube(12, -6)
    engine.resize()
    const after = snapshots.at(-1)
    expect(before?.selectedIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(reactCommittedIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(after?.selectedIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(reactCommittedIds).toEqual(after?.selectedIds)
    expect(after?.selectionOutlineTargetIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(after?.selectionOutlineCount).toBe(5)
  })

  it('clears canonical selection and outlines on a real empty primary click', () => {
    const selections: string[][] = []
    const snapshots: StageEngineDebugSnapshot[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    engine.addEntity({ id: 'actor-1', type: 'Actor', root: entity('actor-1', [0, 0, 0]) })
    engine.setSelection(['actor-1'])
    engine.onSelectionChanged((selection) => selections.push(selection.ids))
    engine.canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 4, clientY: 4, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }))
    engine.canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 1, button: 0, clientX: 4, clientY: 4, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }))
    const after = snapshots.at(-1)
    expect(selections.at(-1)).toEqual([])
    expect(engine.getSelection()).toEqual({ ids: [], primaryId: null })
    expect(after?.selectionOutlineTargetIds).toEqual([])
    expect(after?.lastEmptyClickEvent).toBe('empty-click-cleared')
  })

  it('keeps committed outlines visible while an empty press is still only a pending click', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    engine.addEntity({ id: 'actor-1', type: 'Actor', root: entity('actor-1', [0, 0, 0]) })
    engine.setSelection(['actor-1'])
    engine.canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, button: 0, clientX: 4, clientY: 4, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }))
    const pending = snapshots.at(-1)
    expect(pending?.selectedIds).toEqual(['actor-1'])
    expect(pending?.selectionOutlineTargetIds).toEqual(['actor-1'])
    expect(pending?.pointerMode).toBe('marquee')
  })

  it('commits a real empty-space marquee to the engine, App callback, and persistent outlines', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    const committed: string[][] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    engine.setProps([])
    engine.onSelectionChanged((selection) => committed.push(selection.ids))
    const roots = ['a', 'b', 'c', 'd', 'e'].map((id, index) => {
      const root = entity(id, [(index - 2) * 1.25, 0, 0])
      engine?.addEntity({ id, type: 'Actor', root })
      return root
    })
    const bounds = projectedBounds(engine, roots)
    const startX = bounds.left - 16
    const startY = bounds.top - 16
    const endX = bounds.right + 16
    const endY = bounds.bottom + 16

    engine.canvas.dispatchEvent(marqueePointerEvent('pointerdown', 11, startX, startY))
    engine.canvas.dispatchEvent(marqueePointerEvent('pointermove', 11, endX, endY))
    const preview = snapshots.at(-1)
    expect(preview?.pointerMode).toBe('marquee')
    expect(preview?.marqueePreviewActive).toBe(true)
    expect(preview?.marqueePreviewIds).toEqual(['a', 'b', 'c', 'd', 'e'])

    engine.canvas.dispatchEvent(marqueePointerEvent('pointerup', 11, endX, endY))
    const after = snapshots.at(-1)
    expect(committed.at(-1)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(engine.getSelection()).toEqual({ ids: ['a', 'b', 'c', 'd', 'e'], primaryId: 'e' })
    expect(after?.selectedIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(after?.selectionOutlineTargetIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(after?.selectionOutlineCount).toBe(5)
    expect(after?.marqueePreviewActive).toBe(false)
    expect(after?.marqueeFinalHitIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(after?.marqueePreviousSelectedIds).toEqual([])
    expect(after?.marqueeNextSelectedIds).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(after?.marqueeCallbackPayload).toContain('"primaryId":"e"')
    expect(after?.recentInteractionEvents).toContain('marquee:preview')
    expect(after?.recentInteractionEvents).toContain('marquee:commit:5→5')
  })

  it('preserves marquee selection through orbit, pan, zoom, and ViewCube navigation', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    const root = entity('actor-1', [0, 0, 0])
    engine.addEntity({ id: 'actor-1', type: 'Actor', root })
    engine.setSelection(['actor-1'])
    const before = engine.getSelection()

    engine.orbitFromViewCube(12, -6)
    engine.canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 21, button: 0, clientX: 300, clientY: 300, shiftKey: true, altKey: false, metaKey: false, ctrlKey: false }))
    engine.canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 21, button: 0, clientX: 330, clientY: 312, shiftKey: true, altKey: false, metaKey: false, ctrlKey: false }))
    engine.canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 21, button: 0, clientX: 330, clientY: 312, shiftKey: true, altKey: false, metaKey: false, ctrlKey: false }))
    engine.canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 22, button: 2, clientX: 300, clientY: 300, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }))
    engine.canvas.dispatchEvent(pointerEvent('pointermove', { pointerId: 22, button: 2, clientX: 320, clientY: 310, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }))
    engine.canvas.dispatchEvent(pointerEvent('pointerup', { pointerId: 22, button: 2, clientX: 320, clientY: 310, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }))
    engine.canvas.dispatchEvent(pointerEvent('wheel', { deltaX: 0, deltaY: -40, deltaMode: 0, ctrlKey: false }))

    expect(engine.getSelection()).toEqual(before)
    expect(snapshots.at(-1)?.selectionOutlineTargetIds).toEqual(['actor-1'])
  })

  it('applies additive and subtractive marquee modes through the real pointer path', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    engine.setProps([])
    const roots = ['a', 'b', 'c'].map((id, index) => {
      const root = entity(id, [(index - 1) * 2.4, 0, 0])
      engine?.addEntity({ id, type: 'Actor', root })
      return root
    })
    const dragMarquee = (root: InstanceType<typeof actualThree.Group>, pointerId: number, modifiers: Record<string, boolean> = {}) => {
      const bounds = projectedBounds(engine!, [root])
      const startX = bounds.left - 12
      const startY = bounds.top - 12
      const endX = bounds.right + 12
      const endY = bounds.bottom + 12
      engine!.canvas.dispatchEvent(marqueePointerEvent('pointerdown', pointerId, startX, startY, modifiers))
      engine!.canvas.dispatchEvent(marqueePointerEvent('pointermove', pointerId, endX, endY, modifiers))
      engine!.canvas.dispatchEvent(marqueePointerEvent('pointerup', pointerId, endX, endY, modifiers))
    }

    dragMarquee(roots[0]!, 31)
    expect(engine.getSelection().ids).toEqual(['a'])
    dragMarquee(roots[1]!, 32, { shiftKey: true })
    expect(engine.getSelection().ids).toEqual(['a', 'b'])
    dragMarquee(roots[1]!, 33, { altKey: true })
    expect(engine.getSelection().ids).toEqual(['a'])
    expect(snapshots.at(-1)?.marqueePreviousSelectedIds).toEqual(['a', 'b'])
    expect(snapshots.at(-1)?.marqueeNextSelectedIds).toEqual(['a'])
  })

  it('starts empty-space marquee regardless of the active transform tool while preserving entity moves', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    const root = entity('actor-1', [0, 0, 0])
    engine.addEntity({ id: 'actor-1', type: 'Actor', root })

    engine.setTool('move')
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerdown', 51, 4, 4))
    expect(snapshots.at(-1)?.pointerMode).toBe('marquee')
    engine.canvas.dispatchEvent(marqueePointerEvent('pointermove', 51, 80, 80))
    expect(snapshots.at(-1)?.marqueePreviewActive).toBe(true)
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerup', 51, 80, 80))

    engine.setSelection(['actor-1'])
    const bounds = projectedBounds(engine, [root])
    const centerX = (bounds.left + bounds.right) / 2
    const centerY = (bounds.top + bounds.bottom) / 2
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerdown', 52, centerX, centerY))
    expect(snapshots.at(-1)?.pointerMode).not.toBe('marquee')
    engine.canvas.dispatchEvent(marqueePointerEvent('pointercancel', 52, centerX + 20, centerY + 20))
  })

  it('keeps Space+empty-drag as orbit instead of starting marquee', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, { debugEnabled: true, onDebug: (snapshot) => snapshots.push(snapshot) })
    engine.setTool('rotate')
    window.dispatchEvent(pointerEvent('keydown', { code: 'Space', key: ' ' }))
    // The actual application receives Space before the pointer gesture. The
    // test keeps the same keyboard lifecycle and verifies the opt-in orbit
    // path remains distinct from empty-space marquee selection.
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerdown', 61, 4, 4))
    expect(snapshots.at(-1)?.pointerMode).toBe('orbit')
    engine.canvas.dispatchEvent(marqueePointerEvent('pointermove', 61, 24, 20))
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerup', 61, 24, 20))
    window.dispatchEvent(pointerEvent('keyup', { code: 'Space', key: ' ' }))
  })

  it('uses logical group selection and excludes camera frustum geometry from marquee bounds', () => {
    const snapshots: StageEngineDebugSnapshot[] = []
    engine = new StageEngine(new TestContainer() as unknown as HTMLElement, {
      debugEnabled: true,
      onDebug: (snapshot) => snapshots.push(snapshot),
      resolveSelectionId: (id) => id.startsWith('group-child-') ? 'group-1' : id,
      resolveSelectionVisualIds: (id) => id === 'group-1' ? ['group-child-a', 'group-child-b'] : [id],
    })
    engine.setProps([])
    const groupRoot = new actualThree.Group()
    groupRoot.visible = false
    engine.addEntity({ id: 'group-1', type: 'Actor', root: groupRoot })
    const childA = entity('group-child-a', [-1.1, 0, 0])
    const childB = entity('group-child-b', [1.1, 0, 0])
    engine.addEntity({ id: 'group-child-a', type: 'Actor', root: childA })
    engine.addEntity({ id: 'group-child-b', type: 'Actor', root: childB })

    const cameraRoot = new actualThree.Group()
    cameraRoot.position.set(6, 0, -3)
    const cameraBody = new actualThree.Mesh(new actualThree.BoxGeometry(0.4, 0.4, 0.4), new actualThree.MeshBasicMaterial())
    cameraRoot.add(cameraBody)
    const frustum = new actualThree.Mesh(new actualThree.BoxGeometry(1, 1, 0.05), new actualThree.MeshBasicMaterial())
    frustum.position.set(0, 8, 3)
    frustum.raycast = () => undefined
    cameraRoot.add(frustum)
    engine.addEntity({ id: 'camera-1', type: 'Camera', root: cameraRoot, selectionBounds: cameraBody })

    const groupBounds = projectedBounds(engine, [childA, childB])
    const groupStartX = groupBounds.left - 12
    const groupStartY = groupBounds.top - 12
    const groupEndX = groupBounds.right + 12
    const groupEndY = groupBounds.bottom + 12
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerdown', 41, groupStartX, groupStartY))
    engine.canvas.dispatchEvent(marqueePointerEvent('pointermove', 41, groupEndX, groupEndY))
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerup', 41, groupEndX, groupEndY))

    expect(engine.getSelection()).toEqual({ ids: ['group-1'], primaryId: 'group-1' })
    expect(snapshots.at(-1)?.selectionOutlineTargetIds).toEqual(['group-child-a', 'group-child-b'])

    const frustumBounds = projectedBounds(engine, [frustum])
    const frustumOnlyStartX = frustumBounds.left - 12
    const frustumOnlyStartY = frustumBounds.top - 12
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerdown', 42, frustumOnlyStartX, frustumOnlyStartY))
    engine.canvas.dispatchEvent(marqueePointerEvent('pointermove', 42, frustumBounds.right + 12, frustumBounds.bottom + 12))
    engine.canvas.dispatchEvent(marqueePointerEvent('pointerup', 42, frustumBounds.right + 12, frustumBounds.bottom + 12))
    expect(engine.getSelection().ids).toEqual([])
  })
})
