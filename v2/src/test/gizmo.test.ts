import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { actorRotateAnchorFromBounds, actorRotateGizmoScale } from '../runtime/gizmo'

describe('V2 Actor rotate gizmo presentation', () => {
  it('anchors at the visual body center while preserving world X/Z center', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(3, 2, 4))

    expect(actorRotateAnchorFromBounds(bounds)).toEqual(new THREE.Vector3(1, 0.9, 1))
  })

  it('uses a compact 60 percent rotate diameter scale', () => {
    expect(actorRotateGizmoScale(1)).toBeCloseTo(0.6)
  })
})
