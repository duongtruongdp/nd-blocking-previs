import * as THREE from 'three'
import type { PropDocument, PropShape } from '../core/sceneDocument'

export type V2TestEntityDefinition = PropDocument

export const V2TestEntities: readonly V2TestEntityDefinition[] = [
  { id: 'prop-cube', name: 'Cube', type: 'Prop', position: [-2.2, 1, 0], rotation: [0, 0, 0], shape: 'cube', primaryColor: '#9b91df' },
  { id: 'prop-sphere', name: 'Sphere', type: 'Prop', position: [0, 1, 0], rotation: [0, 0, 0], shape: 'sphere', primaryColor: '#86b7c8' },
  { id: 'prop-cylinder', name: 'Cylinder', type: 'Prop', position: [2.2, 1, 0], rotation: [0, 0, 0], shape: 'cylinder', primaryColor: '#d5a47f' },
]

export function createV2TestGeometry(shape: PropShape): THREE.BufferGeometry {
  if (shape === 'sphere') return new THREE.SphereGeometry(0.9, 24, 16)
  if (shape === 'cylinder') return new THREE.CylinderGeometry(0.78, 0.78, 2, 24)
  return new THREE.BoxGeometry(1.6, 2, 1.6)
}

export const V2TestEntityColors: Record<string, string> = {
  'prop-cube': '#9b91df',
  'prop-sphere': '#86b7c8',
  'prop-cylinder': '#d5a47f',
}

export function createDefaultProps(): PropDocument[] {
  return V2TestEntities.map((prop) => ({ ...prop, position: [...prop.position] as [number, number, number], rotation: [...prop.rotation] as [number, number, number] }))
}
