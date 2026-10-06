import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { isSelectableStageObject, normalizeStagePointer, stagePointerMovedBeyondThreshold } from '../runtime/stageInteraction'

describe('Stage interaction geometry', () => {
  const stageRect = { left: 100, top: 50, width: 800, height: 600 }

  it('normalizes a pointer against the full Blocking View Stage', () => {
    expect(normalizeStagePointer(500, 350, stageRect)).toEqual({ x: 0, y: 0 })
  })

  it('uses only the centered Camera View image rectangle', () => {
    const imageRegion = { left: 240, top: 90, width: 520, height: 520 }
    expect(normalizeStagePointer(500, 350, stageRect, imageRegion)).toEqual({ x: 0, y: 0 })
    expect(normalizeStagePointer(150, 350, stageRect, imageRegion)).toBeNull()
    expect(normalizeStagePointer(500, 700, stageRect, imageRegion)).toBeNull()
  })

  it('keeps an offset canvas rect as the coordinate source', () => {
    const offsetCanvas = { left: 320, top: 140, width: 640, height: 480 }
    expect(normalizeStagePointer(640, 380, offsetCanvas)).toEqual({ x: 0, y: 0 })
    expect(normalizeStagePointer(320, 140, offsetCanvas)).toEqual({ x: -1, y: 1 })
  })

  it('keeps a short left press in click territory and promotes a larger move to drag', () => {
    expect(stagePointerMovedBeyondThreshold(100, 100, 103, 104)).toBe(false)
    expect(stagePointerMovedBeyondThreshold(100, 100, 104, 104)).toBe(true)
  })

  it('rejects visual helpers while allowing a normal subject child', () => {
    const subject = new THREE.Group()
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
    subject.add(mesh)
    expect(isSelectableStageObject(mesh)).toBe(true)

    const guide = new THREE.Group()
    guide.userData.stageSelectable = false
    const guideLine = new THREE.LineSegments(new THREE.BufferGeometry())
    guide.add(guideLine)
    expect(isSelectableStageObject(guideLine)).toBe(false)

    mesh.geometry.dispose()
    guideLine.geometry.dispose()
  })
})
